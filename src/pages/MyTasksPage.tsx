  /**
   * @license
   * SPDX-License-Identifier: Apache-2.0
   */

  import React, { useState, useEffect, useMemo } from "react";
  import { useLocation, useNavigate } from "react-router-dom";
  import { useAuth } from "../context/AuthContext";
  import { useAppData } from "../context/AppDataContext";
    import {
    collection,
    collectionGroup,
    deleteDoc,
    deleteField,
    doc,
    getDoc,
    getDocs,
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
      const { tasks: workspaceTasks, members, workspaceData } = useAppData();

    const myRole = (() => {
      if (workspaceData?.ownerId === user?.uid) return "owner";
      const mine = (Array.isArray(members) ? members : []).find((m: any) => {
        const memberUid = m.userId || m.uid || m.id;
        return !!user?.uid && memberUid === user.uid;
      });
      return String(mine?.role || "viewer").toLowerCase();
    })();

    const isViewerOnly = myRole === "viewer";

    const location = useLocation();
    const navigate = useNavigate();

    const [userTaskIndex, setUserTaskIndex] = useState<any[]>([]);

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

    const tasks = useMemo(() => {
      const merged = new Map<string, any>();

      const putTask = (task: any, source: "workspace" | "user") => {
        if (!task) return;

        const id = String(
          task.id ||
            task.originalTaskId ||
            task.sharedTaskId ||
            task.taskId ||
            ""
        ).trim();

        if (!id) return;

        const existing = merged.get(id);

        const normalizedTask = {
          ...task,
          id,
          workspaceId: task.workspaceId || workspaceId || "",
          source,
        };

        if (!existing) {
          merged.set(id, normalizedTask);
          return;
        }

        /**
         * Keep canonical workspace task data fresh.
         * Keep user-index metadata for accepted/shared tasks.
         */
        merged.set(id, {
          ...existing,
          ...normalizedTask,
          isSharedTask:
            existing.isSharedTask === true || normalizedTask.isSharedTask === true,
          sharedWithMe:
            existing.sharedWithMe === true || normalizedTask.sharedWithMe === true,
          shareId: normalizedTask.shareId || existing.shareId || "",
          accessType: normalizedTask.accessType || existing.accessType || "",
        });
      };

      workspaceTasks.forEach((task: any) => putTask(task, "workspace"));
      userTaskIndex.forEach((task: any) => putTask(task, "user"));

      return Array.from(merged.values()).sort((a: any, b: any) => {
        return (
          getTime(b.updatedAt || b.acceptedAt || b.createdAt) -
          getTime(a.updatedAt || a.acceptedAt || a.createdAt)
        );
      });
    }, [workspaceTasks, userTaskIndex, workspaceId]);


      /**
   * 1. Main My Tasks listener — RESILIENT VERSION.
   *
   * Reads users/{uid}/tasks (the canonical source for /my-tasks).
   *
   * Hardened to survive:
   *  - the auth-warmup race (rules briefly reject reads right after sign-in)
   *  - brand-new users whose users/{uid} doc is still being created by
   *    AuthContext.ensureUserProfile()
   *  - transient network errors
   *
   * On any transient error we re-subscribe with exponential backoff
   * instead of silently giving up with setUserTaskIndex([]).
   * This is what makes the page work universally for every newly
   * invited account on first sign-in.
   */
  useEffect(() => {
    if (!user?.uid) {
      setUserTaskIndex([]);
      return;
    }

    let cancelled = false;
    let activeUnsub: (() => void) | null = null;
    let retryTimer: number | null = null;
    let attempt = 0;

    const RETRY_DELAYS_MS = [250, 500, 1000, 2000, 4000, 8000];

    const subscribe = () => {
      if (cancelled || !user?.uid) return;

      console.log(
        `[MyTasksPage] Subscribing to users/${user.uid}/tasks (attempt ${attempt + 1})`
      );

      activeUnsub = onSnapshot(
        collection(db, "users", user.uid, "tasks"),
        (snapshot) => {
          if (cancelled) return;

          // Successful read — reset retry counter.
          attempt = 0;

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
          setUserTaskIndex(list);
        },
        (error) => {
          if (cancelled) return;

          const code = String((error as any)?.code || "").toLowerCase();

          const isTransient =
            code === "permission-denied" ||
            code === "unauthenticated" ||
            code === "failed-precondition" ||
            code === "unavailable" ||
            code === "deadline-exceeded" ||
            code === "internal" ||
            code === "cancelled";

          console.warn(
            `[MyTasksPage] users tasks listener error (transient=${isTransient}):`,
            code || error
          );

          // Tear down the failed subscription before retrying.
          if (activeUnsub) {
            try {
              activeUnsub();
            } catch {}
            activeUnsub = null;
          }

          if (!isTransient) {
            setUserTaskIndex([]);
            return;
          }

          const delay =
            RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
          attempt += 1;

          retryTimer = window.setTimeout(subscribe, delay);
        }
      );
    };

    subscribe();

    return () => {
      cancelled = true;
      if (retryTimer) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
      if (activeUnsub) {
        try {
          activeUnsub();
        } catch {}
        activeUnsub = null;
      }
    };
  }, [user?.uid]);


      /**
   * 2. Self-healing reconciler for shared tasks — UNIVERSAL VERSION.
   *
   * Previous approach used 6 single-field collectionGroup listeners.
   * Those require single-field collection-group indexes to be ENABLED for
   * every field name we query, which is not the default in Firestore and
   * is fragile. They all failed with `failed-precondition` in console.
   *
   * New approach: a one-shot reconciler that runs on mount (and whenever
   * the user's email becomes known). It scans the user's own notifications
   * (which they always have read permission for) and back-fills any
   * personal task copies that are missing in users/{uid}/tasks.
   *
   * The CANONICAL guarantee for "the task shows up in /my-tasks" is the
   * write performed by AcceptTaskInvitePage.upsertMyTaskCopyFromInvite()
   * to users/{uid}/tasks/{taskId}, which happens BEFORE the redirect.
   *
   * This reconciler exists ONLY to repair the rare case where the personal
   * task copy was deleted manually or the original write was lost.
   */
  useEffect(() => {
    if (!user?.uid) return;

    let cancelled = false;

    const reconcile = async () => {
      try {
        const { getDocs, query: q, limit: lim } = await import(
          "firebase/firestore"
        );

        const notifsSnap = await getDocs(
          q(collection(db, "users", user.uid, "notifications"), lim(50))
        );

        if (cancelled || notifsSnap.empty) return;

        const candidates: Array<{
          workspaceId: string;
          taskId: string;
          shareId?: string;
        }> = [];

        notifsSnap.forEach((n) => {
          const d = n.data() as any;
          const wid = String(d?.workspaceId || "").trim();
          const tid = String(d?.taskId || "").trim();
          if (wid && tid) {
            candidates.push({
              workspaceId: wid,
              taskId: tid,
              shareId: String(d?.shareId || "") || undefined,
            });
          }
        });

        if (candidates.length === 0) return;

        const missing: typeof candidates = [];
        for (const c of candidates) {
          try {
            const existing = await getDoc(
              doc(db, "users", user.uid, "tasks", c.taskId)
            );
            if (!existing.exists()) missing.push(c);
          } catch {
            // ignore
          }
        }

        if (cancelled || missing.length === 0) return;

        console.log(
          "[MyTasksPage] Reconciler found",
          missing.length,
          "missing personal task copies — repairing"
        );

        await Promise.all(
          missing.map(async (c) => {
            try {
                            const srcSnap = await getDoc(
                doc(db, "workspaces", c.workspaceId, "tasks", c.taskId)
              );
              if (!srcSnap.exists()) return;
              const src = srcSnap.data() as any;

              // Recover the REAL owner from the share doc if the source task
              // doc happens to be missing owner fields (older tasks).
              let shareOwner: any = {};
              if (c.shareId) {
                try {
                  const shareSnap = await getDoc(
                    doc(
                      db,
                      "workspaces",
                      c.workspaceId,
                      "tasks",
                      c.taskId,
                      "shares",
                      c.shareId
                    )
                  );
                  if (shareSnap.exists()) shareOwner = shareSnap.data() as any;
                } catch {
                  // ignore
                }
              }

              const ownerId =
                src.ownerId ||
                src.createdBy ||
                src.createdByUid ||
                shareOwner.invitedBy ||
                shareOwner.sharedByUid ||
                "";

              const ownerEmail =
                src.ownerEmail ||
                src.createdByEmail ||
                shareOwner.invitedByEmail ||
                shareOwner.sharedByEmail ||
                "";

              const ownerName =
                src.ownerName ||
                shareOwner.invitedByName ||
                shareOwner.sharedByName ||
                "";

              await setDoc(
                doc(db, "users", user.uid!, "tasks", c.taskId),
                {
                  ...src,
                  id: c.taskId,
                  originalTaskId: c.taskId,
                  sharedTaskId: c.taskId,
                  workspaceId: c.workspaceId,
                  shareId: c.shareId || "",

                  // GLOBAL OWNER PRESERVATION — never the current user.
                  ownerId,
                  createdBy: src.createdBy || ownerId,
                  createdByEmail: ownerEmail,
                  ownerEmail,
                  ownerName,

                  isSharedTask: true,
                  sharedWithMe: true,
                  accessType: "email_invite",
                  acceptedBy: user.uid,
                  acceptedByUid: user.uid,
                  acceptedByEmail: user.email || "",
                  acceptedByEmailLower: String(user.email || "").toLowerCase(),
                  acceptedAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                  createdAt: src.createdAt || serverTimestamp(),
                },
                { merge: true }
              );

              console.log("[MyTasksPage] Reconciler repaired:", c.taskId);
            } catch (err) {
              console.warn(
                "[MyTasksPage] Reconciler repair failed:",
                c.taskId,
                err
              );
            }
          })
        );
      } catch (err) {
        console.warn(
          "[MyTasksPage] Reconciler scan failed (non-fatal):",
          err
        );
      }
    };

    reconcile();

    return () => {
      cancelled = true;
    };
  }, [user?.uid, user?.email]);


  /**
   * 2b. Owner-field backfill for ALREADY-ACCEPTED shared tasks.
   *
   * Existing invitees have a personal task copy that was written before the
   * owner-preservation fix, so it may be missing ownerId/createdByEmail.
   * Without those, TaskDetailPanel falls back to showing the VIEWER as Owner.
   *
   * This effect runs once whenever the user's shared tasks load. For each
   * shared task missing owner fields, it recovers the real owner from the
   * canonical share doc (invitedBy / invitedByEmail) or the source task,
   * then merges the owner fields back into users/{uid}/tasks/{taskId}.
   *
   * Idempotent: any task that already has ownerId AND createdByEmail is
   * skipped, so it never re-writes and never loops.
   */
  useEffect(() => {
    if (!user?.uid) return;

    let cancelled = false;

    const backfillOwners = async () => {
      // Only look at the user's own copies that are shared and missing owner.
      const needsRepair = (Array.isArray(userTaskIndex) ? userTaskIndex : [])
        .filter((t: any) => isSharedTask(t))
        .filter((t: any) => {
          const hasOwnerId = String(t.ownerId || t.createdBy || "").trim();
          const hasOwnerEmail = String(
            t.ownerEmail || t.createdByEmail || ""
          ).trim();
          return !hasOwnerId || !hasOwnerEmail;
        });

      if (cancelled || needsRepair.length === 0) return;

      console.log(
        "[MyTasksPage] Owner backfill: repairing",
        needsRepair.length,
        "shared task(s) missing owner fields"
      );

      await Promise.all(
        needsRepair.map(async (t: any) => {
          const taskId = String(
            t.originalTaskId || t.sharedTaskId || t.taskId || t.id || ""
          ).trim();
          const wsId = String(t.workspaceId || "").trim();
          const shareId = String(t.shareId || "").trim();

          if (!taskId || !wsId) return;

          try {
            // 1. Try the canonical source task first.
            let ownerId = "";
            let ownerEmail = "";
            let ownerName = "";

            try {
              const srcSnap = await getDoc(
                doc(db, "workspaces", wsId, "tasks", taskId)
              );
              if (srcSnap.exists()) {
                const src = srcSnap.data() as any;
                ownerId = src.ownerId || src.createdBy || src.createdByUid || "";
                ownerEmail = src.ownerEmail || src.createdByEmail || "";
                ownerName = src.ownerName || "";
              }
            } catch {
              // ignore — fall through to share doc
            }

            // 2. Fall back to the share doc (always identifies the inviter).
            if ((!ownerId || !ownerEmail) && shareId) {
              try {
                const shareSnap = await getDoc(
                  doc(
                    db,
                    "workspaces",
                    wsId,
                    "tasks",
                    taskId,
                    "shares",
                    shareId
                  )
                );
                if (shareSnap.exists()) {
                  const s = shareSnap.data() as any;
                  ownerId =
                    ownerId || s.invitedBy || s.sharedByUid || "";
                  ownerEmail =
                    ownerEmail || s.invitedByEmail || s.sharedByEmail || "";
                  ownerName =
                    ownerName || s.invitedByName || s.sharedByName || "";
                }
              } catch {
                // ignore
              }
            }

            // 3. Last resort: the personal copy may already carry sharedBy*.
            ownerId =
              ownerId || t.sharedByUid || t.sharedBy || "";
            ownerEmail = ownerEmail || t.sharedByEmail || "";
            ownerName = ownerName || t.sharedByName || "";

            if (!ownerId && !ownerEmail) return; // nothing recoverable

            await setDoc(
              doc(db, "users", user.uid!, "tasks", t.id),
              {
                ownerId,
                createdBy: ownerId,
                createdByEmail: ownerEmail,
                ownerEmail,
                ownerName,
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );

            console.log("[MyTasksPage] Owner backfill repaired:", t.id, {
              ownerId,
              ownerEmail,
            });
          } catch (err) {
            console.warn(
              "[MyTasksPage] Owner backfill failed for",
              taskId,
              err
            );
          }
        })
      );
    };

    backfillOwners();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, userTaskIndex]);

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

                const sourceTaskData = sourceTaskSnap.data() as any;

          const sourceTask = {
            id: sourceTaskSnap.id,
            title: String(sourceTaskData?.title || sourceTaskData?.name || "Untitled task"),
            status: String(sourceTaskData?.status || "To Do"),
            priority: String(sourceTaskData?.priority || "Low"),
            assignee: String(sourceTaskData?.assignee || ""),
            dueDate: sourceTaskData?.dueDate || "",
            description: String(sourceTaskData?.description || ""),
            taskCode: String(sourceTaskData?.taskCode || sourceTaskData?.code || ""),
            projectId:
              requestedProjectId ||
              String(sourceTaskData?.projectId || ""),
            workspaceId: requestedWorkspaceId,
            originalTaskId: sourceTaskSnap.id,
            sharedTaskId: sourceTaskSnap.id,
            createdAt: sourceTaskData?.createdAt || null,
            updatedAt: sourceTaskData?.updatedAt || null,
            ...sourceTaskData,
          } as unknown as DetailTask;


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
      if (isViewerOnly) {
        console.warn("[MyTasksPage] saveEdit blocked: viewer access");
        return;
      }

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
      if (isViewerOnly) {
        console.warn("[MyTasksPage] toggleDone blocked: viewer access");
        return;
      }

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
    if (isViewerOnly) {
      console.warn("[MyTasksPage] deleteTask blocked: viewer access");
      return;
    }

    const taskToDelete = tasks.find((task: any) => task.id === taskId);
    if (!taskToDelete) {
      console.warn("[MyTasksPage] deleteTask: task not found in list:", taskId);
      return;
    }

    const shared = isSharedTask(taskToDelete);
    const sourceWorkspaceId = taskToDelete.workspaceId || workspaceId || "";

    // The canonical workspace task id (shares live under this id).
    const canonicalTaskId = String(
      (taskToDelete as any).originalTaskId ||
        (taskToDelete as any).sharedTaskId ||
        (taskToDelete as any).taskId ||
        taskToDelete.id ||
        taskId
    ).trim();

    // Every id this personal copy could have been stored under.
    const candidateIds = Array.from(
      new Set(
        [
          taskToDelete.id,
          (taskToDelete as any).originalTaskId,
          (taskToDelete as any).sharedTaskId,
          (taskToDelete as any).taskId,
          taskId,
        ]
          .map((v) => String(v || "").trim())
          .filter((v) => v.length > 0)
      )
    );

    console.log("[MyTasksPage] deleteTask", {
      taskId,
      shared,
      candidateIds,
      canonicalTaskId,
      sourceWorkspaceId,
    });

    try {
      if (shared) {
        // ── Invited guest leaving a shared task ──────────────────────────────
        // 1. Mark MY share document(s) as "removed" so the owner's
        //    "Who has access" list (which filters out status === "removed")
        //    stops showing me as Active — in realtime.
        if (sourceWorkspaceId && canonicalTaskId) {
          try {
            const myEmail = String(user.email || "");
            const myEmailLower = myEmail.toLowerCase();

            const sharesRef = collection(
              db,
              "workspaces",
              sourceWorkspaceId,
              "tasks",
              canonicalTaskId,
              "shares"
            );

            const sharesSnap = await getDocs(sharesRef);

            const myShareDocs = sharesSnap.docs.filter((shareDoc) => {
              const s = shareDoc.data() as any;

              return (
                s.acceptedByUid === user.uid ||
                s.acceptedBy === user.uid ||
                String(s.acceptedByEmail || "").toLowerCase() === myEmailLower ||
                String(s.acceptedByEmailLower || "").toLowerCase() ===
                  myEmailLower ||
                String(s.sharedWithEmail || "").toLowerCase() === myEmailLower ||
                String(s.sharedWithEmailLower || "").toLowerCase() ===
                  myEmailLower ||
                String(s.invitedEmail || "").toLowerCase() === myEmailLower ||
                String(s.invitedEmailLower || "").toLowerCase() === myEmailLower
              );
            });

            await Promise.all(
              myShareDocs.map(async (shareDoc) => {
                try {
                  await updateDoc(shareDoc.ref, {
                    status: "removed",
                    removedByUid: user.uid,
                    removedByEmail: myEmail,
                    removedByEmailLower: myEmailLower,
                    removedAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                  });
                  console.log(
                    "[MyTasksPage] marked share removed:",
                    shareDoc.id
                  );
                } catch (e) {
                  console.warn(
                    "[MyTasksPage] mark share removed skipped:",
                    shareDoc.id,
                    e
                  );
                }
              })
            );

            // 2. Remove my task-access entry from the workspace people doc so
            //    the Team page External Guests card updates too.
            try {
              const personId = `guest_${myEmailLower.replace(
                /[^a-z0-9]/g,
                "_"
              )}`;
              const personRef = doc(
                db,
                "workspaces",
                sourceWorkspaceId,
                "people",
                personId
              );
              const personSnap = await getDoc(personRef);

              if (personSnap.exists()) {
                const personData = personSnap.data() as any;
                const remainingTasks = { ...(personData.tasks || {}) };
                delete remainingTasks[canonicalTaskId];

                const remainingProjects = personData.projects || {};
                const totalAccess =
                  Object.keys(remainingTasks).length +
                  Object.keys(remainingProjects).length;

                if (totalAccess === 0) {
                  await deleteDoc(personRef);
                } else {
                  await updateDoc(personRef, {
                    [`tasks.${canonicalTaskId}`]: deleteField(),
                    updatedAt: serverTimestamp(),
                  });
                }
              }
            } catch (personErr) {
              console.warn(
                "[MyTasksPage] guest people doc cleanup skipped:",
                personErr
              );
            }
          } catch (sharesErr) {
            console.warn(
              "[MyTasksPage] guest share removal skipped:",
              sharesErr
            );
          }
        }

        // 3. Remove ONLY my personal copy/copies.
        await Promise.all(
          candidateIds.map(async (id) => {
            try {
              await deleteDoc(doc(db, "users", user.uid!, "tasks", id));
              console.log("[MyTasksPage] deleted personal copy:", id);
            } catch (e) {
              console.warn("[MyTasksPage] personal copy delete skipped:", id, e);
            }
          })
        );
      } else {
        // Author / editor: delete the real workspace source...
        if (sourceWorkspaceId) {
          await Promise.all(
            candidateIds.map(async (id) => {
              try {
                await deleteDoc(
                  doc(db, "workspaces", sourceWorkspaceId, "tasks", id)
                );
                console.log("[MyTasksPage] deleted workspace source:", id);
              } catch (e) {
                console.warn(
                  "[MyTasksPage] workspace source delete skipped:",
                  id,
                  e
                );
              }
            })
          );
        }

        // ...and remove the author's own personal copies too.
        await Promise.all(
          candidateIds.map(async (id) => {
            try {
              await deleteDoc(doc(db, "users", user.uid!, "tasks", id));
            } catch (e) {
              console.warn(
                "[MyTasksPage] author personal copy cleanup skipped:",
                id,
                e
              );
            }
          })
        );
      }

      // Optimistic local removal so the row disappears even if the
      // snapshot listener lags. The listener will reconcile shortly after.
      setUserTaskIndex((prev) =>
        prev.filter((t: any) => !candidateIds.includes(String(t.id || "")))
      );
    } catch (err) {
      console.error("[MyTasksPage] deleteTask failed:", err);
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
                        ? "text-white"
                        : "bg-violet-50 text-violet-600 border border-violet-100 hover:bg-violet-100"
                    }`
                  : `px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      isActive
                        ? "text-white"
                        : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                    }`;

              // Active non-overdue tab → exact  "#4C28EE" .
              const activeStyle =
                isActive && !isOverdueTab
                  ? { backgroundColor:   "#4C28EE"  }
                  : undefined;

              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={activeStyle}
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
