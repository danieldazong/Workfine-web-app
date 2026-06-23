import {
  doc,
  updateDoc,
  deleteDoc,
  getDoc,
  setDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "./config";
import { deriveWorkspaceDisplayId } from "./users";
import {
  createRoleChangeNotification,
  createWorkspaceRemovalNotification,
} from "./notifications";




export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

/**
 * Update a member's role and permissions in a workspace.
 */
export async function updateMemberRole(
  workspaceId: string,
  userId: string,
  newRole: WorkspaceRole,
  actor?: { uid?: string; name?: string; photoURL?: string }
): Promise<void> {
  const memberRef = doc(db, "workspaces", workspaceId, "members", userId);

  const isOwnerOrAdmin = newRole === "owner" || newRole === "admin";
  const isMember = newRole === "member";
  const isViewer = newRole === "viewer";

  await updateDoc(memberRef, {
    role: newRole,
    permissions: {
      canView: true,
      canComment: isOwnerOrAdmin || isMember,
      canEdit: isOwnerOrAdmin,
      canDelete: isOwnerOrAdmin,
      canInvite: isOwnerOrAdmin,
      canCreateProjects: isOwnerOrAdmin,
      canDeleteProjects: isOwnerOrAdmin,
      canInviteMembers: isOwnerOrAdmin,
      canManageTasks: isOwnerOrAdmin,
      canViewOnly: isViewer,
    },
    lastActive: serverTimestamp(),
  });

  // GLOBAL: notify the affected member, but only if they opted in.
  try {
    const actorUid = String(actor?.uid || "").trim();
    if (actorUid && actorUid !== userId) {
      // Respect the recipient's notification preference.
      const recipientSnap = await getDoc(doc(db, "users", userId));
      const prefs = recipientSnap.exists()
        ? (recipientSnap.data().notifPrefs as Record<string, boolean> | undefined)
        : undefined;
      const wantsRoleChange = prefs ? prefs.roleChangeEmails !== false : true;

      if (wantsRoleChange) {
        let workspaceName = "";
        try {
          const wsSnap = await getDoc(doc(db, "workspaces", workspaceId));
          if (wsSnap.exists()) workspaceName = String(wsSnap.data().name || "");
        } catch {}

        await createRoleChangeNotification({
          workspaceId,
          recipientUid: userId,
          newRole,
          workspaceName,
          actorId: actorUid,
          actorName: actor?.name,
          actorPhotoURL: actor?.photoURL,
        });
      }
    }
  } catch (e) {
    console.warn("[updateMemberRole] role-change notification skipped:", e);
  }
}


/**
 * Remove a member from a workspace and reset their workspaceId to a personal one.
 */
export async function removeMember(
  workspaceId: string,
  userId: string
): Promise<void> {
    // 1. Delete member document
  await deleteDoc(doc(db, "workspaces", workspaceId, "members", userId));

  try {
    const userSnapForEmail = await getDoc(doc(db, "users", userId));
    const emailLower = String(
      userSnapForEmail.exists()
        ? userSnapForEmail.data().emailLower ||
            userSnapForEmail.data().email_lowercase ||
            userSnapForEmail.data().email ||
            ""
        : ""
    )
      .trim()
      .toLowerCase();

    if (emailLower) {
      await deleteDoc(doc(db, "workspaces", workspaceId, "members", emailLower));
    }
  } catch (e) {
    console.warn("[removeMember] could not remove legacy email member doc:", e);
  }


  // 2. Reset user's workspaceId to a personal workspace ID
  try {
    const userRef  = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
            const personalId =
        (userSnap.data().personalWorkspaceId as string | undefined) ||
        `personal_${userId}`;

                            await setDoc(
        userRef,
        {
          workspaceId: personalId,
          personalWorkspaceId: personalId,
          workspaceDisplayId: deriveWorkspaceDisplayId(userId),
          lastRemovedFromWorkspaceId: workspaceId,
          removedFromWorkspaceAt: serverTimestamp(),
          // GLOBAL REAL-TIME SIGNAL: User 1 always has permission to read their
          // OWN users/{uid} doc, so a live listener on it fires the instant we
          // bump this counter — no need to read the workspace they just lost.
          removalSignal: Date.now(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );



    }
  } catch (e) {
    console.warn("[removeMember] could not reset user workspaceId:", e);
  }

  // GLOBAL REAL-TIME REMOVAL NOTIFICATION:
  // Fire a notification through the SAME proven pipeline used by task invites
  // and role changes. This makes the removal appear in the live bell instantly
  // AND lets AppShell pop the removal modal off it. Non-fatal — never blocks
  // the removal itself.
  try {
    const wsSnap = await getDoc(doc(db, "workspaces", workspaceId));
    const wsName = wsSnap.exists()
      ? String(wsSnap.data().name || "")
      : "";

    let actorId = "";
    let actorName = "";
    let actorPhotoURL = "";
    try {
      const authMod = await import("./config");
      const currentUser = authMod.auth.currentUser;
      actorId = String(currentUser?.uid || "");
      actorName = String(currentUser?.displayName || "An admin");
      actorPhotoURL = String(currentUser?.photoURL || "");
    } catch {}

    if (actorId && actorId !== userId) {
      await createWorkspaceRemovalNotification({
        workspaceId,
        recipientUid: userId,
        workspaceName: wsName,
        actorId,
        actorName,
        actorPhotoURL,
      });
    }
  } catch (e) {
    console.warn("[removeMember] removal notification skipped:", e);
  }
}


/**
 * Convenience wrapper for the current user leaving a workspace.
 */
export async function leaveWorkspace(
  workspaceId: string,
  userId: string
): Promise<void> {
  return removeMember(workspaceId, userId);
}

/**
 * Transfer ownership of a workspace to another active member.
 *  - The new owner is promoted to role: "owner" with full permissions.
 *  - The previous owner is demoted to role: "admin".
 *  - The workspace document's ownerId / ownerEmail are updated.
 */
export async function transferOwnership(
  workspaceId: string,
  currentOwnerId: string,
  newOwnerId: string,
  newOwnerEmail?: string
): Promise<void> {
  if (currentOwnerId === newOwnerId) {
    throw new Error("You're already the owner of this workspace.");
  }

  const workspaceRef   = doc(db, "workspaces", workspaceId);
  const currentOwnerRef = doc(db, "workspaces", workspaceId, "members", currentOwnerId);
  const newOwnerRef    = doc(db, "workspaces", workspaceId, "members", newOwnerId);

  // Verify the new owner is actually a member
  const newOwnerSnap = await getDoc(newOwnerRef);
  if (!newOwnerSnap.exists()) {
    throw new Error("That user is no longer a member of this workspace.");
  }

  const batch = writeBatch(db);

    // Demote previous owner to admin
  batch.update(currentOwnerRef, {
    role: "admin",
    permissions: {
      canView: true,
      canComment: true,
      canEdit: true,
      canDelete: true,
      canInvite: true,
      canCreateProjects: true,
      canDeleteProjects: true,
      canInviteMembers: true,
      canManageTasks: true,
      canViewOnly: false,
    },

    lastActive: serverTimestamp(),
  });

  // Promote new owner
  batch.update(newOwnerRef, {
    role: "owner",
        permissions: {
      canView: true,
      canComment: true,
      canEdit: true,
      canDelete: true,
      canInvite: true,
      canCreateProjects: true,
      canDeleteProjects: true,
      canInviteMembers: true,
      canManageTasks: true,
      canViewOnly: false,
    },

    lastActive: serverTimestamp(),
  });

  // Update workspace document
  const wsUpdate: Record<string, any> = {
    ownerId: newOwnerId,
    updatedAt: serverTimestamp(),
  };
    if (newOwnerEmail) {
    wsUpdate.ownerEmail = newOwnerEmail;
    wsUpdate.ownerEmailLower = String(newOwnerEmail).trim().toLowerCase();
  }


  batch.update(workspaceRef, wsUpdate);

  await batch.commit();
}
