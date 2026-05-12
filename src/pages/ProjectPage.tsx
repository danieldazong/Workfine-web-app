import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate }               from "react-router-dom";
import {
  collection, onSnapshot, addDoc, updateDoc,
  deleteDoc, doc, serverTimestamp,
} from "firebase/firestore";
import { db }          from "../lib/firebase/config";
import { useAuth }     from "../context/AuthContext";
import { useAppData }  from "../context/AppDataContext";
import TaskDetailPanel from "../components/TaskDetailPanel";

// ─── Types ────────────────────────────────────────────────────────────────
interface Task {
  id:          string;
  title:       string;
  status:      "To Do" | "In Progress" | "In Review" | "Done";
  priority:    "Low" | "Medium" | "High";
  assignee:    string;
  dueDate:     string;
  description: string;
  createdAt:   any;
  taskCode?:   string;
}

const STATUS_COLUMNS = ["To Do", "In Progress", "In Review", "Done"] as const;

const STATUS_STYLE: Record<string, string> = {
  "To Do":       "bg-gray-100 text-gray-600",
  "In Progress": "bg-blue-100 text-blue-600",
  "In Review":   "bg-purple-100 text-purple-600",
  "Done":        "bg-emerald-100 text-emerald-600",
};

const PRIORITY_STYLE: Record<string, string> = {
  "High":   "bg-red-100 text-red-600",
  "Medium": "bg-amber-100 text-amber-600",
  "Low":    "bg-gray-100 text-gray-500",
};

const PRIORITY_DOT: Record<string, string> = {
  "High":   "bg-red-500",
  "Medium": "bg-amber-400",
  "Low":    "bg-gray-400",
};

// ─── Empty Task Form ──────────────────────────────────────────────────────
const emptyTask = () => ({
  title: "", status: "To Do" as const, priority: "Medium" as const,
  assignee: "", dueDate: "", description: "",
});

