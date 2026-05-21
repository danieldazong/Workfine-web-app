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

  attachments?: Attachment[];
  comments?: Comment[];

  [key: string]: any;
}
export type AppNotificationType = "mention" | "task_comment";

export interface AppNotification {
  id: string;
  type: AppNotificationType;

  workspaceId: string;
  projectId?: string;
  taskId: string;
  sourceTaskId?: string;
  commentId?: string;

  title: string;
  message?: string;

  taskTitle?: string;
  projectName?: string;

  actorId: string;
  actorName: string;
  actorPhotoURL?: string;

  read: boolean;
  readAt?: any;

  createdAt?: any;
  createdAtMs: number;

  [key: string]: any;
}
