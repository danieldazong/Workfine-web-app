import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

import { db } from "./config";
import type { AppNotification, AppNotificationType } from "../../types";

function cleanId(value?: string | null): string {
  return String(value || "").trim();
}

function uniqueCleanIds(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => cleanId(value))
        .filter((value) => Boolean(value) && !value.includes("/")),
    ),
  );
}

function buildNotificationTitle({
  type,
  taskTitle,
}: {
  type: AppNotificationType;
  taskTitle?: string;
}) {
  const safeTaskTitle = String(taskTitle || "this task").trim();

  if (type === "mention") {
    return `You are mentioned in ${safeTaskTitle} Task`;
  }

  return `New comment in ${safeTaskTitle}`;
}

type CreateCommentNotificationsParams = {
  workspaceId: string;
  projectId?: string;
  taskId: string;
  sourceTaskId?: string;
  commentId: string;
  taskTitle?: string;
  projectName?: string;
  commentText?: string;
  authorId: string;
  authorName: string;
  authorPhotoURL?: string;
  mentionedUids?: string[];
  taskMemberUids?: string[];
};

export async function createCommentNotifications({
  workspaceId,
  projectId,
  taskId,
  sourceTaskId,
  commentId,
  taskTitle,
  projectName,
  commentText,
  authorId,
  authorName,
  authorPhotoURL,
  mentionedUids,
  taskMemberUids,
}: CreateCommentNotificationsParams) {
  const safeWorkspaceId = cleanId(workspaceId);
  const safeTaskId = cleanId(taskId || sourceTaskId);
  const safeSourceTaskId = cleanId(sourceTaskId || taskId);
  const safeCommentId = cleanId(commentId);
  const safeAuthorId = cleanId(authorId);

  if (!safeWorkspaceId || !safeTaskId || !safeCommentId || !safeAuthorId) {
    return;
  }

  const cleanMentionedUids = uniqueCleanIds(mentionedUids || []).filter(
    (uid) => uid !== safeAuthorId,
  );

  const cleanTaskMemberUids = uniqueCleanIds(taskMemberUids || []).filter(
    (uid) => uid !== safeAuthorId,
  );

  const recipients = new Map<string, AppNotificationType>();

  /**
   * Normal task members get task_comment notifications.
   */
  cleanTaskMemberUids.forEach((uid) => {
    recipients.set(uid, "task_comment");
  });

  /**
   * Mention notification wins if the same user is also a task member.
   */
  cleanMentionedUids.forEach((uid) => {
    recipients.set(uid, "mention");
  });

  if (recipients.size === 0) {
    return;
  }

  const nowMs = Date.now();
  const batch = writeBatch(db);

  recipients.forEach((type, recipientUid) => {
    const notificationRef = doc(
      collection(db, "users", recipientUid, "notifications"),
    );

    const title = buildNotificationTitle({
      type,
      taskTitle,
    });

        const payload: Omit<AppNotification, "id"> & {
      senderUid: string;
      recipientUid: string;
      commentPreview?: string;
      updatedAt?: any;
    } = {
      type,

      // REQUIRED by your firestore.rules:
      // request.resource.data.senderUid == request.auth.uid
      // request.resource.data.recipientUid == userId
      senderUid: safeAuthorId,
      recipientUid,

      workspaceId: safeWorkspaceId,
      projectId: cleanId(projectId),
      taskId: safeTaskId,
      sourceTaskId: safeSourceTaskId,
      commentId: safeCommentId,

      title,
      message:
        type === "mention"
          ? `${authorName || "Someone"} mentioned you${
              projectName ? ` in ${projectName}` : ""
            }.`
          : `${authorName || "Someone"} commented${
              projectName ? ` in ${projectName}` : ""
            }.`,

      taskTitle: taskTitle || "Untitled task",
      projectName: projectName || "",

      actorId: safeAuthorId,
      actorName: authorName || "User",
      actorPhotoURL: authorPhotoURL || "",

      commentPreview: String(commentText || "").trim().slice(0, 180),

      read: false,
      readAt: null,

      createdAt: serverTimestamp(),
      createdAtMs: nowMs,
      updatedAt: serverTimestamp(),
    };


    batch.set(notificationRef, payload);
  });

  await batch.commit();
}
type CreateRoleChangeNotificationParams = {
  workspaceId: string;
  recipientUid: string;
  newRole: string;
  workspaceName?: string;
  actorId: string;
  actorName?: string;
  actorPhotoURL?: string;
};

