/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { useAppData } from '../context/AppDataContext';
import { 
  CheckSquare, 
  BarChart3, 
  AlertCircle, 
  FolderOpen, 
  ArrowUp, 
  ArrowDown, 
  CheckCircle2 
} from 'lucide-react';
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from 'recharts';

export default function InsightsPage() {
  const {
    tasks,
    teamMembers,
    loading,
    projects,
  } = useAppData();

  // Count only projects with status "active" — updates in real-time
  const activeProjectsCount = projects.filter(
    (p) => p.status === "active"
  ).length;

  // Total projects count for reference
  const totalProjectsCount = projects.length;

  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "90d" | "all">("7d");
  const [pageReady, setPageReady] = useState(false);

  useEffect(() => {
    if (!loading) setPageReady(true);
  }, [loading]);

  if (!pageReady) {
    return (
      <div className="ml-0 bg-[#f4f5f7] min-h-screen overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 pt-14 pb-8">
          <div className="h-8 w-48 bg-gray-200 rounded-lg animate-pulse mb-2" />
          <div className="h-4 w-64 bg-gray-100 rounded animate-pulse mb-8" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-white border border-gray-200 rounded-xl animate-pulse shadow-sm" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Helper: filter tasks by time range
  const getFilteredTasks = (taskList: any[]) => {
    if (timeRange === "all") return taskList;

    const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return taskList.filter((t: any) => {
      const created = t.createdAt?.toDate?.() || new Date(t.createdAt || 0);
      return created >= cutoff;
    });
  };

  const filteredTasks = getFilteredTasks(tasks);

  // Compute trend vs previous period
  const getPreviousPeriodTasks = () => {
    const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : timeRange === "90d" ? 90 : 365;

    const now = new Date();
    const periodStart = new Date();
    periodStart.setDate(now.getDate() - days);
    const prevStart = new Date();
    prevStart.setDate(now.getDate() - days * 2);

    const current = tasks.filter((t: any) => {
      const d = t.createdAt?.toDate?.() || new Date(t.createdAt || 0);
      return d >= periodStart && d <= now;
    }).length;

    const previous = tasks.filter((t: any) => {
      const d = t.createdAt?.toDate?.() || new Date(t.createdAt || 0);
      return d >= prevStart && d < periodStart;
    }).length;

    const change = previous === 0 ? (current > 0 ? 100 : 0) : Math.round(((current - previous) / previous) * 100);

    return { current, change };
  };

  const trendData = getPreviousPeriodTasks();
  const totalTasksTrend = trendData.change;

  // Completion Rate trend
  const getCompletionRateTrend = () => {
    const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : timeRange === "90d" ? 90 : 365;
    const now = new Date();
    const periodStart = new Date();
    periodStart.setDate(now.getDate() - days);
    const prevStart = new Date();
    prevStart.setDate(now.getDate() - days * 2);

    const currentTasks = tasks.filter((t: any) => {
      const d = t.createdAt?.toDate?.() || new Date(t.createdAt || 0);
      return d >= periodStart && d <= now;
    });
    const currentDone = currentTasks.filter((t: any) => t.status === "Done").length;
    const currentRate = currentTasks.length > 0 ? Math.round((currentDone / currentTasks.length) * 100) : 0;

    const prevTasks = tasks.filter((t: any) => {
      const d = t.createdAt?.toDate?.() || new Date(t.createdAt || 0);
      return d >= prevStart && d < periodStart;
    });
    const prevDone = prevTasks.filter((t: any) => t.status === "Done").length;
    const prevRate = prevTasks.length > 0 ? Math.round((prevDone / prevTasks.length) * 100) : 0;

    return currentRate - prevRate;
  };
  const completionRateTrend = getCompletionRateTrend();

  const activeProjectsTrend = 0;

  const getDaysArray = () => {
    const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90;
    const limit = timeRange === "all" ? 30 : days;

    return Array.from({ length: limit }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (limit - 1 - i));
      return {
        day: timeRange === "7d"
          ? d.toLocaleDateString("en-US", { weekday: "short" })
          : d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        date: d.toISOString().split("T")[0],
      };
    });
  };

  const chartTrendData = getDaysArray().map(({ day, date }) => ({
    day,
    completed: tasks.filter((t: any) => {
      if (t.status !== "Done") return false;
      const d = t.updatedAt?.toDate?.()
        ? t.updatedAt.toDate().toISOString().split("T")[0]
        : (t.updatedAt || "").split("T")[0];
      return d === date;
    }).length,
    created: tasks.filter((t: any) => {
      const d = t.createdAt?.toDate?.()
        ? t.createdAt.toDate().toISOString().split("T")[0]
        : (t.createdAt || "").split("T")[0];
      return d === date;
    }).length,
  }));

  const statusData = [
    { name: "To Do", count: filteredTasks.filter((t: any) => t.status === "To Do").length, fill: "#9ca3af" },
    { name: "In Progress", count: filteredTasks.filter((t: any) => t.status === "In Progress").length, fill: "#3b82f6" },
    { name: "In Review", count: filteredTasks.filter((t: any) => t.status === "In Review").length, fill: "#a855f7" },
    { name: "Done", count: filteredTasks.filter((t: any) => t.status === "Done").length, fill: "#10b981" },
  ];

  const priorityData = [
    { name: "High", value: filteredTasks.filter((t: any) => t.priority === "High").length, color: "#ef4444" },
    { name: "Medium", value: filteredTasks.filter((t: any) => t.priority === "Medium").length, color: "#f59e0b" },
    { name: "Low", value: filteredTasks.filter((t: any) => t.priority === "Low").length, color: "#9ca3af" },
  ].filter(d => d.value > 0);

  const overdueTasksList = tasks.filter((t: any) => {
    if (!t.dueDate || t.status === "Done") return false;
    return new Date(t.dueDate) < new Date();
  }).sort((a: any, b: any) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  const overdueCount = overdueTasksList.length;

  const teamPerformance = teamMembers.map((member: any) => {
    const memberTasks = filteredTasks.filter((t: any) => t.assignee === member.name);
    const doneTasks = memberTasks.filter((t: any) => t.status === "Done");
    const overdueMemberTasks = memberTasks.filter((t: any) => {
      if (!t.dueDate || t.status === "Done") return false;
      return new Date(t.dueDate) < new Date();
    });
    const rate = memberTasks.length > 0 ? Math.round((doneTasks.length / memberTasks.length) * 100) : 0;

    return {
      ...member,
      total: memberTasks.length,
      done: doneTasks.length,
      overdue: overdueMemberTasks.length,
      rate,
    };
  }).sort((a: any, b: any) => b.rate - a.rate);

  const totalTasksVal = filteredTasks.length;
  const donePct = totalTasksVal > 0 ? (filteredTasks.filter((t: any) => t.status === "Done").length / totalTasksVal) * 100 : 0;
  const overduePct = totalTasksVal > 0 ? (tasks.filter((t: any) => {
    if (!t.dueDate || t.status === "Done") return false;
    return new Date(t.dueDate) < new Date();
  }).length / totalTasksVal) * 100 : 0;
  
  const highPriorityDone = filteredTasks.filter((t: any) => t.priority === "High" && t.status === "Done").length;
  const highPriorityTotal = filteredTasks.filter((t: any) => t.priority === "High").length;
  const highPriorityRate = highPriorityTotal > 0 ? (highPriorityDone / highPriorityTotal) * 100 : 100;

  const healthScore = Math.round((donePct * 0.5) + (Math.max(0, 100 - overduePct) * 0.3) + (highPriorityRate * 0.2));

  const healthLabel = healthScore >= 80 ? "Excellent" : healthScore >= 60 ? "Good" : healthScore >= 40 ? "Fair" : "Needs Attention";
  const healthColor = healthScore >= 80 ? "#10b981" : healthScore >= 60 ? "#3b82f6" : healthScore >= 40 ? "#f59e0b" : "#ef4444";

  return (
    <div className="ml-0 bg-[#f4f5f7] min-h-screen overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 pt-14 pb-8">
        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
            Insights
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Real-time performance analytics
          </p>
        </div>

        {/* Time range filter */}
        <div className="flex items-center gap-2 mb-5">
          {[
            { label: "Last 7 Days", value: "7d" },
            { label: "Last 30 Days", value: "30d" },
            { label: "Last 90 Days", value: "90d" },
            { label: "All Time", value: "all" },
          ].map((option) => (
                       <button
              key={option.value}
              onClick={() => setTimeRange(option.value as any)}
              style={
                timeRange === option.value
                  ? { backgroundColor:  "#4C28EE", borderColor: "#4C28EE" }
                  : undefined
              }
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                timeRange === option.value
                  ? "text-white"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {option.label}
            </button>

          ))}
        </div>

        {/* ROW 1: Enhanced stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500 font-medium">Total Tasks</p>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-blue-50 text-blue-500">
                <CheckSquare className="w-4 h-4 text-blue-500" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{filteredTasks.length}</p>
            {totalTasksTrend !== 0 && (
              <div className={`flex items-center gap-1 mt-1 ${totalTasksTrend > 0 ? "text-emerald-600" : "text-red-500"}`}>
                {totalTasksTrend > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                <span className="text-xs font-medium">{Math.abs(totalTasksTrend)}% vs last period</span>
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500 font-medium">Completion Rate</p>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-emerald-50 text-emerald-500">
                <BarChart3 className="w-4 h-4 text-emerald-500" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {filteredTasks.length > 0 ? Math.round((filteredTasks.filter((t: any) => t.status === "Done").length / filteredTasks.length) * 100) + "%" : "0%"}
            </p>
            {completionRateTrend !== 0 && (
              <div className={`flex items-center gap-1 mt-1 ${completionRateTrend > 0 ? "text-emerald-600" : "text-red-500"}`}>
                {completionRateTrend > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                <span className="text-xs font-medium">{Math.abs(completionRateTrend)}% vs last period</span>
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500 font-medium">Overdue Tasks</p>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-red-50 text-red-500">
                <AlertCircle className="w-4 h-4 text-red-500" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{overdueCount}</p>
            {overdueCount > 0 && (
              <div className="flex items-center gap-1 mt-1 text-red-500">
                <span className="text-xs font-medium">Action required</span>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100
                          flex flex-col gap-2 relative overflow-hidden">
            {/* Icon */}
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-500">Active Projects</p>
              <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center
                              justify-center">
                <svg className="w-4 h-4 text-purple-500" fill="none"
                     viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2
                       2H5a2 2 0 01-2-2V7z" />
                </svg>
              </div>
            </div>

            {/* Live Count */}
            <p className="text-3xl font-bold text-gray-900">
              {activeProjectsCount}
            </p>

            {/* Subtitle showing total */}
            <p className="text-xs text-gray-400">
              {totalProjectsCount === 0
                ? "No projects yet"
                : `${activeProjectsCount} of ${totalProjectsCount} total project${
                    totalProjectsCount !== 1 ? "s" : ""
                  } active`}
            </p>

            {/* Live indicator dot */}
            <div className="flex items-center gap-1.5 mt-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full
                                 rounded-full bg-purple-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2
                                 bg-purple-500" />
              </span>
              <span className="text-xs text-purple-500 font-medium">
                Live sync
              </span>
            </div>
          </div>
        </div>

        {/* ROW 2: Task Completion Trend | Status Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
          {/* Task Completion Trend line chart */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
            <h3 className="text-gray-900 font-semibold mb-4 text-sm">Task Completion Trend</h3>
                                               <div style={{ width: "100%", height: 180, minWidth: 0, minHeight: 180, position: "relative" }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={180} debounce={50}>
                <LineChart data={chartTrendData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} allowDecimals={false} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, color: "#111827", fontSize: 12 }} />
                  <Line type="monotone" dataKey="created" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Created" />
                  <Line type="monotone" dataKey="completed" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Completed" />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Task Status Breakdown bar chart */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
            <h3 className="text-gray-900 font-semibold mb-4 text-sm">Task Status Breakdown</h3>
                                             <div style={{ width: "100%", height: 180, minWidth: 0, minHeight: 180, position: "relative" }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={180} debounce={50}>
                <BarChart data={statusData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} allowDecimals={false} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, color: "#111827", fontSize: 12 }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={30}>
                    {statusData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ROW 3: Priority Analysis | Overdue Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
          {/* Priority Analysis donut chart */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 flex flex-col">
            <div className="mb-2">
              <h3 className="text-gray-900 font-semibold text-sm">Priority Analysis</h3>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Task Distribution by Priority</p>
            </div>
            {priorityData.length === 0 ? (
              <div className="flex items-center justify-center h-[180px]">
                <p className="text-xs text-gray-400">No tasks yet.</p>
              </div>
            ) : (
                                                       <div style={{ width: "100%", height: 180, minWidth: 0, minHeight: 180, position: "relative" }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={180} debounce={50}>
                  <PieChart>
                    <Pie data={priorityData} innerRadius={50} outerRadius={75} dataKey="value" stroke="none">
                      {priorityData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 8, color: "#111827", fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-xl font-bold text-gray-900">{priorityData.reduce((acc, curr) => acc + curr.value, 0)}</span>
                </div>
              </div>
            )}
            <div className="flex justify-center gap-4 mt-auto pt-2">
              {priorityData.map(d => (
                <div key={d.name} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="text-xs text-gray-600">{d.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Overdue Tasks list */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4 flex flex-col">
            <div className="mb-4">
              <h3 className="text-gray-900 font-semibold text-sm">Overdue Tasks</h3>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Tasks Past Their Due Date</p>
            </div>
            
            <div className="max-h-[220px] overflow-y-auto pr-2">
              {overdueTasksList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10">
                  <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center mb-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  </div>
                  <p className="text-xs font-medium text-gray-700">All caught up!</p>
                  <p className="text-xs text-gray-400 mt-0.5">No overdue tasks.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {overdueTasksList.map((task: any) => (
                    <div key={task.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                      <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1 flex-shrink-0 min-w-[48px] text-center">
                        {Math.floor((new Date().getTime() - new Date(task.dueDate).getTime()) / (1000 * 60 * 60 * 24))}d
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800 truncate">{task.title}</p>
                        <p className="text-xs text-gray-400 truncate">
                          {task.projectId || "No project"}
                        </p>
                      </div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${task.priority === "High" ? "bg-red-100 text-red-600" : task.priority === "Medium" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-500"}`}>
                        {task.priority || "None"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>


        {/* ROW 5: Team Performance | Productivity Score */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
          {/* Team Performance */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
            <div className="mb-4">
              <h3 className="text-gray-900 font-semibold text-sm">Team Performance</h3>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Tasks Completed Per Member</p>
            </div>
            
            <div className="space-y-3">
              {teamPerformance.length === 0 ? (
                <div className="flex items-center justify-center py-10 text-center">
                  <p className="text-xs text-gray-400">No team members yet.<br/>Add members to see performance.</p>
                </div>
              ) : (
                teamPerformance.map((member: any) => (
                  <div key={member.id || member.name} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <p className="text-xs font-medium text-gray-700 truncate">{member.name}</p>
                        <div className="flex items-center gap-2">
                          {member.overdue > 0 && <span className="text-xs text-red-500">{member.overdue} overdue</span>}
                          <span className="text-xs font-semibold text-gray-900">{member.rate}%</span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full transition-all" style={{ width: `${member.rate}%`, backgroundColor: member.rate >= 75 ? "#10b981" : member.rate >= 40 ? "#f59e0b" : "#ef4444" }} />
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">{member.done}/{member.total} tasks completed</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Productivity Score */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
            <div className="mb-2">
              <h3 className="text-gray-900 font-semibold text-sm">Productivity Score</h3>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Overall Workspace Health</p>
            </div>
            
            <div className="flex flex-col items-center py-4">
              <div className="relative w-32 h-32">
                <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="50" fill="none" stroke="#f3f4f6" strokeWidth="10" />
                  <circle cx="60" cy="60" r="50" fill="none" stroke={healthColor} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 50}`} strokeDashoffset={2 * Math.PI * 50 * (1 - healthScore / 100)} className="transition-all duration-700" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-gray-900">{healthScore}</span>
                  <span className="text-xs text-gray-400">/ 100</span>
                </div>
              </div>
              
              <span className="text-sm font-semibold mt-3" style={{ color: healthColor }}>{healthLabel}</span>
              
              <div className="grid grid-cols-3 gap-4 mt-4 w-full">
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-900">{Math.round(donePct)}%</p>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Done Rate</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-red-500">{overdueCount}</p>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Overdue</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-900">{Math.round(highPriorityRate)}%</p>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">High Done</p>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
