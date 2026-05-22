import React, { useMemo, useState } from "react";
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
  LogOut,
  AlertTriangle,
  ArrowRightLeft,
  ChevronDown,
   Lock,
  Loader2,
} from "lucide-react";


import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase/config";
import { useAuth } from "../context/AuthContext";
import { useAppData } from "../context/AppDataContext";
import InviteMemberModal from "../components/InviteMemberModal";
import CreateProjectModal from "../components/CreateProjectModal";
import {
  updateMemberRole,
  removeMember,
  leaveWorkspace,
  transferOwnership,
  WorkspaceRole,
} from "../lib/firebase/workspaceMembers";
import { isProjectPinnedToWorkspace } from "../lib/projectAccess";
import { addExistingProjectToWorkspace } from "../lib/firebase/projects";


type TabId = "overview" | "members" | "settings";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "members",  label: "Members"  },
  { id: "settings", label: "Settings" },
];

export default function WorkspacePage() {
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();
 const { user, workspaceId: authWorkspaceId } = useAuth();
  const { members, pendingInvites, workspaceData, projects, tasks, cancelInvite } = useAppData();

  const activeTab: TabId =
    tab === "members" || tab === "settings" ? (tab as TabId) : "overview";

 const [showInvite, setShowInvite] = useState(false);
const [showCreateProject, setShowCreateProject] = useState(false);
const [showAddExistingProject, setShowAddExistingProject] = useState(false);
const [addingProjectId, setAddingProjectId] = useState<string | null>(null);
const [addProjectError, setAddProjectError] = useState("");



  const wsId = workspaceData?.id ?? workspaceData?.workspaceId ?? authWorkspaceId ?? "";
const wsName = workspaceData?.name ?? "My Workspace";
const wsInitial = (wsName?.[0] ?? "W").toUpperCase();
const wsColor = "#8b5cf6";

const isOwnerFromWorkspaceDoc =
  !!user?.uid && workspaceData?.ownerId === user.uid;

const fallbackOwnerMember =
  isOwnerFromWorkspaceDoc && user
    ? {
        userId: user.uid,
        email: user.email ?? "",
        displayName:
          user.displayName ?? user.email?.split("@")[0] ?? "Owner",
        avatar:
          (user.displayName ?? user.email ?? "O")[0]?.toUpperCase() ?? "O",
        avatarColor: "#8b5cf6",
        photoURL: user.photoURL ?? "",
        role: "owner",
        status: "active",
        workspaceId: wsId,
        joinedAt: workspaceData?.createdAt ?? null,
        invitedBy: "",
        lastActive: null,
        permissions: {
          canCreateProjects: true,
          canDeleteProjects: true,
          canInviteMembers: true,
          canManageTasks: true,
          canEdit: true,
          canDelete: true,
          canInvite: true,
        },
      }
    : null;

const membersForUi =
  members.length > 0
    ? members
    : fallbackOwnerMember
      ? [fallbackOwnerMember]
      : [];

const activeMembers = membersForUi.filter((m) => m.status === "active");

const myMembership = membersForUi.find((m) => m.userId === user?.uid);

const canManage =
  isOwnerFromWorkspaceDoc ||
  myMembership?.role === "owner" ||
  myMembership?.role === "admin";

const canCreateWorkspaceProjects =
  !!user?.uid &&
  !!wsId &&
  (isOwnerFromWorkspaceDoc ||
    myMembership?.status === "active" ||
    (!!authWorkspaceId && authWorkspaceId === wsId));


const availableProjectsToAdd = useMemo(() => {
  return projects.filter((project: any) => {
    return project && project.id && project.pinnedToWorkspace !== true;
  });
}, [projects]);

async function handleAddExistingProject(projectId: string) {
  setAddProjectError("");

  if (!user?.uid) {
    setAddProjectError("You must be signed in to add a project.");
    return;
  }

  if (!wsId) {
    setAddProjectError("No workspace was found.");
    return;
  }

  if (!canManage) {
    setAddProjectError("Only workspace owners or admins can add projects.");
    return;
  }

  try {
    setAddingProjectId(projectId);

    await addExistingProjectToWorkspace(wsId, projectId, user.uid);

    setShowAddExistingProject(false);
  } catch (error) {
    console.error("Failed to add project to workspace:", error);

    setAddProjectError(
      error instanceof Error
        ? error.message
        : "Failed to add project to workspace."
    );
  } finally {
    setAddingProjectId(null);
  }
}

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
                  type="button"
                  onClick={() => navigate("/workspace/settings")}
                  className="p-1.5 text-gray-500 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                  title="Workspace settings"
                >
                  <SettingsIcon size={16} />
                </button>
                <button
                  type="button"
                  className="p-1.5 text-gray-500 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors"
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
  canCreateWorkspaceProjects={canCreateWorkspaceProjects}
  onInvite={() => setShowInvite(true)}
  onCreateProject={() => setShowCreateProject(true)}
  onAddExistingProject={() => {
    setAddProjectError("");
    setShowAddExistingProject(true);
  }}
  onOpenSettings={() => navigate("/workspace/settings")}
/>

        )}

       {activeTab === "members" && (
 <MembersTab
  workspaceId={wsId}
  members={membersForUi}
  pendingInvites={pendingInvites}
  myUid={user?.uid ?? ""}
  workspaceOwnerId={workspaceData?.ownerId ?? ""}
  canManage={canManage}
  onInvite={() => setShowInvite(true)}
  onCancelInvite={cancelInvite}
/>

)}


       {activeTab === "settings" && (
  <SettingsTab
    workspaceId={wsId}
    workspaceData={workspaceData}
    myUid={user?.uid ?? ""}
    myRole={myMembership?.role as WorkspaceRole}
    canManage={canManage}
    members={membersForUi}
  />
)}


      </div>

      {showInvite && wsId && (
  <InviteMemberModal
    onClose={() => setShowInvite(false)}
    workspaceId={wsId}
    workspaceName={wsName}
    members={membersForUi}
    pendingInvites={pendingInvites}
  />
)}


      <CreateProjectModal
  isOpen={showCreateProject}
  onClose={() => setShowCreateProject(false)}
