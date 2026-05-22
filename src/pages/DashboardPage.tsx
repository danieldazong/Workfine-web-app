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
const toMs = (v: any): number => {
  if (!v) return 0;
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.seconds === "number")    return v.seconds * 1000;
  return new Date(v).getTime();
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


// ─── Add Task Modal ────────────────────────────────────────────────────────
const emptyTask = () => ({
  title: "", status: "To Do", priority: "Medium",
  dueDate: "", assignee: "", projectId: "",
});


const DashboardPage = () => {
  const { user, workspaceId }                         = useAuth();
  const { projects, tasks, teamMembers, notes, files, members } = useAppData();
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
          if (t.status !== "Done" || !t.updatedAt) return false;
          return new Date(toMs(t.updatedAt)).toDateString() === d.toDateString();
        }).length,
      };
    });
  }, [tasks]);

  const thisWeekCount = weeklyData.reduce((s, d) => s + d.completed, 0);

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

      await addDoc(collection(db, "workspaces", workspaceId, "tasks"), {
  ...taskForm,
  taskCode,
  workspaceId,
  ownerId: user.uid,
  createdBy: user.uid,
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
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
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

        {/* ── ROW 1: Stat Cards ────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-3 mb-4">
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
        <div className="grid grid-cols-2 gap-3 mb-4">

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
              <button onClick={() => navigate("/tasks")}
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
        <div className="grid grid-cols-2 gap-3 mb-4">

          {/* Workflow Health */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-0.5">
              Workflow Health
            </h3>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-3">
              Tasks by status
            </p>
            {workflowData.some(d => d.count > 0) ? (
              <div style={{ width: "100%", height: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
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
              <div style={{ width: "100%", height: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
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
        <div className="grid grid-cols-2 gap-3 mb-4">

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
            <div style={{ width: "100%", height: 130 }}>
              <ResponsiveContainer width="100%" height="100%">
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
            <div className="grid grid-cols-3 gap-3">
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
              <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">{totalMembers}</span>
            </div>
            {teamMembers.length > 0 ? (
              <div className="space-y-2 max-h-[160px] overflow-y-auto">
                {teamMembers.map(m => {
                  const mt   = tasks.filter(t => t.assignee === m.name || t.assignee === m.email);
                  const done = mt.filter(t => t.status === "Done").length;
                  const pct  = mt.length > 0 ? Math.round((done/mt.length)*100) : 0;
                  return (
                    <div key={m.id} className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {(m.name ?? m.email ?? "?")[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between">
                          <p className="text-xs font-medium text-gray-700 truncate">
                            {m.name ?? m.email}
                          </p>
                          <p className="text-[10px] text-gray-400">{pct}%</p>
                        </div>
                        <div className="w-full h-1 bg-gray-100 rounded-full mt-1">
                          <div className="h-full bg-blue-500 rounded-full"
                               style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-[120px] flex flex-col items-center justify-center gap-1">
                <p className="text-xs text-gray-400">No team members yet.</p>
                <p className="text-[10px] text-gray-300">Add members to see workload.</p>
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
        className="fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3 bg-blue-600 text-white text-sm font-medium rounded-full shadow-lg hover:bg-blue-700 transition-all hover:shadow-xl z-40"
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
