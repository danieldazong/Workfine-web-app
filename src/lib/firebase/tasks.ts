/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
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
