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

        const taskRef = doc(db, "workspaces", workspaceId, "tasks", taskId);
        const taskSnap = await getDoc(taskRef);

        let taskData: TaskData | null = null;

        if (taskSnap.exists()) {
          taskData = {
            id: taskSnap.id,
            ...taskSnap.data(),
          } as TaskData;
        }

        setInvite(shareData);
        setTask(taskData);

        if (shareData.status === "active" || shareData.status === "accepted") {
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

      const taskRef = doc(db, "workspaces", workspaceId, "tasks", taskId);
      const taskSnap = await getDoc(taskRef);

      if (!taskSnap.exists()) {
        setState("error");
        setError(
          "The shared task no longer exists. Please contact the sender."
        );
        return;
      }

      const taskData = {
        id: taskSnap.id,
        ...taskSnap.data(),
      } as TaskData;

      const userTaskRef = doc(db, "users", user.uid, "tasks", taskId);

      await setDoc(
        userTaskRef,
        {
          ...taskData,

          id: taskId,
          originalTaskId: taskId,
          workspaceId,
          sharedTaskId: taskId,
          shareId,

          title:
            taskData.title ||
            taskData.name ||
            invite.taskTitle ||
            "Untitled Task",

          taskCode:
            taskData.taskCode || taskData.code || invite.taskCode || "",

          status: taskData.status || invite.taskStatus || "To Do",

          priority: taskData.priority || invite.taskPriority || "Low",

          dueDate: taskData.dueDate || invite.taskDueDate || "",

          projectId: taskData.projectId || invite.projectId || "",

          projectName:
            taskData.projectName || invite.projectName || "Shared task",

          isSharedTask: true,
          sharedWithMe: true,

          sharedBy: invite.invitedBy || invite.sharedByUid || "",
          sharedByUid: invite.invitedBy || invite.sharedByUid || "",
          sharedByName: invite.invitedByName || invite.sharedByName || "",
          sharedByEmail: invite.invitedByEmail || invite.sharedByEmail || "",

          acceptedBy: user.uid,
          acceptedByUid: user.uid,
          acceptedByEmail: user.email || "",
          acceptedAt: serverTimestamp(),

          createdAt: taskData.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await updateDoc(shareRef, {
        status: "active",

        acceptedBy: user.uid,
        acceptedByUid: user.uid,
        acceptedByEmail: user.email || "",

        updatedAt: serverTimestamp(),
        acceptedAt: serverTimestamp(),
      });

      setState("accepted");

      setTimeout(() => {
        navigate("/my-tasks", { replace: true });
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
              disabled={state === "accepting"}
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
              This task has been added to your My Tasks list.
            </p>

            <button
              onClick={() => navigate("/my-tasks", { replace: true })}
              className="w-full py-3 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 transition-colors"
            >
              Go to My Tasks
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
