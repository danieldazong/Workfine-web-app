/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "./config";
import { createTaskAssignmentNotification } from "./notifications";


export type TaskPriority = "Urgent" | "High" | "Medium" | "Low";

export type TaskStatus = "To Do" | "In Progress" | "In Review" | "Done";

export type Attachment = {
  id?: string;
  name: string;
  url: string;
  type?: string;
  size?: number;
  uploadedAt?: any;
  uploadedBy?: string;
};

export type Task = {
  id: string;
  title?: string;
  description?: string;
  priority?: TaskPriority | string;
  status?: TaskStatus | string;
  projectId?: string;
  workspaceId?: string;
  assignee?: string;
  assigneeId?: string;
  assigneeIds?: string[];
  dueDate?: any;
  sectionId?: string;
  attachments?: Attachment[];
  createdAt?: any;
  updatedAt?: any;
  [key: string]: any;
};

export type Comment = {
  id: string;
  taskId?: string;
  text?: string;
  content?: string;
  authorId?: string;
  authorName?: string;
  createdAt?: any;
  updatedAt?: any;
  [key: string]: any;
};

type CreateTaskInput = Omit<Partial<Task>, "id"> & {
  workspaceId: string;
  projectId?: string;
  title: string;
};

const cleanUndefined = (obj: Record<string, any>) => {
  const cleaned: Record<string, any> = {};

  Object.entries(obj).forEach(([key, value]) => {
    if (value !== undefined) {
      cleaned[key] = value;
    }
  });

  return cleaned;
};

function assertCanEditWorkspaceContent(canEdit?: boolean) {
  if (canEdit === false) {
    throw new Error("You do not have permission to edit this project.");
  }
}
// GLOBAL: resolves the single assignee uid from any of the task's assignee fields.
function resolveAssigneeUid(data: Record<string, any>): string {
  const single = String(data.assigneeId || data.assignedToUid || "").trim();
  if (single) return single;
  if (Array.isArray(data.assigneeIds) && data.assigneeIds.length > 0) {
    return String(data.assigneeIds[0] || "").trim();
  }
  if (Array.isArray(data.assignedTo) && data.assignedTo.length > 0) {
    return String(data.assignedTo[0] || "").trim();
  }
  return "";
}

type AssignmentActor = {
  actorId: string;
  actorName?: string;
  actorPhotoURL?: string;
};

