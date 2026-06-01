import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

import { db } from "../lib/firebase/config";
import { useAuth } from "../context/AuthContext";
import { activateTaskGuestPerson } from "../lib/firebase/tasks";


type InviteState =
  | "checking-auth"
  | "loading"
  | "ready"
  | "accepting"
  | "accepted"
  | "error";

type TaskInviteData = {
  id: string;
  workspaceId: string;
  taskId: string;

  invitedEmail?: string;
  invitedEmailLower?: string;
  invitedBy?: string;
  invitedByName?: string;
  invitedByEmail?: string;

  sharedWithEmail?: string;
  sharedByUid?: string;
  sharedByName?: string;
  sharedByEmail?: string;

  taskTitle?: string;
  taskCode?: string;
  taskStatus?: string;
  taskPriority?: string;
  taskDueDate?: string;
  projectName?: string;
  message?: string;
  status?: string;
  inviteLink?: string;
  taskLink?: string;
  projectId?: string;
  accessType?: string;
};

type TaskData = {
  id: string;
  title?: string;
  name?: string;
  description?: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  projectName?: string;
  workspaceId?: string;
  projectId?: string;
  taskCode?: string;
  code?: string;
  [key: string]: any;
};
function cleanLower(value: any): string {
  return String(value || "").trim().toLowerCase();
}

function firstText(...values: any[]): string {
  for (const value of values) {
    const clean = String(value ?? "").trim();
    if (clean) return clean;
  }

  return "";
}

