/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  limit,
  QuerySnapshot,
  DocumentData,
} from "firebase/firestore";
import { db, auth } from "./config";
import { Task, Comment } from "../../types";

const workspaceTasksRef = (workspaceId: string) =>
  collection(db, "workspaces", workspaceId, "tasks");

const workspaceTaskDocRef = (workspaceId: string, taskId: string) =>
  doc(db, "workspaces", workspaceId, "tasks", taskId);

const workspaceCommentsRef = (workspaceId: string) =>
  collection(db, "workspaces", workspaceId, "comments");

async function getActiveWorkspaceId(): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Unauthenticated user");

  const userSnap = await getDoc(doc(db, "users", uid));
  const workspaceId = userSnap.exists()
    ? (userSnap.data().workspaceId as string | undefined)
    : undefined;

  if (!workspaceId) throw new Error("No active workspace");

  return workspaceId;
}

function normalizeTaskDoc(d: any): Task {
  return {
    id: d.id,
    ...d.data(),
  } as Task;
}

export const taskService = {
  async createTask(
    task: Omit<
      Task,
      "id" | "createdAt" | "updatedAt" | "attachments" | "subtasks"
    >
  ): Promise<string> {
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error("Unauthenticated user cannot create tasks");

    const workspaceId =
      (task as any).workspaceId && (task as any).workspaceId !== "ws1"
        ? (task as any).workspaceId
        : await getActiveWorkspaceId();

    const tRef = doc(workspaceTasksRef(workspaceId));

    const newTask: Task = {
      ...(task as any),
      id: tRef.id,
      workspaceId,
      createdBy: userId,
      ownerId: userId,
      attachments: [],
      subtasks: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Task;

    await setDoc(tRef, newTask);

    return tRef.id;
  },

  async updateTask(taskId: string, updates: Partial<Task>): Promise<void> {
    const workspaceId =
      (updates as any).workspaceId && (updates as any).workspaceId !== "ws1"
        ? ((updates as any).workspaceId as string)
        : await getActiveWorkspaceId();

    await updateDoc(workspaceTaskDocRef(workspaceId, taskId), {
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  },

  async deleteTask(taskId: string): Promise<void> {
    const workspaceId = await getActiveWorkspaceId();

    await deleteDoc(workspaceTaskDocRef(workspaceId, taskId));
  },

  subscribeToProjectTasks(projectId: string, callback: (tasks: Task[]) => void) {
    let unsub: (() => void) | null = null;
    let cancelled = false;

    getActiveWorkspaceId()
      .then((workspaceId) => {
        if (cancelled) return;

        const q = query(
          workspaceTasksRef(workspaceId),
          where("projectId", "==", projectId),
          orderBy("createdAt", "asc")
        );

        unsub = onSnapshot(q, (snapshot) => {
          const tasks = snapshot.docs.map(normalizeTaskDoc);
          callback(tasks);
        });
      })
      .catch((err) => {
        console.warn("[Tasks] subscribeToProjectTasks failed:", err.message);
        callback([]);
      });

    return () => {
      cancelled = true;
      unsub?.();
    };
  },

  subscribeToUserTasks(userId: string, callback: (tasks: Task[]) => void) {
    let unsub: (() => void) | null = null;
    let cancelled = false;

    getActiveWorkspaceId()
      .then((workspaceId) => {
        if (cancelled) return;

        const q = query(
          workspaceTasksRef(workspaceId),
          where("assigneeId", "==", userId),
          limit(200)
        );

        unsub = onSnapshot(q, (snapshot) => {
          const tasks = snapshot.docs.map(normalizeTaskDoc);
          callback(tasks);
        });
      })
      .catch((err) => {
        console.warn("[Tasks] subscribeToUserTasks failed:", err.message);
        callback([]);
      });

    return () => {
      cancelled = true;
      unsub?.();
    };
  },

  async addComment(comment: Omit<Comment, "id" | "createdAt">): Promise<void> {
    const userId = auth.currentUser?.uid;
    if (!userId) throw new Error("Unauthenticated user");

    const workspaceId = await getActiveWorkspaceId();

    await addDoc(workspaceCommentsRef(workspaceId), {
      ...comment,
      workspaceId,
      createdBy: userId,
      createdAt: new Date().toISOString(),
    });
  },

  subscribeToTaskComments(
    taskId: string,
    callback: (comments: Comment[]) => void
  ) {
    let unsub: (() => void) | null = null;
    let cancelled = false;

    getActiveWorkspaceId()
      .then((workspaceId) => {
        if (cancelled) return;

        const q = query(
          workspaceCommentsRef(workspaceId),
          where("taskId", "==", taskId),
          orderBy("createdAt", "asc")
        );

        unsub = onSnapshot(q, (snapshot) => {
          const comments = snapshot.docs.map(
            (d) => ({ id: d.id, ...d.data() } as Comment)
          );
          callback(comments);
        });
      })
      .catch((err) => {
        console.warn("[Tasks] subscribeToTaskComments failed:", err.message);
        callback([]);
      });

    return () => {
      cancelled = true;
      unsub?.();
    };
  },
};

export async function getUserTasks(userId: string): Promise<Task[]> {
  const workspaceId = await getActiveWorkspaceId();

  const q = query(
    workspaceTasksRef(workspaceId),
    where("assigneeId", "==", userId),
    limit(200)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map(normalizeTaskDoc);
}

export function subscribeToUserTasks(
  userId: string,
  callback: (tasks: Task[]) => void
): () => void {
  let unsub: (() => void) | null = null;
  let cancelled = false;

  getActiveWorkspaceId()
    .then((workspaceId) => {
      if (cancelled) return;

      const q = query(
        workspaceTasksRef(workspaceId),
        where("assigneeId", "==", userId),
        limit(200)
      );

      unsub = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
        const tasks = snapshot.docs.map(normalizeTaskDoc);
        callback(tasks);
      });
    })
    .catch((err) => {
      console.warn("[Tasks] subscribeToUserTasks failed:", err.message);
      callback([]);
    });

  return () => {
    cancelled = true;
    unsub?.();
  };
}

export function subscribeToProjectTasks(
  projectId: string,
  callback: (tasks: Task[]) => void
): () => void {
  let unsub: (() => void) | null = null;
  let cancelled = false;

  getActiveWorkspaceId()
    .then((workspaceId) => {
      if (cancelled) return;

      const q = query(
        workspaceTasksRef(workspaceId),
        where("projectId", "==", projectId),
        limit(200)
      );

      unsub = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
        const tasks = snapshot.docs.map(normalizeTaskDoc);
        callback(tasks);
      });
    })
    .catch((err) => {
      console.warn("[Tasks] subscribeToProjectTasks failed:", err.message);
      callback([]);
    });

  return () => {
    cancelled = true;
    unsub?.();
  };
}

export async function createTask(
  workspaceIdOrUid: string,
  data: {
    title: string;
    description?: string;
    status: string;
    priority: string;
    dueDate?: string;
    assignee?: string;
    projectId?: string;
    workspaceId?: string;
  }
): Promise<string> {
  const currentUid = auth.currentUser?.uid;

  const workspaceId =
    data.workspaceId ||
    (workspaceIdOrUid?.startsWith("WF-")
      ? workspaceIdOrUid
      : await getActiveWorkspaceId());

  if (!workspaceId) throw new Error("No active workspace");

  const ref = collection(db, "workspaces", workspaceId, "tasks");

  const docRef = await addDoc(ref, {
    title: data.title.trim(),
    description: data.description?.trim() ?? "",
    status: data.status ?? "To Do",
    priority: data.priority ?? "Medium",
    dueDate: data.dueDate ?? null,
    assignee: data.assignee?.trim() ?? "Unassigned",
    projectId: data.projectId ?? null,

    workspaceId,
    userId: currentUid ?? "",
    ownerId: currentUid ?? "",
    createdBy: currentUid ?? "",

    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  console.log(
    "[Tasks] ✅ Task saved:",
    `workspaces/${workspaceId}/tasks/${docRef.id}`
  );

  return docRef.id;
}
