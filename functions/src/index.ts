/**
 * Cloud Functions for Workfine.
 *
 * cleanupGuestsOnProjectDelete:
 *   When a project is deleted, remove that project from every external
 *   guest record in the workspace`s /people collection. If a guest record
 *   ends up with zero remaining projects, delete the guest record entirely
 *   so they do not pollute the External Guests list with dead access.
 *
 * Lazy initialization pattern:
 *   The Admin SDK is initialized inside the handler, not at module top
 *   level. This avoids the Firebase deploy analyzer timing out while
 *   resolving Application Default Credentials during introspection.
 */

import { onDocumentDeleted } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

function getDb() {
  const app = getApps().length === 0 ? initializeApp() : getApps()[0];
  return getFirestore(app);
}


export const cleanupGuestsOnProjectDelete = onDocumentDeleted(
  {
    document: "projects/{projectId}",
    region: "us-central1",
  },
  async (event) => {
    const db = getDb();
    const projectId = event.params.projectId;
    const before = event.data?.data();

    if (!before) {
      logger.warn("[cleanupGuests] No before-data for deleted project", {
        projectId,
      });
      return;
    }

    const workspaceId: string | undefined = before.workspaceId;
    if (!workspaceId || typeof workspaceId !== "string") {
      logger.warn("[cleanupGuests] Deleted project has no workspaceId, skipping", {
        projectId,
      });
      return;
    }

    logger.info("[cleanupGuests] Project deleted, scanning guests", {
      projectId,
      workspaceId,
    });

    const peopleRef = db.collection(`workspaces/${workspaceId}/people`);
    const affectedSnap = await peopleRef
      .where("projectIds", "array-contains", projectId)
      .get();

    if (affectedSnap.empty) {
      logger.info("[cleanupGuests] No guests reference this project", {
        projectId,
        workspaceId,
      });
      return;
    }

    const batch = db.batch();
    let updatedCount = 0;
    let deletedCount = 0;

    for (const personDoc of affectedSnap.docs) {
      const data = personDoc.data();
      const currentPids: string[] = Array.isArray(data.projectIds)
        ? data.projectIds
        : [];
      const remainingPids = currentPids.filter((p) => p !== projectId);

      if (remainingPids.length === 0) {
        batch.delete(personDoc.ref);
        deletedCount++;
        logger.info("[cleanupGuests] Deleting orphan guest", {
          uid: personDoc.id,
          email: data.email,
          workspaceId,
        });
      } else {
        batch.update(personDoc.ref, {
          projectIds: FieldValue.arrayRemove(projectId),
          [`projects.${projectId}`]: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        updatedCount++;
        logger.info("[cleanupGuests] Removing project from guest", {
          uid: personDoc.id,
          email: data.email,
          remainingProjectCount: remainingPids.length,
        });
      }
    }

    await batch.commit();

    logger.info("[cleanupGuests] Done", {
      projectId,
      workspaceId,
      guestsUpdated: updatedCount,
      guestsDeleted: deletedCount,
    });
  }
);

/**
 * cleanupMemberCopiesOnTaskDelete:
 *   When a canonical workspace task is deleted, every member/guest who has a
 *   personal copy at users/{uid}/tasks/{taskId} would otherwise be left with an
 *   orphaned copy that never disappears (a client cannot write another user''s
 *   path). This server-side trigger fans the deletion out:
 *     - deletes users/{uid}/tasks/{taskId} for every affected user, AND
 *     - writes users/{uid}/removedTasks/{taskId} (the SAME tombstone the
 *       MyTasksPage reconciler checks) so the copy is never resurrected.
 *
 *   Affected users are discovered from the task''s own /shares subcollection
 *   (acceptedByUid), which is the canonical record of who accepted the share.
 *   Mirrors cleanupGuestsOnProjectDelete: lazy init, same region, batched.
 */
export const cleanupMemberCopiesOnTaskDelete = onDocumentDeleted(
  {
    document: "workspaces/{workspaceId}/tasks/{taskId}",
    region: "us-central1",
  },
  async (event) => {
    const db = getDb();
    const { workspaceId, taskId } = event.params;
    const before = event.data?.data();

    logger.info("[cleanupTaskCopies] Task deleted, fanning out", {
      workspaceId,
      taskId,
    });

    const affectedUids = new Set<string>();

    try {
      const sharesSnap = await db
        .collection(`workspaces/${workspaceId}/tasks/${taskId}/shares`)
        .get();

        sharesSnap.forEach(doc => {
        const data = doc.data();
        const uid = String(
          data.acceptedByUid ||
          data.acceptedBy ||
          data.uid ||
          data.userId ||
          data.userUid ||
          data.memberUid ||
          data.invitedUid ||
          ""
        ).trim();
        if (uid) {
          affectedUids.add(uid);
        }
        logger.info("[cleanupTaskCopies] share doc inspected", {
          shareId: doc.id,
          fields: Object.keys(data),
          resolvedUid: uid || "(none)"
        });
      });

    } catch (err) {
      logger.warn("[cleanupTaskCopies] shares scan failed (non-fatal)", {
        workspaceId,
        taskId,
        err: String((err as Error)?.message || err),
      });
    }

    try {
      const cgSnap = await db
        .collectionGroup("tasks")
        .where("originalTaskId", "==", taskId)
        .get();

      cgSnap.forEach((d) => {
        const segments = d.ref.path.split("/");
        if (segments[0] === "users" && segments[2] === "tasks") {
          affectedUids.add(segments[1]);
        }
      });
    } catch (err) {
      logger.warn(
        "[cleanupTaskCopies] collectionGroup safety scan skipped (non-fatal)",
        { taskId, err: String((err as Error)?.message || err) }
      );
    }

    if (affectedUids.size === 0) {
      logger.info("[cleanupTaskCopies] No personal copies to remove", {
        workspaceId,
        taskId,
      });
      return;
    }

    const batch = db.batch();
    let count = 0;

    for (const uid of affectedUids) {
      batch.delete(db.doc(`users/${uid}/tasks/${taskId}`));

      batch.set(
        db.doc(`users/${uid}/removedTasks/${taskId}`),
        {
          taskId,
          canonicalTaskId: taskId,
          workspaceId,
          removedAt: FieldValue.serverTimestamp(),
          reason: "owner_deleted_task",
        },
        { merge: true }
      );

      count++;
    }

    await batch.commit();

    logger.info("[cleanupTaskCopies] Done", {
      workspaceId,
      taskId,
      copiesRemoved: count,
      hadBeforeData: Boolean(before),
    });
  }
);
