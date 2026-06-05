import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppData } from "../context/AppDataContext";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  FolderKanban, Plus, Search, Rocket, CheckCircle2, AlertTriangle,
  TrendingUp, ArrowRight, ChevronDown,
} from "lucide-react";
import CreateProjectModal from "../components/CreateProjectModal";

const BRAND = "#4C28EE";

// ─── Helpers ────────────────────────────────────────────────────────────────
const toMs = (v: any): number => {
  if (!v) return 0;
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

const txt = (v: unknown, fallback = ""): string => {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return fallback;
};

const ProjectsOverviewPage = () => {
  const { projects, tasks, loading } = useAppData();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "completed" | "at-risk">("all");
  const [sortBy, setSortBy] = useState<"recent" | "progress" | "tasks" | "name">("recent");
  const [showCreateProject, setShowCreateProject] = useState(false);

  const now = new Date();

  // ── Per-project enriched stats ──────────────────────────────────────────────
  const enriched = useMemo(() => {
    return (Array.isArray(projects) ? projects : []).map((p: any) => {
      const pt = tasks.filter((t: any) => t.projectId === p.id);
      const done = pt.filter((t: any) => t.status === "Done").length;
      const inProgress = pt.filter((t: any) => t.status === "In Progress").length;
      const overdue = pt.filter(
        (t: any) => t.dueDate && new Date(t.dueDate) < now && t.status !== "Done"
      ).length;
      const total = pt.length;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const isComplete = total > 0 && done === total;
            const atRisk = !isComplete && overdue > 0;
      return { ...p, _total: total, _done: done, _inProgress: inProgress, _overdue: overdue, _pct: pct, _isComplete: isComplete, _atRisk: atRisk };
    });
  }, [projects, tasks]);

  // ── Portfolio rollups ───────────────────────────────────────────────────────
  const portfolio = useMemo(() => {
    const totalProjects = enriched.length;
    const completedProjects = enriched.filter((p: any) => p._isComplete).length;
    const atRiskProjects = enriched.filter((p: any) => p._atRisk).length;
    const activeProjects = totalProjects - completedProjects - atRiskProjects;

    const totalTasks = enriched.reduce((s: number, p: any) => s + p._total, 0);
    const doneTasks = enriched.reduce((s: number, p: any) => s + p._done, 0);
    const inProgressTasks = enriched.reduce((s: number, p: any) => s + p._inProgress, 0);
    const overdueTasks = enriched.reduce((s: number, p: any) => s + p._overdue, 0);
    const avgCompletion = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    return { totalProjects, completedProjects, atRiskProjects, activeProjects, totalTasks, doneTasks, inProgressTasks, overdueTasks, avgCompletion };
  }, [enriched]);

  // ── Chart data ──────────────────────────────────────────────────────────────
  const statusDistribution = useMemo(() => [
    { name: "On Track", value: portfolio.activeProjects, color: "#4C28EE" },
    { name: "At Risk", value: portfolio.atRiskProjects, color: "#f43f5e" },
    { name: "Completed", value: portfolio.completedProjects, color: "#10b981" },
  ].filter((d) => d.value > 0), [portfolio]);

  const tasksPerProject = useMemo(() =>
    [...enriched].sort((a: any, b: any) => b._total - a._total).slice(0, 8).map((p: any) => ({
      name: txt(p.name, "Untitled").slice(0, 12),
      Done: p._done,
      Remaining: p._total - p._done,
    })), [enriched]);

  const topPerforming = useMemo(() =>
    [...enriched].filter((p: any) => p._total > 0).sort((a: any, b: any) => b._pct - a._pct).slice(0, 3), [enriched]);

  const atRiskList = useMemo(() => enriched.filter((p: any) => p._atRisk).slice(0, 3), [enriched]);

  // ── Filtered grid ───────────────────────────────────────────────────────────
  const grid = useMemo(() => {
    let list = [...enriched];
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((p: any) => txt(p.name).toLowerCase().includes(q) || txt(p.code).toLowerCase().includes(q));
    if (statusFilter === "active") list = list.filter((p: any) => !p._isComplete && !p._atRisk);
    if (statusFilter === "completed") list = list.filter((p: any) => p._isComplete);
    if (statusFilter === "at-risk") list = list.filter((p: any) => p._atRisk);
    list.sort((a: any, b: any) => {
      if (sortBy === "progress") return b._pct - a._pct;
      if (sortBy === "tasks") return b._total - a._total;
      if (sortBy === "name") return txt(a.name).localeCompare(txt(b.name));
      return toMs(b.createdAt) - toMs(a.createdAt);
    });
    return list;
  }, [enriched, search, statusFilter, sortBy]);

  const todoTasks = Math.max(0, portfolio.totalTasks - portfolio.doneTasks - portfolio.inProgressTasks);

  const HERO = [
    {
      label: "Total Tasks", value: portfolio.totalTasks,
      sub: `across ${portfolio.totalProjects} ${portfolio.totalProjects === 1 ? "project" : "projects"}`,
      icon: FolderKanban, accent: "#4C28EE", tint: "from-violet-50 to-white", ring: "ring-violet-100",
    },
    {
      label: "In Progress", value: portfolio.inProgressTasks,
      sub: `${todoTasks} not started`,
      icon: Rocket, accent: "#3b82f6", tint: "from-blue-50 to-white", ring: "ring-blue-100",
    },
    {
      label: "Completed", value: portfolio.doneTasks,
      sub: `${portfolio.avgCompletion}% of all tasks`,
      icon: CheckCircle2, accent: "#10b981", tint: "from-emerald-50 to-white", ring: "ring-emerald-100",
    },
    {
      label: "Overdue", value: portfolio.overdueTasks,
      sub: portfolio.overdueTasks > 0 ? "needs attention" : "all on time",
      icon: AlertTriangle,
      accent: portfolio.overdueTasks > 0 ? "#f43f5e" : "#94a3b8",
      tint: portfolio.overdueTasks > 0 ? "from-rose-50 to-white" : "from-slate-50 to-white",
      ring: portfolio.overdueTasks > 0 ? "ring-rose-100" : "ring-slate-100",
    },
  ];


  return (
    <div className="ml-0 bg-gradient-to-b from-[#f7f8fb] to-[#eef0f6] min-h-screen overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 pt-12 pb-12">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-none">My Projects</h1>
            <p className="text-sm text-slate-400 mt-2">Portfolio overview across all your projects.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateProject(true)}
            style={{ backgroundColor: BRAND }}
            className="flex items-center gap-2 px-4 py-2.5 text-white text-sm font-semibold rounded-xl shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 hover:-translate-y-0.5 transition-all"
          >
            <Plus size={16} /> Create Project
          </button>
        </div>

        {/* ── HERO STATS ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          {HERO.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className={`relative overflow-hidden bg-gradient-to-br ${s.tint} border border-white rounded-2xl p-5 shadow-sm ring-1 ${s.ring} hover:shadow-md transition-all`}>
                                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[34px] font-bold tracking-tight leading-none" style={{ color: s.accent }}>{s.value}</p>
                    <p className="text-xs font-semibold text-slate-600 mt-2">{s.label}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{s.sub}</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${s.accent}15` }}>
                    <Icon size={18} style={{ color: s.accent }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── PORTFOLIO HEALTH ────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
                <TrendingUp size={16} style={{ color: BRAND }} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Portfolio Health</h3>
                <p className="text-[11px] text-slate-400">
                  {portfolio.doneTasks} of {portfolio.totalTasks} tasks completed
                  {portfolio.overdueTasks > 0 && ` · ${portfolio.overdueTasks} overdue`}
                </p>
              </div>
            </div>
            <span className={`text-[32px] font-bold tracking-tight ${portfolio.avgCompletion >= 70 ? "text-emerald-500" : portfolio.avgCompletion >= 40 ? "text-violet-600" : "text-amber-500"}`}>
              {portfolio.avgCompletion}%
            </span>
          </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${portfolio.avgCompletion}%`,
                backgroundImage: "repeating-linear-gradient(45deg, #4C28EE 0px, #4C28EE 6px, #6747f5 6px, #6747f5 12px)",
              }} />
          </div>

        </div>

        {/* ── CHARTS ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
          {/* Status donut */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <h3 className="text-sm font-semibold text-slate-800">Project Status</h3>
            <p className="text-[11px] text-slate-400 mb-2">Distribution across portfolio</p>
            {statusDistribution.length > 0 ? (
              <div className="flex items-center gap-4">
                <div style={{ width: 160, height: 180 }}>
                  <ResponsiveContainer width="100%" height="100%" debounce={0}>
                    <PieChart>
                      <Pie data={statusDistribution} cx="50%" cy="50%" innerRadius={52} outerRadius={75} paddingAngle={3} dataKey="value" stroke="none">
                        {statusDistribution.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle" className="fill-slate-900" style={{ fontSize: 22, fontWeight: 700 }}>
                        {portfolio.totalProjects}
                      </text>
                      <text x="50%" y="58%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 9, fill: "#94a3b8", letterSpacing: 1 }}>
                        PROJECTS
                      </text>
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 10, border: "1px solid #eef0f6" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-2.5">
                  {statusDistribution.map((d) => (
                    <div key={d.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                        <span className="text-xs text-slate-600">{d.name}</span>
                      </div>
                      <span className="text-xs font-semibold text-slate-800">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : <div className="h-[180px] flex items-center justify-center"><p className="text-xs text-slate-400">No project data yet</p></div>}
          </div>

          {/* Tasks by project */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <h3 className="text-sm font-semibold text-slate-800">Tasks by Project</h3>
            <p className="text-[11px] text-slate-400 mb-2">Done vs remaining · top 8</p>
            {tasksPerProject.length > 0 ? (
              <div style={{ width: "100%", height: 180 }}>
                <ResponsiveContainer width="100%" height="100%" debounce={0}>
                  <BarChart data={tasksPerProject} barSize={18} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#94a3b8" }} interval={0} angle={-20} textAnchor="end" height={48} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} allowDecimals={false} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: "#f7f8fb" }} contentStyle={{ fontSize: 11, borderRadius: 10, border: "1px solid #eef0f6" }} />
                    <Bar dataKey="Done" stackId="a" fill="#10b981" />
                    <Bar dataKey="Remaining" stackId="a" fill="#e9ebf2" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <div className="h-[180px] flex items-center justify-center"><p className="text-xs text-slate-400">No task data yet</p></div>}
          </div>
        </div>

        {/* ── TOP PERFORMING + NEEDS ATTENTION ────────────────────────── */}
        {(topPerforming.length > 0 || atRiskList.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">🏆 Top Performing</h3>
              {topPerforming.length > 0 ? (
                <div className="space-y-1">
                  {topPerforming.map((p: any) => (
                    <div key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
                      className="flex items-center gap-3 cursor-pointer hover:bg-slate-50 rounded-xl px-2.5 py-2 -mx-2.5 transition-colors group">
                      <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0" style={{ backgroundColor: txt(p.color, "#3b82f6") }}>
                        {txt(p.name, "U").charAt(0).toUpperCase()}
                      </span>
                      <span className="text-xs font-medium text-slate-700 truncate flex-1">{txt(p.name, "Untitled")}</span>
                      <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${p._pct}%` }} />
                      </div>
                      <span className="text-xs font-bold text-emerald-600 w-9 text-right flex-shrink-0">{p._pct}%</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-slate-400">No data yet.</p>}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">⚠️ Needs Attention</h3>
              {atRiskList.length > 0 ? (
                <div className="space-y-1">
                  {atRiskList.map((p: any) => (
                    <div key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
                      className="flex items-center gap-3 cursor-pointer hover:bg-rose-50/50 rounded-xl px-2.5 py-2 -mx-2.5 transition-colors">
                      <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0" style={{ backgroundColor: txt(p.color, "#3b82f6") }}>
                        {txt(p.name, "U").charAt(0).toUpperCase()}
                      </span>
                      <span className="text-xs font-medium text-slate-700 truncate flex-1">{txt(p.name, "Untitled")}</span>
                      <span className="text-[11px] font-semibold text-rose-500 flex-shrink-0">
                        {p._overdue > 0 ? `${p._overdue} overdue` : `${p._pct}% done`}
                      </span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-slate-400">Everything's on track. 🎉</p>}
            </div>
          </div>
        )}

        {/* ── TOOLBAR ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="inline-flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-100 shadow-sm">
            {([
              { id: "all", label: `All ${enriched.length}` },
              { id: "active", label: `Active ${portfolio.activeProjects}` },
              { id: "completed", label: `Completed ${portfolio.completedProjects}` },
              { id: "at-risk", label: `At Risk ${portfolio.atRiskProjects}` },
            ] as const).map((f) => (
              <button key={f.id} onClick={() => setStatusFilter(f.id)}
                style={statusFilter === f.id ? { backgroundColor: BRAND } : undefined}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${statusFilter === f.id ? "text-white shadow-sm" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"}`}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="Search projects..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="bg-white border border-slate-100 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-200 w-48" />
            </div>
            <div className="relative">
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}
                className="appearance-none bg-white border border-slate-100 rounded-xl pl-3 pr-8 py-2 text-xs font-medium text-slate-600 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-200 cursor-pointer">
                <option value="recent">Most Recent</option>
                <option value="progress">Progress</option>
                <option value="tasks">Most Tasks</option>
                <option value="name">Name (A–Z)</option>
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* ── PROJECT GRID ────────────────────────────────────────────── */}
        {grid.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {grid.map((p: any) => (
              <div key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
                className="relative bg-white rounded-2xl shadow-sm border border-slate-100 p-5 cursor-pointer hover:shadow-lg hover:-translate-y-1 hover:border-violet-200 transition-all duration-200 group">
                {/* top accent line */}
                <div className="absolute top-0 left-5 right-5 h-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: txt(p.color, "#3b82f6") }} />
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold shadow-sm flex-shrink-0" style={{ backgroundColor: txt(p.color, "#3b82f6") }}>
                    {txt(p.name, "U").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 truncate group-hover:text-violet-600 transition-colors">{txt(p.name, "Untitled project")}</p>
                    {p.code && <p className="text-[11px] text-slate-400 truncate">{txt(p.code)}</p>}
                  </div>
                  {p._isComplete ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-semibold flex-shrink-0">Done</span>
                  ) : p._atRisk ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-500 font-semibold flex-shrink-0">At risk</span>
                  ) : null}
                </div>

                                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] text-slate-400">Progress</span>
                  <span className={`text-[11px] font-bold ${p._pct === 0 ? "text-slate-300" : "text-slate-700"}`}>
                    {p._total === 0 ? "No tasks" : `${p._pct}%`}
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full mb-4 overflow-hidden">
                  {p._pct === 0 ? (
                    // faint striped placeholder so a 0% bar reads as "not started"
                    // rather than looking like a broken / missing bar.
                    <div
                      className="h-full w-full rounded-full opacity-40"
                      style={{
                        backgroundImage:
                          "repeating-linear-gradient(45deg, #e2e8f0 0px, #e2e8f0 4px, #f1f5f9 4px, #f1f5f9 8px)",
                      }}
                    />
                  ) : (
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${p._pct}%`, backgroundColor: p._isComplete ? "#10b981" : txt(p.color, "#3b82f6") }}
                    />
                  )}
                </div>


                <div className="flex items-center justify-between text-[11px] pt-3 border-t border-slate-50">
                  <span className="text-slate-500">{p._total} {p._total === 1 ? "task" : "tasks"} · {p._done} done</span>
                  {p._overdue > 0
                    ? <span className="text-rose-500 font-medium flex items-center gap-1"><AlertTriangle size={11} /> {p._overdue} overdue</span>
                    : <span className="text-slate-300 group-hover:text-violet-500 transition-colors flex items-center gap-0.5">Open <ArrowRight size={11} /></span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 py-24 flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center">
              <FolderKanban size={24} style={{ color: BRAND }} />
            </div>
            <p className="text-sm text-slate-400 font-medium">
              {loading ? "Loading projects…" : search || statusFilter !== "all" ? "No projects match your filters." : "No projects yet."}
            </p>
            {!loading && !search && statusFilter === "all" && (
              <button type="button" onClick={() => setShowCreateProject(true)} style={{ backgroundColor: BRAND }} className="mt-1 px-4 py-2 text-white text-xs font-semibold rounded-xl shadow-sm hover:opacity-90 transition-opacity">
                + Create your first project
              </button>
            )}
          </div>
        )}
      </div>

      <CreateProjectModal isOpen={showCreateProject} onClose={() => setShowCreateProject(false)} />
    </div>
  );
};

export default ProjectsOverviewPage;
