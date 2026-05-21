import {
  collection,
  doc,
  serverTimestamp,
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
