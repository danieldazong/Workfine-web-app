/**
 * GLOBAL single source of truth for task-sharing labels & descriptions.
 *
 * Two DIFFERENT axes — never mix them in the UI:
 *  1) ROLE  (what a guest can DO once inside)  → Commenter | Viewer
 *  2) SCOPE (WHO can open the task at all)      → project | invited | link
 *
 * Importing these everywhere guarantees identical wording across the
 * Share modal, tooltips, and any future Manage-access surface.
 */

export type GuestRole = "commenter" | "viewer";

export type TaskAccessMode =
  | "task_project"
  | "invited_only"
  | "anyone_with_link";

/** ROLE — what an invited guest can do. */
export const GUEST_ROLE_LABELS: Record<
  GuestRole,
  { label: string; short: string; description: string }
> = {
  commenter: {
    label: "Commenter",
    short: "Can comment",
    description: "Can read, comment, like and copy. Cannot edit the task.",
  },
    viewer: {
    label: "Viewer",
    short: "View only",
    description: "Read-only. Cannot comment, like, copy or edit, Cannot Delete.",
  },

};

/** SCOPE — who is allowed to open this task at all. */
export const TASK_ACCESS_OPTIONS: {
  value: TaskAccessMode;
  label: string;
  description: string;
}[] = [
  {
    value: "task_project",
    label: "Project members",
    description: "People already on this task or its connected project.",
  },
  {
    value: "invited_only",
    label: "Restricted",
    description: "Only the owner, assignee, and people you invite by email.",
  },
  {
    value: "anyone_with_link",
    label: "Anyone with the link",
    description: "No sign-in or invite needed — anyone with the link can view.",
  },
];

export function normalizeGuestRole(value?: string | null): GuestRole {
  return String(value || "").trim().toLowerCase() === "viewer"
    ? "viewer"
    : "commenter";
}
