
export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";
export type ProjectVisibility = "workspace" | "private";

export interface AccessProjectLike {
  id?: string;
  workspaceId?: string;

  visibility?: ProjectVisibility | string;

  createdBy?: string;
  ownerId?: string;
  uid?: string;

  memberIds?: string[];
  collaboratorUids?: string[];

  pinnedToWorkspace?: boolean;

  [key: string]: any;
}

export function isWorkspaceManager(role?: string | null): boolean {
  return role === "owner" || role === "admin";
}

export function canUserAccessProject(
  project: AccessProjectLike,
  userId?: string,
  role?: string | null
): boolean {
  if (!project || !userId) return false;

  if (isWorkspaceManager(role)) return true;

  if (
    project.createdBy === userId ||
    project.ownerId === userId ||
    project.uid === userId
  ) {
    return true;
  }

  if (!project.visibility || project.visibility === "workspace") {
    return true;
  }

  if (Array.isArray(project.memberIds) && project.memberIds.includes(userId)) {
    return true;
  }

  if (
    Array.isArray(project.collaboratorUids) &&
    project.collaboratorUids.includes(userId)
  ) {
    return true;
  }

  return false;
}

export function canUserEditProject(
  project: AccessProjectLike,
  userId?: string,
  role?: string | null
): boolean {
  if (!project || !userId) return false;

  // Role is the source of truth. Viewer = view only, Member = no edit.
  if (role === "viewer" || role === "member") return false;

  if (isWorkspaceManager(role)) return true;

  // Owner of the project document (only relevant if no managing role above).
  return (
    project.createdBy === userId ||
    project.ownerId === userId ||
    project.uid === userId
  );
}


export function canUserCommentOnProject(
  project: AccessProjectLike,
  userId?: string,
  role?: string | null
): boolean {
  if (!project || !userId) return false;
  if (role === "viewer") return false;
  if (isWorkspaceManager(role)) return true;
  if (role === "member") return true;
  return (
    project.createdBy === userId ||
    project.ownerId === userId ||
    project.uid === userId
  );
}


export function isProjectPinnedToWorkspace(project: AccessProjectLike): boolean {
  return project.pinnedToWorkspace !== false;
}
