import React, { useState, useMemo } from "react";
import { useNavigate }    from "react-router-dom";
import { useAppData }     from "../context/AppDataContext";
import { useAuth }        from "../context/AuthContext";
import {
  addDoc, collection, serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase/config";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import CreateProjectModal from "../components/CreateProjectModal";
import { getOverdueTasks } from "../utils/overdueUtils";
import { FolderKanban } from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────
// ─── Helpers ──────────────────────────────────────────────────────────────
const toMs = (v: any): number => {
  if (!v) return 0;
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.seconds === "number")    return v.seconds * 1000;
  return new Date(v).getTime();
};
// ─── Avatar helpers (SHARED — must stay byte-for-byte identical to
// WorkspacePage.tsx / TeamPage.tsx so the SAME email renders the SAME avatar
// everywhere, in real-time off the live `members` array). GLOBAL. ─────────────
function monogramGradient(seed: string): string {
  const s = String(seed || "?").trim().toLowerCase();

  let h1 = 0;
  let h2 = 0;
  let h3 = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = (c + ((h1 << 5) - h1)) | 0;
    h2 = (c * 31 + ((h2 << 7) - h2)) | 0;
    h3 = (c * 17 + ((h3 << 3) - h3)) | 0;
  }

  const hue1 = Math.abs(h1) % 360;
  const hueGap = 25 + (Math.abs(h2) % 90);
  const hue2 = (hue1 + hueGap) % 360;

  const sat1 = 58 + (Math.abs(h2) % 28);
  const sat2 = 58 + (Math.abs(h3) % 28);
  const light1 = 48 + (Math.abs(h3) % 16);
  const light2 = 38 + (Math.abs(h1) % 14);
  const angle = Math.abs(h2 ^ h3) % 360;

  return `linear-gradient(${angle}deg, hsl(${hue1} ${sat1}% ${light1}%), hsl(${hue2} ${sat2}% ${light2}%))`;
}

function monogramInitials(name?: string | null, email?: string | null): string {
  // GLOBAL: seed initials from the SAME canonical source as the gradient —
  // email first (never stale), falling back to name. This guarantees the
  // SAME letter on every surface even when Firebase Auth displayName and
  // Firestore displayName disagree.
  const emailLocal = String(email || "").trim().split("@")[0];
  const label =
    String(emailLocal || name || "?")
      .replace(/[._-]+/g, " ")
      .trim();
  if (!label || label === "?") return "?";
  const initials = label
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return initials || label[0]?.toUpperCase() || "?";
}


// Only Firebase Storage uploads are real user photos. Any other URL
// (e.g. Google lh3.googleusercontent.com) is ignored so every account
// shows its monogram gradient instead of the Gmail photo.
function resolveAvatarPhoto(photoURL?: string | null): string {
  const url = String(photoURL || "").trim();
  return url.includes("firebasestorage") ? url : "";
}

// Returns the email-based seed used for the gradient. Falls back to name.
function avatarSeed(name?: string | null, email?: string | null): string {
  return (
    String(email || "").trim().toLowerCase() ||
    String(name || "?").trim().toLowerCase()
  );
}


const completionMs = (t: any): number => {
  if (t?.completedAt) return toMs(t.completedAt);
  return toMs(t?.updatedAt);
};



// GLOBAL: robustly decide whether a task belongs to a given workspace member.
// Matches by uid first (assigneeId / assigneeIds / assigneeUid / assignedToUid),
// then falls back to email, then to name — covering every way assignment is
// stored across the codebase. Same data the live listeners already provide,
// so it stays real-time with zero extra reads/writes.
const taskBelongsToMember = (t: any, m: any): boolean => {
  const memberUid = String(m?.userId || m?.uid || m?.id || "").trim();
  const memberEmail = String(m?.email || m?.emailLower || "").trim().toLowerCase();
  const memberName = String(m?.displayName || m?.name || "").trim().toLowerCase();

  // uid-based matches (most reliable)
  if (memberUid) {
    if (t?.assigneeId === memberUid) return true;
    if (t?.assigneeUid === memberUid) return true;
    if (t?.assignedToUid === memberUid) return true;
    if (Array.isArray(t?.assigneeIds) && t.assigneeIds.includes(memberUid)) return true;
    if (Array.isArray(t?.assignedTo) && t.assignedTo.includes(memberUid)) return true;
  }

  // email-based matches
  if (memberEmail) {
    if (typeof t?.assigneeEmail === "string" && t.assigneeEmail.toLowerCase().trim() === memberEmail) return true;
    if (typeof t?.assignee === "string" && t.assignee.toLowerCase().trim() === memberEmail) return true;
    if (
      Array.isArray(t?.assigneeEmails) &&
      t.assigneeEmails.map((e: any) => String(e).toLowerCase().trim()).includes(memberEmail)
    ) return true;
  }

    // name-based fallback (legacy)
  if (memberName && typeof t?.assignee === "string" && t.assignee.toLowerCase().trim() === memberName) {
    return true;
  }

  // OWNER/CREATOR fallback: when a task has NO explicit assignee, attribute it
  // to its owner (or creator) so the workload card reflects real responsibility
  // instead of showing everyone at zero. New tasks created with the assignee
  // picker below will match via the uid/email branches above and skip this.
  const hasExplicitAssignee =
    (typeof t?.assignee === "string" && t.assignee.trim() !== "") ||
    !!t?.assigneeId ||
    !!t?.assigneeUid ||
    !!t?.assignedToUid ||
    (Array.isArray(t?.assigneeIds) && t.assigneeIds.length > 0);

  if (!hasExplicitAssignee && memberUid) {
    if (t?.ownerId === memberUid) return true;
    if (t?.createdBy === memberUid) return true;
  }

  return false;
};