export const taskService = {
    async createTask(data: CreateTaskInput, actor?: AssignmentActor) {
    const { workspaceId, ...taskData } = data;

    if (!workspaceId) {
      throw new Error("workspaceId is required to create task");
    }

    const ref = await addDoc(
      collection(db, "workspaces", workspaceId, "tasks"),
      cleanUndefined({
        ...taskData,
        workspaceId,
        title: String(taskData.title || "").trim(),
        status: taskData.status || "To Do",
        priority: taskData.priority || "Medium",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );

    // GLOBAL: notify the assignee if the task was created already assigned.
    const assigneeUid = resolveAssigneeUid(taskData);
    if (assigneeUid && actor?.actorId) {
      try {
        await createTaskAssignmentNotification({
          workspaceId,
          recipientUid: assigneeUid,
          taskId: ref.id,
          taskTitle: String(taskData.title || "").trim(),
          projectId: String(taskData.projectId || ""),
          projectName: String((taskData as any).projectName || ""),
          actorId: actor.actorId,
          actorName: actor.actorName,
          actorPhotoURL: actor.actorPhotoURL,
        });
      } catch (err) {
        console.warn(
          "[createTask] assignment notification failed (non-fatal):",
          (err as any)?.message || err,
        );
      }
    }

    return ref.id;
  },


   async updateTask(
    taskId: string,
    data: Partial<Task>,
    workspaceId?: string,
    actor?: AssignmentActor
  ) {
    const finalWorkspaceId = workspaceId || data.workspaceId;

    if (!finalWorkspaceId) {
      throw new Error("workspaceId is required to update task");
    }

    const taskRef = doc(
      db,
      "workspaces",
      finalWorkspaceId,
      "tasks",
      taskId
    );

    // Read the existing assignee BEFORE the update so we only notify
    // when the assignee actually CHANGES (prevents duplicate notifications).
    let previousAssigneeUid = "";
    const newAssigneeUid = resolveAssigneeUid(data as Record<string, any>);

    if (newAssigneeUid && actor?.actorId) {
      try {
        const existingSnap = await getDoc(taskRef);
        if (existingSnap.exists()) {
          previousAssigneeUid = resolveAssigneeUid(
            existingSnap.data() as Record<string, any>,
          );
        }
      } catch {
        previousAssigneeUid = "";
      }
    }

    await updateDoc(
      taskRef,
      cleanUndefined({
        ...data,
        updatedAt: serverTimestamp(),
      })
    );

    // GLOBAL: notify only when the assignee changed to a new user.
    if (
      newAssigneeUid &&
      actor?.actorId &&
      newAssigneeUid !== previousAssigneeUid
    ) {
      try {
        await createTaskAssignmentNotification({
          workspaceId: finalWorkspaceId,
          recipientUid: newAssigneeUid,
          taskId,
          taskTitle: String(data.title || "").trim(),
          projectId: String(data.projectId || ""),
          projectName: String((data as any).projectName || ""),
          actorId: actor.actorId,
          actorName: actor.actorName,
          actorPhotoURL: actor.actorPhotoURL,
        });
      } catch (err) {
        console.warn(
          "[updateTask] assignment notification failed (non-fatal):",
          (err as any)?.message || err,
        );
      }
    }
  },


  async deleteTask(taskId: string, workspaceId?: string) {
    if (!workspaceId) {
      throw new Error("workspaceId is required to delete task");
    }

    const taskRef = doc(
      db,
      "workspaces",
      workspaceId,
      "tasks",
      taskId
    );

    await deleteDoc(taskRef);
  },
};

/**
 * Upsert a workspace "person" record for an external task guest.
 * This is what makes the invited email appear under "External Guests"
 * on the Team Page, separated from real workspace members.
 */
export async function upsertTaskGuestPerson(params: {
  workspaceId: string;
  taskId: string;
  shareId: string;
  invitedEmail: string;
  invitedBy: string;
  invitedByName?: string;
  invitedByEmail?: string;
  taskTitle?: string;
  taskCode?: string;
  projectId?: string;
  projectName?: string;
  status?: "active" | "pending";
}) {
  const {
    workspaceId,
    taskId,
    shareId,
    invitedEmail,
    invitedBy,
    invitedByName = "",
    invitedByEmail = "",
    taskTitle = "",
    taskCode = "",
    projectId = "",
    projectName = "",
    status = "pending",
  } = params;

  if (!workspaceId || !taskId || !shareId || !invitedEmail) return;

  const emailLower = String(invitedEmail).trim().toLowerCase();
  if (!emailLower) return;

  // Person doc id = sanitized email so the same person across tasks shares one doc.
  const personId = `guest_${emailLower.replace(/[^a-z0-9]/g, "_")}`;
  const personRef = doc(db, "workspaces", workspaceId, "people", personId);

  const taskAccess = {
    taskId,
    taskTitle,
    taskCode,
    projectId,
    projectName,
    shareId,
    status: "active",
    grantedAt: serverTimestamp(),
    grantedBy: invitedBy,
  };

  const existing = await getDoc(personRef);

  if (existing.exists()) {
    // Merge: add this task to their tasks map, never downgrade member -> guest.
    const data = existing.data() as any;
    const existingType = data?.type || "guest";

    await setDoc(
      personRef,
      {
        [`tasks.${taskId}`]: taskAccess,
        status: existingType === "member" ? data.status : status,
        lastActive: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    return;
  }

  await setDoc(personRef, {
    id: personId,
    workspaceId,
    email: invitedEmail,
    emailLower,
    displayName: invitedEmail.split("@")[0],
    photoURL: "",
    avatarColor: "",

    type: "guest",
    status,
    invitedVia: "task",

    invitedBy,
    invitedByName,
    invitedByEmail,

    tasks: { [taskId]: taskAccess },
    projects: {},

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastActive: null,
  });
}

/**
 * Mark a task guest as active (status="active") and stamp lastActive.
 * Called when they accept the task invite.
 */
export async function activateTaskGuestPerson(params: {
  workspaceId: string;
  invitedEmail: string;
  taskId?: string;
  shareId?: string;
  acceptedByUid?: string;
  acceptedByEmail?: string;
  acceptedByName?: string;
  acceptedByPhotoURL?: string;
}) {
  const {
    workspaceId,
    invitedEmail,
    taskId = "",
    shareId = "",
    acceptedByUid = "",
    acceptedByEmail = "",
    acceptedByName = "",
    acceptedByPhotoURL = "",
  } = params;

  if (!workspaceId || !invitedEmail) {
    console.warn(
      "[activateTaskGuestPerson] Missing workspaceId or invitedEmail — skipping",
      { workspaceId, invitedEmail }
    );
    return;
  }

  // Always normalize identically to upsertTaskGuestPerson() so the
  // personId matches the existing guest doc for ALL guests (global).
  const emailLower = String(invitedEmail).trim().toLowerCase();
  if (!emailLower) {
    console.warn("[activateTaskGuestPerson] Empty emailLower — skipping");
    return;
  }


  console.log("[activateTaskGuestPerson] Activating guest", {
    workspaceId,
    emailLower,
    hasPhoto: Boolean(acceptedByPhotoURL && acceptedByPhotoURL.trim()),
  });
   // ============================================================
  // FALLBACK: the auth object's photoURL is often empty/stale right
  // after Google sign-in, so activateTaskGuestPerson() can be called
  // with an empty acceptedByPhotoURL. The reliable source of truth is
  // the users/{uid} doc (the same one the Share modal reads). If we
  // were not handed a photo, read it from there. Global for all guests.
  // ============================================================
  let resolvedPhotoURL = String(acceptedByPhotoURL || "").trim();
  let resolvedName = String(acceptedByName || "").trim();

  if (acceptedByUid && (!resolvedPhotoURL || !resolvedName)) {
    try {
      const userSnap = await getDoc(doc(db, "users", acceptedByUid));
      if (userSnap.exists()) {
        const u = userSnap.data() as any;
        if (!resolvedPhotoURL) {
          resolvedPhotoURL = String(
            u.photoURL ||
              u.googlePhotoURL ||
              u.providerPhotoURL ||
              u.authPhotoURL ||
              u.avatarUrl ||
              ""
          ).trim();
        }
        if (!resolvedName) {
          resolvedName = String(u.displayName || u.name || "").trim();
        }
      }
    } catch (lookupErr) {
      console.warn(
        "[activateTaskGuestPerson] users/{uid} photo lookup failed (non-fatal):",
        acceptedByUid,
        (lookupErr as any)?.message || lookupErr
      );
    }
  }

  // Canonical person id — MUST match upsertTaskGuestPerson() so we update
  // the same doc the Team page is already listening to.
  const personId = `guest_${emailLower.replace(/[^a-z0-9]/g, "_")}`;
  const personRef = doc(db, "workspaces", workspaceId, "people", personId);


  // Step 1 — flip ROOT fields to active. This is what the Team page badge reads.
  // Step 1 — flip ROOT fields to active. This is what the Team page badge reads.
  const rootPayload: Record<string, any> = {
    id: personId,
    workspaceId,
    email: emailLower,
    emailLower,
    status: "active",
    accepted: true,
    acceptedAt: serverTimestamp(),
        displayName:
      resolvedName ||
      (acceptedByEmail ? acceptedByEmail.split("@")[0] : "") ||
      emailLower.split("@")[0],
    type: "guest",
    lastActive: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };


  // Only write photoURL when we actually have one — never overwrite
  // an existing good avatar with an empty string.
    if (resolvedPhotoURL) {
    rootPayload.photoURL = resolvedPhotoURL;
    rootPayload.avatarUrl = resolvedPhotoURL;
  }



  if (acceptedByUid) {
    rootPayload.userId = acceptedByUid;
    rootPayload.uid = acceptedByUid;
  }

  if (acceptedByEmail) {
    rootPayload.acceptedByEmail = acceptedByEmail;
  }

  await setDoc(personRef, rootPayload, { merge: true });

  // Step 2 — flip the nested tasks.{taskId} entry to active.
  // We do this as a merge setDoc (not updateDoc) because updateDoc fails the
  // entire write if any precondition is off, which would silently leave the
  // root active but the nested entry stale. setDoc({merge:true}) is safe.
  if (taskId) {
    await setDoc(
      personRef,
      {
        tasks: {
          [taskId]: {
            taskId,
            shareId: shareId || "",
            status: "active",
            accepted: true,
            acceptedAt: serverTimestamp(),
            acceptedByUid: acceptedByUid || "",
            acceptedByEmail: acceptedByEmail || "",
            acceptedByName: acceptedByName || "",
            acceptedByPhotoURL: acceptedByPhotoURL || "",
          },
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }
}



