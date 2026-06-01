import React, { useMemo, useState } from "react";
import { X, FolderKanban, Lock, Globe2, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useAppData } from "../context/AppDataContext";
import { createProject } from "../lib/firebase/projects";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /**
   * When opened from the Workspace page's Curated work / setup checklist,
   * default the new project to a pinned workspace project so it shows up in
   * Curated work and completes the setup step. Sidebar create stays private.
   */
  defaultVisibility?: "workspace" | "private";
  defaultPinnedToWorkspace?: boolean;
}

const COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#3b82f6",
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
];

export default function CreateProjectModal({
  isOpen,
  onClose,
  defaultVisibility = "private",
  defaultPinnedToWorkspace = false,
}: Props) {
  const navigate = useNavigate();
  const { user, workspaceId, personalWorkspaceId } = useAuth();
  const { members, workspaceData } = useAppData();

  const safeMembers = Array.isArray(members) ? members : [];

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [visibility, setVisibility] = useState<"workspace" | "private">(
    defaultVisibility
  );
  const [pinnedToWorkspace, setPinnedToWorkspace] = useState(
    defaultPinnedToWorkspace
  );

  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const trimmedName = name.trim();
  const trimmedDescription = description.trim();

  const myMembership = safeMembers.find((m: any) => {
    const memberUid = m.userId || m.uid || m.id;
    return !!user?.uid && memberUid === user.uid;
  });

  const isWorkspaceOwner = !!user?.uid && workspaceData?.ownerId === user.uid;

  const isActiveWorkspaceMember =
    isWorkspaceOwner || myMembership?.status === "active";

  const effectivePersonalWorkspaceId =
    personalWorkspaceId || (user?.uid ? `personal_${user.uid}` : "");

  const targetWorkspaceId =
    visibility === "private" ? effectivePersonalWorkspaceId : workspaceId || "";

  const canCreatePrivateProject = !!user?.uid && !!effectivePersonalWorkspaceId;

  const canCreateWorkspaceProject =
    !!user?.uid && !!workspaceId && isActiveWorkspaceMember;

  const myMembershipRole = (() => {
    if (workspaceData?.ownerId === user?.uid) return "owner";
    const mine = safeMembers.find((m: any) => {
      const memberUid = m.userId || m.uid || m.id;
      return !!user?.uid && memberUid === user.uid;
    });
    return String(mine?.role || "viewer").toLowerCase();
  })();

  const isViewerOnly = myMembershipRole === "viewer";

  const canCreateProjects =
    !isViewerOnly &&
    (visibility === "private"
      ? canCreatePrivateProject
      : canCreateWorkspaceProject);

  const projectCode = useMemo(() => {
    const base = trimmedName
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word[0])
      .join("")
      .slice(0, 4);

    return base ? `${base}-${Math.floor(Math.random() * 900 + 100)}` : "";
  }, [trimmedName]);

  React.useEffect(() => {
    if (isOpen) {
      setVisibility(defaultVisibility);
      setPinnedToWorkspace(defaultPinnedToWorkspace);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, defaultVisibility, defaultPinnedToWorkspace]);

  if (!isOpen) return null;

  function resetForm() {
    setName("");
    setDescription("");
    setColor(COLORS[0]);
    setVisibility(defaultVisibility);
    setPinnedToWorkspace(defaultPinnedToWorkspace);
    setPriority("medium");
    setDueDate("");
    setError("");
  }

  function handleClose() {
    if (saving) return;

    resetForm();
    onClose();
  }

  async function handleSubmit(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (saving) return;

    setError("");

    if (!user?.uid) {
      setError("You must be signed in to create a project.");
      return;
    }

    if (!targetWorkspaceId) {
      setError("No workspace was found. Please sign out and sign back in.");
      return;
    }

    if (!canCreateProjects) {
      setError(
        visibility === "private"
          ? "Your personal workspace is still loading. Please refresh and try again."
          : "Your workspace is still loading or your account is not an active member of this workspace."
      );
      return;
    }

    if (!trimmedName) {
      setError("Project name is required.");
      return;
    }

    setSaving(true);

    try {
      const projectId = await createProject(
        targetWorkspaceId,
        {
          name: trimmedName,
          description: trimmedDescription,
          color,
          visibility,
          pinnedToWorkspace:
            visibility === "workspace" ? pinnedToWorkspace : false,
          priority,
          dueDate: dueDate || null,
          code: projectCode || null,
          memberIds: [user.uid],
          workspaceId: targetWorkspaceId,
          sourceWorkspaceId: targetWorkspaceId,
          projectWorkspaceId: targetWorkspaceId,
          createdBy: user.uid,
          ownerId: user.uid,
          isPrivateProject: visibility === "private",
        },
        user.uid
      );

      resetForm();
      onClose();
      navigate(`/projects/${projectId}`);
    } catch (err: any) {
      console.error("[CreateProjectModal] failed:", err);
      setError(err?.message || "Failed to create project.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-project-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          handleClose();
        }
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[86vh] w-full max-w-[360px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex shrink-0 items-start justify-between border-b border-slate-100 px-4 py-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
              <FolderKanban size={16} />
            </div>

            <div className="min-w-0">
              <h2
                id="create-project-title"
                className="text-sm font-semibold leading-tight text-slate-900"
              >
                Create project
              </h2>
              <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                Start a new shared or private workspace project.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Close create project modal"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!canCreateProjects && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {isViewerOnly
                ? "You have viewer access. Viewers cannot create projects."
                : visibility === "private"
                  ? "Your personal workspace is still loading. Please refresh and try again."
                  : "Your workspace is still loading or your account is not an active member of this workspace."}
            </div>
          )}

          <div>
            <label
              htmlFor="create-project-name"
              className="mb-1 block text-[11px] font-semibold text-slate-600"
            >
              Project name <span className="text-red-500">*</span>
            </label>

            <input
              id="create-project-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value.slice(0, 80));
                if (error) setError("");
              }}
              placeholder="Website redesign"
              autoFocus
              disabled={saving}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-50"
            />
          </div>

          <div>
            <label
              htmlFor="create-project-description"
              className="mb-1 block text-[11px] font-semibold text-slate-600"
            >
              Description
            </label>

            <textarea
              id="create-project-description"
              value={description}
              onChange={(event) =>
                setDescription(event.target.value.slice(0, 240))
              }
              placeholder="What is this project about?"
              rows={1}
              disabled={saving}
              className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-50"
            />

            <p className="mt-0.5 text-right text-[10px] text-slate-400">
              {description.length}/240
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold text-slate-600">
              Color
            </label>

            <div className="flex flex-wrap gap-1.5">
              {COLORS.map((projectColor) => (
                <button
                  key={projectColor}
                  type="button"
                  onClick={() => setColor(projectColor)}
                  disabled={saving}
                  className={`h-6 w-6 rounded-full border-2 transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    color === projectColor
                      ? "scale-110 border-slate-900"
                      : "border-transparent"
                  }`}
                  style={{ backgroundColor: projectColor }}
                  aria-label={`Select project color ${projectColor}`}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                htmlFor="create-project-priority"
                className="mb-1 block text-[11px] font-semibold text-slate-600"
              >
                Priority
              </label>

              <select
                id="create-project-priority"
                value={priority}
                onChange={(event) => setPriority(event.target.value as any)}
                disabled={saving}
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-50"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="create-project-due-date"
                className="mb-1 block text-[11px] font-semibold text-slate-600"
              >
                Due date
              </label>

              <input
                id="create-project-due-date"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                disabled={saving}
                className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-50"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold text-slate-600">
              Visibility
            </label>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setVisibility("workspace")}
                disabled={saving}
                className={`rounded-lg border p-2 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  visibility === "workspace"
                    ? "border-violet-400 bg-violet-50"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <Globe2 className="mb-1 text-violet-600" size={14} />

                <p className="text-xs font-semibold text-slate-800">
                  Workspace
                </p>

                <p className="mt-0.5 text-[10px] leading-snug text-slate-500">
                  Visible to active shared workspace members.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setVisibility("private")}
                disabled={saving}
                className={`rounded-lg border p-2 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  visibility === "private"
                    ? "border-violet-400 bg-violet-50"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <Lock className="mb-1 text-violet-600" size={14} />

                <p className="text-xs font-semibold text-slate-800">Private</p>

                <p className="mt-0.5 text-[10px] leading-snug text-slate-500">
                  Saved only in your own private account sidebar.
                </p>
              </button>
            </div>
          </div>

          {visibility === "workspace" && (
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={pinnedToWorkspace}
                onChange={(event) =>
                  setPinnedToWorkspace(event.target.checked)
                }
                disabled={saving}
                className="rounded border-slate-300 text-violet-600 disabled:cursor-not-allowed"
              />
              Show in Workspace curated work
            </label>
          )}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            className="rounded-lg px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={!trimmedName || saving || !canCreateProjects}
            className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create project"}
          </button>
        </div>
      </form>
    </div>
  );
}