// GLOBAL: notifies a member when their workspace role changes.
// Respects the recipient's "roleChangeEmails" preference handled by the caller.
export async function createRoleChangeNotification({
  workspaceId,
  recipientUid,
  newRole,
  workspaceName,
  actorId,
  actorName,
  actorPhotoURL,
}: CreateRoleChangeNotificationParams) {
  const safeWorkspaceId = cleanId(workspaceId);
  const safeRecipientUid = cleanId(recipientUid);
  const safeActorId = cleanId(actorId);
  const safeRole = cleanId(newRole);

  if (!safeWorkspaceId || !safeRecipientUid || !safeActorId || !safeRole) {
    return;
  }

  // Don't notify someone about changing their own role.
  if (safeRecipientUid === safeActorId) return;

  const notificationRef = doc(
    collection(db, "users", safeRecipientUid, "notifications"),
  );

  const roleLabel = safeRole.charAt(0).toUpperCase() + safeRole.slice(1);
  const wsLabel = String(workspaceName || "your workspace").trim();

  const payload = {
    type: "role_change",

    senderUid: safeActorId,
    recipientUid: safeRecipientUid,

    workspaceId: safeWorkspaceId,
    projectId: "",
    taskId: "",
    sourceTaskId: "",
    commentId: "",

    title: `Your role changed to ${roleLabel}`,
    message: `${actorName || "An admin"} changed your role to ${roleLabel} in ${wsLabel}.`,

    taskTitle: "",
    projectName: "",

    actorId: safeActorId,
    actorName: actorName || "An admin",
    actorPhotoURL: actorPhotoURL || "",

    commentPreview: "",

    read: false,
    readAt: null,

    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(notificationRef, payload);
}

type CreateWorkspaceRemovalNotificationParams = {
  workspaceId: string;
  recipientUid: string;
  workspaceName?: string;
  actorId: string;
  actorName?: string;
  actorPhotoURL?: string;
};

// GLOBAL: notifies a user IN REAL TIME that they were removed from a workspace.
// Uses the SAME users/{uid}/notifications pipeline that powers task-invite and
// role-change notifications, so it appears in the live bell instantly. The
// `createdAtMs` field is REQUIRED — useNotifications orderBy("createdAtMs")
// excludes any doc missing it. `type: "workspace_removed"` lets AppShell pop
// the removal modal off this exact notification.
export async function createWorkspaceRemovalNotification({
  workspaceId,
  recipientUid,
  workspaceName,
  actorId,
  actorName,
  actorPhotoURL,
}: CreateWorkspaceRemovalNotificationParams) {
  const safeWorkspaceId = cleanId(workspaceId);
  const safeRecipientUid = cleanId(recipientUid);
  const safeActorId = cleanId(actorId);

  if (!safeWorkspaceId || !safeRecipientUid || !safeActorId) {
    return;
  }

  if (safeRecipientUid === safeActorId) return;

  const wsLabel = String(workspaceName || "a workspace").trim();

  const notificationRef = doc(
    collection(db, "users", safeRecipientUid, "notifications"),
  );

  const payload = {
    type: "workspace_removed",

    // REQUIRED by firestore.rules for notifications/{id} create.
    senderUid: safeActorId,
    recipientUid: safeRecipientUid,

    workspaceId: safeWorkspaceId,
    projectId: "",
    taskId: "",
    sourceTaskId: "",
    commentId: "",

    title: `Removed from ${wsLabel}`,
    message: `You were removed from ${wsLabel}. You'll be returned to your own workspace.`,

    taskTitle: "",
    projectName: wsLabel,

    actorId: safeActorId,
    actorName: actorName || "An admin",
    actorPhotoURL: actorPhotoURL || "",

    commentPreview: "",

    read: false,
    readAt: null,

    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(notificationRef, payload);
}

type CreateTaskAssignmentNotificationParams = {
  workspaceId: string;
  recipientUid: string;
  taskId: string;
  taskTitle?: string;
  projectId?: string;
  projectName?: string;
  actorId: string;
  actorName?: string;
  actorPhotoURL?: string;
};

// GLOBAL: notifies a user when a task is assigned to them.
// Gated by the recipient's notifPrefs.taskEmails preference (checked by caller).
export async function createTaskAssignmentNotification({
  workspaceId,
  recipientUid,
  taskId,
  taskTitle,
  projectId,
  projectName,
  actorId,
  actorName,
  actorPhotoURL,
}: CreateTaskAssignmentNotificationParams) {
  const safeWorkspaceId = cleanId(workspaceId);
  const safeRecipientUid = cleanId(recipientUid);
  const safeTaskId = cleanId(taskId);
  const safeActorId = cleanId(actorId);

  if (!safeWorkspaceId || !safeRecipientUid || !safeTaskId || !safeActorId) {
    return;
  }

  // Don't notify someone about assigning a task to themselves.
  if (safeRecipientUid === safeActorId) return;

  // Respect the recipient's Task Assignments preference (global, per-user).
  try {
    const recipientSnap = await getDoc(doc(db, "users", safeRecipientUid));
    if (recipientSnap.exists()) {
      const prefs = (recipientSnap.data() as any)?.notifPrefs;
      // Default OFF to match the SettingsPage default (taskEmails: false).
      if (!prefs || prefs.taskEmails !== true) {
        return;
      }
    } else {
      return;
    }
  } catch (err) {
    console.warn(
      "[createTaskAssignmentNotification] pref lookup failed (skipping):",
      (err as any)?.message || err,
    );
    return;
  }

  const safeTaskTitle = String(taskTitle || "a task").trim();
  const wsProjectLabel = String(projectName || "").trim();

  const notificationRef = doc(
    collection(db, "users", safeRecipientUid, "notifications"),
  );

  const payload = {
    type: "task_assignment",

    senderUid: safeActorId,
    recipientUid: safeRecipientUid,

    workspaceId: safeWorkspaceId,
    projectId: cleanId(projectId),
    taskId: safeTaskId,
    sourceTaskId: safeTaskId,
    commentId: "",

    title: `You were assigned to ${safeTaskTitle}`,
    message: `${actorName || "Someone"} assigned you to ${safeTaskTitle}${
      wsProjectLabel ? ` in ${wsProjectLabel}` : ""
    }.`,

    taskTitle: safeTaskTitle,
    projectName: wsProjectLabel,

    actorId: safeActorId,
    actorName: actorName || "User",
    actorPhotoURL: actorPhotoURL || "",

    commentPreview: "",

    read: false,
    readAt: null,

    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(notificationRef, payload);
}

export async function markNotificationAsRead(
  userId: string,
  notificationId: string,
) {
  const safeUserId = cleanId(userId);
  const safeNotificationId = cleanId(notificationId);

  if (!safeUserId || !safeNotificationId) return;

  const notificationRef = doc(
    db,
    "users",
    safeUserId,
    "notifications",
    safeNotificationId,
  );

  await updateDoc(notificationRef, {
    read: true,
    readAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function markAllNotificationsAsRead(
  userId: string,
  notifications: Array<{ id?: string; read?: boolean }>,
) {
  const safeUserId = cleanId(userId);

  if (!safeUserId || !Array.isArray(notifications)) return;

  const unreadNotifications = notifications.filter((notification) => {
    return notification?.id && !notification.read;
  });

  if (unreadNotifications.length === 0) return;

  const batch = writeBatch(db);

  unreadNotifications.forEach((notification) => {
    const safeNotificationId = cleanId(notification.id);

    if (!safeNotificationId) return;

    const notificationRef = doc(
      db,
      "users",
      safeUserId,
      "notifications",
      safeNotificationId,
    );

    batch.update(notificationRef, {
      read: true,
      readAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  await batch.commit();
}
