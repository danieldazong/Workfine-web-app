import React, { useState, useMemo } from "react";
import { useAppData } from "../context/AppDataContext";
import { useAuth } from "../context/AuthContext";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase/config";
import { getOverdueTasks } from "../utils/overdueUtils";
import TaskDetailPanel, { Task as DetailTask } from "../components/TaskDetailPanel";

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  projectId?: string;
  assignee?: string;
  dueDate?: string;
  taskCode?: string;
}

interface Project {
  id: string;
  name: string;
  color?: string;
}

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-orange-400",
  low: "bg-green-500",
};

const PROJECT_COLORS = [
  "#8b5cf6","#3b82f6","#10b981","#f59e0b",
  "#ef4444","#ec4899","#06b6d4","#84cc16",
];

const DAYS   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function dateKey(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
}

function isTaskDone(task: Task): boolean {
  const s = task.status?.toLowerCase();
  return s === "done" || s === "completed";
}

function isTaskOverdue(task: Task): boolean {
  if (!task.dueDate) return false;
  if (isTaskDone(task)) return false;
  const due = new Date(task.dueDate);
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

export default function CalendarPage() {
  const { tasks = [], projects = [] } = useAppData() as {
    tasks: Task[];
    projects: Project[];
  };

  const today = new Date();
  const [viewYear,      setViewYear]      = useState(today.getFullYear());
  const [viewMonth,     setViewMonth]     = useState(today.getMonth());
  const [selectedDay,   setSelectedDay]   = useState<number | null>(today.getDate());
  const [filterProject, setFilterProject] = useState("all");
  const [filterStatus,  setFilterStatus]  = useState("all");
  const [sidePanelOpen, setSidePanelOpen] = useState(true);
  const [detailTask, setDetailTask] = useState<DetailTask | null>(null);
  const { user, workspaceId } = useAuth();
  const [editTask, setEditTask] = useState<DetailTask | null>(null);
  const [editForm, setEditForm] = useState({
    title: "", description: "", status: "To Do",
    priority: "Medium", assignee: "", dueDate: "",
  });
  const [editSaving, setEditSaving] = useState(false);

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
    if (!workspaceId || !editTask || !editForm.title.trim()) return;

    setEditSaving(true);
    try {
      await updateDoc(
  doc(db, "workspaces", workspaceId, "tasks", editTask.id),
  { ...editForm, updatedAt: serverTimestamp() }
);

      setEditTask(null);
    } finally { setEditSaving(false); }
  }

  // Shared overdue detection — recomputes on every Firestore push
  const overdueTasks = useMemo(() => getOverdueTasks(tasks), [tasks]);
  const overdueIds   = useMemo(
    () => new Set(overdueTasks.map((t: Task) => t.id)),
    [overdueTasks]
  );
  const isOverdueTask = (t: Task) => overdueIds.has(t.id);

  const projectColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    projects.forEach((p, i) => {
      map[p.id] = p.color || PROJECT_COLORS[i % PROJECT_COLORS.length];
    });
    return map;
  }, [projects]);

  // ── FIXED: all status comparisons are now case-insensitive ──
  const filteredTasks = useMemo(() => tasks.filter((t) => {
    if (filterProject !== "all" && t.projectId !== filterProject) return false;

    const status = t.status?.toLowerCase() ?? "";

    if (filterStatus === "completed") {
      if (status !== "completed" && status !== "done") return false;
    }

    if (filterStatus === "active") {
      if (status === "completed" || status === "done") return false;
    }

    if (filterStatus === "todo") {
      if (status !== "todo" && status !== "to do" && status !== "to-do") return false;
    }

    if (filterStatus === "overdue") {
      if (!isTaskOverdue(t)) return false;
    }

    return true;
  }), [tasks, filterProject, filterStatus]);

  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {};
    filteredTasks.forEach((t) => {
      if (!t.dueDate) return;
      const d = new Date(t.dueDate);
      const key = dateKey(d.getFullYear(), d.getMonth(), d.getDate());
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return map;
  }, [filteredTasks]);

  const firstDay    = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedKey   = selectedDay ? dateKey(viewYear, viewMonth, selectedDay) : "";
  const selectedTasks = selectedDay ? (tasksByDate[selectedKey] || []) : [];

  const monthTasks = useMemo(() => filteredTasks.filter((t) => {
    if (!t.dueDate) return false;
    const d = new Date(t.dueDate);
    return d.getFullYear() === viewYear && d.getMonth() === viewMonth;
  }), [filteredTasks, viewYear, viewMonth]);

  // ── FIXED: case-insensitive status checks in summary counts ──
  const summaryCompleted  = monthTasks.filter((t) => isTaskDone(t)).length;
  const summaryOverdue    = monthTasks.filter((t) => isTaskOverdue(t)).length;
  const summaryInProgress = monthTasks.filter((t) => {
    const s = t.status?.toLowerCase();
    return s === "in-progress" || s === "active" || s === "in progress";
  }).length;

  const isOverdueFilter = filterStatus === "overdue";

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
    setSelectedDay(null);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
    setSelectedDay(null);
  }

  return (
    <div className="ml-0 bg-[#f4f5f7] min-h-screen overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 pt-14 pb-10">

        {/* ── PAGE HEADER ── */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Calendar</h1>
            <p className="text-sm text-slate-400 mt-0.5">View and manage tasks by due date</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              className="text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-600 focus:outline-none focus:border-violet-400 cursor-pointer shadow-sm"
            >
              <option value="all">All Projects</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-600 focus:outline-none focus:border-violet-400 cursor-pointer shadow-sm"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="overdue">Overdue</option>
            </select>
            <button
              onClick={() => setSidePanelOpen((v) => !v)}
              className="text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
            >
              {sidePanelOpen ? "Hide Panel" : "Show Panel"}
            </button>
          </div>
        </div>

        {/* ── STATUS FILTER TABS ── */}
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-400 font-medium mr-1">Status:</span>
          {["all","todo","active","completed","overdue"].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors capitalize ${
                filterStatus === s
                  ? s === "overdue"
                    ? "bg-red-500 text-white shadow-sm"
                    : "bg-violet-600 text-white shadow-sm"
                  : "bg-white border border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
            >
              {s === "all" ? "All Status"
                : s === "todo" ? "To Do"
                : s === "active" ? "In Progress"
                : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {/* ── MONTH NAVIGATION ── */}
        <div className="mb-4 flex items-center justify-between bg-white rounded-2xl px-6 py-3 border border-slate-200 shadow-sm">
          <button
            onClick={prevMonth}
            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors text-lg"
          >‹</button>
          <h2 className="text-base font-semibold text-slate-700">
            {MONTHS[viewMonth]} {viewYear}
          </h2>
          <button
            onClick={nextMonth}
            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors text-lg"
          >›</button>
        </div>

        {/* ── MAIN BODY: GRID + SIDE PANEL ── */}
        <div className="flex gap-4 items-start">

          {/* ── CALENDAR GRID ── */}
          <div className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50">
              {DAYS.map((d) => (
                <div key={d} className="text-center text-xs font-semibold text-slate-400 uppercase tracking-wider py-3">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar week rows */}
            <div className="flex flex-col">
              {Array.from({ length: cells.length / 7 }, (_, wi) => (
                <div key={wi} className="grid grid-cols-7 border-b border-slate-100 last:border-b-0">
                  {cells.slice(wi * 7, wi * 7 + 7).map((day, ci) => {
                    if (!day) return (
                      <div
                        key={`e-${wi}-${ci}`}
                        className="h-24 border-r border-slate-100 last:border-r-0 bg-slate-50/40"
                      />
                    );

                    const key        = dateKey(viewYear, viewMonth, day);
                    const dayTasks   = tasksByDate[key] || [];
                    const isToday    = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
                    const isSelected = day === selectedDay;
                    const hasOverdue = dayTasks.some((t) => isTaskOverdue(t));
                    const overdueOnlyHighlight = isOverdueFilter && hasOverdue;

                    return (
                      <button
                        key={day}
                        onClick={() => setSelectedDay(day)}
                        className={[
                          "h-24 flex flex-col items-start p-2 border-r border-slate-100 last:border-r-0 transition-all text-left w-full overflow-hidden",
                          isSelected            ? "bg-violet-50 ring-2 ring-inset ring-violet-400"
                          : isToday             ? "bg-blue-50"
                          : overdueOnlyHighlight? "bg-red-50 hover:bg-red-100/50"
                          :                       "bg-white hover:bg-slate-50",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between w-full mb-1">
                          <span className={[
                            "text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full",
                            isToday    ? "bg-blue-600 text-white"
                            : isSelected ? "text-violet-700 font-bold"
                            :              "text-slate-600",
                          ].join(" ")}>
                            {day}
                          </span>
                          {dayTasks.length > 0 && (
                            <span className="text-[9px] text-slate-400 font-medium">
                              {dayTasks.length}
                            </span>
                          )}
                        </div>

                        {dayTasks.length > 0 && (
                          <div className="flex flex-wrap gap-0.5">
                            {dayTasks.slice(0, 3).map((t) => (
                              <span
                                key={t.id}
                                className={`w-1.5 h-1.5 rounded-full flex-none ${
                                  isTaskOverdue(t) ? "bg-red-500" : PRIORITY_DOT[t.priority?.toLowerCase()] || "bg-slate-400"
                                }`}
                              />
                            ))}
                            {dayTasks.length > 3 && (
                              <span className="text-[8px] text-slate-400 leading-none">+{dayTasks.length - 3}</span>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* ── SUMMARY STRIP ── */}
            <div className="border-t border-slate-200 bg-slate-50 px-6 py-3 flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-6">
                {[
                  { label: "Due This Month", value: monthTasks.length,   color: "text-violet-600" },
                  { label: "Completed",      value: summaryCompleted,    color: "text-emerald-600" },
                  { label: "Overdue",        value: summaryOverdue,      color: "text-red-500" },
                  { label: "In Progress",    value: summaryInProgress,   color: "text-blue-600" },
                ].map((s) => (
                  <div key={s.label} className="flex items-center gap-1.5">
                    <span className={`text-lg font-bold ${s.color}`}>{s.value}</span>
                    <span className="text-xs text-slate-400">{s.label}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-xs text-slate-400 font-medium">Legend:</span>
                {[
                  { label: "High",    cls: "bg-red-500" },
                  { label: "Medium",  cls: "bg-orange-400" },
                  { label: "Low",     cls: "bg-green-500" },
                  { label: "Overdue", cls: "bg-red-300" },
                  { label: "Today",   cls: "bg-blue-600" },
                ].map((leg) => (
                  <div key={leg.label} className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${leg.cls}`} />
                    <span className="text-xs text-slate-400">{leg.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── SIDE PANEL ── */}
          {sidePanelOpen && (
            <div className="flex-none w-72 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">

              <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
                <h3 className="text-sm font-semibold text-slate-700">
                  {selectedDay ? `${MONTHS[viewMonth]} ${selectedDay}, ${viewYear}` : "Select a day"}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {selectedTasks.length} task{selectedTasks.length !== 1 ? "s" : ""} scheduled
                </p>
              </div>

              <div className="overflow-y-auto max-h-[520px] px-4 py-3 space-y-2">
                {selectedTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-center gap-2">
                    <div className="text-3xl">📅</div>
                    <p className="text-xs text-slate-400">
                      {!selectedDay
                        ? "Click a day to view tasks"
                        : isOverdueFilter
                        ? "No overdue tasks on this day"
                        : "No tasks due on this day"}
                    </p>
                  </div>
                ) : (
                  selectedTasks.map((task) => {
                    const proj      = projects.find((p) => p.id === task.projectId);
                    const projColor = proj ? projectColorMap[proj.id] || "#8b5cf6" : "#8b5cf6";
                    const overdue   = isTaskOverdue(task);

                    return (
                      <div
                        key={task.id}
                        onClick={() => setDetailTask(task as unknown as DetailTask)}
                        className="bg-white rounded-xl p-3 border border-slate-200 hover:border-violet-300 hover:shadow-sm transition-all cursor-pointer"
                      >
                        <div className="flex items-start gap-2">
                          <span className={`mt-1 w-2 h-2 rounded-full flex-none ${
                            overdue ? "bg-red-500" : PRIORITY_DOT[task.priority?.toLowerCase()] || "bg-slate-400"
                          }`} />
                          <p className="text-xs font-medium text-slate-700 leading-snug line-clamp-2">
                            {task.taskCode && <span className="text-slate-400 mr-1">{task.taskCode}</span>}
                            {task.title}
                          </p>
                        </div>

                        {task.dueDate && (
                          <p className={`mt-1.5 text-[10px] font-medium ${
                            overdue ? "text-red-500" : "text-slate-400"
                          }`}>
                            Due: {new Date(task.dueDate).toLocaleDateString()}
                          </p>
                        )}

                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
                            overdue
                              ? "bg-red-100 text-red-600"
                              : isTaskDone(task)
                              ? "bg-emerald-100 text-emerald-600"
                              : "bg-slate-100 text-slate-500"
                          }`}>
                            {overdue ? "Overdue" : task.status || "Todo"}
                          </span>
                          {task.priority && (
                            <span className="text-[10px] text-slate-400 font-medium capitalize">{task.priority}</span>
                          )}
                        </div>

                        {proj && (
                          <div className="mt-2 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full flex-none" style={{ backgroundColor: projColor }} />
                            <span className="text-[10px] text-slate-400 truncate">{proj.name}</span>
                          </div>
                        )}
                        {task.assignee && (
                          <div className="mt-1.5 flex items-center gap-1.5">
                            <div className="w-4 h-4 rounded-full bg-violet-100 border border-violet-200 flex items-center justify-center flex-none">
                              <span className="text-[8px] text-violet-600 font-bold">{task.assignee[0]?.toUpperCase()}</span>
                            </div>
                            <span className="text-[10px] text-slate-400 truncate">{task.assignee}</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {projects.length > 0 && (
                <div className="border-t border-slate-200 px-5 py-4 bg-slate-50">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Active Projects</p>
                  <div className="space-y-1.5 max-h-28 overflow-y-auto">
                    {projects.map((p, i) => (
                      <div key={p.id} className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full flex-none" style={{ backgroundColor: p.color || PROJECT_COLORS[i % PROJECT_COLORS.length] }} />
                        <span className="text-xs text-slate-600 truncate">{p.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {detailTask && (
        <TaskDetailPanel
          task={detailTask}
          onClose={() => setDetailTask(null)}
          onEdit={(t) => {
            setDetailTask(null);
            openEdit(t);
          }}
        />
      )}

      {editTask && (
        <div className="fixed inset-0 bg-black/50 z-[90] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Edit Task</h2>
              <button onClick={() => setEditTask(null)}
                      className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
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
                  onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Description</label>
                <textarea
                  placeholder="Add more details..."
                  value={editForm.description}
                  onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Status</label>
                  <select
                    value={editForm.status}
                    onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {["To Do","In Progress","In Review","Done"].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Priority</label>
                  <select
                    value={editForm.priority}
                    onChange={e => setEditForm(f => ({ ...f, priority: e.target.value }))}
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
                  <label className="text-xs font-medium text-gray-600 block mb-1">Assignee</label>
                  <input
                    type="text"
                    placeholder="Name or email"
                    value={editForm.assignee}
                    onChange={e => setEditForm(f => ({ ...f, assignee: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Due Date</label>
                  <input
                    type="date"
                    value={editForm.dueDate}
                    onChange={e => setEditForm(f => ({ ...f, dueDate: e.target.value }))}
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
