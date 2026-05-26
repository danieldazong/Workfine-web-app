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

export const taskService = {
  async createTask(data: CreateTaskInput) {
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

    return ref.id;
  },

  async updateTask(
    taskId: string,
    data: Partial<Task>,
    workspaceId?: string
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

    await updateDoc(
      taskRef,
      cleanUndefined({
        ...data,
        updatedAt: serverTimestamp(),
      })
    );
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
  acceptedByUid?: string;
  acceptedByName?: string;
  acceptedByPhotoURL?: string;
}) {
  const {
    workspaceId,
    invitedEmail,
    acceptedByUid = "",
    acceptedByName = "",
    acceptedByPhotoURL = "",
  } = params;

  if (!workspaceId || !invitedEmail) return;

  const emailLower = String(invitedEmail).trim().toLowerCase();
  if (!emailLower) return;

  const personId = `guest_${emailLower.replace(/[^a-z0-9]/g, "_")}`;
  const personRef = doc(db, "workspaces", workspaceId, "people", personId);

  await setDoc(
    personRef,
    {
      status: "active",
      userId: acceptedByUid || undefined,
      uid: acceptedByUid || undefined,
      displayName: acceptedByName || emailLower.split("@")[0],
      photoURL: acceptedByPhotoURL || "",
      lastActive: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
