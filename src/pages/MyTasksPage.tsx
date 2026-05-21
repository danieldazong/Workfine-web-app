/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query as firestoreQuery,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "../lib/firebase/config";
import { getOverdueTasks } from "../utils/overdueUtils";
import TaskDetailPanel, {
  Task as DetailTask,
} from "../components/TaskDetailPanel";

type FilterType =
  | "All"
  | "Shared with me"
  | "To Do"
  | "In Progress"
  | "In Review"
  | "Done"
  | "Overdue";

const statusColor: Record<string, string> = {
  "To Do": "bg-gray-100 text-gray-600",
  "In Progress": "bg-blue-100 text-blue-600",
  "In Review": "bg-purple-100 text-purple-600",
  Done: "bg-emerald-100 text-emerald-600",
};

const priorityColor: Record<string, string> = {
  High: "bg-red-100 text-red-600",
  Medium: "bg-amber-100 text-amber-600",
  Low: "bg-gray-100 text-gray-500",
};

const FILTERS: FilterType[] = [
  "All",
  "Shared with me",
  "To Do",
  "In Progress",
  "In Review",
  "Done",
  "Overdue",
];

function getTime(value: any): number {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDueDate(value: any): string {
  if (!value) return "";

  try {
    if (typeof value === "string") {
      return new Date(value + "T12:00:00").toLocaleDateString();
    }

    const ms = getTime(value);
    if (!ms) return "";

    return new Date(ms).toLocaleDateString();
  } catch {
    return String(value);
  }
}

function isSharedTask(task: any): boolean {
  return Boolean(
    task?.isSharedTask ||
      task?.sharedWithMe ||
      task?.accessType === "email_invite" ||
      task?.shareId
  );
}

// Maps URL query values to the canonical tab label used in state.
const filterFromQuery = (
  rawFilter: string | null,
  rawView: string | null
): FilterType | null => {
  const raw = rawView || rawFilter;
  if (!raw) return null;

  const key = raw.toLowerCase().trim();

  if (
    key === "shared" ||
    key === "shared-with-me" ||
    key === "shared_with_me" ||
    key === "shared with me"
  ) {
    return "Shared with me";
  }

  const match = FILTERS.find((f) => f.toLowerCase() === key);
  return match ?? null;
};

export default function MyTasksPage() {
    const { user, workspaceId } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();


  const [tasks, setTasks] = useState<any[]>([]);
  const [filter, setFilter] = useState<FilterType>("All");
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(
    null
  );

  const [detailTask, setDetailTask] = useState<DetailTask | null>(null);
  const [editTask, setEditTask] = useState<DetailTask | null>(null);
  const [autoOpenedTaskId, setAutoOpenedTaskId] = useState<string | null>(null);

    const requestedTaskId = useMemo(() => {
    const params = new URLSearchParams(location.search);

    return String(params.get("taskId") || params.get("highlight") || "")
      .trim() || null;
  }, [location.search]);

  const requestedCommentId = useMemo(() => {
    const params = new URLSearchParams(location.search);

    return String(params.get("commentId") || "").trim() || null;
  }, [location.search]);

  const requestedWorkspaceId = useMemo(() => {
    const params = new URLSearchParams(location.search);

    return String(params.get("workspaceId") || workspaceId || "").trim() || null;
  }, [location.search, workspaceId]);

  const requestedProjectId = useMemo(() => {
    const params = new URLSearchParams(location.search);

    return String(params.get("projectId") || "").trim() || null;
  }, [location.search]);




  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    status: "To Do",
    priority: "Medium",
    assignee: "",
    dueDate: "",
  });

  const [editSaving, setEditSaving] = useState(false);

  /**
   * 1. Main My Tasks listener.
   * This reads the user's personal task index:
   *
   * users/{uid}/tasks
   *
   * Accepted task invites must appear here as real documents.
   */
  useEffect(() => {
    if (!user?.uid) {
      setTasks([]);
      return;
    }

    console.log("[MyTasksPage] Listening to user tasks:", user.uid);

    const unsubscribe = onSnapshot(
      collection(db, "users", user.uid, "tasks"),
      (snapshot) => {
        const list = snapshot.docs.map((taskDoc) => ({
          id: taskDoc.id,
          ...taskDoc.data(),
        }));

        list.sort((a: any, b: any) => {
          return (
            getTime(b.acceptedAt || b.createdAt || b.updatedAt) -
            getTime(a.acceptedAt || a.createdAt || a.updatedAt)
          );
        });

        console.log("[MyTasksPage] User tasks loaded:", list.length);
        setTasks(list);
      },
      (error) => {
        console.error("[MyTasksPage] users tasks listener error:", error);
        setTasks([]);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  /**
   * 2. Safety sync for accepted task shares.
   *
   * This makes the app dynamic and robust:
   * if a task share was accepted but the user's task index document is missing,
   * this listener repairs it automatically.
   *
   * It watches all shares where:
   * acceptedByUid === current user uid
   */
  useEffect(() => {
    if (!user?.uid) return;

    const acceptedSharesQuery = firestoreQuery(
      collectionGroup(db, "shares"),
      where("acceptedByUid", "==", user.uid)
    );

    const unsubscribe = onSnapshot(
      acceptedSharesQuery,
      async (snapshot) => {
        if (snapshot.empty) return;

        console.log(
          "[MyTasksPage] Accepted task shares found:",
          snapshot.docs.length
        );

        await Promise.all(
          snapshot.docs.map(async (shareDoc) => {
            try {
              const share = {
                id: shareDoc.id,
                ...shareDoc.data(),
              } as any;

              const shareStatus = String(share.status || "").toLowerCase();

              if (
                shareStatus !== "active" &&
                shareStatus !== "accepted"
              ) {
                return;
              }

              /**
               * Path is:
               * workspaces/{workspaceId}/tasks/{taskId}/shares/{shareId}
               */
              const taskRefFromPath = shareDoc.ref.parent.parent;
              const workspaceRefFromPath = taskRefFromPath?.parent.parent;

              const sourceTaskId =
                share.taskId || taskRefFromPath?.id || "";

              const sourceWorkspaceId =
                share.workspaceId || workspaceRefFromPath?.id || "";

              if (!sourceTaskId || !sourceWorkspaceId) {
                console.warn("[MyTasksPage] Share missing task/workspace id:", {
                  shareId: shareDoc.id,
                  sourceTaskId,
                  sourceWorkspaceId,
                });
                return;
              }

              let sourceTaskData: any = {};

              try {
                const sourceTaskSnap = await getDoc(
                  doc(
                    db,
                    "workspaces",
                    sourceWorkspaceId,
                    "tasks",
                    sourceTaskId
                  )
                );

                if (sourceTaskSnap.exists()) {
                  sourceTaskData = {
                    id: sourceTaskSnap.id,
                    ...sourceTaskSnap.data(),
                  };
                }
              } catch (sourceReadError) {
                console.warn(
                  "[MyTasksPage] Could not read source task. Using share summary instead:",
                  sourceReadError
                );
              }

              const userTaskRef = doc(
                db,
                "users",
                user.uid,
                "tasks",
                sourceTaskId
              );

              await setDoc(
                userTaskRef,
                {
                  ...sourceTaskData,

                  id: sourceTaskId,
                  originalTaskId: sourceTaskId,
                  sharedTaskId: sourceTaskId,

                  workspaceId: sourceWorkspaceId,
                  shareId: shareDoc.id,

                  title:
                    sourceTaskData.title ||
                    sourceTaskData.name ||
                    share.taskTitle ||
                    "Untitled Task",

                  taskCode:
                    sourceTaskData.taskCode ||
                    sourceTaskData.code ||
                    share.taskCode ||
                    "",

                  status:
                    sourceTaskData.status ||
                    share.taskStatus ||
                    "To Do",

                  priority:
                    sourceTaskData.priority ||
                    share.taskPriority ||
                    "Low",

                  dueDate:
                    sourceTaskData.dueDate ||
                    share.taskDueDate ||
                    "",

                  projectId:
                    sourceTaskData.projectId ||
                    share.projectId ||
                    "",

                  projectName:
                    sourceTaskData.projectName ||
                    share.projectName ||
                    "Shared task",

                  description:
                    sourceTaskData.description ||
                    share.description ||
                    "",

                  isSharedTask: true,
                  sharedWithMe: true,
                  accessType: share.accessType || "email_invite",

                  sharedBy:
                    share.invitedBy ||
                    share.sharedByUid ||
                    share.sharedBy ||
                    "",

                  sharedByUid:
                    share.invitedBy ||
                    share.sharedByUid ||
                    share.sharedBy ||
                    "",

                  sharedByName:
                    share.invitedByName ||
                    share.sharedByName ||
                    "Task owner",

                  sharedByEmail:
                    share.invitedByEmail ||
                    share.sharedByEmail ||
                    "",

                  acceptedBy: user.uid,
                  acceptedByUid: user.uid,
                  acceptedByEmail: user.email || share.acceptedByEmail || "",
                  acceptedAt: share.acceptedAt || serverTimestamp(),

                  sourceUpdatedAt:
                    sourceTaskData.updatedAt ||
                    sourceTaskData.createdAt ||
                    null,

                  updatedAt: serverTimestamp(),
                  createdAt:
                    sourceTaskData.createdAt ||
                    share.createdAt ||
                    serverTimestamp(),
                },
                { merge: true }
              );

              console.log(
                "[MyTasksPage] Synced accepted shared task:",
                sourceTaskId
              );
            } catch (error) {
              console.error(
                "[MyTasksPage] Failed to sync accepted shared task:",
                error
              );
            }
          })
        );
      },
      (error) => {
        /**
         * If rules/index are not ready yet, My Tasks will still work from
         * users/{uid}/tasks. This sync is a repair layer.
         */
        console.warn(
          "[MyTasksPage] accepted shares listener warning:",
          error?.code || error
        );
      }
    );

    return () => unsubscribe();
  }, [user?.uid, user?.email]);
   /**
   * 3. Sync filter/highlight/deep-link state from URL.
   *
   * Supports:
   * /my-tasks?view=shared
   * /my-tasks?filter=shared
   * /my-tasks?highlight=TASK_ID
   * /my-tasks?taskId=TASK_ID
   * /my-tasks?taskId=TASK_ID&commentId=COMMENT_ID&workspaceId=WORKSPACE_ID
   */
  useEffect(() => {
    const params = new URLSearchParams(location.search);

    const nextFilter = filterFromQuery(params.get("filter"), params.get("view"));

    if (nextFilter) {
      setFilter(nextFilter);
    }

    const requestedId = String(
      params.get("taskId") || params.get("highlight") || ""
    ).trim();

    if (requestedId) {
      setHighlightedTaskId(requestedId);

      const timeout = window.setTimeout(() => {
        setHighlightedTaskId(null);
      }, 4500);

      return () => window.clearTimeout(timeout);
    }

    setHighlightedTaskId(null);
    setAutoOpenedTaskId(null);
  }, [location.search]);




   /**
   * 4. Deep-link task drawer opening.
   *
   * When user opens:
   * /my-tasks?taskId=abc123
   * /my-tasks?taskId=abc123&commentId=comment123&workspaceId=workspace123
   *
   * This automatically opens TaskDetailPanel and passes commentId
   * so TaskDetailPanel scrolls/highlights the exact comment.
   */
  useEffect(() => {
    if (!requestedTaskId) return;
    if (!user?.uid) return;

    const openKey = `${requestedWorkspaceId || ""}:${requestedTaskId}:${
      requestedCommentId || ""
    }`;

    if (autoOpenedTaskId === openKey) return;

    let cancelled = false;

    async function openRequestedTask() {
      const foundTask = tasks.find((task: any) => {
        return (
          String(task.id || "") === requestedTaskId ||
          String(task.originalTaskId || "") === requestedTaskId ||
          String(task.sharedTaskId || "") === requestedTaskId ||
          String(task.taskCode || "") === requestedTaskId
        );
      });

      if (foundTask) {
        if (cancelled) return;

        setDetailTask(foundTask as unknown as DetailTask);
        setAutoOpenedTaskId(openKey);
        return;
      }

      /**
       * Fallback:
       * If the task is not yet in users/{uid}/tasks, open it directly from
       * workspaces/{workspaceId}/tasks/{taskId}. This is needed for notification
       * deep-links and freshly accepted/shared tasks.
       */
      if (!requestedWorkspaceId) return;

      try {
        const sourceTaskSnap = await getDoc(
          doc(db, "workspaces", requestedWorkspaceId, "tasks", requestedTaskId)
        );

        if (!sourceTaskSnap.exists() || cancelled) return;

        const sourceTask = {
          id: sourceTaskSnap.id,
          ...sourceTaskSnap.data(),
          originalTaskId: sourceTaskSnap.id,
          sharedTaskId: sourceTaskSnap.id,
          workspaceId: requestedWorkspaceId,
          projectId:
            requestedProjectId ||
            String((sourceTaskSnap.data() as any)?.projectId || ""),
        } as DetailTask;

        setDetailTask(sourceTask);
        setAutoOpenedTaskId(openKey);
      } catch (error) {
        console.error("[MyTasksPage] open notification task failed:", error);
      }
    }

    openRequestedTask();

    return () => {
      cancelled = true;
    };
  }, [
    requestedTaskId,
    requestedCommentId,
    requestedWorkspaceId,
    requestedProjectId,
    autoOpenedTaskId,
    tasks,
    user?.uid,
  ]);



  function closeDetailTask() {
    setDetailTask(null);

    const params = new URLSearchParams(location.search);

    if (
      params.has("taskId") ||
      params.has("highlight") ||
      params.has("commentId") ||
      params.has("workspaceId") ||
      params.has("projectId")
    ) {
      params.delete("taskId");
      params.delete("highlight");
      params.delete("commentId");
      params.delete("workspaceId");
      params.delete("projectId");

      const nextSearch = params.toString();

      navigate(
        {
          pathname: location.pathname,
          search: nextSearch ? `?${nextSearch}` : "",
        },
        { replace: true }
      );
    }
  }

  function openEdit(t: DetailTask) {
    setEditTask(t);

    setEditForm({
      title: t.title ?? "",
      description: t.description ?? "",
      status: t.status ?? "To Do",
      priority: t.priority ?? "Medium",
      assignee: t.assignee ?? "",
      dueDate: t.dueDate ?? "",
    });
  }

  async function saveEdit() {
    if (!user?.uid || !editTask || !editForm.title.trim()) return;

    setEditSaving(true);

    try {
      await setDoc(
        doc(db, "users", user.uid, "tasks", editTask.id),
        {
          ...editTask,
          ...editForm,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      /**
       * Non-shared tasks can update the workspace source.
       * Shared tasks stay as user-level task index updates only,
       * unless later you add collaboration permissions.
       */
      const sourceWorkspaceId =
        (editTask as any).workspaceId || workspaceId || "";

      if (sourceWorkspaceId && !(editTask as any).isSharedTask) {
        await updateDoc(
          doc(db, "workspaces", sourceWorkspaceId, "tasks", editTask.id),
          {
            ...editForm,
            updatedAt: serverTimestamp(),
          }
        );
      }

      setEditTask(null);
    } finally {
      setEditSaving(false);
    }
  }

  const overdueTasks = useMemo(() => getOverdueTasks(tasks), [tasks]);

  const overdueIds = useMemo(
    () => new Set(overdueTasks.map((t) => t.id)),
    [overdueTasks]
  );

  const sharedTasks = useMemo(
    () => tasks.filter((task) => isSharedTask(task)),
    [tasks]
  );

  const filteredTasks =
    filter === "All"
      ? tasks
      : filter === "Shared with me"
        ? sharedTasks
        : filter === "Overdue"
          ? overdueTasks
          : tasks.filter((t) => t.status === filter);

  const countForFilter = (f: FilterType): number => {
    if (f === "All") return tasks.length;
    if (f === "Shared with me") return sharedTasks.length;
    if (f === "Overdue") return overdueTasks.length;

    return tasks.filter((t) => t.status === f).length;
  };

  const completedCount = tasks.filter((t) => t.status === "Done").length;

  const toggleDone = async (task: any) => {
    if (!user?.uid) return;

    const newStatus = task.status === "Done" ? "To Do" : "Done";

    await setDoc(
      doc(db, "users", user.uid, "tasks", task.id),
      {
        status: newStatus,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    const sourceWorkspaceId = task.workspaceId || workspaceId || "";

    if (sourceWorkspaceId && !isSharedTask(task)) {
      await updateDoc(
        doc(db, "workspaces", sourceWorkspaceId, "tasks", task.id),
        {
          status: newStatus,
          updatedAt: serverTimestamp(),
        }
      );
    }
  };

  const deleteTask = async (taskId: string) => {
    if (!user?.uid) return;

    const taskToDelete = tasks.find((task: any) => task.id === taskId);

    await deleteDoc(doc(db, "users", user.uid, "tasks", taskId));

    const sourceWorkspaceId = taskToDelete?.workspaceId || workspaceId || "";

    /**
     * For shared tasks, delete only the user's local copy.
     * Do not delete the original source task.
     */
    if (sourceWorkspaceId && taskToDelete && !isSharedTask(taskToDelete)) {
      await deleteDoc(doc(db, "workspaces", sourceWorkspaceId, "tasks", taskId));
    }
  };

  function emptyTitle() {
    if (filter === "All") return "No tasks yet";
    if (filter === "Shared with me") return "No shared tasks yet";
    return `No ${filter} tasks`;
  }

  function emptySubtitle() {
    if (filter === "Shared with me") {
      return "Tasks you accept from invites will appear here instantly.";
    }

    return "Tasks you create or accept will appear here instantly.";
  }

  return (
    <div className="ml-0 bg-[#f4f5f7] min-h-screen overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 pt-14 pb-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
                My Tasks
              </h1>

              <p className="text-sm text-gray-500 mt-1">
                {tasks.length} total &middot; {completedCount} completed
                {sharedTasks.length > 0 && (
                  <>
                    {" "}
                    &middot; {sharedTasks.length} shared with me
                  </>
                )}
              </p>
            </div>

            {sharedTasks.length > 0 && (
              <button
                type="button"
                onClick={() => setFilter("Shared with me")}
                className="hidden sm:inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100 transition-colors"
              >
                Shared with me
                <span className="rounded-full bg-violet-600 text-white px-1.5 py-0.5 text-[10px]">
                  {sharedTasks.length}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {FILTERS.map((f) => {
            const isActive = filter === f;
            const isOverdueTab = f === "Overdue";
            const isSharedTab = f === "Shared with me";

            const className = isOverdueTab
              ? `px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-red-500 text-white"
                    : "bg-red-100 text-red-500 border border-red-200 hover:bg-red-200"
                }`
              : isSharedTab
                ? `px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-violet-600 text-white"
                      : "bg-violet-50 text-violet-600 border border-violet-100 hover:bg-violet-100"
                  }`
                : `px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                  }`;

            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={className}
              >
                {f}
                <span className="ml-1.5 opacity-70">
                  {countForFilter(f)}
                </span>
              </button>
            );
          })}
        </div>

        {/* Task List */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          {filteredTasks.length > 0 ? (
            filteredTasks.map((task, idx) => {
              const shared = isSharedTask(task);
              const highlighted =
  highlightedTaskId === task.id ||
  highlightedTaskId === task.originalTaskId ||
  highlightedTaskId === task.sharedTaskId ||
  highlightedTaskId === task.taskCode;



              return (
                <div
                  key={task.id}
                  onClick={() => setDetailTask(task as unknown as DetailTask)}
                  className={`flex items-center gap-4 px-5 py-4 transition-colors cursor-pointer ${
                    highlighted
                      ? "bg-violet-50 ring-2 ring-violet-200 ring-inset"
                      : "hover:bg-gray-50"
                  } ${
                    idx < filteredTasks.length - 1
                      ? "border-b border-gray-100"
                      : ""
                  }`}
                >
                  {/* Checkbox */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleDone(task);
                    }}
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      task.status === "Done"
                        ? "border-emerald-500 bg-emerald-500"
                        : "border-gray-300 hover:border-blue-400"
                    }`}
                    title={
                      task.status === "Done"
                        ? "Mark as not done"
                        : "Mark as done"
                    }
                  >
                    {task.status === "Done" && (
                      <svg
                        className="w-3 h-3 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </button>

                  {/* Task info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      {task.taskCode && (
                        <span className="text-xs text-slate-400 font-mono flex-shrink-0">
                          {task.taskCode}
                        </span>
                      )}

                      <p
                        className={`text-sm font-medium truncate ${
                          task.status === "Done"
                            ? "line-through text-gray-400"
                            : "text-gray-800"
                        }`}
                      >
                        {task.title || "Untitled Task"}
                      </p>

                      {shared && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-600 border border-violet-100 flex-shrink-0">
                          Shared
                        </span>
                      )}

                      {highlighted && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-100 flex-shrink-0">
                          Added
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-0.5 min-w-0">
                      {task.projectName && (
                        <p className="text-xs text-gray-400 truncate">
                          {task.projectName}
                        </p>
                      )}

                      {task.projectName && task.dueDate && (
                        <span className="text-xs text-gray-300">·</span>
                      )}

                      {task.dueDate && (
                        <p
                          className={`text-xs ${
                            overdueIds.has(task.id)
                              ? "text-red-500 font-medium"
                              : "text-gray-400"
                          }`}
                        >
                          Due: {formatDueDate(task.dueDate)}
                        </p>
                      )}

                      {shared && task.sharedByName && (
                        <>
                          <span className="text-xs text-gray-300">·</span>
                          <p className="text-xs text-gray-400 truncate">
                            Shared by {task.sharedByName}
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Status badge */}
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                      statusColor[task.status] ?? "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {task.status ?? "To Do"}
                  </span>

                  {/* Priority badge */}
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                      priorityColor[task.priority] ??
                      "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {task.priority ?? "Low"}
                  </span>

                  {/* Delete */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteTask(task.id);
                    }}
                    className="text-gray-300 hover:text-red-400 transition-colors text-lg leading-none flex-shrink-0"
                    title={
                      shared
                        ? "Remove from My Tasks"
                        : "Delete task"
                    }
                  >
                    &times;
                  </button>
                </div>
              );
            })
          ) : (
            <div className="py-20 flex flex-col items-center justify-center gap-2">
              <p className="text-gray-400 text-sm font-medium">
                {emptyTitle()}
              </p>

              <p className="text-gray-300 text-xs">
                {emptySubtitle()}
              </p>
            </div>
          )}
        </div>
      </div>

           {detailTask && (
        <TaskDetailPanel
          task={detailTask}
          onClose={closeDetailTask}
          onEdit={(t) => {
            setDetailTask(null);
            openEdit(t);
          }}
          highlightCommentId={requestedCommentId}
        />
      )}


      {editTask && (
        <div className="fixed inset-0 bg-black/50 z-[90] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Edit Task
              </h2>

              <button
                onClick={() => setEditTask(null)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                ✕
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Task Name <span className="text-red-500">*</span>
                </label>

                <input
                  type="text"
                  placeholder="What needs to be done?"
                  value={editForm.title}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      title: e.target.value,
                    }))
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Description
                </label>

                <textarea
                  placeholder="Add more details..."
                  value={editForm.description}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      description: e.target.value,
                    }))
                  }
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Status
                  </label>

                  <select
                    value={editForm.status}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        status: e.target.value,
                      }))
                    }
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {["To Do", "In Progress", "In Review", "Done"].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Priority
                  </label>

                  <select
                    value={editForm.priority}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        priority: e.target.value,
                      }))
                    }
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="Low">🟢 Low</option>
                    <option value="Medium">🟡 Medium</option>
                    <option value="High">🔴 High</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Assignee
                  </label>

                  <input
                    type="text"
                    placeholder="Name or email"
                    value={editForm.assignee}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        assignee: e.target.value,
                      }))
                    }
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Due Date
                  </label>

                  <input
                    type="date"
                    value={editForm.dueDate}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        dueDate: e.target.value,
                      }))
                    }
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="px-6 pb-6 flex gap-2">
              <button
                onClick={() => setEditTask(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>

              <button
                onClick={saveEdit}
                disabled={!editForm.title.trim() || editSaving}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