/>
<AddExistingProjectModal
  isOpen={showAddExistingProject}
  projects={availableProjectsToAdd}
  addingProjectId={addingProjectId}
  error={addProjectError}
  onClose={() => {
    if (!addingProjectId) {
      setShowAddExistingProject(false);
      setAddProjectError("");
    }
  }}
  onAdd={handleAddExistingProject}
/>

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
  canCreateWorkspaceProjects,
  onInvite,
  onCreateProject,
  onAddExistingProject,
  onOpenSettings,
}: any) {
  const description = workspaceData?.description ?? "";
  const hasDescription = description.trim().length > 0;
    const curatedProjects = projects.filter(isProjectPinnedToWorkspace);
  const hasProjects    = curatedProjects.length > 0;
  const hasTeammates   = members.length > 1;

  // Lifted editing state so the setup checklist can open the description editor.
  const [editingDesc, setEditingDesc] = useState(false);

  const setupItems = [
  {
    id: "desc",
    label: hasDescription
      ? "Edit workspace description"
      : "Add workspace description",
    done: hasDescription,
    onClick: () => {
      if (!canManage) {
        alert("Only workspace owners or admins can edit the description.");
        return;
      }

      setEditingDesc(true);

      setTimeout(() => {
        document
          .getElementById("ws-hero-card")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });

        setTimeout(() => {
          const textarea = document.querySelector(
            "#ws-hero-card textarea"
          ) as HTMLTextAreaElement | null;

          textarea?.focus();
        }, 120);
      }, 50);
    },
  },
  {
    id: "proj",
    label: hasProjects
      ? "Create another project"
      : "Create your first project",
    done: hasProjects,
       onClick: () => {
      if (!canCreateWorkspaceProjects) {
        alert("Workspace is still loading. Please refresh and try again.");
        return;
      }

      onCreateProject();
    },

  },
  {
    id: "team",
    label: hasTeammates
      ? "Invite another teammate"
      : "Invite a teammate",
    done: hasTeammates,
    onClick: onInvite,
  },
];


  const completedSteps = setupItems.filter((i) => i.done).length;
  const totalSteps     = setupItems.length;
  const setupDone      = completedSteps === totalSteps;

  const totalTasks     = tasks.length;
  const completedTasks = tasks.filter((t: any) => t.status === "Done").length;
  const completion     = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

      {/* ─── LEFT COLUMN (2/3) ───────────────────────────────────────── */}
      <div className="lg:col-span-2 space-y-5">

        {/* Workspace hero card */}
        <div id="ws-hero-card" className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
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
                externalEditing={editingDesc}
                onEditingChange={setEditingDesc}
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
  type="button"
  onClick={item.onClick}
  className={`text-left p-3 rounded-xl border transition-all ${

                   item.done
  ? "bg-emerald-50 border-emerald-200 hover:border-emerald-300 hover:shadow-md active:scale-[0.98] cursor-pointer"
  : "bg-white border-gray-200 hover:border-violet-400 hover:shadow-md hover:bg-violet-50/30 active:scale-[0.98] cursor-pointer"

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

        {/* Curated work */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Curated work</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Important links and projects your team should know about
              </p>
            </div>
                      
                        <button
              onClick={() => window.location.assign("/projects")}
              className="text-xs text-violet-600 hover:underline font-medium flex items-center gap-1"
            >

              View all <ArrowRight size={12} />
            </button>
          </div>

                    {curatedProjects.length === 0 ? (
            <div className="text-center py-8">
              <FolderKanban className="mx-auto text-gray-300 mb-3" size={32} />
              <p className="text-sm text-gray-500 mb-3">No projects yet</p>
                                                        {canCreateWorkspaceProjects ? (
                <button
                  onClick={onCreateProject}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-violet-600 text-white text-xs font-medium rounded-lg hover:bg-violet-700 transition-colors"
                >
                  <Plus size={13} /> Create first project
                </button>
              ) : (
                <p className="text-xs text-gray-400">
                  Workspace is still loading. Refresh and try again.
                </p>
              )}


            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {curatedProjects.slice(0, 4).map((p: any) => {
                const pt   = tasks.filter((t: any) => t.projectId === p.id);
                const done = pt.filter((t: any) => t.status === "Done").length;
                const pct  = pt.length > 0 ? Math.round((done / pt.length) * 100) : 0;
                return (
                  <div
                    key={p.id}
                                        onClick={() => window.location.assign(`/projects/${p.id}`)}
                    className="border border-gray-200 rounded-xl p-3 cursor-pointer hover:border-violet-300 hover:shadow-sm transition-all group"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
                                               style={{ backgroundColor: p?.color ?? "#3b82f6" }}
                      >
                        {String(p?.name || "P").charAt(0).toUpperCase()}
                      </div>
                      <p className="text-sm font-semibold text-gray-800 truncate group-hover:text-violet-700 transition-colors">
                        {String(p?.name || "Untitled Project")}
                      </p>
                    </div>
                    {p?.description && (
                      <p className="text-xs text-gray-400 truncate mb-2">
                        {String(p.description)}
                      </p>
                    )}
                    <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1">
                      <span>{pt.length} task{pt.length === 1 ? "" : "s"}</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                                                style={{ width: `${pct}%`, backgroundColor: p?.color ?? "#3b82f6" }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

                                                           {curatedProjects.length > 0 && canCreateWorkspaceProjects && (
                      <button
                        type="button"
                        onClick={onCreateProject}
                        className="mt-3 w-full py-2 border border-dashed border-gray-300 text-gray-500 hover:text-violet-600 hover:border-violet-300 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-1"
                      >
                        <Plus size={13} /> Create another project
                      </button>
                    )}


        </div>
      </div>

      {/* ─── RIGHT COLUMN (1/3) ──────────────────────────────────────── */}
      <div className="space-y-5">

        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-800">Members</h3>
                      <button
              onClick={() => window.location.assign("/workspace/members")}
              className="text-xs text-violet-600 hover:underline font-medium"
            >
              View all {members.length}
            </button>
          </div>

          {members.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No members yet</p>
          ) : (
            <div className="flex flex-wrap gap-2 mb-3">
              {members.slice(0, 6).map((m: any) => {
  const label =
    m.displayName ||
    m.email ||
    "Member";

  const initials =
    m.avatar ||
    label
      .split(" ")
      .map((part: string) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  return (
    <div
      key={m.userId}
      title={`${m.displayName || "Member"}${m.email ? ` • ${m.email}` : ""}`}
      className="w-9 h-9 rounded-full border-2 border-white shadow-sm overflow-hidden flex items-center justify-center text-white text-xs font-bold bg-violet-500"
      style={{ backgroundColor: m.photoURL ? undefined : m.avatarColor || "#8b5cf6" }}
    >
      {m.photoURL ? (
        <img
          src={m.photoURL}
          alt={label}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        initials
      )}
    </div>
  );
})}

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
  externalEditing,
  onEditingChange,
}: {
  workspaceId?: string;
  value: string;
  canEdit: boolean;
  externalEditing?: boolean;
  onEditingChange?: (v: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(value);
  const [saving,  setSaving]  = useState(false);

  React.useEffect(() => {
    if (externalEditing !== undefined && externalEditing !== editing) {
      setEditing(externalEditing);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalEditing]);

  function updateEditing(v: boolean) {
    setEditing(v);
    onEditingChange?.(v);
  }

  React.useEffect(() => { setDraft(value); }, [value]);

  async function save() {
  if (!workspaceId) {
    alert("Workspace is still loading. Please refresh and try again.");
    return;
  }

  if (!canEdit) {
    alert("Only workspace owners or admins can edit the description.");
    return;
  }

  setSaving(true);

  try {
    await updateDoc(doc(db, "workspaces", workspaceId), {
      description: draft.trim(),
      updatedAt: serverTimestamp(),
    });

    updateEditing(false);
  } catch (e: any) {
    console.error("[Workspace] save description failed:", e);
    alert(e?.message || "Failed to save workspace description.");
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
          className="w-full text-sm text-gray-900 placeholder-gray-400 bg-white border border-violet-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
        />
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[10px] text-gray-400">{draft.length}/280</span>
          <div className="flex gap-2">
            <button
              onClick={() => { setDraft(value); updateEditing(false); }}
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
        type="button"
        onClick={() => canEdit && updateEditing(true)}
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
          type="button"
          onClick={() => updateEditing(true)}
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
  workspaceOwnerId,
  canManage,
  onInvite,
  onCancelInvite,
}: {
  workspaceId?: string;
  members: any[];
  pendingInvites: any[];
  myUid: string;
  workspaceOwnerId: string;
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
              className="w-full pl-8 pr-3 py-1.5 text-xs text-gray-900 placeholder-gray-400 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
        </div>
      </div>

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

      <div className="px-5 py-4">
        {subTab === "active" && (
          <ActiveMembersList
  members={filteredMembers}
  allCount={activeMembers.length}
  myUid={myUid}
  myRole={myRole}
  workspaceOwnerId={workspaceOwnerId}
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
  workspaceOwnerId,
  canManage,
  busyId,
  onRoleChange,
  onRemove,
}: {
  members: any[];
  allCount: number;
  myUid: string;
  myRole: WorkspaceRole;
  workspaceOwnerId: string;
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
      <div className="grid grid-cols-[1fr_140px_120px_36px] items-center gap-3 px-2 pb-2 text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
        <span>Member</span>
        <span>Role</span>
        <span>Joined</span>
        <span></span>
      </div>

      {members.map((m) => {
        const role = (m.role as WorkspaceRole) ?? "member";

const isCanonicalOwner = m.userId === workspaceOwnerId;
const effectiveRole: WorkspaceRole =
  isCanonicalOwner ? "owner" : role === "owner" ? "admin" : role;

const meta = ROLE_META[effectiveRole] ?? ROLE_META.member;
const Icon = meta.icon;
const isMe = m.userId === myUid;
const isBusy = busyId === m.userId;

const editable =
  canManage &&
  !isCanonicalOwner &&
  !isMe &&
  (myRole === "owner" || (myRole === "admin" && effectiveRole !== "admin"));

const removable =
  canManage &&
  !isCanonicalOwner &&
  !isMe &&
  (myRole === "owner" || (myRole === "admin" && effectiveRole !== "admin"));


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
            <div className="flex items-center gap-3 min-w-0">
              <div
  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 overflow-hidden bg-violet-500"
  style={{ backgroundColor: m.photoURL ? undefined : m.avatarColor || "#8b5cf6" }}
>
  {m.photoURL ? (
    <img
      src={m.photoURL}
      alt={m.displayName || m.email || "Member"}
      className="w-full h-full object-cover"
      referrerPolicy="no-referrer"
    />
  ) : (
    m.avatar ||
    (m.displayName || m.email || "M")
      .split(" ")
      .map((part: string) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase()
  )}
</div>

              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {m.displayName}
                  {isMe && <span className="ml-1.5 text-[10px] text-gray-400 font-normal">(you)</span>}
                </p>
                <p className="text-xs text-gray-400 truncate">{m.email}</p>
              </div>
            </div>

            {editable ? (
              <select
  disabled={isBusy}
  value={effectiveRole === "owner" ? "admin" : effectiveRole}
  onChange={(e) => onRoleChange(m.userId, e.target.value as WorkspaceRole)}
                className={`text-xs font-semibold px-2 py-1.5 rounded-lg border border-gray-200 ${meta.color} bg-white focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50 cursor-pointer`}
              >
                {myRole === "owner" && <option value="admin">Admin</option>}
<option value="member">Member</option>
<option value="viewer">Viewer</option>

              </select>
            ) : (
              <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold w-fit ${meta.bg} ${meta.color}`}>
                <Icon size={11} />
                {meta.label}
              </div>
            )}

            <span className="text-xs text-gray-500">{joinedDate}</span>

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

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS TAB
// ─────────────────────────────────────────────────────────────────────────────

