import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Settings as SettingsIcon,
  UserPlus,
  Star,
  CheckCircle2,
  Circle,
  Plus,
  FolderKanban,
  ArrowRight,
  Pencil,
  Search,
  Shield,
  User as UserIcon,
  Eye,
  Crown,
  Trash2,
  Clock,
  Mail,
  X,
  AlertCircle,
} from "lucide-react";

import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase/config";
import { useAuth } from "../context/AuthContext";
import { useAppData } from "../context/AppDataContext";
import InviteMemberModal from "../components/InviteMemberModal";
import WorkspaceModal from "../components/WorkspaceModal";
import CreateProjectModal from "../components/CreateProjectModal";
import {
  updateMemberRole,
  removeMember,
  WorkspaceRole,
} from "../lib/firebase/workspaceMembers";


type TabId = "overview" | "members" | "settings";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "members",  label: "Members"  },
  { id: "settings", label: "Settings" },
];

const fmtDate = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

export default function WorkspacePage() {
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { members, pendingInvites, workspaceData, projects, tasks, cancelInvite } = useAppData();


  const activeTab: TabId =
    tab === "members" || tab === "settings" ? (tab as TabId) : "overview";

  const [showInvite, setShowInvite] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);

  const wsName     = workspaceData?.name     ?? "My Workspace";
  const wsInitial  = (wsName?.[0] ?? "W").toUpperCase();
  const wsColor    = "#8b5cf6";
  const activeMembers = members.filter((m) => m.status === "active");

  // current user's role in this workspace
  const myMembership = members.find((m) => m.userId === user?.uid);
  const canManage = myMembership?.role === "owner" || myMembership?.role === "admin";

  return (
    <div className="bg-[#f4f5f7] min-h-screen overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 pt-14 pb-10">

        {/* ── Header row ─────────────────────────────────────────────── */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-sm"
              style={{ backgroundColor: wsColor }}
            >
              {wsInitial}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
                  {wsName}
                </h1>
                <button
                  onClick={() => setShowSettings(true)}
                  className="text-gray-400 hover:text-gray-700 transition-colors"
                  title="Workspace settings"
                >
                  <SettingsIcon size={16} />
                </button>
                <button
                  className="text-gray-300 hover:text-amber-500 transition-colors"
                  title="Star workspace"
                >
                  <Star size={16} />
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {workspaceData?.id ?? ""}
                {activeMembers.length > 0 && ` · ${activeMembers.length} member${activeMembers.length === 1 ? "" : "s"}`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-xl hover:bg-violet-700 transition-colors shadow-sm"
          >
            <UserPlus size={15} />
            Invite
          </button>
        </div>

        {/* ── Tab bar ────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1 border-b border-gray-200 mb-6">
          {TABS.map((t) => {
            const isActive = activeTab === t.id;
            const path = t.id === "overview" ? "/workspace" : `/workspace/${t.id}`;
            return (
              <button
                key={t.id}
                onClick={() => navigate(path)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  isActive
                    ? "border-violet-600 text-violet-700"
                    : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
              >
                {t.label}
                {t.id === "members" && activeMembers.length > 0 && (
                  <span className="ml-1.5 text-xs text-gray-400">
                    {activeMembers.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Tab content ────────────────────────────────────────────── */}
        {activeTab === "overview" && (
          <OverviewTab
            workspaceData={workspaceData}
            workspaceName={wsName}
            workspaceColor={wsColor}
            workspaceInitial={wsInitial}
            members={activeMembers}
            projects={projects}
            tasks={tasks}
            canManage={canManage}
            onInvite={() => setShowInvite(true)}
            onCreateProject={() => setShowCreateProject(true)}
            onOpenSettings={() => setShowSettings(true)}
          />
        )}
        {activeTab === "members" && (
  <MembersTab
    workspaceId={workspaceData?.id}
    members={members}
    pendingInvites={pendingInvites}
    myUid={user?.uid ?? ""}
    canManage={canManage}
    onInvite={() => setShowInvite(true)}
    onCancelInvite={cancelInvite}
  />
)}

        {activeTab === "settings" && <SettingsTabStub />}
      </div>

      {showInvite && workspaceData?.id && (
        <InviteMemberModal
          onClose={() => setShowInvite(false)}
          workspaceId={workspaceData.id}
          workspaceName={wsName}
          members={members}
          pendingInvites={pendingInvites}
        />
      )}

      {showSettings && <WorkspaceModal onClose={() => setShowSettings(false)} />}

      {showCreateProject && (
        <CreateProjectModal onClose={() => setShowCreateProject(false)} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OVERVIEW TAB
// ─────────────────────────────────────────────────────────────────────────────

function OverviewTab({
  workspaceData,
  workspaceName,
  workspaceColor,
  workspaceInitial,
  members,
  projects,
  tasks,
  canManage,
  onInvite,
  onCreateProject,
  onOpenSettings,
}: any) {
  const description = workspaceData?.description ?? "";
  const hasDescription = description.trim().length > 0;
  const hasProjects    = projects.length > 0;
  const hasTeammates   = members.length > 1;

  const setupItems = [
    { id: "desc",  label: "Add workspace description", done: hasDescription, onClick: () => {
        // inline edit handled below by EditableDescription
        document.getElementById("ws-desc-edit-btn")?.click();
      }
    },
    { id: "proj",  label: "Create your first project", done: hasProjects,    onClick: onCreateProject },
    { id: "team",  label: "Invite a teammate",         done: hasTeammates,   onClick: onInvite },
  ];

  const completedSteps = setupItems.filter((i) => i.done).length;
  const totalSteps     = setupItems.length;
  const setupDone      = completedSteps === totalSteps;

  // stats
  const totalTasks     = tasks.length;
  const completedTasks = tasks.filter((t: any) => t.status === "Done").length;
  const completion     = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

      {/* ─── LEFT COLUMN (2/3) ───────────────────────────────────────── */}
      <div className="lg:col-span-2 space-y-5">

        {/* Workspace hero card with editable description */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
          <div className="flex items-start gap-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-sm flex-shrink-0"
              style={{ backgroundColor: workspaceColor }}
            >
              {workspaceInitial}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-gray-900 truncate">{workspaceName}</h2>
              <EditableDescription
                workspaceId={workspaceData?.id}
                value={description}
                canEdit={canManage}
              />
            </div>
          </div>
        </div>

        {/* Setup checklist */}
        {!setupDone && (
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">
                  Finish setting up your workspace
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {completedSteps} of {totalSteps} steps completed
                </p>
              </div>
              <div className="text-xs font-semibold text-violet-600">
                {Math.round((completedSteps / totalSteps) * 100)}%
              </div>
            </div>
            <div className="w-full h-1.5 bg-gray-100 rounded-full mb-4 overflow-hidden">
              <div
                className="h-full bg-violet-500 rounded-full transition-all duration-500"
                style={{ width: `${(completedSteps / totalSteps) * 100}%` }}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {setupItems.map((item) => (
                <button
                  key={item.id}
                  onClick={item.onClick}
                  disabled={item.done}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    item.done
                      ? "bg-emerald-50 border-emerald-200 cursor-default"
                      : "bg-white border-gray-200 hover:border-violet-300 hover:shadow-sm cursor-pointer"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {item.done ? (
                      <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <Circle size={16} className="text-gray-300 flex-shrink-0 mt-0.5" />
                    )}
                    <span className={`text-xs font-medium leading-tight ${
                      item.done ? "text-emerald-700" : "text-gray-700"
                    }`}>
                      {item.label}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Curated work / Recent projects */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Curated work</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Important links and projects your team should know about
              </p>
            </div>
            <button
              onClick={() => navigate2("/projects")}
              className="text-xs text-violet-600 hover:underline font-medium flex items-center gap-1"
            >
              View all <ArrowRight size={12} />
            </button>
          </div>

          {projects.length === 0 ? (
            <div className="text-center py-8">
              <FolderKanban className="mx-auto text-gray-300 mb-3" size={32} />
              <p className="text-sm text-gray-500 mb-3">No projects yet</p>
              <button
                onClick={onCreateProject}
                className="inline-flex items-center gap-2 px-3 py-2 bg-violet-600 text-white text-xs font-medium rounded-lg hover:bg-violet-700 transition-colors"
              >
                <Plus size={13} /> Create first project
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {projects.slice(0, 4).map((p: any) => {
                const pt   = tasks.filter((t: any) => t.projectId === p.id);
                const done = pt.filter((t: any) => t.status === "Done").length;
                const pct  = pt.length > 0 ? Math.round((done / pt.length) * 100) : 0;
                return (
                  <div
                    key={p.id}
                    onClick={() => navigate2(`/projects/${p.id}`)}
                    className="border border-gray-200 rounded-xl p-3 cursor-pointer hover:border-violet-300 hover:shadow-sm transition-all group"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
                        style={{ backgroundColor: p.color ?? "#3b82f6" }}
                      >
                        {p.name[0].toUpperCase()}
                      </div>
                      <p className="text-sm font-semibold text-gray-800 truncate group-hover:text-violet-700 transition-colors">
                        {p.name}
                      </p>
                    </div>
                    {p.description && (
                      <p className="text-xs text-gray-400 truncate mb-2">{p.description}</p>
                    )}
                    <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1">
                      <span>{pt.length} task{pt.length === 1 ? "" : "s"}</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: p.color ?? "#3b82f6" }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {projects.length > 0 && (
            <button
              onClick={onCreateProject}
              className="mt-3 w-full py-2 border border-dashed border-gray-300 text-gray-500 hover:text-violet-600 hover:border-violet-300 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-1"
            >
              <Plus size={13} /> Add another project
            </button>
          )}
        </div>
      </div>

      {/* ─── RIGHT COLUMN (1/3) ──────────────────────────────────────── */}
      <div className="space-y-5">

        {/* Members preview */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-800">Members</h3>
            <button
              onClick={() => navigate2("/workspace/members")}
              className="text-xs text-violet-600 hover:underline font-medium"
            >
              View all {members.length}
            </button>
          </div>

          {members.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No members yet</p>
          ) : (
            <div className="flex flex-wrap gap-2 mb-3">
              {members.slice(0, 6).map((m: any) => (
                <div
                  key={m.userId}
                  title={m.displayName}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold border-2 border-white shadow-sm"
                  style={{ backgroundColor: m.avatarColor || "#8b5cf6" }}
                >
                  {m.avatar || (m.displayName?.[0] ?? "M").toUpperCase()}
                </div>
              ))}
              {members.length > 6 && (
                <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-500 font-semibold border-2 border-white shadow-sm">
                  +{members.length - 6}
                </div>
              )}
              <button
                onClick={onInvite}
                title="Invite member"
                className="w-9 h-9 rounded-full border-2 border-dashed border-gray-300 text-gray-400 hover:text-violet-600 hover:border-violet-300 flex items-center justify-center transition-colors"
              >
                <Plus size={14} />
              </button>
            </div>
          )}

          <button
            onClick={onInvite}
            className="w-full py-2 bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1"
          >
            <UserPlus size={12} /> Invite teammate
          </button>
        </div>

        {/* Workspace stats */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Workspace at a glance</h3>
          <div className="space-y-3">
            <StatRow label="Projects"        value={projects.length} />
            <StatRow label="Tasks"           value={totalTasks} />
            <StatRow label="Completed tasks" value={completedTasks} />
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-gray-500">Completion rate</span>
                <span className="font-semibold text-gray-800">{completion}%</span>
              </div>
              <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${completion}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Plan card */}
        <div className="bg-gradient-to-br from-violet-600 to-violet-800 rounded-2xl shadow-sm p-5 text-white">
          <p className="text-xs uppercase tracking-wider opacity-80 mb-1">Current plan</p>
          <p className="text-lg font-bold mb-2 capitalize">{workspaceData?.plan ?? "Free"}</p>
          <p className="text-xs opacity-80 leading-relaxed">
            Manage workspace settings, members, and billing from the gear icon above.
          </p>
          <button
            onClick={onOpenSettings}
            className="mt-3 w-full py-2 bg-white/15 hover:bg-white/25 backdrop-blur-sm rounded-lg text-xs font-medium transition-colors"
          >
            Open settings
          </button>
        </div>
      </div>
    </div>
  );
}

// Tiny helper because OverviewTab is a child function — it doesn't have
// access to react-router's `navigate`. We use window.location for simplicity.
function navigate2(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-gray-500">{label}</span>
      <span className="font-semibold text-gray-800 text-sm">{value}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EDITABLE DESCRIPTION
// ─────────────────────────────────────────────────────────────────────────────

function EditableDescription({
  workspaceId,
  value,
  canEdit,
}: {
  workspaceId?: string;
  value: string;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(value);
  const [saving,  setSaving]  = useState(false);

  // keep draft in sync if value changes externally
  React.useEffect(() => { setDraft(value); }, [value]);

  async function save() {
    if (!workspaceId) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "workspaces", workspaceId), {
        description: draft.trim(),
        updatedAt: serverTimestamp(),
      });
      setEditing(false);
    } catch (e) {
      console.error("[Workspace] save description failed:", e);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="mt-1.5">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 280))}
          rows={2}
          autoFocus
          placeholder="Describe what this workspace is for..."
          className="w-full text-sm text-gray-700 border border-violet-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
        />
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[10px] text-gray-400">{draft.length}/280</span>
          <div className="flex gap-2">
            <button
              onClick={() => { setDraft(value); setEditing(false); }}
              disabled={saving}
              className="px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-3 py-1 text-xs bg-violet-600 text-white font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!value) {
    return (
      <button
        id="ws-desc-edit-btn"
        onClick={() => canEdit && setEditing(true)}
        disabled={!canEdit}
        className={`mt-1 text-sm italic flex items-center gap-1 ${
          canEdit
            ? "text-gray-400 hover:text-violet-600 cursor-pointer"
            : "text-gray-400 cursor-default"
        }`}
      >
        {canEdit ? "+ Add workspace description" : "No description"}
      </button>
    );
  }

  return (
    <div className="mt-1 flex items-start gap-2 group">
      <p className="text-sm text-gray-600 leading-relaxed flex-1">{value}</p>
      {canEdit && (
        <button
          id="ws-desc-edit-btn"
          onClick={() => setEditing(true)}
          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-violet-600 transition-opacity flex-shrink-0 mt-0.5"
          title="Edit description"
        >
          <Pencil size={13} />
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STUBS for later phases
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// MEMBERS TAB
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_META: Record<
  WorkspaceRole,
  { label: string; icon: any; color: string; bg: string }
> = {
  owner:  { label: "Owner",  icon: Crown,    color: "text-amber-600",   bg: "bg-amber-50" },
  admin:  { label: "Admin",  icon: Shield,   color: "text-blue-600",    bg: "bg-blue-50" },
  member: { label: "Member", icon: UserIcon, color: "text-emerald-600", bg: "bg-emerald-50" },
  viewer: { label: "Viewer", icon: Eye,      color: "text-orange-500",  bg: "bg-orange-50" },
};

function MembersTab({
  workspaceId,
  members,
  pendingInvites,
  myUid,
  canManage,
  onInvite,
  onCancelInvite,
}: {
  workspaceId?: string;
  members: any[];
  pendingInvites: any[];
  myUid: string;
  canManage: boolean;
  onInvite: () => void;
  onCancelInvite: (code: string) => Promise<void>;
}) {
  const [subTab, setSubTab] = useState<"active" | "pending">("active");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const activeMembers = members.filter((m) => m.status === "active");
  const pendingList   = pendingInvites.filter((i) => i.status === "pending");

  const myMembership = members.find((m) => m.userId === myUid);
  const myRole: WorkspaceRole = (myMembership?.role as WorkspaceRole) ?? "member";

  // filter members by search
  const q = query.trim().toLowerCase();
  const filteredMembers = q
    ? activeMembers.filter((m) =>
        (m.displayName ?? "").toLowerCase().includes(q) ||
        (m.email ?? "").toLowerCase().includes(q)
      )
    : activeMembers;

  const filteredPending = q
    ? pendingList.filter((i) =>
        (i.email ?? "").toLowerCase().includes(q)
      )
    : pendingList;

  async function handleRoleChange(userId: string, newRole: WorkspaceRole) {
    if (!workspaceId) return;
    setError("");
    setBusyId(userId);
    try {
      await updateMemberRole(workspaceId, userId, newRole);
    } catch (e: any) {
      console.error("[MembersTab] role change failed:", e);
      setError(e?.message || "Failed to update role.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(userId: string, displayName: string) {
    if (!workspaceId) return;
    if (!confirm(`Remove ${displayName} from the workspace?`)) return;
    setError("");
    setBusyId(userId);
    try {
      await removeMember(workspaceId, userId);
    } catch (e: any) {
      console.error("[MembersTab] remove failed:", e);
      setError(e?.message || "Failed to remove member.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancelInvite(code: string) {
    setError("");
    setBusyId(code);
    try {
      await onCancelInvite(code);
    } catch (e: any) {
      console.error("[MembersTab] cancel invite failed:", e);
      setError(e?.message || "Failed to cancel invitation.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">

      {/* Toolbar */}
      <div className="px-5 pt-5 pb-3 border-b border-gray-100">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Workspace members</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Manage who has access to this workspace and what they can do
            </p>
          </div>
          {canManage && (
            <button
              onClick={onInvite}
              className="flex items-center gap-2 px-3 py-2 bg-violet-600 text-white rounded-lg text-xs font-semibold hover:bg-violet-700 transition-colors flex-shrink-0"
            >
              <UserPlus size={13} />
              Invite Member
            </button>
          )}
        </div>

        {/* Sub-tabs + Search */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-1">
            <button
              onClick={() => setSubTab("active")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                subTab === "active"
                  ? "bg-violet-100 text-violet-700"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              Active <span className="ml-1 opacity-70">{activeMembers.length}</span>
            </button>
            <button
              onClick={() => setSubTab("pending")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 ${
                subTab === "pending"
                  ? "bg-violet-100 text-violet-700"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              Pending
              {pendingList.length > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                  subTab === "pending" ? "bg-violet-200 text-violet-800" : "bg-amber-100 text-amber-700"
                }`}>
                  {pendingList.length}
                </span>
              )}
            </button>
          </div>

          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={subTab === "active" ? "Search members..." : "Search invites..."}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-5 mt-3">
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
            <AlertCircle size={13} />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError("")} className="text-red-500 hover:text-red-700">
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="px-5 py-4">
        {subTab === "active" && (
          <ActiveMembersList
            members={filteredMembers}
            allCount={activeMembers.length}
            myUid={myUid}
            myRole={myRole}
            canManage={canManage}
            busyId={busyId}
            onRoleChange={handleRoleChange}
            onRemove={handleRemove}
          />
        )}

        {subTab === "pending" && (
          <PendingInvitesList
            invites={filteredPending}
            allCount={pendingList.length}
            canManage={canManage}
            busyId={busyId}
            onCancel={handleCancelInvite}
            onInvite={onInvite}
          />
        )}
      </div>
    </div>
  );
}

function ActiveMembersList({
  members,
  allCount,
  myUid,
  myRole,
  canManage,
  busyId,
  onRoleChange,
  onRemove,
}: {
  members: any[];
  allCount: number;
  myUid: string;
  myRole: WorkspaceRole;
  canManage: boolean;
  busyId: string | null;
  onRoleChange: (uid: string, role: WorkspaceRole) => void;
  onRemove: (uid: string, name: string) => void;
}) {
  if (allCount === 0) {
    return (
      <div className="text-center py-12">
        <UserIcon className="mx-auto mb-3 text-gray-300" size={36} />
        <p className="text-sm text-gray-500">No active members yet.</p>
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="text-center py-12">
        <Search className="mx-auto mb-3 text-gray-300" size={28} />
        <p className="text-sm text-gray-500">No members match your search.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {/* Header row */}
      <div className="grid grid-cols-[1fr_140px_120px_36px] items-center gap-3 px-2 pb-2 text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
        <span>Member</span>
        <span>Role</span>
        <span>Joined</span>
        <span></span>
      </div>

      {members.map((m) => {
        const role = (m.role as WorkspaceRole) ?? "member";
        const meta = ROLE_META[role] ?? ROLE_META.member;
        const Icon = meta.icon;
        const isMe = m.userId === myUid;
        const isBusy = busyId === m.userId;

        const editable =
          canManage &&
          role !== "owner" &&
          !isMe &&
          (myRole === "owner" || (myRole === "admin" && role !== "admin"));

        const removable =
          canManage &&
          role !== "owner" &&
          !isMe &&
          (myRole === "owner" || (myRole === "admin" && role !== "admin"));

        const joinedDate = m.joinedAt
          ? (typeof m.joinedAt.toDate === "function"
              ? m.joinedAt.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
              : "—")
          : "—";

        return (
          <div
            key={m.userId}
            className="grid grid-cols-[1fr_140px_120px_36px] items-center gap-3 px-2 py-3 hover:bg-gray-50 transition-colors rounded-lg"
          >
            {/* Member identity */}
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                style={{ backgroundColor: m.avatarColor || "#8b5cf6" }}
              >
                {m.avatar || (m.displayName?.[0] ?? "M").toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {m.displayName}
                  {isMe && <span className="ml-1.5 text-[10px] text-gray-400 font-normal">(you)</span>}
                </p>
                <p className="text-xs text-gray-400 truncate">{m.email}</p>
              </div>
            </div>

            {/* Role */}
            {editable ? (
              <select
                disabled={isBusy}
                value={role}
                onChange={(e) => onRoleChange(m.userId, e.target.value as WorkspaceRole)}
                className={`text-xs font-semibold px-2 py-1.5 rounded-lg border border-gray-200 ${meta.color} bg-white focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50 cursor-pointer`}
              >
                {(myRole === "owner") && <option value="admin">Admin</option>}
                <option value="member">Member</option>
                <option value="viewer">Viewer</option>
              </select>
            ) : (
              <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold w-fit ${meta.bg} ${meta.color}`}>
                <Icon size={11} />
                {meta.label}
              </div>
            )}

            {/* Joined */}
            <span className="text-xs text-gray-500">{joinedDate}</span>

            {/* Remove */}
            <div className="flex justify-end">
              {removable ? (
                <button
                  onClick={() => onRemove(m.userId, m.displayName)}
                  disabled={isBusy}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                  title="Remove member"
                >
                  {isBusy ? (
                    <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-red-500 rounded-full animate-spin" />
                  ) : (
                    <Trash2 size={13} />
                  )}
                </button>
              ) : (
                <span className="w-7 h-7" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PendingInvitesList({
  invites,
  allCount,
  canManage,
  busyId,
  onCancel,
  onInvite,
}: {
  invites: any[];
  allCount: number;
  canManage: boolean;
  busyId: string | null;
  onCancel: (code: string) => void;
  onInvite: () => void;
}) {
  if (allCount === 0) {
    return (
      <div className="text-center py-12">
        <Mail className="mx-auto mb-3 text-gray-300" size={36} />
        <p className="text-sm text-gray-500 mb-1">No pending invitations.</p>
        <p className="text-xs text-gray-400 mb-4">
          Invite teammates to start collaborating in this workspace.
        </p>
        {canManage && (
          <button
            onClick={onInvite}
            className="inline-flex items-center gap-2 px-3 py-2 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-700 transition-colors"
          >
            <UserPlus size={12} /> Invite a teammate
          </button>
        )}
      </div>
    );
  }

  if (invites.length === 0) {
    return (
      <div className="text-center py-12">
        <Search className="mx-auto mb-3 text-gray-300" size={28} />
        <p className="text-sm text-gray-500">No invitations match your search.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {invites.map((inv) => {
        const role = (inv.role as WorkspaceRole) ?? "member";
        const meta = ROLE_META[role] ?? ROLE_META.member;
        const isBusy = busyId === inv.code;

        const invitedAt = inv.createdAt
          ? (typeof inv.createdAt.toDate === "function"
              ? inv.createdAt.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric" })
              : "")
          : "";

        return (
          <div
            key={inv.code}
            className="flex items-center gap-3 px-2 py-3 hover:bg-gray-50 transition-colors rounded-lg"
          >
            <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
              <Clock className="text-amber-600" size={15} />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{inv.email}</p>
              <p className="text-xs text-gray-400 truncate">
                Invited by {inv.invitedByName ?? "Someone"}
                {invitedAt && ` · ${invitedAt}`}
                {" · "}
                <span className="font-mono">{inv.code}</span>
              </p>
            </div>

            <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold ${meta.bg} ${meta.color}`}>
              {meta.label}
            </div>

            {canManage && (
              <button
                onClick={() => onCancel(inv.code)}
                disabled={isBusy}
                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                title="Cancel invitation"
              >
                {isBusy ? (
                  <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-red-500 rounded-full animate-spin" />
                ) : (
                  <X size={13} />
                )}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}


function SettingsTabStub() {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-8 text-center">
      <p className="text-5xl mb-3">⚙️</p>
      <p className="text-sm text-gray-500">Settings tab content coming in Phase D.</p>
      <p className="text-xs text-gray-400 italic mt-2">
        Workspace name, description, privacy controls will live here.
      </p>
    </div>
  );
}
