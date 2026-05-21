import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../lib/firebase/config";
import type { AppNotification } from "../types";

export function useNotifications(userId?: string | null) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const safeUserId = String(userId || "").trim();

    if (!safeUserId) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const notificationsQuery = query(
      collection(db, "users", safeUserId, "notifications"),
      orderBy("createdAtMs", "desc"),
      limit(40),
    );

    const unsubscribe = onSnapshot(
      notificationsQuery,
      (snapshot) => {
        const data: AppNotification[] = snapshot.docs.map((notificationDoc) => {
          const raw = notificationDoc.data() as Partial<AppNotification> & {
            commentPreview?: string;
          };

          return {
            id: notificationDoc.id,
            type: raw.type === "mention" ? "mention" : "task_comment",

            workspaceId: String(raw.workspaceId || ""),
            projectId: String(raw.projectId || ""),
            taskId: String(raw.taskId || raw.sourceTaskId || ""),
            sourceTaskId: String(raw.sourceTaskId || raw.taskId || ""),
            commentId: String(raw.commentId || ""),

            title: String(raw.title || "Notification"),
            message: String(raw.message || ""),
            taskTitle: String(raw.taskTitle || ""),
            projectName: String(raw.projectName || ""),

            actorId: String(raw.actorId || ""),
            actorName: String(raw.actorName || "Someone"),
            actorPhotoURL: String(raw.actorPhotoURL || ""),

            commentPreview: String(raw.commentPreview || ""),

            read: Boolean(raw.read),
            readAt: raw.readAt ?? null,

            createdAt: raw.createdAt ?? null,
            createdAtMs: Number(raw.createdAtMs || 0),
          } as AppNotification;
        });

        setNotifications(data);
        setLoading(false);
      },
      (error) => {
        console.error("[useNotifications] listener:", error.message);
        setNotifications([]);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [userId]);

  const unreadCount = useMemo(() => {
    return notifications.filter((notification) => !notification.read).length;
  }, [notifications]);

  const markAsRead = async (notificationId: string) => {
    const safeUserId = String(userId || "").trim();
    const safeNotificationId = String(notificationId || "").trim();

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
  };

  const markAllAsRead = async () => {
    const safeUserId = String(userId || "").trim();

    if (!safeUserId) return;

    const unreadNotifications = notifications.filter((notification) => {
      return notification.id && !notification.read;
    });

    if (unreadNotifications.length === 0) return;

    const batch = writeBatch(db);

    unreadNotifications.forEach((notification) => {
      const notificationRef = doc(
        db,
        "users",
        safeUserId,
        "notifications",
        notification.id,
      );

      batch.update(notificationRef, {
        read: true,
        readAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    await batch.commit();
  };

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
  };
}
