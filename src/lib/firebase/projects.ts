import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
  arrayUnion,
  query,
  where,
  getDocs,
  writeBatch,
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

  sourceWorkspaceId?: string;
  projectWorkspaceId?: string;
  isPrivateProject?: boolean;
}

function uniqueArray(values: Array<string | undefined | null>): string[] {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

export async function createProject(
  workspaceId: string,
  data: NewProject,
  createdBy?: string
): Promise<string> {
  if (!workspaceId) {
    throw new Error("No workspace found. Please sign out and sign back in.");
  }

  const projectName = data.name?.trim();

  if (!projectName) {
    throw new Error("Project name is required.");
  }

  const creatorId = createdBy ?? data.createdBy ?? data.ownerId ?? "";

  if (!creatorId) {
    throw new Error("Missing creator ID.");
  }

  const visibility: ProjectVisibility = data.visibility ?? "private";

  const isPrivateProject =
    visibility === "private" || data.isPrivateProject === true;

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
    sourceWorkspaceId: data.sourceWorkspaceId ?? workspaceId,
    projectWorkspaceId: data.projectWorkspaceId ?? workspaceId,

    visibility,
    projectScope: isPrivateProject ? "private" : "workspace",
    isPrivateProject,
    pinnedToWorkspace:
      visibility === "workspace" ? data.pinnedToWorkspace ?? true : false,

    memberIds,
    collaboratorUids: memberIds,

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
    `workspaces/${workspaceId}/projects/${docRef.id}`,
    "| visibility:",
    visibility
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
    projectScope: "workspace",
    isPrivateProject: false,
    pinnedToWorkspace: true,
    memberIds: arrayUnion(userId),
    collaboratorUids: arrayUnion(userId),
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

  // 1. Delete all workspace-level tasks that belong to this project.
  //    Per-user mirror copies under users/{uid}/tasks cannot be deleted from
  //    the client (rules forbid writing to another user's tree). They are
  //    reconciled by each client's own listeners after the source is removed.
  try {
    const tasksRef = collection(db, "workspaces", workspaceId, "tasks");
    const projectTasksQuery = query(
      tasksRef,
      where("projectId", "==", projectId)
    );
    const snap = await getDocs(projectTasksQuery);

    // Firestore batches are limited to 500 writes; chunk to stay safe.
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += 450) {
      const batch = writeBatch(db);
      docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    console.log(
      "[Projects] 🧹 Deleted",
      docs.length,
      "workspace tasks for project:",
      projectId
    );
  } catch (err: any) {
    // Do not block project deletion if task cleanup partially fails.
    console.error(
      "[Projects] ⚠️ Task cleanup error (continuing to delete project):",
      err?.code,
      err?.message
    );
  }

  // 2. Delete the project document itself.
  await deleteDoc(doc(db, "workspaces", workspaceId, "projects", projectId));

  console.log("[Projects] 🗑️ Deleted project:", projectId);
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
  const isTaskInviteRoute =
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/accept-task-invite");

  if (isTaskInviteRoute) {
    console.log("[Projects] Skipping project listener on task invite route");
    callback([]);
    return () => {};
  }

  if (!workspaceId) {
    callback([]);
    return () => {};
  }

  console.log("[Projects] 👂 Listening:", workspaceId);

  return onSnapshot(
    collection(db, "workspaces", workspaceId, "projects"),
    (snapshot) => {
      const list: Project[] = snapshot.docs.map((d) => {
        const data = d.data() as any;

        return {
          id: d.id,
          ...data,
          workspaceId: data.workspaceId || workspaceId,
          sourceWorkspaceId: data.sourceWorkspaceId || workspaceId,
          projectWorkspaceId: data.projectWorkspaceId || workspaceId,
          projectScope:
            data.projectScope ||
            (data.visibility === "private" ? "private" : "workspace"),
          isPrivateProject:
            data.isPrivateProject === true || data.visibility === "private",
        } as Project;
      });

      list.sort((a, b) => getSeconds(b.createdAt) - getSeconds(a.createdAt));

      callback(list);
    },
    (err) => {
      if (err.code === "permission-denied") {
        console.warn(
          "[Projects] Project listener skipped because user does not have workspace access:",
          workspaceId
        );
      } else {
        console.error("[Projects] ❌ Listener error:", err.code, err.message);
      }

      callback([]);
    }
  );
}
