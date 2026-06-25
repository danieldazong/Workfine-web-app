/**
 * GLOBAL read-path visibility filter.
 *
 * Decides whether a given task should be visible to the current user.
 * This is READ-ONLY scoping — it never writes, never changes roles,
 * never touches invite/permission documents. It simply mirrors the
 * exact ownership/assignment/shared checks already used inside
 * AppDataContext.publishAccessibleData(), extracted so externally-merged
 * tasks get filtered the SAME way instead of leaking wholesale.
 */
export interface VisibilityCtx {
  uid: string;
  email: string; // lowercased
  accessibleProjectIds: Set<string>;
}

export function isTaskVisibleToUser(task: any, ctx: VisibilityCtx): boolean {
  if (!task) return false;
  const { uid, email, accessibleProjectIds } = ctx;

  const taskProjectId = String(task.projectId || "").trim();
  if (taskProjectId && accessibleProjectIds.has(taskProjectId)) return true;

  // Explicitly shared with this user.
  if (
    task.isSharedTask ||
    task.sharedWithMe ||
    task.accessType === "email_invite" ||
    task.shareId
  ) {
    return true;
  }

  // Owned / created by this user.
  if (task.createdBy === uid || task.ownerId === uid || task.uid === uid) {
    return true;
  }

  // Assigned by uid.
  if (task.assigneeId === uid || task.assignedToUid === uid) return true;
  if (Array.isArray(task.assigneeIds) && task.assigneeIds.includes(uid)) return true;
  if (Array.isArray(task.assignedTo) && task.assignedTo.includes(uid)) return true;
  if (Array.isArray(task.memberIds) && task.memberIds.includes(uid)) return true;
  if (
    Array.isArray(task.collaboratorUids) &&
    task.collaboratorUids.includes(uid)
  ) {
    return true;
  }

  // Assigned by email.
  if (
    email &&
    typeof task.assignee === "string" &&
    task.assignee.toLowerCase().trim() === email
  ) {
    return true;
  }
  if (
    email &&
    typeof task.assigneeEmail === "string" &&
    task.assigneeEmail.toLowerCase().trim() === email
  ) {
    return true;
  }
  if (
    email &&
    Array.isArray(task.assigneeEmails) &&
    task.assigneeEmails
      .map((e: any) => String(e).toLowerCase().trim())
      .includes(email)
  ) {
    return true;
  }

  return false;
}
