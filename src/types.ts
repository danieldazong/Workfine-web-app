export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";
export type ProjectVisibility = "workspace" | "private";

export interface Project {
  id: string;
  workspaceId: string;

  name: string;
  description: string;
  color: string;

  status: "active" | "archived" | string;
  priority?: "low" | "medium" | "high" | "urgent" | string;
  dueDate?: string | null;
  code?: string | null;

  visibility?: ProjectVisibility;
  pinnedToWorkspace?: boolean;

  memberIds?: string[];
  collaboratorUids?: string[];

  createdBy?: string;
  ownerId?: string;
  uid?: string;

  taskCount?: number;
  completedTaskCount?: number;
  progress?: number;

  createdAt: unknown;
  updatedAt?: unknown;

  [key: string]: any;
}
export type WorkspacePersonType = "guest" | "member";
export type WorkspacePersonStatus = "active" | "inactive" | "pending";
export type WorkspacePersonInvitedVia = "task" | "project" | "workspace";

export interface WorkspacePersonProjectAccess {
  projectId?: string;
  projectName?: string;
  role?: "viewer" | "commenter" | "editor" | string;
  status?: "active" | "removed" | string;
  grantedAt?: any;
  grantedBy?: string;
}

export interface WorkspacePersonTaskAccess {
  taskId: string;
  taskTitle?: string;
  taskCode?: string;
  projectId?: string;
  projectName?: string;
  shareId?: string;
  status?: "active" | "revoked" | string;
  // GLOBAL: per-guest access level for this task. Missing → "commenter".
  guestRole?: "commenter" | "viewer";
  grantedAt?: any;
  grantedBy?: string;
}


export interface WorkspacePerson {
  id?: string;
  userId?: string;
  uid?: string;
  email?: string;
  emailLower?: string;
  displayName?: string;
  photoURL?: string;
  avatarColor?: string;

  type?: WorkspacePersonType;
  status?: WorkspacePersonStatus;
  invitedVia?: WorkspacePersonInvitedVia;
  // GLOBAL: default per-guest access level across this person's task shares.
  guestRole?: "commenter" | "viewer";


  workspaceId?: string;
  invitedBy?: string;
  invitedByName?: string;
  invitedByEmail?: string;

  lastActive?: any;
  createdAt?: any;
  updatedAt?: any;

  projects?: Record<string, WorkspacePersonProjectAccess>;
  tasks?: Record<string, WorkspacePersonTaskAccess>;

  [key: string]: any;
}
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type TaskStatus =
  | "todo"
  | "in-progress"
  | "review"
  | "done"
  | "blocked";

export interface Attachment {
  id?: string;
  name: string;
  url: string;
  type?: string;
  size?: number;
  uploadedAt?: any;
  uploadedBy?: string;
}

export interface Comment {
  id?: string;
  taskId?: string;
  text: string;
  authorId?: string;
  authorName?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  projectId?: string;

  status?: TaskStatus | string;
  priority?: TaskPriority | string;

  assignee?: string;
  assigneeId?: string;
  assigneeIds?: string[];

  dueDate?: any;
  createdAt?: any;
  updatedAt?: any;
  completedAt?: any;

  attachments?: Attachment[];
  comments?: Comment[];

  [key: string]: any;
}

export type AppNotificationType =
  | "mention"
  | "task_comment"
  | "role_change"
  | "task_assignment"
  | "weekly_digest";


export interface AppNotification {
  id: string;
  type: AppNotificationType;

  workspaceId: string;
  projectId?: string;
  taskId: string;
  sourceTaskId?: string;
  commentId?: string;

  /**
   * Required by Firestore rules for creating notifications:
   * users/{recipientUid}/notifications/{notificationId}
   */
  senderUid?: string;
  recipientUid?: string;

  title: string;
  message?: string;

  taskTitle?: string;
  projectName?: string;
  commentPreview?: string;

  actorId: string;
  actorName: string;
  actorPhotoURL?: string;

  read: boolean;
  readAt?: any;

  createdAt?: any;
  createdAtMs: number;

  [key: string]: any;
}