const toDisplayText = (value: unknown, fallback = ""): string => {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
};

const toDateValue = (value: unknown): Date | null => {
  if (!value) return null;

  try {
    if (value instanceof Date) return value;

    if (
      typeof value === "object" &&
      value !== null &&
      "toDate" in value &&
      typeof (value as any).toDate === "function"
    ) {
      return (value as any).toDate();
    }

    if (
      typeof value === "object" &&
      value !== null &&
      "seconds" in value &&
      typeof (value as any).seconds === "number"
    ) {
      return new Date((value as any).seconds * 1000);
    }

    if (typeof value === "string" || typeof value === "number") {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    return null;
  } catch {
    return null;
  }
};

const fmtDate = (value: unknown): string => {
  const date = toDateValue(value);
  if (!date) return "";
  return date.toLocaleDateString();
};

const isPastDate = (value: unknown, compareTo: Date): boolean => {
  const date = toDateValue(value);
  if (!date) return false;
  return date < compareTo;
};


const emptyTask = () => ({
  title: "", status: "To Do", priority: "Medium",
  dueDate: "", assignee: "", projectId: "",
  assigneeId: "", assigneeEmail: "",
});



const DashboardPage = () => {
  const { user, workspaceId }                         = useAuth();
    const { projects, tasks, teamMembers, notes, members } = useAppData();
  const navigate                                       = useNavigate();

  // ── Modals ──────────────────────────────────────────────────────────────
  const [showTask,    setShowTask]    = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [taskForm,    setTaskForm]    = useState(emptyTask());
  const [saving,      setSaving]      = useState(false);
  const [dismissed,   setDismissed]   = useState(false);

  // ── Derived stats ────────────────────────────────────────────────────────
  const totalProjects   = projects.length;
  const activeTasks     = tasks.filter(t => t.status !== "Done").length;
  const completedTasks  = tasks.filter(t => t.status === "Done").length;
  const totalMembers    = members.length > 0 ? members.length : teamMembers.length;
  const now             = new Date();

  const overdueTasks = useMemo(() => getOverdueTasks(tasks), [tasks]);

  // ── Workflow Health chart ────────────────────────────────────────────────
  const workflowData = [
    { name: "To Do",       count: tasks.filter(t => t.status === "To Do").length,       fill: "#9ca3af" },
    { name: "In Progress", count: tasks.filter(t => t.status === "In Progress").length, fill: "#3b82f6" },
    { name: "In Review",   count: tasks.filter(t => t.status === "In Review").length,   fill: "#8b5cf6" },
    { name: "Done",        count: tasks.filter(t => t.status === "Done").length,        fill: "#10b981" },
  ];

  // ── Priority donut ────────────────────────────────────────────────────────
  const priorityData = [
    { name: "High",   value: tasks.filter(t => t.priority === "High").length,   color: "#ef4444" },
    { name: "Medium", value: tasks.filter(t => t.priority === "Medium").length, color: "#f59e0b" },
    { name: "Low",    value: tasks.filter(t => t.priority === "Low").length,    color: "#9ca3af" },
  ].filter(d => d.value > 0);

  // ── Weekly productivity ───────────────────────────────────────────────────
  const weeklyData = useMemo(() => {
    const days = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i));
      return {
        day: days[d.getDay()],
        completed: tasks.filter(t => {
          if (t.status !== "Done") return false;
          const cms = completionMs(t);
          if (!cms) return false;
          return new Date(cms).toDateString() === d.toDateString();
        }).length,
      };
    });
  }, [tasks]);


    const thisWeekCount = weeklyData.reduce((s, d) => s + d.completed, 0);

 

     // ── Weekly Digest (in-app, replaces email digest) ─────────────────────────
  // GLOBAL: computed client-side from the same `tasks` array every account
  // already loads. Zero extra reads/writes. Uses the real `completedAt`
  // timestamp (via completionMs) so the numbers are 100% accurate and stay
  // consistent with the Weekly Productivity chart above.
  const weeklyDigest = useMemo(() => {
    const DAY = 24 * 60 * 60 * 1000;
    const nowMs = Date.now();
    const startThisWeek = nowMs - 7 * DAY;   // last 7 days
    const startLastWeek = nowMs - 14 * DAY;  // the 7 days before that

    const completedThisWeek = tasks.filter(
      (t) =>
        t.status === "Done" &&
        completionMs(t) >= startThisWeek &&
        completionMs(t) <= nowMs
    ).length;

    const completedLastWeek = tasks.filter(
      (t) =>
        t.status === "Done" &&
        completionMs(t) >= startLastWeek &&
        completionMs(t) < startThisWeek
    ).length;

    const createdThisWeek = tasks.filter(
      (t) => t.createdAt && toMs(t.createdAt) >= startThisWeek
    ).length;

    const overdueCount = overdueTasks.length;

    // Most active project this week (by tasks created OR completed in window).
    const activityByProject = new Map<string, number>();
    tasks.forEach((t) => {
      const pid = String(t.projectId || "").trim();
      if (!pid) return;
      const created = t.createdAt && toMs(t.createdAt) >= startThisWeek;
      const completed =
        t.status === "Done" &&
        completionMs(t) >= startThisWeek;
      if (created || completed) {
        activityByProject.set(pid, (activityByProject.get(pid) || 0) + 1);
      }
    });


    let topProjectName = "";
    let topProjectCount = 0;
    activityByProject.forEach((count, pid) => {
      if (count > topProjectCount) {
        topProjectCount = count;
        const proj = projects.find((p) => p.id === pid);
        topProjectName = toDisplayText((proj as any)?.name, "");
      }
    });

    // Delta vs last week.
    const delta = completedThisWeek - completedLastWeek;
    let trend: "up" | "down" | "flat" = "flat";
    if (delta > 0) trend = "up";
    else if (delta < 0) trend = "down";

    // Percentage change (guard divide-by-zero).
    let pctChange: number | null = null;
    if (completedLastWeek > 0) {
      pctChange = Math.round((delta / completedLastWeek) * 100);
    } else if (completedThisWeek > 0) {
      pctChange = 100; // went from 0 → something
    }

    // One-line narrative headline.
    let headline = "";
    if (completedThisWeek === 0 && completedLastWeek === 0) {
      headline = "No tasks completed yet this week.";
    } else if (trend === "up") {
      headline = `You completed ${completedThisWeek} ${
        completedThisWeek === 1 ? "task" : "tasks"
      } this week — up from ${completedLastWeek} last week. 🎉`;
    } else if (trend === "down") {
      headline = `You completed ${completedThisWeek} ${
        completedThisWeek === 1 ? "task" : "tasks"
      } this week — down from ${completedLastWeek} last week.`;
    } else {
      headline = `You completed ${completedThisWeek} ${
        completedThisWeek === 1 ? "task" : "tasks"
      } this week — same as last week.`;
    }

    return {
      completedThisWeek,
      completedLastWeek,
      createdThisWeek,
      overdueCount,
      topProjectName,
      topProjectCount,
      delta,
      trend,
      pctChange,
      headline,
    };
  }, [tasks, projects, overdueTasks]);


  // ── Upcoming tasks ────────────────────────────────────────────────────────
  const upcomingTasks = [...tasks]
    .filter(t => t.status !== "Done")
    .sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    })
    .slice(0, 5);

  // ── Recent activity ────────────────────────────────────────────────────────
  const recentActivity = [...tasks]
    .sort((a, b) => toMs(b.updatedAt) - toMs(a.updatedAt))
    .slice(0, 5);

  // ── Project progress per project ───────────────────────────────────────────
  const projectProgress = projects.map(p => {
    const pt   = tasks.filter(t => t.projectId === p.id);
    const done = pt.filter(t => t.status === "Done").length;
    const pct  = pt.length > 0 ? Math.round((done / pt.length) * 100) : 0;
    return { ...p, total: pt.length, done, pct };
  });
  // ── Team Members workload (real-time, from live `members` collection) ──────
  // GLOBAL: derived from the same `members` + `tasks` listeners every account
  // already runs. Fixes the badge/list mismatch by using `members` (the real
  // workspace member collection) instead of the empty legacy `teamMembers`.
  const memberWorkload = useMemo(() => {
    const source = (members.length > 0 ? members : teamMembers) as any[];

    return source
      .map((m: any) => {
        const uidStr = String(m?.userId || m?.uid || m?.id || "").trim();
        const name =
          String(m?.displayName || m?.name || "").trim() ||
          String(m?.email || "").split("@")[0] ||
          "Member";
        const email = String(m?.email || m?.emailLower || "").trim();
        const role = String(m?.role || "member");
        const photo = String(m?.avatar || m?.photoURL || m?.avatarUrl || "").trim();
        const color = String(m?.avatarColor || "").trim() || "#4C28EE";

        const mine = tasks.filter((t: any) => taskBelongsToMember(t, m));
        const total = mine.length;
        const done = mine.filter((t: any) => t.status === "Done").length;
        const active = total - done;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;

                return {
          key: uidStr || email || name,
          name,
          email,
          role,
          photo,
          color,
          // RAW fields the SHARED avatar helpers expect — identical inputs to
          // WorkspacePage / TeamPage so the same email renders the same avatar.
          displayName: String(m?.displayName || m?.name || "").trim() || name,
          photoURL: String(m?.photoURL || m?.avatar || m?.avatarUrl || "").trim(),
          total,
          done,
          active,
          pct,
        };
      })
      // Busiest people (most open work) first; ties broken by total.
      .sort((a, b) => b.active - a.active || b.total - a.total);
  }, [members, teamMembers, tasks]);

  // ── Save task ──────────────────────────────────────────────────────────────
  const handleSaveTask = async () => {
  if (!user?.uid || !workspaceId || !taskForm.title.trim()) return;
    setSaving(true);
    try {
      let taskCode = "";
      if (taskForm.projectId) {
         const p = projects.find((x: any) => x.id === taskForm.projectId);
         const pCode = p?.code || "WF-000";
         const pTasks = tasks.filter(t => t.projectId === taskForm.projectId);
         taskCode = `${pCode}-T${pTasks.length + 1}`;
      } else {
         taskCode = `${workspaceId || "WF-000"}-T${tasks.length + 1}`;
      }

                   // Resolve the picked assignee (if any) from the live members list so
          // we store BOTH the uid and email — the matcher keys off either.
          const picked = members.find(
            (mm: any) =>
              String(mm?.userId || mm?.uid || mm?.id || "") === taskForm.assigneeId
          ) as any;

          await addDoc(collection(db, "workspaces", workspaceId, "tasks"), {
            ...taskForm,
            // Explicit assignment (empty string when "Unassigned" is chosen).
            assigneeId: taskForm.assigneeId || "",
            assigneeEmail:
              taskForm.assigneeEmail ||
              String(picked?.email || picked?.emailLower || "").trim(),
            taskCode,
            workspaceId,
            ownerId: user.uid,
            createdBy: user.uid,
            completedAt: taskForm.status === "Done" ? serverTimestamp() : null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });



      setTaskForm(emptyTask());
      setShowTask(false);
    } finally { setSaving(false); }
  };


  const displayName = user?.displayName ?? user?.email?.split("@")[0] ?? "User";

  const STAT_CARDS = [
    { label: "Total Projects",   value: totalProjects,  color: "text-violet-600",  bg: "bg-violet-100", icon: <FolderKanban className="w-6 h-6 text-violet-600" />, onClick: () => navigate("/projects") },
    { label: "Active Tasks",     value: activeTasks,    color: "text-amber-600",   bg: "bg-amber-50",   icon: "⏳", onClick: () => navigate("/my-tasks") },
    { label: "Completed Tasks",  value: completedTasks, color: "text-emerald-600", bg: "bg-emerald-50", icon: "✅", onClick: undefined },
    { label: "Team Members",     value: totalMembers,   color: "text-purple-600",  bg: "bg-purple-50",  icon: "👥", onClick: () => navigate("/team") },
  ];

  return (
    <div className="ml-0 bg-[#f4f5f7] min-h-screen overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 pt-14 pb-10">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              Welcome, {displayName}
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Here's your productivity overview for today.
            </p>
          </div>
                   <button
            type="button"
            onClick={() => setShowCreateProject(true)}
            style={{ backgroundColor:  "#4C28EE" }}
            className="flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-xl transition-colors shadow-sm hover:opacity-90"
          >
            + Create Project
          </button>
        </div>

        {/* ── Overdue Banner ───────────────────────────────────────────── */}
        {overdueTasks.length > 0 && !dismissed && (
          <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 mb-4">
            <p className="text-sm text-red-600 font-medium">
              ⚠️ {overdueTasks.length} Overdue{" "}
              {overdueTasks.length === 1 ? "Task" : "Tasks"}:{" "}
              <span className="font-normal">
                {overdueTasks.map(t => toDisplayText((t as any).title, "Untitled task")).join(", ")}
              </span>
            </p>
            <div className="flex items-center gap-3">
              <button onClick={() => navigate("/my-tasks?filter=overdue")}
                      className="text-xs text-red-600 hover:underline font-medium">
                View All →
              </button>
              <button onClick={() => setDismissed(true)}
                      className="text-red-400 hover:text-red-600 text-lg">×</button>
            </div>
          </div>
        )}
                {/* ── Weekly Digest Card ───────────────────────────────────────── */}
                        {/* ── Weekly Digest Card ───────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">
                This Week at a Glance
              </h3>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">
                Your last 7 days
              </p>
            </div>
            <button
              onClick={() => navigate("/insights")}
              className="text-xs text-violet-600 hover:underline font-medium"
            >
              View details →
            </button>
          </div>

          {/* Narrative headline */}
          <p className="text-sm text-gray-700 mb-4">
            {weeklyDigest.headline}
            {weeklyDigest.pctChange !== null && weeklyDigest.trend !== "flat" && (
              <span
                className={`ml-2 text-xs font-semibold ${
                  weeklyDigest.trend === "up"
                    ? "text-emerald-600"
                    : "text-red-500"
                }`}
              >
                {weeklyDigest.trend === "up" ? "▲" : "▼"}{" "}
                {Math.abs(weeklyDigest.pctChange)}%
              </span>
            )}
          </p>

          {/* Stat strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-emerald-50 rounded-lg px-3 py-2.5">
              <p className="text-lg font-bold text-emerald-600">
                {weeklyDigest.completedThisWeek}
              </p>
              <p className="text-[10px] text-gray-500 leading-tight">
                Completed this week
              </p>
            </div>
            <div className="bg-blue-50 rounded-lg px-3 py-2.5">
              <p className="text-lg font-bold text-blue-600">
                {weeklyDigest.createdThisWeek}
              </p>
              <p className="text-[10px] text-gray-500 leading-tight">
                Created this week
              </p>
            </div>
            <div
              className={`rounded-lg px-3 py-2.5 ${
                weeklyDigest.overdueCount > 0 ? "bg-red-50" : "bg-gray-50"
              }`}
            >
              <p
                className={`text-lg font-bold ${
                  weeklyDigest.overdueCount > 0
                    ? "text-red-500"
                    : "text-gray-400"
                }`}
              >
                {weeklyDigest.overdueCount}
              </p>
              <p className="text-[10px] text-gray-500 leading-tight">
                Overdue
              </p>
            </div>
            <div className="bg-violet-50 rounded-lg px-3 py-2.5">
              <p className="text-sm font-bold text-violet-600 truncate">
                {weeklyDigest.topProjectName || "—"}
              </p>
              <p className="text-[10px] text-gray-500 leading-tight">
                Most active project
              </p>
            </div>
          </div>
        </div>

        {/* ── ROW 1: Stat Cards ────────────────────────────────────────── */}

               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {STAT_CARDS.map(s => (
            <div key={s.label}
                 onClick={s.onClick}
                 className={`bg-white border border-gray-200 rounded-xl shadow-sm p-4 flex items-center gap-3 ${s.onClick ? 'cursor-pointer hover:shadow-md hover:border-blue-200 transition-all' : ''}`}>
              <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center
                              justify-center text-lg flex-shrink-0`}>
                {s.icon}
              </div>
              <div>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-400 mt-0.5 leading-tight">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── ROW 2: Project Progress + Upcoming Tasks ─────────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">

          {/* Project Progress */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">
                  Project Progress
                </h3>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">
                  Tasks by project
                </p>
              </div>
              <span className="text-xs text-gray-400">{totalProjects} projects</span>
            </div>
            {projectProgress.length > 0 ? (
              <div className="space-y-3 max-h-[200px] overflow-y-auto pr-1">
                               {projectProgress.map(p => {
                  const projectName = toDisplayText((p as any).name, "Untitled project");
                  const projectColor = toDisplayText((p as any).color, "#3b82f6");

                  return (
                    <div key={p.id}
                         className="cursor-pointer"
                         onClick={() => navigate(`/projects/${p.id}`)}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: projectColor }} />
                          <span className="text-xs font-medium text-gray-700 truncate max-w-[140px]">
                            {projectName}
                          </span>
                        </div>
                        <span className="text-xs text-gray-400">
                          {p.done}/{p.total} · {p.pct}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${p.pct}%`, backgroundColor: projectColor }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-[180px] flex flex-col items-center justify-center gap-2">
                <p className="text-2xl">📁</p>
                <p className="text-xs text-gray-400">No projects yet.</p>
                <button type="button" onClick={() => setShowCreateProject(true)}
                        className="text-xs text-blue-600 hover:underline">
                  + Create your first project
                </button>
              </div>
            )}
          </div>

          {/* Upcoming Tasks */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">
                  Upcoming Tasks
                </h3>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">
                  Sorted by due date
                </p>
              </div>
                            <button onClick={() => navigate("/my-tasks")}
                      className="text-xs text-blue-600 hover:underline font-medium">
                VIEW ALL →
              </button>
            </div>
            {upcomingTasks.length > 0 ? (
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {upcomingTasks.map(t => {
  const taskTitle = toDisplayText((t as any).title, "Untitled task");
  const taskCode = toDisplayText((t as any).taskCode);
  const taskPriority = toDisplayText((t as any).priority, "Low");
  const taskDueDate = (t as any).dueDate;

  return (
    <div
      key={(t as any).id}
      className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-gray-300 text-sm flex-shrink-0">⏱</span>

        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-700 truncate">
            {taskCode && (
              <span className="text-slate-400 mr-1">
                {taskCode}
              </span>
            )}
            {taskTitle}
          </p>

          <p
            className={`text-[10px] ${
              taskDueDate && isPastDate(taskDueDate, now)
                ? "text-red-500"
                : "text-gray-400"
            }`}
          >
            {taskDueDate ? fmtDate(taskDueDate) : "No due date"}
          </p>
        </div>
      </div>

      <span
        className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
          taskPriority === "High"
            ? "bg-red-100 text-red-600"
            : taskPriority === "Medium"
            ? "bg-amber-100 text-amber-600"
            : "bg-gray-100 text-gray-500"
        }`}
      >
        {taskPriority}
      </span>
    </div>
  );
})}

              </div>
            ) : (
              <div className="h-[180px] flex items-center justify-center">
                <p className="text-xs text-gray-400">No upcoming tasks</p>
              </div>
            )}
          </div>
        </div>

        {/* ── ROW 3: Workflow Health + Task Priority ───────────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">

          {/* Workflow Health */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-0.5">
              Workflow Health
            </h3>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-3">
              Tasks by status
            </p>
            {workflowData.some(d => d.count > 0) ? (
                            <div style={{ width: "100%", height: 160, minWidth: 0, minHeight: 160 }}>
                <ResponsiveContainer width="100%" height="100%" debounce={0}>
                  <BarChart data={workflowData} barSize={28}>
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={20} />
                    <Tooltip contentStyle={{ fontSize: 11 }} />
                    <Bar dataKey="count" radius={[4,4,0,0]}>
                      {workflowData.map((d, i) => (
                        <Cell key={i} fill={d.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[160px] flex items-center justify-center">
                <p className="text-xs text-gray-400">No task data yet</p>
              </div>
            )}
          </div>

          {/* Task Priority Breakdown */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-0.5">
              Task Priority Breakdown
            </h3>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-3">
              Distribution by level
            </p>
            {priorityData.length > 0 ? (
                            <div style={{ width: "100%", height: 160, minWidth: 0, minHeight: 160 }}>
                <ResponsiveContainer width="100%" height="100%" debounce={0}>
                  <PieChart>
                    <Pie
                      data={priorityData}
                      cx="50%" cy="50%"
                      innerRadius={45} outerRadius={68}
                      dataKey="value"
                      label={false}
                    >
                      {priorityData.map((d, i) => (
                        <Cell key={i} fill={d.color} />
                      ))}
                    </Pie>
                    <text x="50%" y="50%" textAnchor="middle"
                          dominantBaseline="middle"
                          className="text-lg font-bold fill-gray-800">
                      {tasks.length}
                    </text>
                    <text x="50%" y="62%" textAnchor="middle"
                          dominantBaseline="middle"
                          style={{ fontSize: 9, fill: "#9ca3af" }}>
                          TASKS
                    </text>
                    <Tooltip contentStyle={{ fontSize: 11 }} />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: 11 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[160px] flex items-center justify-center">
                <p className="text-xs text-gray-400">No task data yet</p>
              </div>
            )}
          </div>
        </div>

        {/* ── ROW 4: Recent Activity + Weekly Productivity ─────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">

          {/* Recent Activity */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-0.5">
              Recent Activity
            </h3>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-3">
              Latest actions
            </p>
            {recentActivity.length > 0 ? (
              <div className="space-y-2 max-h-[160px] overflow-y-auto">
                {recentActivity.map(t => (
                  <div key={t.id}
                       className="flex items-center gap-2.5 py-1.5 border-b border-gray-50 last:border-0">
                    <div className={`w-6 h-6 rounded-full flex items-center
                                    justify-center flex-shrink-0 text-xs ${
                      t.status === "Done"
                        ? "bg-emerald-100 text-emerald-600"
                        : "bg-blue-100 text-blue-600"
                    }`}>
                      {t.status === "Done" ? "✓" : "+"}
                    </div>
                    <p className="text-xs text-gray-600 truncate flex-1">
  {toDisplayText((t as any).status) === "Done" ? "Completed" : "Created"}{" "}
  <span className="font-medium text-gray-800">
    "{toDisplayText((t as any).title, "Untitled task")}"
  </span>
</p>

                  </div>
                ))}
              </div>
            ) : (
              <div className="h-[160px] flex items-center justify-center">
                <p className="text-xs text-gray-400">No recent activity</p>
              </div>
            )}
          </div>

          {/* Weekly Productivity */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-0.5">
              <h3 className="text-sm font-semibold text-gray-800">
                Weekly Productivity
              </h3>
              <div className="text-right">
                <p className="text-lg font-bold text-blue-600">{thisWeekCount}</p>
                <p className="text-[10px] text-gray-400">this week</p>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-3">
              Completed last 7 days
            </p>
                        <div style={{ width: "100%", height: 130, minWidth: 0, minHeight: 130 }}>
              <ResponsiveContainer width="100%" height="100%" debounce={0}>
                <LineChart data={weeklyData}>
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={20} />
                  <Tooltip contentStyle={{ fontSize: 11 }} />
                  <Line
                    type="monotone" dataKey="completed"
                    stroke="#3b82f6" strokeWidth={2}
                    dot={{ r: 3, fill: "#3b82f6" }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ── ROW 5: Projects Grid ─────────────────────────────────────── */}
        {projects.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-800">
                 Accessible Projects
              </h3>
              <button type="button" onClick={() => setShowCreateProject(true)}
                      className="text-xs text-blue-600 hover:underline">
                + New Project
              </button>
            </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {projects.slice(0, 6).map(p => {
                const pt   = tasks.filter(t => t.projectId === p.id);
                const done = pt.filter(t => t.status === "Done").length;
                const pct  = pt.length > 0 ? Math.round((done/pt.length)*100) : 0;
                const over = pt.filter(t =>
                  t.dueDate && new Date(t.dueDate) < now && t.status !== "Done"
                ).length;
                return (
                  <div
                    key={p.id}
                    onClick={() => navigate(`/projects/${p.id}`)}
                    className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 cursor-pointer hover:shadow-md hover:border-blue-200 transition-all group"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <div
  className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
  style={{ backgroundColor: toDisplayText((p as any).color, "#3b82f6") }}
>
  {toDisplayText((p as any).name, "Untitled project").charAt(0).toUpperCase()}
</div>

<div className="min-w-0 flex-1">
  <p className="text-sm font-semibold text-gray-800 truncate group-hover:text-blue-600 transition-colors">
    {toDisplayText((p as any).name, "Untitled project")}
  </p>

  {(p as any).code && (
    <p className="text-xs text-slate-400 truncate">
      {toDisplayText((p as any).code)}
    </p>
  )}

  <p className="text-[10px] text-gray-400 capitalize mt-0.5">
    {toDisplayText((p as any).status, "active")}
  </p>
</div>

                    </div>

                    {(p as any).description && (
  <p className="text-xs text-gray-400 mb-3 truncate">
    {toDisplayText((p as any).description)}
  </p>
)}


                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] text-gray-400">Progress</span>
                      <span className="text-[10px] font-semibold text-gray-600">
                        {pct}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-gray-100 rounded-full mb-3">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: toDisplayText((p as any).color, "#3b82f6") }}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex gap-2">
                        <span className="text-[10px] text-gray-500">
                          📋 {pt.length} tasks
                        </span>
                        {over > 0 && (
                          <span className="text-[10px] text-red-500">
                            ⚠️ {over} overdue
                          </span>
                        )}
                      </div>
                      {(p as any).priority && (
  <span
    className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
      toDisplayText((p as any).priority) === "High"
        ? "bg-red-100 text-red-500"
        : toDisplayText((p as any).priority) === "Medium"
        ? "bg-amber-100 text-amber-600"
        : "bg-gray-100 text-gray-500"
    }`}
  >
    {toDisplayText((p as any).priority)}
  </span>
)}

                    </div>

                    {(p as any).dueDate && (
  <p className="text-[10px] text-gray-400 mt-2">
    📅 Due {fmtDate((p as any).dueDate)}
  </p>
)}

                  </div>
                );
              })}
            </div>
            {projects.length > 6 && (
              <button
                type="button"
                onClick={() => navigate("/projects")}
                className="mt-4 w-full py-2.5 text-sm font-medium text-violet-600 bg-violet-50 hover:bg-violet-100 rounded-xl border border-violet-200 transition-colors"
              >
                View All Projects ({projects.length} total) →
              </button>
            )}
          </div>
        )}

        {/* ── ROW 6: Team Members + My Notes ──────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 mb-4">

                  {/* Team Members */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">
                  Team Members
                </h3>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">
                  Workload overview
                </p>
              </div>
              <button
                onClick={() => navigate("/team")}
                className="text-xs bg-violet-50 text-violet-600 hover:bg-violet-100 rounded-full px-2.5 py-0.5 font-medium transition-colors"
              >
                {memberWorkload.length}
              </button>
            </div>
            {memberWorkload.length > 0 ? (
              <div className="space-y-3 max-h-[180px] overflow-y-auto pr-1">
                {memberWorkload.map(m => (
                  <div key={m.key} className="flex items-center gap-2.5">
                                      {/* Avatar: SHARED monogram logic — pixel-identical to
                        WorkspacePage / TeamPage, driven by the live members data. */}
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 overflow-hidden select-none ring-1 ring-gray-100"
                      style={
                        resolveAvatarPhoto(m.photoURL)
                          ? undefined
                          : { background: monogramGradient(avatarSeed(m.displayName, m.email)) }
                      }
                    >
                      {resolveAvatarPhoto(m.photoURL) ? (
                        <img
                          src={resolveAvatarPhoto(m.photoURL)}
                          alt={m.displayName || m.email || "Member"}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        monogramInitials(m.displayName, m.email)
                      )}
                    </div>



                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="text-xs font-medium text-gray-700 truncate">
                            {m.name}
                          </p>
                          {(m.role === "owner" || m.role === "admin") && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 font-semibold capitalize flex-shrink-0">
                              {m.role}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-400 flex-shrink-0">
                          {m.pct}%
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-2 mt-1">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${m.pct}%`,
                              backgroundColor: m.pct === 100 ? "#10b981" : "#4C28EE",
                            }}
                          />
                        </div>
                        <span className="text-[10px] text-gray-400 flex-shrink-0 whitespace-nowrap">
                          {m.active} active · {m.done} done
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-[120px] flex flex-col items-center justify-center gap-1">
                <p className="text-xs text-gray-400">No team members yet.</p>
                <button
                  type="button"
                  onClick={() => navigate("/team")}
                  className="text-[10px] text-violet-600 hover:underline"
                >
                  + Invite your first member
                </button>
              </div>
            )}
          </div>


          {/* My Notes */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-800">My Notes</h3>
              <span className="text-xs text-gray-400">{notes.length} notes</span>
            </div>
            {notes.length > 0 ? (
              <div className="space-y-2 max-h-[160px] overflow-y-auto">
                {notes.slice(0,5).map(n => (
                  <div key={n.id}
                       className="py-1.5 border-b border-gray-50 last:border-0">
                    <p className="text-xs font-medium text-gray-700 truncate">
  {String(n.title ?? "Untitled")}
</p>
<p className="text-[10px] text-gray-400 truncate mt-0.5">
  {String(n.content ?? n.body ?? "")}
</p>

                  </div>
                ))}
              </div>
            ) : (
              <div className="h-[120px] flex flex-col items-center justify-center">
                <p className="text-2xl mb-1">✏️</p>
                <p className="text-xs text-gray-400">No notes yet.</p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ══ ADD TASK FLOATING BUTTON ══════════════════════════════════════ */}
            <button
        onClick={() => setShowTask(true)}
        style={{ backgroundColor:  "#4C28EE" }}
        className="fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3 text-white text-sm font-medium rounded-full shadow-lg transition-all hover:shadow-xl hover:opacity-90 z-40"
      >
        + Add Task
      </button>

      {/* ══ ADD TASK MODAL ════════════════════════════════════════════════ */}
      {showTask && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">New Task</h2>
              <button onClick={() => setShowTask(false)}
                      className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="space-y-3">
              <input
                type="text" placeholder="Task name *"
                value={taskForm.title}
                onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={taskForm.status}
                  onChange={e => setTaskForm(f => ({ ...f, status: e.target.value }))}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {["To Do","In Progress","In Review","Done"].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <select
                  value={taskForm.priority}
                  onChange={e => setTaskForm(f => ({ ...f, priority: e.target.value }))}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Low">🟢 Low</option>
                  <option value="Medium">🟡 Medium</option>
                  <option value="High">🔴 High</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="date" value={taskForm.dueDate}
                  onChange={e => setTaskForm(f => ({ ...f, dueDate: e.target.value }))}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                                <select
                  value={taskForm.projectId}
                  onChange={e => setTaskForm(f => ({ ...f, projectId: e.target.value }))}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">No project</option>
                  {projects.map(p => (
  <option key={(p as any).id} value={(p as any).id}>
    {toDisplayText((p as any).name, "Untitled project")}
  </option>
))}

                </select>
              </div>

              {/* Assignee picker — writes assigneeId + assigneeEmail so the
                  Team Members workload card attributes the task correctly. */}
              <select
                value={taskForm.assigneeId}
                onChange={e => {
                  const uid = e.target.value;
                  const m = (members as any[]).find(
                    (mm: any) => String(mm?.userId || mm?.uid || mm?.id || "") === uid
                  );
                  setTaskForm(f => ({
                    ...f,
                    assigneeId: uid,
                    assigneeEmail: String(m?.email || m?.emailLower || "").trim(),
                  }));
                }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Unassigned</option>
                {(members.length > 0 ? members : teamMembers).map((m: any) => {
                  const uid = String(m?.userId || m?.uid || m?.id || "");
                  const label =
                    String(m?.displayName || m?.name || "").trim() ||
                    String(m?.email || "").split("@")[0] ||
                    "Member";
                  return (
                    <option key={uid || label} value={uid}>
                      {label}
                    </option>
                  );
                })}
              </select>

            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowTask(false)}
                      className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleSaveTask}
                      disabled={!taskForm.title.trim() || saving}
                      className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {saving ? "Saving..." : "Create Task"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ CREATE PROJECT MODAL ══════════════════════════════════════════ */}
                 <CreateProjectModal
        isOpen={showCreateProject}
        onClose={() => setShowCreateProject(false)}
      />

    </div>
  );
};

export default DashboardPage;
