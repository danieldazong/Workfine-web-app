import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
} from "firebase/firestore";
import { db } from "./config";

export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  status: string;
  workspaceId: string;
  createdBy?: string;
  ownerId?: string;
  uid?: string;
  createdAt: unknown;
  updatedAt?: unknown;
  [key: string]: any;
}

export interface NewProject {
  name: string;
  description: string;
  color: string;
  status?: string;
  priority?: string;
  dueDate?: string | null;
  code?: string;
}

async function ensureWorkspaceDocExists(workspaceId: string): Promise<void> {
  await setDoc(
    doc(db, "workspaces", workspaceId),
    {
      id: workspaceId,
      workspaceId,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function createProject(
  workspaceId: string,
  data: NewProject,
  createdBy?: string
): Promise<string> {
  if (!workspaceId) throw new Error("No active workspace");

  await ensureWorkspaceDocExists(workspaceId);

  const ref = collection(db, "workspaces", workspaceId, "projects");

  const docRef = await addDoc(ref, {
    name: data.name.trim(),
    description: data.description?.trim() ?? "",
    color: data.color ?? "#6366f1",
    status: data.status ?? "active",
    priority: data.priority ?? "Medium",
    dueDate: data.dueDate ?? null,
    code: data.code ?? null,

    workspaceId,
    createdBy: createdBy ?? "",
    ownerId: createdBy ?? "",
    uid: createdBy ?? "",

    taskCount: 0,
    completedTaskCount: 0,
    progress: 0,

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  console.log(
    "[Projects] ✅ Saved:",
    `workspaces/${workspaceId}/projects/${docRef.id}`
  );

  return docRef.id;
}

export async function updateProject(
  workspaceId: string,
  projectId: string,
  updates: Partial<Project>
): Promise<void> {
  if (!workspaceId || !projectId) return;

  await updateDoc(doc(db, "workspaces", workspaceId, "projects", projectId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });

  console.log("[Projects] ✏️ Updated:", projectId);
}

export async function deleteProject(
  workspaceId: string,
  projectId: string
): Promise<void> {
  if (!workspaceId || !projectId) return;

  await deleteDoc(doc(db, "workspaces", workspaceId, "projects", projectId));

  console.log("[Projects] 🗑️ Deleted:", projectId);
}

export function subscribeToProjects(
  workspaceId: string,
  callback: (projects: Project[]) => void
): Unsubscribe {
  if (!workspaceId) {
    callback([]);
    return () => {};
  }

  console.log("[Projects] 👂 Attaching workspace listener:", workspaceId);

  return onSnapshot(
    collection(db, "workspaces", workspaceId, "projects"),
    (snapshot) => {
      const list: Project[] = snapshot.docs.map(
        (d) =>
          ({
            id: d.id,
            ...(d.data() as Omit<Project, "id">),
          } as Project)
      );

      list.sort((a, b) => {
        const aT =
          a.createdAt &&
          typeof a.createdAt === "object" &&
          "seconds" in (a.createdAt as object)
            ? (a.createdAt as { seconds: number }).seconds
            : 0;

        const bT =
          b.createdAt &&
          typeof b.createdAt === "object" &&
          "seconds" in (b.createdAt as object)
            ? (b.createdAt as { seconds: number }).seconds
            : 0;

        return bT - aT;
      });

      console.log("[Projects] 📦 Workspace snapshot count:", list.length);
      callback(list);
    },
    (err) => {
      console.error("[Projects] ❌ Listener error:", err.code, err.message);
      callback([]);
    }
  );
}