function SettingsTab({
  workspaceId,
  workspaceData,
  myUid,
  myRole,
  canManage,
  members,
}: {
  workspaceId?: string;
  workspaceData: any;
  myUid: string;
  myRole?: WorkspaceRole;
  canManage: boolean;
  members: any[];
}) {
  const navigate = useNavigate();
  const isOwner = myRole === "owner";

  const [name, setName] = useState(workspaceData?.name ?? "");
  const [description, setDescription] = useState(workspaceData?.description ?? "");
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [generalSaved, setGeneralSaved] = useState(false);
  const [generalError, setGeneralError] = useState("");

  React.useEffect(() => { setName(workspaceData?.name ?? ""); }, [workspaceData?.name]);
  React.useEffect(() => { setDescription(workspaceData?.description ?? ""); }, [workspaceData?.description]);

  const [showLeave, setShowLeave] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);

  const dirty =
    name.trim() !== (workspaceData?.name ?? "") ||
    description.trim() !== (workspaceData?.description ?? "");

  const transferCandidates = members.filter(
    (m) => m.status === "active" && m.userId !== myUid
  );

  async function saveGeneral() {
    if (!workspaceId) return;
    if (!name.trim()) {
      setGeneralError("Workspace name cannot be empty.");
      return;
    }
    setGeneralError("");
    setSavingGeneral(true);
    try {
      await updateDoc(doc(db, "workspaces", workspaceId), {
        name: name.trim(),
        description: description.trim(),
        updatedAt: serverTimestamp(),
      });
      setGeneralSaved(true);
      setTimeout(() => setGeneralSaved(false), 2200);
    } catch (e: any) {
      console.error("[SettingsTab] saveGeneral failed:", e);
      setGeneralError(e?.message || "Failed to save changes.");
    } finally {
      setSavingGeneral(false);
    }
  }

  const createdDate = workspaceData?.createdAt
    ? (typeof workspaceData.createdAt.toDate === "function"
        ? workspaceData.createdAt.toDate().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
        : "—")
    : "—";

  return (
    <div className="space-y-5">

      <Section title="General" description="Basic information about your workspace">
        <div className="space-y-4">
          <Field label="Workspace name" required>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 60))}
              disabled={!canManage}
              maxLength={60}
              placeholder="Enter workspace name"
              className="w-full px-3 py-2 text-sm text-gray-900 placeholder-gray-400 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:bg-gray-50 disabled:text-gray-500"
            />
            <p className="text-[10px] text-gray-400 mt-1">{name.length}/60</p>
          </Field>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 280))}
              disabled={!canManage}
              maxLength={280}
              rows={3}
              placeholder="Describe what this workspace is for..."
              className="w-full px-3 py-2 text-sm text-gray-900 placeholder-gray-400 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none disabled:bg-gray-50 disabled:text-gray-500"
            />
            <p className="text-[10px] text-gray-400 mt-1">{description.length}/280</p>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Workspace ID">
              <div className="px-3 py-2 text-sm font-mono text-gray-500 bg-gray-50 border border-gray-200 rounded-lg">
                {workspaceData?.id ?? "—"}
              </div>
            </Field>
            <Field label="Created">
              <div className="px-3 py-2 text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg">
                {createdDate}
              </div>
            </Field>
          </div>

          <Field label="Plan">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-violet-50 border border-violet-200 rounded-lg">
              <span className="text-sm font-semibold text-violet-700 capitalize">
                {workspaceData?.plan ?? "Free"}
              </span>
              <span className="text-[10px] text-violet-500 uppercase tracking-wider">Current</span>
            </div>
          </Field>

          {generalError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
              <AlertCircle size={13} />
              <span>{generalError}</span>
            </div>
          )}

          {canManage && (
            <div className="flex items-center justify-end gap-2 pt-1">
              {generalSaved && (
                <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                  <CheckCircle2 size={12} /> Saved
                </span>
              )}
              <button
                onClick={() => {
                  setName(workspaceData?.name ?? "");
                  setDescription(workspaceData?.description ?? "");
                  setGeneralError("");
                }}
                disabled={!dirty || savingGeneral}
                className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Reset
              </button>
              <button
                onClick={saveGeneral}
                disabled={!dirty || savingGeneral}
                className="px-4 py-1.5 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {savingGeneral ? "Saving..." : "Save changes"}
              </button>
            </div>
          )}
        </div>
      </Section>

      <Section title="Privacy & access" description="Control who can find and join this workspace">
        <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl border border-dashed border-gray-200">
          <Lock className="text-gray-400 flex-shrink-0 mt-0.5" size={18} />
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-700">Invite-only workspace</p>
            <p className="text-xs text-gray-500 mt-0.5">
              People can only join this workspace if they're invited by an admin or owner.
              Public/discoverable workspaces are coming soon.
            </p>
          </div>
        </div>
      </Section>

      <Section title="Ownership & membership" description="Manage your role in this workspace">
        <div className="space-y-3">

          {isOwner && (
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-xl">
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-800">Transfer ownership</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Hand over this workspace to another member. You'll be demoted to admin and can then leave if you wish.
                </p>
              </div>
              <button
                onClick={() => setShowTransfer(true)}
                disabled={transferCandidates.length === 0}
                className="ml-4 flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-violet-300 hover:text-violet-700 rounded-lg text-xs font-semibold transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                title={transferCandidates.length === 0 ? "No other members to transfer to. Invite someone first." : ""}
              >
                <ArrowRightLeft size={13} />
                Transfer ownership
              </button>
            </div>
          )}

          {!isOwner ? (
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-xl">
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-800">Leave workspace</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  You'll lose access to all projects, tasks, and members in this workspace. You can rejoin only if invited again.
                </p>
              </div>
              <button
                onClick={() => setShowLeave(true)}
                className="ml-4 flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-lg text-xs font-semibold transition-colors flex-shrink-0"
              >
                <LogOut size={13} />
                Leave workspace
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-xl bg-gray-50/50">
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-700">Leave workspace</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  As the owner, you can't leave directly. Transfer ownership first, then you'll be able to leave.
                </p>
              </div>
            </div>
          )}
        </div>
      </Section>

      {showLeave && workspaceId && (
        <ConfirmDialog
          icon={<LogOut className="text-red-600" size={22} />}
          title="Leave this workspace?"
          message="You'll lose access immediately. You can rejoin only if someone invites you again."
          confirmLabel="Leave workspace"
          confirmWord=""
          onCancel={() => setShowLeave(false)}
          onConfirm={async () => {
            await leaveWorkspace(workspaceId, myUid);
            navigate("/");
          }}
        />
      )}

      {showTransfer && workspaceId && (
        <TransferOwnershipDialog
          workspaceId={workspaceId}
          currentOwnerId={myUid}
          candidates={transferCandidates}
          onCancel={() => setShowTransfer(false)}
          onTransferred={() => {
            setShowTransfer(false);
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSFER OWNERSHIP DIALOG
// ─────────────────────────────────────────────────────────────────────────────

function TransferOwnershipDialog({
  workspaceId,
  currentOwnerId,
  candidates,
  onCancel,
  onTransferred,
}: {
  workspaceId: string;
  currentOwnerId: string;
  candidates: any[];
  onCancel: () => void;
  onTransferred: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string>("");
  const [confirmText, setConfirmText] = useState("");
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState("");

  const selected = candidates.find((c) => c.userId === selectedId);
  const requiredWord = "TRANSFER";
  const canConfirm = !!selected && confirmText === requiredWord;

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !working) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, working]);

  async function run() {
    if (!selected) return;
    setErr("");
    setWorking(true);
    try {
      await transferOwnership(workspaceId, currentOwnerId, selected.userId, selected.email);
      onTransferred();
    } catch (e: any) {
      console.error("[TransferOwnership]", e);
      setErr(e?.message || "Transfer failed. Please try again.");
      setWorking(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/70 backdrop-blur-md"
      style={{ animation: "dlgFadeIn 0.18s ease-out" }}
      onClick={(e) => { if (e.target === e.currentTarget && !working) onCancel(); }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md ring-1 ring-gray-200/60 overflow-hidden"
        style={{ animation: "dlgSlideUp 0.24s cubic-bezier(0.16, 1, 0.3, 1)" }}
        role="dialog"
        aria-modal="true"
      >
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-full bg-violet-50 ring-[6px] ring-violet-50/50 flex items-center justify-center flex-shrink-0">
              <ArrowRightLeft className="text-violet-600" size={20} />
            </div>
            <div className="flex-1 pt-0.5 min-w-0">
              <h3 className="text-[15px] font-semibold text-gray-900 leading-snug">
                Transfer workspace ownership
              </h3>
              <p className="text-[13px] text-gray-500 mt-1.5 leading-relaxed">
                Pick a member to become the new owner. You'll be demoted to admin and they'll get full control over this workspace.
              </p>
            </div>
            <button
              onClick={onCancel}
              disabled={working}
              className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 p-1 rounded-lg transition-colors disabled:opacity-40 flex-shrink-0"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          <div className="mt-5 ml-[60px]">
            <label className="block text-[11px] font-semibold text-gray-600 mb-2 uppercase tracking-wide">
              New owner
            </label>
            {candidates.length === 0 ? (
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500">
                No other members in this workspace. Invite someone first, then come back here to transfer ownership.
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                {candidates.map((c) => {
                  const isSelected = c.userId === selectedId;
                  return (
                    <button
                      key={c.userId}
                      type="button"
                      onClick={() => setSelectedId(c.userId)}
                      disabled={working}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                        isSelected ? "bg-violet-50" : "hover:bg-gray-50"
                      }`}
                    >
                      <div
  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 overflow-hidden bg-violet-500"
  style={{ backgroundColor: c.photoURL ? undefined : c.avatarColor || "#8b5cf6" }}
>
  {c.photoURL ? (
    <img
      src={c.photoURL}
      alt={c.displayName || c.email || "Member"}
      className="w-full h-full object-cover"
      referrerPolicy="no-referrer"
    />
  ) : (
    c.avatar ||
    (c.displayName || c.email || "M")
      .split(" ")
      .map((part: string) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase()
  )}
</div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{c.displayName}</p>
                        <p className="text-xs text-gray-400 truncate">{c.email}</p>
                      </div>
                      {isSelected && (
                        <CheckCircle2 className="text-violet-600 flex-shrink-0" size={16} />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selected && (
            <div className="mt-4 ml-[60px]">
              <label className="block text-[11px] font-semibold text-gray-600 mb-2 uppercase tracking-wide">
                Type{" "}
                <span className="font-mono text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded text-[11px] tracking-normal normal-case">
                  {requiredWord}
                </span>{" "}
                to confirm
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                className="w-full px-3.5 py-2.5 text-sm font-mono text-gray-900 placeholder-gray-300 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all"
                placeholder={requiredWord}
              />
            </div>
          )}

          {err && (
            <div className="mt-4 ml-[60px] flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
              <AlertCircle size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
              <span className="text-xs text-red-700 leading-relaxed">{err}</span>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={working}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Cancel
          </button>
          <button
            onClick={run}
            disabled={!canConfirm || working}
            className="px-4 py-2 text-sm font-semibold text-white bg-violet-600 rounded-lg hover:bg-violet-700 active:bg-violet-800 disabled:bg-violet-300 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow flex items-center justify-center gap-2 min-w-[150px]"
          >
            {working ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Transferring…</span>
              </>
            ) : (
              <span>Transfer ownership</span>
            )}
          </button>
        </div>
        <style>{`
          @keyframes dlgFadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes dlgSlideUp { from { opacity: 0; transform: translateY(12px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        `}</style>
      </div>
    </div>
  );
}

function AddExistingProjectModal({
  isOpen,
  projects,
  addingProjectId,
  error,
  onClose,
  onAdd,
}: {
  isOpen: boolean;
  projects: any[];
  addingProjectId: string | null;
  error: string;
  onClose: () => void;
  onAdd: (projectId: string) => void;
}) {
  if (!isOpen) return null;

  return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
                        <h2 className="text-base font-semibold text-slate-900">
              Add project to workspace
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Choose an existing project to show in curated work.
            </p>

          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={!!addingProjectId}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close add project modal"
          >
            <X size={20} />
          </button>
        </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error && (
                            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {projects.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center">
              <FolderKanban className="mx-auto mb-3 text-slate-300" size={34} />

              <p className="text-sm font-medium text-slate-900">
                No projects available
              </p>

              <p className="mt-1 text-sm text-slate-500">
                All available projects are already added to curated work.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {projects.map((project: any) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => onAdd(project.id)}
                  disabled={!!addingProjectId}
                                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-violet-300 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold text-white"
                      style={{
                        backgroundColor: project.color || "#7C3AED",
                      }}
                    >
                      {project.name?.charAt(0)?.toUpperCase() || "P"}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {project.name || "Untitled Project"}
                      </p>

                      <p className="truncate text-xs text-slate-500">
                        {project.code || "No code"} ·{" "}
                        {project.visibility || "private"}
                      </p>
                    </div>
                  </div>

                  <div className="ml-4 shrink-0 text-sm font-medium text-violet-600">
                    {addingProjectId === project.id ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      "Add"
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

                <div className="flex shrink-0 justify-end border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={!!addingProjectId}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function Section({
  title,
  description,
  danger,
  children,
}: {
  title: string;
  description?: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`bg-white border rounded-2xl shadow-sm p-5 ${danger ? "border-red-200" : "border-gray-200"}`}>
      <div className="mb-4">
        <h3 className={`text-sm font-semibold ${danger ? "text-red-700" : "text-gray-800"}`}>
          {title}
        </h3>
        {description && (
          <p className="text-xs text-gray-400 mt-0.5">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function ConfirmDialog({
  icon,
  title,
  message,
  confirmLabel,
  confirmWord,
  onCancel,
  onConfirm,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
  confirmLabel: string;
  confirmWord: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [typed, setTyped] = useState("");
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState("");

  const canConfirm = confirmWord ? typed === confirmWord : true;

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !working) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, working]);

  async function run() {
    setErr("");
    setWorking(true);
    try {
      await onConfirm();
    } catch (e: any) {
      console.error("[ConfirmDialog]", e);
      setErr(e?.message || "Action failed. Please try again.");
      setWorking(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/70 backdrop-blur-md"
      style={{ animation: "dlgFadeIn 0.18s ease-out" }}
      onClick={(e) => { if (e.target === e.currentTarget && !working) onCancel(); }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md ring-1 ring-gray-200/60 overflow-hidden"
        style={{ animation: "dlgSlideUp 0.24s cubic-bezier(0.16, 1, 0.3, 1)" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-full bg-red-50 ring-[6px] ring-red-50/50 flex items-center justify-center flex-shrink-0">
              {icon}
            </div>
            <div className="flex-1 pt-0.5 min-w-0">
              <h3 id="confirm-title" className="text-[15px] font-semibold text-gray-900 leading-snug">
                {title}
              </h3>
              <p className="text-[13px] text-gray-500 mt-1.5 leading-relaxed">
                {message}
              </p>
            </div>
            <button
              onClick={onCancel}
              disabled={working}
              className="text-gray-400 hover:text-gray-700 hover:bg-gray-100 p-1 rounded-lg transition-colors disabled:opacity-40 flex-shrink-0"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          {confirmWord && (
            <div className="mt-5 ml-[60px]">
              <label className="block text-[11px] font-semibold text-gray-600 mb-2 uppercase tracking-wide">
                Type{" "}
                <span className="font-mono text-red-700 bg-red-50 px-1.5 py-0.5 rounded text-[11px] tracking-normal normal-case">
                  {confirmWord}
                </span>{" "}
                to confirm
              </label>
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoFocus
                spellCheck={false}
                autoComplete="off"
                className="w-full px-3.5 py-2.5 text-sm font-mono text-gray-900 placeholder-gray-300 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 transition-all"
                placeholder={confirmWord}
              />
              {typed.length > 0 && !canConfirm && (
                <p className="text-[11px] text-gray-400 mt-1.5">Must match exactly</p>
              )}
            </div>
          )}

          {err && (
            <div className="mt-4 ml-[60px] flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
              <AlertCircle size={14} className="text-red-600 flex-shrink-0 mt-0.5" />
              <span className="text-xs text-red-700 leading-relaxed">{err}</span>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={working}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Cancel
          </button>
          <button
            onClick={run}
            disabled={!canConfirm || working}
            className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 active:bg-red-800 disabled:bg-red-300 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow flex items-center justify-center gap-2 min-w-[130px]"
          >
            {working ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Working…</span>
              </>
            ) : (
              <span>{confirmLabel}</span>
            )}
          </button>
        </div>

        <style>{`
          @keyframes dlgFadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes dlgSlideUp { from { opacity: 0; transform: translateY(12px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        `}</style>
      </div>
    </div>
  );
}
