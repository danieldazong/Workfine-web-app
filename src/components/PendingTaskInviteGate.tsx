import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  collectionGroup,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase/config";
import { useAuth } from "../context/AuthContext";

interface PendingShare {
  id: string;
  ref: any;
  workspaceId?: string;
  taskId?: string;
  taskTitle?: string;
  taskCode?: string;
  projectName?: string;
  sharedByName?: string;
  invitedByName?: string;
  invitedEmailLower?: string;
  status?: string;
}

function normalizeEmail(email?: string | null): string {
  return String(email || "").trim().toLowerCase();
}

export default function PendingTaskInviteGate() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState<PendingShare[]>([]);
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const myEmailLower = normalizeEmail(user?.email);

  useEffect(() => {
    if (!user?.uid || !myEmailLower) {
      setPending([]);
      return;
    }

    const sharesQuery = query(
      collectionGroup(db, "shares"),
      where("invitedEmailLower", "==", myEmailLower),
      where("status", "==", "pending")
    );

    const unsub = onSnapshot(
      sharesQuery,
      (snap) => {
        const rows: PendingShare[] = snap.docs.map((d) => ({
          id: d.id,
          ref: d.ref,
          ...(d.data() as any),
        }));
        setPending(rows);
      },
      (err) => {
        console.warn("[PendingTaskInviteGate] shares listener:", err.message);
      }
    );

    return () => unsub();
  }, [user?.uid, myEmailLower]);

  const activeInvite = useMemo(() => {
    return pending.find((p) => p.id && !dismissed[p.id]) || null;
  }, [pending, dismissed]);

  if (!user?.uid || !activeInvite) return null;

  const inviterName =
    activeInvite.sharedByName ||
    activeInvite.invitedByName ||
    "A teammate";

  const taskName = activeInvite.taskTitle || "a task";

  async function handleAccept() {
    if (!user || !activeInvite) return;

    const { workspaceId, taskId } = activeInvite;
    if (!workspaceId || !taskId) {
      setErrorMsg("This invite is missing required information.");
      return;
    }

    setBusy(true);
    setErrorMsg("");

    try {
      let freshPhotoURL = user.photoURL || "";
      let freshDisplayName = user.displayName || "";
      try {
        if (typeof (user as any).reload === "function") await (user as any).reload();
        freshPhotoURL = user.photoURL || freshPhotoURL;
        freshDisplayName = user.displayName || freshDisplayName;
        if (!freshPhotoURL && Array.isArray((user as any).providerData)) {
          for (const p of (user as any).providerData)
            if (p?.photoURL) { freshPhotoURL = p.photoURL; break; }
        }
        if (!freshDisplayName && Array.isArray((user as any).providerData)) {
          for (const p of (user as any).providerData)
            if (p?.displayName) { freshDisplayName = p.displayName; break; }
        }
      } catch {}

      let taskData: any = {};
      try {
        const taskSnap = await getDoc(
          doc(db, "workspaces", workspaceId, "tasks", taskId)
        );
        if (taskSnap.exists()) taskData = taskSnap.data();
      } catch (readErr) {
        console.warn("[PendingTaskInviteGate] source task read failed:", readErr);
      }

      // STEP 1 (ARCHITECTURAL RULE): write users/{uid}/tasks/{taskId} FIRST.
      await setDoc(
        doc(db, "users", user.uid, "tasks", taskId),
        {
          ...taskData,
          id: taskId,
          originalTaskId: taskId,
          workspaceId,
          isSharedTask: true,
          sharedWithMe: true,
          shareId: activeInvite.id,
          sharedBy: inviterName,
          title: taskData.title || activeInvite.taskTitle || "Shared task",
          taskCode: taskData.taskCode || activeInvite.taskCode || "",
          status: taskData.status || (activeInvite as any).taskStatus || "To Do",
          priority: taskData.priority || (activeInvite as any).taskPriority || "Low",
          projectId: taskData.projectId || (activeInvite as any).projectId || "",
          projectName: taskData.projectName || activeInvite.projectName || "",
          acceptedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // STEP 2 (NON-FATAL): flip the share to active.
      try {
        const rawAuthEmail = user.email || "";
        await updateDoc(activeInvite.ref, {
          status: "active",
          acceptedBy: user.uid,
          acceptedByUid: user.uid,
          acceptedByEmail: rawAuthEmail,
          acceptedByEmailLower: rawAuthEmail.toLowerCase(),
          acceptedByName:
            freshDisplayName ||
            (rawAuthEmail ? rawAuthEmail.split("@")[0] : ""),
          acceptedByPhotoURL: freshPhotoURL,
          invitedEmailLower: myEmailLower,
          updatedAt: serverTimestamp(),
          acceptedAt: serverTimestamp(),
        });
      } catch (shareErr) {
        console.warn(
          "[PendingTaskInviteGate] share update failed (NON-FATAL):",
          shareErr
        );
      }

      try { localStorage.removeItem("pendingTaskInviteUrl"); } catch {}

      // Capture the task id BEFORE dismissing, so navigation is reliable
      // even after the snapshot listener drops this now-active invite.
      const acceptedTaskId = taskId;
      const acceptedInviteId = activeInvite.id;

      // Close the modal and stop the spinner immediately on the FIRST click.
      // Do NOT wait on the snapshot listener to remove the invite — that race
      // was what made the spinner hang until a second click.
      setDismissed((prev) => ({ ...prev, [acceptedInviteId]: true }));
      setBusy(false);

      // Land the user directly on the shared task in My Tasks.
      // MyTasksPage opens the comment side-drawer from ?highlight=<taskId>.
      navigate(
        `/my-tasks?view=shared&highlight=${encodeURIComponent(acceptedTaskId)}`,
        { replace: true }
      );
      return;
    } catch (err: any) {
      console.error("[PendingTaskInviteGate] accept failed:", err);
      setErrorMsg(err?.message || "Could not accept the invite. Please try again.");
      setBusy(false);
    }
  }

  function handleDecline() {
    if (!activeInvite) return;
    setDismissed((prev) => ({ ...prev, [activeInvite.id]: true }));
    setErrorMsg("");
  }

  const remainingCount = pending.filter((p) => !dismissed[p.id]).length;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-white/40 backdrop-blur-md">
      <div className="w-full max-w-sm rounded-2xl border border-white/60 bg-white/90 shadow-2xl backdrop-blur-xl overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-violet-500 to-indigo-500" />

        <div className="p-6">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-violet-100 text-violet-600 text-2xl">
            📨
          </div>

          <h2 className="text-center text-lg font-semibold text-slate-900">
            You've been invited to a task
          </h2>

          <p className="mt-1 text-center text-sm text-slate-500">
            <span className="font-medium text-slate-700">{inviterName}</span>{" "}
            invited you to collaborate on{" "}
            <span className="font-medium text-slate-700">"{taskName}"</span>.
          </p>

          {remainingCount > 1 && (
            <p className="mt-2 text-center text-[11px] text-slate-400">
              {remainingCount} pending invites — you can review the rest after
              this one.
            </p>
          )}

          {errorMsg && (
            <p className="mt-3 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-500">
              {errorMsg}
            </p>
          )}

          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              onClick={handleAccept}
              disabled={busy}
              className="h-10 w-full rounded-xl bg-violet-600 text-sm font-semibold text-white hover:bg-violet-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {busy ? (
                <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              ) : (
                "Accept invitation"
              )}
            </button>

            <button
              type="button"
              onClick={handleDecline}
              disabled={busy}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-60"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
