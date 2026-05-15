import React, { useMemo, useState } from "react";
import { X, FolderKanban, Lock, Globe2, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useAppData } from "../context/AppDataContext";
import { createProject } from "../lib/firebase/projects";

interface Props {
  isOpen: boolean;
  onClose: () => void;
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

export default function CreateProjectModal({ isOpen, onClose }: Props) {
  const navigate = useNavigate();
  const { user, workspaceId } = useAuth();
  const { members, workspaceData } = useAppData();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [visibility, setVisibility] = useState<"workspace" | "private">(
    "workspace"
  );
  const [pinnedToWorkspace, setPinnedToWorkspace] = useState(true);
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const myMembership = members.find((m: any) => m.userId === user?.uid);

  const isWorkspaceOwner =
    !!user?.uid && workspaceData?.ownerId === user.uid;

  const myRole = isWorkspaceOwner
    ? "owner"
    : myMembership?.role ?? "member";

  const canCreateProjects =
    myRole === "owner" ||
    myRole === "admin" ||
    myMembership?.permissions?.canCreateProjects === true;

  const projectCode = useMemo(() => {
    const base = name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word[0])
      .join("")
      .slice(0, 4);

    return base ? `${base}-${Math.floor(Math.random() * 900 + 100)}` : "";
  }, [name]);

  if (!isOpen) return null;

  async function handleSubmit() {
    setError("");

    if (!user?.uid) {
      setError("You must be signed in to create a project.");
      return;
    }

    if (!workspaceId) {
      setError("No active workspace was found.");
      return;
    }

    if (!canCreateProjects) {
      setError("You do not have permission to create projects.");
      return;
    }

    if (!name.trim()) {
      setError("Project name is required.");
      return;
    }

    setSaving(true);

    try {
      const projectId = await createProject(
        workspaceId,
        {
          name,
          description,
          color,
          visibility,
          pinnedToWorkspace:
            visibility === "workspace" ? pinnedToWorkspace : false,
          priority,
          dueDate: dueDate || null,
          code: projectCode || null,
          memberIds: [user.uid],
        },
        user.uid
      );

      setName("");
      setDescription("");
      setColor(COLORS[0]);
      setVisibility("workspace");
      setPinnedToWorkspace(true);
      setPriority("medium");
      setDueDate("");

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <FolderKanban size={20} />
            </div>

            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Create project
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Start a new shared or private workspace project.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!canCreateProjects && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Your current role does not allow creating workspace projects.
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              Project name <span className="text-red-500">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 80))}
              placeholder="Website redesign"
              autoFocus
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 240))}
              placeholder="What is this project about?"
              rows={3}
              className="w-full resize-none rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
            <p className="mt-1 text-right text-[10px] text-slate-400">
              {description.length}/240
            </p>
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold text-slate-600">
              Color
            </label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-8 w-8 rounded-full border-2 transition ${
                    color === c
                      ? "border-slate-900 scale-110"
                      : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-violet-100"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                Due date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-violet-100"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold text-slate-600">
              Visibility
            </label>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setVisibility("workspace")}
                className={`rounded-xl border p-3 text-left transition ${
                  visibility === "workspace"
                    ? "border-violet-400 bg-violet-50"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <Globe2 className="mb-2 text-violet-600" size={18} />
                <p className="text-sm font-semibold text-slate-800">
                  Workspace
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Visible to active workspace members.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setVisibility("private")}
                className={`rounded-xl border p-3 text-left transition ${
                  visibility === "private"
                    ? "border-violet-400 bg-violet-50"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <Lock className="mb-2 text-violet-600" size={18} />
                <p className="text-sm font-semibold text-slate-800">Private</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Only you and added members can access it.
                </p>
              </button>
            </div>
          </div>

          {visibility === "workspace" && (
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={pinnedToWorkspace}
                onChange={(e) => setPinnedToWorkspace(e.target.checked)}
                className="rounded border-slate-300 text-violet-600"
              />
              Show in Workspace curated work
            </label>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-white disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!name.trim() || saving || !canCreateProjects}
            className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create project"}
          </button>
        </div>
      </div>
    </div>
  );
}
