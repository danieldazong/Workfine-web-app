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
  arrayUnion,
} from "firebase/firestore";
import { db } from "./config";
import { Project, ProjectVisibility } from "../../types";

export interface NewProject {
  name: string;
  description?: string;
  color?: string;
  status?: string;
  priority?: string;
  dueDate?: string | null;
  code?: string | null;

  visibility?: ProjectVisibility;
  pinnedToWorkspace?: boolean;
  memberIds?: string[];

  createdBy?: string;
  ownerId?: string;
  workspaceId?: string;
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

function uniqueArray(values: Array<string | undefined | null>): string[] {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

export async function createProject(
  workspaceId: string,
  data: NewProject,
  createdBy?: string
): Promise<string> {
  if (!workspaceId) throw new Error("No active workspace.");

  const projectName = data.name?.trim();

  if (!projectName) {
    throw new Error("Project name is required.");
  }

  await ensureWorkspaceDocExists(workspaceId);

  const creatorId = createdBy ?? data.createdBy ?? data.ownerId ?? "";
  const visibility: ProjectVisibility = data.visibility ?? "workspace";

  const memberIds = uniqueArray([
    creatorId,
    ...(Array.isArray(data.memberIds) ? data.memberIds : []),
  ]);

  const projectsRef = collection(db, "workspaces", workspaceId, "projects");

  const docRef = await addDoc(projectsRef, {
    name: projectName,
    description: data.description?.trim() ?? "",
    color: data.color ?? "#6366f1",

    status: data.status ?? "active",
    priority: data.priority ?? "medium",
    dueDate: data.dueDate ?? null,
    code: data.code ?? null,

    workspaceId,

    visibility,
    pinnedToWorkspace:
      visibility === "workspace" ? data.pinnedToWorkspace ?? true : false,

    memberIds,

    createdBy: creatorId,
    ownerId: creatorId,
    uid: creatorId,

    taskCount: 0,
    completedTaskCount: 0,
    progress: 0,

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  console.log(
    "[Projects] ✅ Created:",
    `workspaces/${workspaceId}/projects/${docRef.id}`
  );

  return docRef.id;
}

export async function updateProject(
  workspaceId: string,
  projectId: string,
  updates: Partial<Project>
): Promise<void> {
  if (!workspaceId) throw new Error("Workspace ID is required.");
  if (!projectId) throw new Error("Project ID is required.");

  await updateDoc(doc(db, "workspaces", workspaceId, "projects", projectId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });

  console.log("[Projects] ✏️ Updated:", projectId);
}

export async function addExistingProjectToWorkspace(
  workspaceId: string,
  projectId: string,
  userId: string
): Promise<void> {
  if (!workspaceId) throw new Error("Workspace ID is required.");
  if (!projectId) throw new Error("Project ID is required.");
  if (!userId) throw new Error("User ID is required.");

  await updateDoc(doc(db, "workspaces", workspaceId, "projects", projectId), {
    visibility: "workspace",
    pinnedToWorkspace: true,
    memberIds: arrayUnion(userId),
    updatedAt: serverTimestamp(),
  });

  console.log("[Projects] 📌 Added existing project to workspace:", projectId);
}

export async function removeProjectFromWorkspaceCuratedWork(
  workspaceId: string,
  projectId: string
): Promise<void> {
  if (!workspaceId) throw new Error("Workspace ID is required.");
  if (!projectId) throw new Error("Project ID is required.");

  await updateDoc(doc(db, "workspaces", workspaceId, "projects", projectId), {
    pinnedToWorkspace: false,
    updatedAt: serverTimestamp(),
  });

  console.log("[Projects] 📌 Removed from curated work:", projectId);
}

export async function deleteProject(
  workspaceId: string,
  projectId: string
): Promise<void> {
  if (!workspaceId) throw new Error("Workspace ID is required.");
  if (!projectId) throw new Error("Project ID is required.");

  await deleteDoc(doc(db, "workspaces", workspaceId, "projects", projectId));

  console.log("[Projects] 🗑️ Deleted:", projectId);
}

function getSeconds(value: any): number {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") {
    return Math.floor(value.toMillis() / 1000);
  }
  if (typeof value?.seconds === "number") {
    return value.seconds;
  }

  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

export function subscribeToProjects(
  workspaceId: string,
  callback: (projects: Project[]) => void
): Unsubscribe {
  if (!workspaceId) {
    callback([]);
    return () => {};
  }

  console.log("[Projects] 👂 Listening:", workspaceId);

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

      list.sort((a, b) => getSeconds(b.createdAt) - getSeconds(a.createdAt));

      callback(list);
    },
    (err) => {
      console.error("[Projects] ❌ Listener error:", err.code, err.message);
      callback([]);
    }
  );
}
