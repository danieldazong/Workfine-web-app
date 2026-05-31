/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date | null) {
  if (!date) return 'No date';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

export function getInitials(nameOrEmail: string | null | undefined): string {
  if (!nameOrEmail) return 'U';
  // If it looks like an email, use the part before @
  const base = nameOrEmail.includes('@')
    ? nameOrEmail.split('@')[0]
    : nameOrEmail;
  const parts = base.trim().split(/[\s._-]+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return base.slice(0, 2).toUpperCase();
}

/** Returns a consistent Tailwind bg-color class derived from a string seed. */
export function getAvatarColor(seed: string | null | undefined): string {
  const colors = [
    'bg-blue-500',
    'bg-violet-500',
    'bg-emerald-500',
    'bg-orange-500',
    'bg-pink-500',
    'bg-indigo-500',
    'bg-teal-500',
    'bg-rose-500',
  ];
  if (!seed) return colors[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Produces a short, uniform workspace label for display anywhere a workspace
 * id is shown (top nav breadcrumb, Settings profile card, Team workspace info).
 *
 * Personal workspaces have very long ids (e.g. "personal_7MaCJZ1207hMe7...")
 * which look broken and wrap onto multiple lines. Team workspaces have short
 * ids (e.g. "WF-354"). To keep every surface identical on EVERY account —
 * current and future — we never render the long raw id: personal workspaces
 * collapse to a short "Personal" label, while team ids are shown as-is.
 */
export function getWorkspaceLabel(workspaceId?: string | null): string {
  const clean = String(workspaceId || "").trim();

  if (!clean) return "WF-000";

  if (clean.startsWith("personal_") || clean.startsWith("WF-PERSONAL-")) {
    return "Personal";
  }

  return clean;
}
/**
 * Resolves the short, unique, permanent workspace display code (e.g. "WF-354821")
 * that must appear IDENTICALLY on the Navbar, Settings page, and Team page for
 * every account.
 *
 * Resolution order (global, account-agnostic):
 *   1. The `displayId` stored on the workspace document (set by AuthContext).
 *   2. A deterministic code derived from the current user's uid (fallback for
 *      the brief moment before workspaceData loads, or legacy docs).
 *   3. Otherwise fall back to the human label (e.g. "Personal" / team id).
 *
 * For real team workspaces (ids like "WF-354") we keep showing the raw id.
 */
export function resolveWorkspaceDisplayId(
  workspaceId?: string | null,
  workspaceData?: { displayId?: string | null; id?: string | null } | null,
  uid?: string | null
): string {
  const stored = String(workspaceData?.displayId || "").trim();
  if (stored) return stored;

  const wid = String(workspaceId || "").trim();

  // Personal workspaces: derive the short code from the uid so it is stable,
  // unique, and identical on every screen — even before the doc loads.
  const isPersonal =
    wid.startsWith("personal_") || wid.startsWith("WF-PERSONAL-");

  if (isPersonal) {
    const cleanUid = String(uid || wid.replace(/^personal_/, "")).trim();
    if (cleanUid) {
      let hash = 0;
      for (let i = 0; i < cleanUid.length; i++) {
        hash = (cleanUid.charCodeAt(i) + ((hash << 5) - hash)) | 0;
      }
      const code = Math.abs(hash) % 1000000;
      return `WF-${String(code).padStart(6, "0")}`;
    }
  }

  // Team workspaces (short ids) and everything else: use the existing label.
  return getWorkspaceLabel(workspaceId);
}
