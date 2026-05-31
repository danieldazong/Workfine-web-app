/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Loader2, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useAppData } from "../../context/AppDataContext";
import { createProject } from "../../lib/firebase/projects";

type ProjectVisibility = "workspace" | "private";
type ProjectStatus = "active" | "planning" | "on-hold" | "completed";
type ProjectPriority = "low" | "medium" | "high";

interface CreateProjectModalProps {
  open?: boolean;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
}

const PROJECT_COLORS = [
  "#6366F1",
  "#8B5CF6",
  "#EC4899",
  "#EF4444",
  "#F97316",
  "#F59E0B",
  "#10B981",
  "#06B6D4",
  "#3B82F6",
  "#64748B",
];

const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  open,
  isOpen,
  onOpenChange,
  onClose,
}) => {
  const { user, workspaceId } = useAuth();
  const { projects, members, workspaceData } = useAppData();

  const modalOpen = open ?? isOpen ?? false;
  const safeProjects = Array.isArray(projects) ? projects : [];

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#6366F1");

  const [visibility, setVisibility] =
    useState<ProjectVisibility>("workspace");
  const [pinnedToWorkspace, setPinnedToWorkspace] = useState<boolean>(true);

  const [status, setStatus] = useState<ProjectStatus>("active");
  const [priority, setPriority] = useState<ProjectPriority>("medium");
  const [dueDate, setDueDate] = useState("");

  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const trimmedName = name.trim();
  const trimmedDescription = description.trim();

  const generatedCode = useMemo(() => {
    const existingNumbers = safeProjects
      .map((project: any) => {
        const code = String(project?.code || "");
        const match = code.match(/(\d+)$/);
        return match ? Number(match[1]) : 0;
      })
      .filter((number) => Number.isFinite(number) && number > 0);

    const nextNumber =
      existingNumbers.length > 0
        ? Math.max(...existingNumbers) + 1
        : safeProjects.length + 1;

    return `PRJ-${String(nextNumber).padStart(3, "0")}`;
  }, [safeProjects]);

  const resetForm = useCallback(() => {
    setName("");
    setDescription("");
    setColor("#6366F1");
    setVisibility("workspace");
    setPinnedToWorkspace(true);
    setStatus("active");
    setPriority("medium");
    setDueDate("");
    setError("");
    setIsSubmitting(false);
  }, []);

  const closeModal = useCallback(() => {
    if (isSubmitting) return;

    resetForm();
    onOpenChange?.(false);
    onClose?.();
  }, [isSubmitting, resetForm, onOpenChange, onClose]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (isSubmitting) return;

      if (!nextOpen) {
        closeModal();
        return;
      }

      onOpenChange?.(true);
    },
    [isSubmitting, closeModal, onOpenChange]
  );

  const validateForm = useCallback(() => {
    if (!trimmedName) {
      return "Project name is required.";
    }

    if (trimmedName.length < 2) {
      return "Project name must be at least 2 characters.";
    }

    if (trimmedName.length > 80) {
      return "Project name must be 80 characters or less.";
    }

    if (!user?.uid) {
      return "You must be signed in to create a project.";
    }

    if (!workspaceId) {
      return "No workspace was found for your account. Please refresh the page or create a workspace first.";
    }

    return "";
  }, [trimmedName, user?.uid, workspaceId]);

  const handleLaunchProject = useCallback(async () => {
    if (isSubmitting) return;

    setError("");

    const validationError = validateForm();

    if (validationError) {
      setError(validationError);
      return;
    }

    if (!user?.uid || !workspaceId) {
      setError("Unable to create project because your workspace session is missing.");
      return;
    }

    try {
      setIsSubmitting(true);

      await createProject(workspaceId, {
        name: trimmedName,
        description: trimmedDescription,
        code: generatedCode,
        color,

        status,
        priority,
        dueDate: dueDate || null,

        workspaceId,
        ownerId: user.uid,
        createdBy: user.uid,

        visibility,
        pinnedToWorkspace:
          visibility === "workspace" ? pinnedToWorkspace : false,
        memberIds: [user.uid],
      } as any);

      resetForm();
      onOpenChange?.(false);
      onClose?.();
    } catch (err) {
      console.error("Failed to create project:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while creating the project. Please try again."
      );

      setIsSubmitting(false);
    }
  }, [
    isSubmitting,
    validateForm,
    user?.uid,
    workspaceId,
    trimmedName,
    trimmedDescription,
    generatedCode,
    color,
    status,
    priority,
    dueDate,
    visibility,
    pinnedToWorkspace,
    resetForm,
    onOpenChange,
    onClose,
  ]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      await handleLaunchProject();
    },
    [handleLaunchProject]
  );

  return (
    <Dialog.Root open={modalOpen} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />

                <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl focus:outline-none">

                    <div className="flex shrink-0 items-start justify-between border-b border-slate-200 px-5 py-4">
            <div>
                            <Dialog.Title className="text-lg font-semibold text-slate-900">
                Create New Project
              </Dialog.Title>

              <Dialog.Description className="mt-0.5 text-xs text-slate-500">
                Set up a project for your workspace.
              </Dialog.Description>
            </div>

            <button
              type="button"
              onClick={closeModal}
              disabled={isSubmitting}
              className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Close create project modal"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {error && (
                                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

                            <div className="space-y-4">
                <div>
                  <label
                    htmlFor="modal-project-name"
                                        className="mb-1.5 block text-xs font-semibold text-slate-600"

                  >
                    Project name <span className="text-red-500">*</span>
                  </label>

                  <input
                    id="modal-project-name"
                    type="text"
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      if (error) setError("");
                    }}
                    placeholder="Example: Website Redesign"
                    disabled={isSubmitting}
                    autoFocus
                                        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label
                    htmlFor="modal-project-description"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Description
                  </label>

                  <textarea
                    id="modal-project-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Briefly describe what this project is about..."
                                      rows={2}
                    disabled={isSubmitting}
                    className="w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                  />
                </div>

                <div>
                                    <label className="mb-2 block text-xs font-semibold text-slate-600">
                    Theme color
                  </label>

                                    <div className="flex flex-wrap gap-2">
                    {PROJECT_COLORS.map((projectColor) => (
                      <button
                        key={projectColor}
                        type="button"
                        onClick={() => setColor(projectColor)}
                        disabled={isSubmitting}
                                                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition ${
                          color === projectColor
                            ? "border-slate-900 ring-4 ring-slate-200"
                            : "border-white hover:scale-105"
                        }`}
                        style={{ backgroundColor: projectColor }}
                        aria-label={`Select project color ${projectColor}`}
                      >
                        {color === projectColor && (
                          <Check size={16} className="text-white" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-3 block text-sm font-medium text-slate-700">
                    Project access
                  </label>

                                    <div className="grid gap-2.5 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        setVisibility("workspace");
                        setPinnedToWorkspace(true);
                      }}
                      disabled={isSubmitting}
                                           className={`rounded-xl border p-3 text-left transition ${
                        visibility === "workspace"
                          ? "border-indigo-500 bg-indigo-50 ring-4 ring-indigo-100"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <p className="font-semibold text-slate-900">
                        Workspace project
                      </p>
                                            <p className="mt-1 text-xs leading-snug text-slate-500">
                        Workspace members can access this project.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setVisibility("private");
                        setPinnedToWorkspace(false);
                      }}
                      disabled={isSubmitting}
                                           className={`rounded-xl border p-3 text-left transition ${
                        visibility === "private"
                          ? "border-indigo-500 bg-indigo-50 ring-4 ring-indigo-100"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <p className="font-semibold text-slate-900">
                        Private project
                      </p>
                                            <p className="mt-1 text-xs leading-snug text-slate-500">
                        Only you and added project members can access it.
                      </p>
                    </button>
                  </div>
                </div>

                {visibility === "workspace" && (
                                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3">
                    <input
                      type="checkbox"
                      checked={pinnedToWorkspace}
                      onChange={(event) =>
                        setPinnedToWorkspace(event.target.checked)
                      }
                      disabled={isSubmitting}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />

                    <span>
                      <span className="block text-sm font-medium text-slate-900">
                        Show in workspace curated work
                      </span>
                                            <span className="mt-1 block text-xs leading-snug text-slate-500">
                        This makes the project visible in the workspace project
                        area for members.
                      </span>
                    </span>
                  </label>
                )}

                                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label
                      htmlFor="modal-project-status"
                      className="mb-2 block text-sm font-medium text-slate-700"
                    >
                      Status
                    </label>

                    <select
                      id="modal-project-status"
                      value={status}
                      onChange={(event) =>
                        setStatus(event.target.value as ProjectStatus)
                      }
                      disabled={isSubmitting}
                                            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                    >
                      <option value="active">Active</option>
                      <option value="planning">Planning</option>
                      <option value="on-hold">On hold</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="modal-project-priority"
                      className="mb-2 block text-sm font-medium text-slate-700"
                    >
                      Priority
                    </label>

                    <select
                      id="modal-project-priority"
                      value={priority}
                      onChange={(event) =>
                        setPriority(event.target.value as ProjectPriority)
                      }
                      disabled={isSubmitting}
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="modal-project-due-date"
                      className="mb-2 block text-sm font-medium text-slate-700"
                    >
                      Due date
                    </label>

                    <input
                      id="modal-project-due-date"
                      type="date"
                      value={dueDate}
                      onChange={(event) => setDueDate(event.target.value)}
                      disabled={isSubmitting}
                                            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                    />
                  </div>
                </div>

                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="mb-3 text-sm font-medium text-slate-700">
                    Preview
                  </p>

                  <div className="flex items-center gap-3">
                                       <div
                      className="h-9 w-9 rounded-xl"
                      style={{ backgroundColor: color }}
                    />


                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {trimmedName || "Untitled Project"}
                      </p>

                      <p className="text-xs text-slate-500">
                        {generatedCode} · {visibility} · {priority} priority
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

             <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">   
              <button
                type="button"
                onClick={closeModal}
                disabled={isSubmitting}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                {isSubmitting ? "Creating..." : "Create Project"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default CreateProjectModal;