// ─── Main Component ───────────────────────────────────────────────────────
const ProjectPage = () => {
  const { id }          = useParams<{ id: string }>();
  const { user, workspaceId } = useAuth();
  const { projects }    = useAppData();
  const navigate        = useNavigate();

  const [tasks,       setTasks]       = useState<Task[]>([]);
  const [view,        setView]        = useState<"list" | "board">("list");
  const [filter,      setFilter]      = useState<"all" | "mine" | "high">("all");
  const [search,      setSearch]      = useState("");
  const [showModal,   setShowModal]   = useState(false);
  const [editTask,    setEditTask]    = useState<Task | null>(null);
  const [form,        setForm]        = useState(emptyTask());
  const [saving,      setSaving]      = useState(false);
  const [drawerTask,  setDrawerTask]  = useState<Task | null>(null);

  const project = projects.find(p => p.id === id);

  // ── Real-time tasks listener ───────────────────────────────────────────
 useEffect(() => {
  if (!workspaceId || !id) return;

  const ref = collection(db, "workspaces", workspaceId, "tasks");

  const unsub = onSnapshot(
    ref,
    (snap) => {
      const all = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Task))
        .filter((t) => (t as any).projectId === id);

      setTasks(all);
    },
    (err) => console.error("[ProjectPage] tasks:", err.code)
  );

  return () => unsub();
}, [workspaceId, id]);


  // ── Keep drawerTask in sync with the latest task data ─────────────────
  useEffect(() => {
    if (!drawerTask) return;
    const fresh = tasks.find(t => t.id === drawerTask.id);
    if (fresh && fresh !== drawerTask) setDrawerTask(fresh);
    if (!fresh) setDrawerTask(null); // task was deleted
  }, [tasks, drawerTask]);

  // ── Live progress update on Firestore project doc ─────────────────────
  useEffect(() => {
  if (!workspaceId || !id) return;

  const done = tasks.filter((t) => t.status === "Done").length;
  const progress = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;

  updateDoc(doc(db, "workspaces", workspaceId, "projects", id), {
    taskCount: tasks.length,
    completedTaskCount: done,
    progress,
    updatedAt: serverTimestamp(),
  }).catch(() => {});
}, [tasks, workspaceId, id]);


  // ── Derived stats ──────────────────────────────────────────────────────
  const done      = tasks.filter(t => t.status === "Done").length;
  const progress  = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
  const overdue   = tasks.filter(t =>
    t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "Done"
  ).length;

  const stats = [
    { label: "Total Tasks",  value: tasks.length, color: "text-gray-900"    },
    { label: "Completed",    value: done,          color: "text-emerald-600" },
    { label: "In Progress",  value: tasks.filter(t => t.status === "In Progress").length, color: "text-blue-600" },
    { label: "Overdue",      value: overdue,       color: overdue > 0 ? "text-red-500" : "text-gray-400" },
  ];

  // ── Filtered tasks ─────────────────────────────────────────────────────
  const assignedToMe = (task: Task): boolean => {
    if (!user?.email) return false;
    const assignee = (task.assignee ?? "").toLowerCase().trim();
    const myEmail  = user.email.toLowerCase().trim();
    return assignee === myEmail;
  };

  const filtered = useMemo(() => {
    let list = [...tasks];
    if (filter === "mine")   list = list.filter(assignedToMe);
    if (filter === "high")   list = list.filter(t => t.priority === "High");
    if (search.trim())       list = list.filter(t =>
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.description?.toLowerCase().includes(search.toLowerCase())
    );
    return list;
  }, [tasks, filter, search, user?.email]);

  // ── Save task ──────────────────────────────────────────────────────────
  const handleSave = async () => {
   if (!user?.uid || !workspaceId || !form.title.trim()) return;
    setSaving(true);
    try {
      if (editTask) {
        await updateDoc(doc(db, "workspaces", workspaceId, "tasks", editTask.id), {
  ...form,
  updatedAt: serverTimestamp(),
});

      } else {
        const pCode = (project as any)?.code || "WF-000";
        const taskCode = `${pCode}-T${tasks.length + 1}`;
        await addDoc(collection(db, "workspaces", workspaceId, "tasks"), {
  ...form,
  taskCode,
  assignee: form.assignee.trim(),
  projectId: id,
  workspaceId,
  ownerId: user.uid,
  createdBy: user.uid,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});

      }
      setShowModal(false);
      setEditTask(null);
      setForm(emptyTask());
    } catch(e: any) { console.error(e.message); }
    finally { setSaving(false); }
  };

  // ── Delete task ────────────────────────────────────────────────────────
  const handleDelete = async (taskId: string) => {
   if (!workspaceId) return;
await deleteDoc(doc(db, "workspaces", workspaceId, "tasks", taskId));

  };

  // ── Toggle task status ─────────────────────────────────────────────────
  const cycleStatus = async (task: Task) => {
    const order: Task["status"][] = ["To Do","In Progress","In Review","Done"];
    const next = order[(order.indexOf(task.status) + 1) % order.length];
   if (!workspaceId) return;

await updateDoc(doc(db, "workspaces", workspaceId, "tasks", task.id), {
  status: next,
  updatedAt: serverTimestamp(),
});
  };

  // ── Open edit modal ────────────────────────────────────────────────────
  const openEdit = (task: Task) => {
    setEditTask(task);
    setForm({
      title:       task.title,
      status:      task.status,
      priority:    task.priority,
      assignee:    task.assignee,
      dueDate:     task.dueDate,
      description: task.description,
    });
    setShowModal(true);
  };

  // ── Open detail drawer (chat + comments + reactions) ───────────────────
  const openDrawer = (task: Task) => {
    setDrawerTask(task);
  };

  // ── Edit handler called from inside the drawer ────────────────────────
  const handleDrawerEdit = (task: Task) => {
    setDrawerTask(null);
    openEdit(task);
  };

  if (!project) return (
    <div className="ml-0 bg-[#f4f5f7] min-h-screen flex items-center justify-center">
      <div className="text-center">
        <p className="text-gray-400 text-sm mb-3">Project not found</p>
        <button onClick={() => navigate("/dashboard")}
                className="text-blue-600 text-sm hover:underline">
          ← Back to Dashboard
        </button>
      </div>
    </div>
  );

  return (
    <div className="ml-0 bg-[#f4f5f7] min-h-screen overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 pt-14 pb-12">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="mb-6">
          <button onClick={() => navigate("/dashboard")}
                  className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 mb-3 transition-colors">
            ← Dashboard
          </button>

          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-sm"
                   style={{ backgroundColor: project.color ?? "#3b82f6" }}>
                {project.name[0].toUpperCase()}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
                  {project.name}
                </h1>
                {project.description && (
                  <p className="text-sm text-gray-500 mt-0.5 max-w-lg">
                    {project.description}
                  </p>
                )}
              </div>
            </div>

            {/* Header badges + New Task */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                (project as any).priority === "High"   ? "bg-red-100 text-red-600"
                : (project as any).priority === "Medium" ? "bg-amber-100 text-amber-600"
                :                                          "bg-gray-100 text-gray-500"
              }`}>
                {(project as any).priority ?? "Medium"} Priority
              </span>
              <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-blue-50 text-blue-600 capitalize">
                {(project as any).status ?? "active"}
              </span>
              <button
                onClick={() => { setEditTask(null); setForm(emptyTask()); setShowModal(true); }}
                className="ml-2 flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
              >
                + New Task
              </button>
            </div>
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-4 mt-3 ml-13">
            {(project as any).dueDate && (
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                📅 Due: {new Date((project as any).dueDate + "T12:00:00")
                  .toLocaleDateString("en-US",{ month:"short", day:"numeric", year:"numeric" })}
              </span>
            )}
            {(project as any).tags?.length > 0 && (
              <div className="flex gap-1.5">
                {(project as any).tags.map((t: string) => (
                  <span key={t}
                        className="text-xs px-2 py-0.5 bg-blue-50 text-blue-500 rounded-full">
                    #{t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Progress Bar ──────────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm px-5 py-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              Project Progress
            </span>
            <span className={`text-sm font-bold ${
              progress === 100 ? "text-emerald-600"
              : progress >= 50 ? "text-blue-600"
              :                  "text-gray-500"
            }`}>
              {progress}% Completed
            </span>
          </div>
          <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${progress}%`,
                backgroundColor: project.color ?? "#3b82f6",
              }}
            />
          </div>
        </div>

        {/* ── Stat Cards ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          {stats.map(s => (
            <div key={s.label}
                 className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-400 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Toolbar ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 mb-4">
          {/* Filters */}
          <div className="flex items-center gap-2">
            {[
              { id: "all", label: `All Tasks (${tasks.length})` },
              { id: "mine", label: `Assigned to Me (${tasks.filter(assignedToMe).length})` },
              { id: "high", label: `Priority: High (${tasks.filter(t => t.priority === "High").length})` }
            ].map(f => (
              <button key={f.id} onClick={() => setFilter(f.id as any)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium
                                  transition-colors ${
                        filter === f.id
                          ? "bg-blue-600 text-white"
                          : "bg-white border border-gray-200 text-gray-500 hover:bg-gray-50"
                      }`}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Search + View toggle */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search tasks..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 w-44"
            />
            <div className="flex border border-gray-200 rounded-lg overflow-hidden bg-white">
              {(["list","board"] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                        className={`px-3 py-1.5 text-xs font-medium capitalize
                                    transition-colors ${
                          view === v
                            ? "bg-blue-600 text-white"
                            : "text-gray-500 hover:bg-gray-50"
                        }`}>
                  {v === "list" ? "☰ List" : "⊞ Board"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── LIST VIEW ─────────────────────────────────────────────────── */}
        {view === "list" && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 border-b border-gray-100 bg-gray-50">
              {["Task Name","Status","Priority","Assignee","Due Date",""].map(h => (
                <span key={h}
                      className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  {h}
                </span>
              ))}
            </div>

            {filtered.length > 0 ? (
              filtered.map(task => (
                <div key={task.id}
                     onClick={() => openDrawer(task)}
                     className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3.5 border-b border-gray-50 last:border-0 hover:bg-gray-50/70 transition-colors items-center group cursor-pointer">
                  {/* Title + checkbox */}
                  <div className="flex items-center gap-3">
                    <button onClick={(e) => { e.stopPropagation(); cycleStatus(task); }}
                            className={`w-5 h-5 rounded-full border-2 flex items-center
                                        justify-center flex-shrink-0 transition-all ${
                              task.status === "Done"
                                ? "border-emerald-500 bg-emerald-500"
                                : "border-gray-300 hover:border-blue-400"
                            }`}>
                      {task.status === "Done" && (
                        <svg className="w-3 h-3 text-white" fill="none"
                             viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round"
                                strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                    <div className="min-w-0">
                      <p className={`text-sm font-medium truncate ${
                        task.status === "Done"
                          ? "line-through text-gray-400"
                          : "text-gray-800"
                      }`}>
                        {task.taskCode && <span className="text-xs text-slate-400 mr-2">{task.taskCode}</span>}
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="text-xs text-gray-400 truncate mt-0.5">
                          {task.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Status */}
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium
                                    w-fit ${STATUS_STYLE[task.status]}`}>
                    {task.status}
                  </span>

                  {/* Priority */}
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[task.priority]}`} />
                    <span className={`text-xs font-medium ${
                      task.priority === "High"   ? "text-red-600"
                      : task.priority === "Medium" ? "text-amber-600"
                      :                             "text-gray-500"
                    }`}>
                      {task.priority}
                    </span>
                  </div>

                  {/* Assignee */}
                  <div className="flex items-center gap-1.5">
                    {task.assignee && task.assignee !== "Unassigned" ? (
                      <>
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0
                                      ${assignedToMe(task) ? "bg-violet-500" : "bg-blue-500"}`}
                        >
                          {task.assignee.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-xs text-gray-600 truncate max-w-[140px]">
                          {assignedToMe(task)
                            ? (
                              <span className="text-violet-600 font-medium">
                                {user?.displayName ?? user?.email ?? "You"}
                              </span>
                            )
                            : task.assignee}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-gray-400 italic">Unassigned</span>
                    )}
                  </div>

                  {/* Due Date */}
                  <span className={`text-xs ${
                    task.dueDate && new Date(task.dueDate) < new Date()
                    && task.status !== "Done"
                      ? "text-red-500 font-medium"
                      : "text-gray-500"
                  }`}>
                    {task.dueDate
                      ? new Date(task.dueDate + "T12:00:00")
                          .toLocaleDateString("en-US",{ month:"short", day:"numeric" })
                      : "—"}
                  </span>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); openEdit(task); }}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors text-xs">
                      ✏️
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(task.id); }}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors text-xs">
                      🗑
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-20 flex flex-col items-center gap-2">
                <p className="text-3xl">📋</p>
                <p className="text-sm text-gray-400 font-medium">No tasks found</p>
                <button
                  onClick={() => { setEditTask(null); setForm(emptyTask()); setShowModal(true); }}
                  className="mt-2 text-xs text-blue-600 hover:underline"
                >
                  + Create your first task
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── BOARD VIEW ────────────────────────────────────────────────── */}
        {view === "board" && (
          <div className="grid grid-cols-4 gap-3">
            {STATUS_COLUMNS.map(col => {
              const colTasks = filtered.filter(t => t.status === col);
              return (
                <div key={col}
                     className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                  {/* Column header */}
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${
                        col === "Done"        ? "bg-emerald-500"
                        : col === "In Review" ? "bg-purple-500"
                        : col === "In Progress" ? "bg-blue-500"
                        :                         "bg-gray-400"
                      }`} />
                      <span className="text-xs font-semibold text-gray-700">
                        {col}
                      </span>
                    </div>
                    <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5 font-medium">
                      {colTasks.length}
                    </span>
                  </div>

                  {/* Column tasks */}
                  <div className="p-3 space-y-2 min-h-[200px]">
                    {colTasks.map(task => (
                      <div key={task.id}
                           className="bg-gray-50 border border-gray-100 rounded-xl p-3 group hover:shadow-sm transition-all cursor-pointer"
                           onClick={() => openDrawer(task)}>
                        <p className={`text-sm font-medium text-gray-800
                                       leading-snug mb-2 ${
                          task.status === "Done" ? "line-through text-gray-400" : ""
                        }`}>
                          {task.taskCode && <span className="block text-[10px] text-slate-400 mb-0.5">{task.taskCode}</span>}
                          {task.title}
                        </p>
                        <div className="flex items-center justify-between">
                          <span className={`text-xs px-2 py-0.5 rounded-full
                                           font-medium ${PRIORITY_STYLE[task.priority]}`}>
                            {task.priority}
                          </span>
                          {task.dueDate && (
                            <span className="text-xs text-gray-400">
                              {new Date(task.dueDate + "T12:00:00")
                                .toLocaleDateString("en-US",{ month:"short", day:"numeric" })}
                            </span>
                          )}
                        </div>
                        {task.assignee && (
                          <div className="flex items-center gap-1.5 mt-2">
                            <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                              {task.assignee[0].toUpperCase()}
                            </div>
                            <span className="text-xs text-gray-500">
                              {task.assignee}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Add task shortcut per column */}
                    <button
                      onClick={() => {
                        setEditTask(null);
                        setForm({ ...emptyTask(), status: col });
                        setShowModal(true);
                      }}
                      className="w-full py-2 text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border-2 border-dashed border-gray-100 hover:border-blue-200"
                    >
                      + Add task
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ══ TASK MODAL ═══════════════════════════════════════════════════ */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">

            {/* Modal header */}
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {editTask ? "Edit Task" : "New Task"}
              </h2>
              <button onClick={() => { setShowModal(false); setEditTask(null); }}
                      className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            <div className="px-6 py-5 space-y-4">

              {/* Title */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Task Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="What needs to be done?"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Description
                </label>
                <textarea
                  placeholder="Add more details..."
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* Status + Priority row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Status
                  </label>
                  <select
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value as any }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {STATUS_COLUMNS.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Priority
                  </label>
                  <select
                    value={form.priority}
                    onChange={e => setForm(f => ({ ...f, priority: e.target.value as any }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="Low">🟢 Low</option>
                    <option value="Medium">🟡 Medium</option>
                    <option value="High">🔴 High</option>
                  </select>
                </div>
              </div>

              {/* Assignee + Due Date row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Assignee
                  </label>
                  <input
                    type="text"
                    placeholder="Name or email"
                    value={form.assignee}
                    onChange={e => setForm(f => ({ ...f, assignee: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-6 pb-6 flex gap-2">
              <button
                onClick={() => { setShowModal(false); setEditTask(null); }}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!form.title.trim() || saving}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : editTask ? "Save Changes" : "Create Task"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ TASK DETAIL DRAWER (chat + comments + reactions) ══════════════ */}
      {drawerTask && (
        <TaskDetailPanel
          task={drawerTask as any}
          onClose={() => setDrawerTask(null)}
          onEdit={handleDrawerEdit}
        />
      )}
    </div>
  );
};

export default ProjectPage;