export default function AcceptTaskInvitePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const auth = useAuth() as any;
  const user = auth?.user || auth?.currentUser || null;
  const authLoading = Boolean(auth?.loading);

  const workspaceId = searchParams.get("workspaceId") || "";
  const taskId = searchParams.get("taskId") || "";
  const shareId = searchParams.get("shareId") || "";

  const [state, setState] = useState<InviteState>("checking-auth");
  const [error, setError] = useState("");
  const [invite, setInvite] = useState<TaskInviteData | null>(null);
  const [task, setTask] = useState<TaskData | null>(null);

  const currentInviteUrl = useMemo(() => {
    return `/accept-task-invite?workspaceId=${encodeURIComponent(
      workspaceId
    )}&taskId=${encodeURIComponent(taskId)}&shareId=${encodeURIComponent(
      shareId
    )}`;
  }, [workspaceId, taskId, shareId]);
  async function readSourceTaskSafely(): Promise<TaskData | null> {
    if (!workspaceId || !taskId) return null;

    try {
      const taskSnap = await getDoc(
        doc(db, "workspaces", workspaceId, "tasks", taskId)
      );

      if (!taskSnap.exists()) {
        console.warn(
          "[AcceptTaskInvitePage] Source task doc missing. Using invite summary instead:",
          { workspaceId, taskId }
        );

        return null;
      }

      return {
        id: taskSnap.id,
        ...taskSnap.data(),
      } as TaskData;
    } catch (err) {
      console.warn(
        "[AcceptTaskInvitePage] Source task unreadable. Using invite summary instead:",
        err
      );

      return null;
    }
  }

  async function upsertMyTaskCopyFromInvite(
    inviteData: TaskInviteData,
    sourceTask: TaskData | null,
    fresh: { freshDisplayName?: string; freshPhotoURL?: string } = {}
  ) {
    const currentUser = user;

    if (!currentUser?.uid) {
      throw new Error("You must be signed in.");
    }

    if (!workspaceId || !taskId || !shareId) {
      throw new Error("Invite link is missing workspaceId, taskId, or shareId.");
    }

    const taskData = sourceTask || ({ id: taskId } as TaskData);

    const invitedEmailLowerFinal = cleanLower(
      inviteData.invitedEmailLower ||
        inviteData.invitedEmail ||
        inviteData.sharedWithEmail ||
        currentUser.email ||
        ""
    );

    const acceptedByEmailLower = cleanLower(currentUser.email);

    await setDoc(
      doc(db, "users", currentUser.uid, "tasks", taskId),
      {
        ...taskData,

        id: taskId,
        originalTaskId: taskId,
        sharedTaskId: taskId,

        workspaceId,
        shareId,

        title: firstText(
          taskData.title,
          taskData.name,
          inviteData.taskTitle,
          "Untitled Task"
        ),

        taskCode: firstText(
          taskData.taskCode,
          taskData.code,
          inviteData.taskCode
        ),

        status: firstText(taskData.status, inviteData.taskStatus, "To Do"),

        priority: firstText(
          taskData.priority,
          inviteData.taskPriority,
          "Low"
        ),

        dueDate: taskData.dueDate || inviteData.taskDueDate || "",

        projectId: firstText(taskData.projectId, inviteData.projectId),

        projectName: firstText(
          taskData.projectName,
          inviteData.projectName,
          "Shared task"
        ),

        description: firstText(taskData.description, ""),

        isSharedTask: true,
        sharedWithMe: true,
        accessType: inviteData.accessType || "email_invite",

        sharedBy: inviteData.invitedBy || inviteData.sharedByUid || "",
        sharedByUid: inviteData.invitedBy || inviteData.sharedByUid || "",
        sharedByName: inviteData.invitedByName || inviteData.sharedByName || "",
        sharedByEmail:
          inviteData.invitedByEmail || inviteData.sharedByEmail || "",

        acceptedBy: currentUser.uid,
        acceptedByUid: currentUser.uid,
        acceptedByEmail: currentUser.email || "",
        acceptedByEmailLower,

        acceptedByName:
          fresh.freshDisplayName ||
          currentUser.displayName ||
          (currentUser.email ? currentUser.email.split("@")[0] : "") ||
          "",

        acceptedByPhotoURL:
          fresh.freshPhotoURL || currentUser.photoURL || "",

        invitedEmailLower: invitedEmailLowerFinal,

        acceptedAt: serverTimestamp(),
        createdAt:
          taskData.createdAt ||
          (inviteData as any).createdAt ||
          serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    console.log("[AcceptTaskInvitePage] Personal task copy written:", {
      uid: currentUser.uid,
      workspaceId,
      taskId,
      shareId,
    });
  }

  useEffect(() => {
    localStorage.removeItem("currentWorkspaceId");
    localStorage.removeItem("selectedWorkspaceId");
    localStorage.removeItem("workspaceId");

    const loadInvite = async () => {
      try {
        setError("");

        if (!workspaceId || !taskId || !shareId) {
          setState("error");
          setError(
            "This task invite link is missing required information. Please ask the sender to send a new invite."
          );
          return;
        }

        if (authLoading) {
          setState("checking-auth");
          return;
        }

        if (!user) {
          localStorage.setItem("pendingTaskInviteUrl", currentInviteUrl);
          setState("checking-auth");
          return;
        }

        setState("loading");

        const shareRef = doc(
          db,
          "workspaces",
          workspaceId,
          "tasks",
          taskId,
          "shares",
          shareId
        );

        const shareSnap = await getDoc(shareRef);

        if (!shareSnap.exists()) {
          setState("error");
          setError(
            "This task invite could not be found. It may have been deleted or the link may be incorrect."
          );
          return;
        }

        const shareData = {
          id: shareSnap.id,
          workspaceId,
          taskId,
          ...shareSnap.data(),
        } as TaskInviteData;

        if (shareData.status === "revoked") {
          setState("error");
          setError(
            "This task invite has been revoked. Please contact the task owner if you need access."
          );
          return;
        }

        const userEmail = String(user.email || "").toLowerCase();

        const inviteEmail = String(
          shareData.invitedEmailLower ||
            shareData.invitedEmail ||
            shareData.sharedWithEmail ||
            ""
        ).toLowerCase();

        const displayInviteEmail =
          shareData.invitedEmail ||
          shareData.sharedWithEmail ||
          "the invited email";

        if (inviteEmail && userEmail && inviteEmail !== userEmail) {
          setInvite(shareData);
          setState("error");
          setError(
            `This invite was sent to ${displayInviteEmail}, but you are signed in as ${user.email}. Please sign in with the invited email address.`
          );
          return;
        }

               const taskData = await readSourceTaskSafely();

        setInvite(shareData);
        setTask(taskData);

        if (shareData.status === "active" || shareData.status === "accepted") {
          // GLOBAL REPAIR:
          // If the share is already active but users/{uid}/tasks/{taskId}
          // is missing, repair it here.
          try {
            await upsertMyTaskCopyFromInvite(shareData, taskData);
          } catch (repairErr) {
            console.warn(
              "[AcceptTaskInvitePage] Active invite repair failed:",
              repairErr
            );
          }

          setState("accepted");
          return;
        }

        setState("ready");

      } catch (err: any) {
        console.error("Failed to load task invite:", err);
        setState("error");
        setError(
          err?.message ||
            "Something went wrong while loading this task invite."
        );
      }
    };

    loadInvite();
  }, [workspaceId, taskId, shareId, user, authLoading, currentInviteUrl]);

    // ============================================================
  // AUTO-ACCEPT for first-time signups.
  //
  // When a brand-new user clicks an invite link, they go through:
  //   1. /accept-task-invite?... (sees Sign In screen, params saved)
  //   2. /login → Google OAuth → account created
  //   3. Returns to /accept-task-invite?... (AuthContext restores URL)
  //   4. state becomes "ready"
  //
  // Without this hook, the user would have to MANUALLY click
  // "Accept Task Invitation" again. With it, we auto-fire the
  // accept flow as soon as the user is signed in AND the invite
  // is ready. This makes first-click signup work end-to-end.
  // ============================================================
  useEffect(() => {
    if (!user) return;
    if (state !== "ready") return;
    if (!invite) return;
    if (!workspaceId || !taskId || !shareId) return;

    // Only auto-fire for users who just signed up via the invite flow.
    // We detect this by checking if pendingTaskInviteUrl is still set
    // in localStorage (it gets cleared right after auto-accept fires).
    const pending = localStorage.getItem("pendingTaskInviteUrl");
    if (!pending) return;

    console.log(
      "[AcceptTaskInvitePage] Auto-accepting invite for newly signed-in user",
      user.uid
    );

    // Clear the flag first so we never auto-fire twice (e.g., on
    // re-renders or fast-refresh in dev).
    localStorage.removeItem("pendingTaskInviteUrl");

    // Tiny delay so AuthContext can finish ensureUserProfile()
    // before we write users/{uid}/tasks/{taskId}.
    const timer = setTimeout(() => {
      handleAcceptInvite();
    }, 600);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, state, invite?.id, workspaceId, taskId, shareId]);



  const handleSignIn = () => {
    localStorage.setItem("pendingTaskInviteUrl", currentInviteUrl);

    navigate(`/login?redirect=${encodeURIComponent(currentInviteUrl)}`, {
      replace: false,
    });
  };

  const handleAcceptInvite = async () => {
    try {
      if (!user) {
        handleSignIn();
        return;
      }

      if (!workspaceId || !taskId || !shareId || !invite) {
        setState("error");
        setError("This invite is missing required information.");
        return;
      }

      setState("accepting");
      setError("");

      const userEmail = String(user.email || "").toLowerCase();

      const inviteEmail = String(
        invite.invitedEmailLower ||
          invite.invitedEmail ||
          invite.sharedWithEmail ||
          ""
      ).toLowerCase();

      const displayInviteEmail =
        invite.invitedEmail || invite.sharedWithEmail || "the invited email";

      if (inviteEmail && userEmail && inviteEmail !== userEmail) {
        setState("error");
        setError(
          `This invite was sent to ${displayInviteEmail}, but you are signed in as ${user.email}.`
        );
        return;
      }

      const shareRef = doc(
        db,
        "workspaces",
        workspaceId,
        "tasks",
        taskId,
        "shares",
        shareId
      );
            const taskData = await readSourceTaskSafely();

            // ============================================================
      // Refresh auth user so photoURL/displayName are guaranteed populated
      // (Google sign-in sometimes leaves these blank until reload()).
      // ============================================================
      let freshPhotoURL = user.photoURL || "";
      let freshDisplayName = user.displayName || "";
      try {
        if (typeof user.reload === "function") {
          await user.reload();
        }
        freshPhotoURL = user.photoURL || freshPhotoURL;
        freshDisplayName = user.displayName || freshDisplayName;

        if (!freshPhotoURL && Array.isArray(user.providerData)) {
          for (const p of user.providerData) {
            if (p?.photoURL) { freshPhotoURL = p.photoURL; break; }
          }
        }
        if (!freshDisplayName && Array.isArray(user.providerData)) {
          for (const p of user.providerData) {
            if (p?.displayName) { freshDisplayName = p.displayName; break; }
          }
        }
      } catch (reloadErr) {
        console.warn("[AcceptTaskInvitePage] user.reload failed:", reloadErr);
      }

         // CRITICAL: the guest people-doc ID is built from the SAME email that
      // upsertTaskGuestPerson() used at invite time (the share doc's
      // invitedEmailLower). We must reuse that exact value here, otherwise
      // activateTaskGuestPerson() builds a DIFFERENT guest_<id> and writes a
      // phantom doc the Team grid never shows. Prefer the lowercased invite
      // email; fall back only if the share doc somehow lacks it.
      const inviteEmailForGuest =
        invite.invitedEmailLower ||
        invite.invitedEmail ||
        invite.sharedWithEmail ||
        user.email ||
        "";


      const userEmailLower = String(user.email || "").toLowerCase();
      const invitedEmailLowerFinal = String(
        invite.invitedEmailLower ||
          invite.invitedEmail ||
          invite.sharedWithEmail ||
          user.email ||
          ""
      ).toLowerCase();

      // ============================================================
      // STEP 1 — Write the user's personal task copy FIRST.
      // This is the doc MyTasksPage reads. It MUST succeed for the
      // task to appear, so we run it before anything that could fail
      // due to permission rules on the workspace shares doc.
      // ============================================================
            await upsertMyTaskCopyFromInvite(invite, taskData, {
        freshDisplayName,
        freshPhotoURL,
      });


            // ============================================================
      // STEP 2 — Flip the share doc to "active".
      //
      // NON-FATAL: if the rules reject this write for any edge case
      // (case-sensitive email mismatch, missing invitedEmailLower on
      // the original share doc, etc.) we DO NOT throw. The personal
      // task copy from Step 1 has already been written, so /my-tasks
      // will show the task regardless. The share doc will be
      // reconciled later by the inviter re-sharing or by the
      // self-healing reconciler in MyTasksPage.
      // ============================================================
      try {
        const rawAuthEmail = user.email || "";
        const lowerAuthEmail = rawAuthEmail.toLowerCase();

        await updateDoc(shareRef, {
          status: "active",
          acceptedBy: user.uid,
          acceptedByUid: user.uid,
          acceptedByEmail: rawAuthEmail,            // matches request.auth.token.email
          acceptedByEmailLower: lowerAuthEmail,     // matches signedInEmailLower()
          acceptedByName:
            freshDisplayName ||
            (rawAuthEmail ? rawAuthEmail.split("@")[0] : "") ||
            "",
          acceptedByPhotoURL: freshPhotoURL,
          invitedEmailLower: invitedEmailLowerFinal,
          updatedAt: serverTimestamp(),
          acceptedAt: serverTimestamp(),
        });

        console.log("[AcceptTaskInvitePage] Share doc updated to active");
      } catch (shareErr: any) {
        // CRITICAL: do NOT rethrow. The user's personal task is already
        // written. Log it so we can audit which share docs needed
        // reconciliation, but never block the user.
        console.warn(
          "[AcceptTaskInvitePage] Share doc update failed (NON-FATAL, task is already in My Tasks):",
          {
            code: shareErr?.code,
            message: shareErr?.message,
            workspaceId,
            taskId,
            shareId,
          }
        );
      }


            // ============================================================
      // STEP 3 — Activate the External Guest (best-effort, non-blocking).
      // Writes the guest's real photoURL + active status into the
      // workspaces/{wsId}/people/{guestId} doc, which is what the
      // Team page "External Guests" grid reads. Global for all guests.
      // ============================================================
      try {
        await activateTaskGuestPerson({
          workspaceId,
          invitedEmail: inviteEmailForGuest,
          taskId,
          shareId,
          acceptedByUid: user.uid,
          acceptedByEmail: user.email || "",
          acceptedByName:
            freshDisplayName ||
            (user.email ? user.email.split("@")[0] : ""),
          acceptedByPhotoURL: freshPhotoURL,
        });

        console.log("[AcceptTaskInvitePage] External guest activated with photo");
      } catch (guestErr: any) {
        console.warn(
          "[AcceptTaskInvitePage] activateTaskGuestPerson failed (NON-FATAL):",
          guestErr?.message || guestErr
        );
      }

      // Clear the pending-invite flag whether or not this was auto-fired.
      try {
        localStorage.removeItem("pendingTaskInviteUrl");
      } catch {}

      setState("accepted");

            setTimeout(() => {
        navigate(
          `/my-tasks?view=shared&highlight=${encodeURIComponent(taskId)}`,
          { replace: true }
        );
      }, 1200);


    } catch (err: any) {
      console.error("Failed to accept task invite:", err);
      setState("error");
      setError(
        err?.message || "Something went wrong while accepting this invite."
      );
    }
  };

  const taskTitle =
    invite?.taskTitle || task?.title || task?.name || "Untitled Task";

  const taskCode = invite?.taskCode || task?.taskCode || task?.code || "";

  const projectName = invite?.projectName || task?.projectName || "Shared task";

  const taskStatus = invite?.taskStatus || task?.status || "Not set";

  const taskPriority = invite?.taskPriority || task?.priority || "Not set";

  const taskDueDate = invite?.taskDueDate || task?.dueDate || "No due date";

  const inviteSenderName =
    invite?.invitedByName || invite?.sharedByName || "Someone";

  const inviteSenderEmail =
    invite?.invitedByEmail || invite?.sharedByEmail || "";

  const isLoading = state === "loading" || authLoading;

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-600 to-violet-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-7">
          <div className="w-9 h-9 bg-violet-600 rounded-xl flex items-center justify-center shadow-lg">
            <span className="text-white font-extrabold text-sm">W</span>
          </div>
          <span className="text-2xl tracking-tight">
            <span className="font-extrabold text-slate-900">Wurk</span>
            <span className="font-light text-slate-900">fine</span>
          </span>
        </div>

        {/* Loading */}
        {(isLoading || (state === "checking-auth" && authLoading)) && (
          <div className="text-center py-10">
            <div className="w-10 h-10 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-slate-500">
              Verifying your task invitation...
            </p>
          </div>
        )}

        {/* Signed out */}
        {state === "checking-auth" && !authLoading && !user && (
          <div>
            <div className="text-center mb-6">
              <div className="text-4xl mb-3">🔐</div>
              <h2 className="text-xl font-bold text-slate-800 mb-1">
                Sign in required
              </h2>
              <p className="text-sm text-slate-500">
                You have been invited to collaborate on a task. Please sign in
                with the email address that received the invitation.
              </p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 mb-5 space-y-2.5">
              <Row label="Invite type" value="Task invitation" />
              <Row label="Access" value="Shared task" />
              <Row label="Status" value="Waiting for sign in" />
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={handleSignIn}
                className="w-full py-3 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 transition-colors"
              >
                Sign In to Accept
              </button>

              <button
                onClick={handleSignIn}
                className="w-full py-3 border border-violet-300 text-violet-700 rounded-xl text-sm font-semibold hover:bg-violet-50 transition-colors"
              >
                Create Account
              </button>
            </div>
          </div>
        )}

        {/* Valid task invite */}
        {state === "ready" && invite && (
          <div>
            <div className="text-center mb-6">
              <div className="text-4xl mb-3">🎉</div>
              <h2 className="text-xl font-bold text-slate-800 mb-1">
                You've been invited!
              </h2>
              <p className="text-sm text-slate-500">
                <span className="font-semibold text-slate-700">
                  {inviteSenderName}
                </span>{" "}
                invited you to collaborate on{" "}
                <span className="font-semibold text-violet-700">
                  {taskTitle}
                </span>
                .
              </p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 mb-5 space-y-2.5">
              <Row label="Task" value={taskTitle} />

              {taskCode && <Row label="Task Code" value={taskCode} />}

              <Row label="Project" value={projectName} />
              <Row label="Status" value={taskStatus} />
              <Row label="Priority" value={taskPriority} />
              <Row label="Due Date" value={taskDueDate} />
              <Row label="Invited by" value={inviteSenderName} />

              {inviteSenderEmail && (
                <Row label="Sender Email" value={inviteSenderEmail} />
              )}
            </div>

            {invite.message && (
              <p className="text-sm italic text-slate-500 bg-slate-50 rounded-xl p-3 mb-4 text-center">
                "{invite.message}"
              </p>
            )}

                        <button
              onClick={handleAcceptInvite}
              disabled={(state as InviteState) === "accepting"}
              className="w-full py-3 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              Accept Task Invitation →
            </button>


            <button
              onClick={() => navigate("/my-tasks")}
              className="w-full py-3 mt-3 border border-violet-300 text-violet-700 rounded-xl text-sm font-semibold hover:bg-violet-50 transition-colors"
            >
              Not now
            </button>
          </div>
        )}

        {/* Accepting */}
        {state === "accepting" && (
          <div className="text-center py-10">
            <div className="w-10 h-10 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin mx-auto mb-4" />
            <h2 className="text-lg font-bold text-slate-800 mb-1">
              Accepting task invitation...
            </h2>
            <p className="text-sm text-slate-500">
              We are adding this task to your account.
            </p>
          </div>
        )}

        {/* Accepted */}
        {state === "accepted" && (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
              ✅
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-1">
              Task invite accepted
            </h2>
                        <p className="text-sm text-slate-400 mb-6">
              This task has been added to your Shared with me tasks.
            </p>


                        <button
              onClick={() =>
                navigate(
                  `/my-tasks?view=shared&highlight=${encodeURIComponent(taskId)}`,
                  { replace: true }
                )
              }
              className="w-full py-3 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 transition-colors"
            >
              Go to Shared Task
            </button>

          </div>
        )}

        {/* Error */}
        {state === "error" && (
          <div className="text-center py-4">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
              ❌
            </div>
            <h2 className="text-lg font-bold text-slate-800 mb-2">
              Invite Problem
            </h2>
            <p className="text-sm text-slate-500 mb-6">{error}</p>

            <div className="flex flex-col gap-3">
              {!user && (
                <button
                  onClick={handleSignIn}
                  className="w-full py-3 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 transition-colors"
                >
                  Sign In
                </button>
              )}

              <button
                onClick={() => navigate("/my-tasks")}
                className="w-full py-3 border border-violet-300 text-violet-700 rounded-xl text-sm font-semibold hover:bg-violet-50 transition-colors"
              >
                Go to My Tasks
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center gap-4 text-sm">
      <span className="text-slate-400 flex-shrink-0">{label}</span>
      <span className="font-medium text-slate-700 text-right break-words">
        {value || "—"}
      </span>
    </div>
  );
}
