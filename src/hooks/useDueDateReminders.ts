/**
 * In-app due-date reminder scheduler (client-side, global for every account).
 *
 * SCOPE / HONEST LIMIT:
 *  - Fires reminders ONLY while the app is open for the signed-in user.
 *  - For reminders when the app is CLOSED you need a scheduled Cloud Function.
 *    That backend piece is intentionally NOT here. See the SERVER NOTE below.
 *
 * It reads the user's own tasks (users/{uid}/tasks) and, when a task crosses a
 * reminder threshold (24h, 1h, due-now), writes a self-notification into the
 * SAME users/{uid}/notifications collection the bell already reads. Dedupe is
 * handled by a deterministic doc id so a threshold never double-fires.
 */
import { useEffect } from "react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase/config";

type Threshold = { key: string; ms: number; label: string };

// Reminder windows before the due moment.
const THRESHOLDS: Threshold[] = [
  { key: "24h", ms: 24 * 60 * 60 * 1000, label: "due in 24 hours" },
  { key: "1h", ms: 60 * 60 * 1000, label: "due in 1 hour" },
  { key: "now", ms: 0, label: "is due now" },
];

// How often we re-check (60s is plenty and cheap).
const CHECK_INTERVAL_MS = 60 * 1000;

// Build a Date from the existing dueDate (+ optional dueTime) without using the
// "T12:00:00" trick — kept isolated here so we never touch existing parsing.
function resolveDueMs(task: any): number {
  const dateStr = String(task?.dueDate || "").trim();
  if (!dateStr) return 0;

  const timeStr = String(task?.dueTime || "").trim(); // "HH:mm" or ""
  // If no time was set, treat the deadline as end-of-day (23:59) so a date-only
  // task doesn't fire "due now" at midnight.
  const composed = timeStr
    ? `${dateStr}T${timeStr}:00`
    : `${dateStr}T23:59:00`;

  const ms = new Date(composed).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function isDone(task: any): boolean {
  const s = String(task?.status || "").toLowerCase();
  return s === "done" || s === "completed";
}

export function useDueDateReminders(userId?: string | null) {
  useEffect(() => {
    const uid = String(userId || "").trim();
    if (!uid) return;

    let tasks: any[] = [];

    const unsub = onSnapshot(
      collection(db, "users", uid, "tasks"),
      (snap) => {
        tasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      },
      (err) => {
        console.warn("[useDueDateReminders] tasks listener:", err.code);
        tasks = [];
      }
    );

    const tick = async () => {
      const now = Date.now();

      for (const task of tasks) {
        if (isDone(task)) continue;

        const dueMs = resolveDueMs(task);
        if (!dueMs) continue;

        const remaining = dueMs - now;

        // Find the tightest threshold this task currently satisfies.
        // We only fire a threshold once the task is at/under it AND not already
        // overdue past the next tighter window (prevents firing all 3 at once
        // for a long-overdue task — only "now" fires then).
        let hit: Threshold | null = null;
        for (const t of THRESHOLDS) {
          if (remaining <= t.ms) {
            hit = t; // keep going; THRESHOLDS is ordered widest→tightest
          }
        }
        if (!hit) continue;

        // Deterministic id => one notification per task per threshold, ever.
        const notifId = `due_${task.id}_${hit.key}`;
        const notifRef = doc(db, "users", uid, "notifications", notifId);

        try {
          const existing = await getDoc(notifRef);
          if (existing.exists()) continue;

          const taskTitle = String(task?.title || "a task").trim();

          // Shape mirrors createTaskAssignmentNotification() exactly so the
          // existing useNotifications mapper + bell render it unchanged.
          await setDoc(notifRef, {
            type: "task_assignment", // reuse an existing rendered type

            // firestore.rules require these on create:
            senderUid: uid,
            recipientUid: uid,

            workspaceId: String(task?.workspaceId || ""),
            projectId: String(task?.projectId || ""),
            taskId: String(task.id || ""),
            sourceTaskId: String(task.id || ""),
            commentId: "",

            title: `Reminder: "${taskTitle}" ${hit.label}`,
            message: `Your task "${taskTitle}" ${hit.label}.`,

            taskTitle,
            projectName: String(task?.projectName || ""),

            actorId: uid,
            actorName: "Reminder",
            actorPhotoURL: "",

            commentPreview: "",

            read: false,
            readAt: null,

            createdAt: serverTimestamp(),
            createdAtMs: Date.now(),
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          console.warn(
            "[useDueDateReminders] write skipped:",
            notifId,
            (err as any)?.code || err
          );
        }
      }
    };

    // Run once on mount, then on an interval.
    tick();
    const timer = window.setInterval(tick, CHECK_INTERVAL_MS);

    return () => {
      unsub();
      window.clearInterval(timer);
    };
  }, [userId]);
}

/*
 * SERVER NOTE (do NOT implement client-side):
 * To remind users when the app is closed, add a scheduled Cloud Function
 * (e.g. every 15 min) that performs the same threshold check server-side and
 * writes the same users/{uid}/notifications doc. The deterministic notifId
 * here (`due_<taskId>_<threshold>`) is intentionally collision-safe with that
 * function so the two never double-fire.
 */
