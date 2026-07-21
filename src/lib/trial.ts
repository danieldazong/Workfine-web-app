/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Per-account 30-day advanced free trial logic.
 * Pure/derived — no Firestore writes, no secrets, no side effects.
 * Reads each account's OWN workspace status, so it is per-account and global.
 */

// Master switch for the hard "trial ended" gate. Keep FALSE until real billing
// exists — flipping true would immediately block every account older than 30
// days that is not subscriptionStatus === "active".
export const TRIAL_GATE_ENABLED = false;

export const TRIAL_LENGTH_DAYS = 30;

function resolveCreatedMs(workspaceData: any): number {
  const createdAt = workspaceData?.createdAt;
  if (!createdAt) return 0;
  if (typeof createdAt?.toMillis === "function") return createdAt.toMillis();
  if (typeof createdAt?.seconds === "number") return createdAt.seconds * 1000;
  const parsed = new Date(createdAt).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface TrialStatus {
  ready: boolean;      // workspace timestamp resolved
  active: boolean;     // paid / subscribed — full access, ignore countdown
  daysLeft: number;    // whole days remaining (0 when expired)
  expired: boolean;    // trial window passed AND not active
}

/**
 * Per-account trial resolution.
 * - subscriptionStatus === "active" (or plan "pro") => active, never expires.
 * - otherwise compute days-left from the account's own createdAt.
 */
export function getTrialStatus(workspaceData: any): TrialStatus {
  const status = String(workspaceData?.subscriptionStatus || "").toLowerCase();
  const plan = String(workspaceData?.plan || "").toLowerCase();

  const isActive = status === "active" || plan === "pro";
  if (isActive) {
    return { ready: true, active: true, daysLeft: TRIAL_LENGTH_DAYS, expired: false };
  }

  const createdMs = resolveCreatedMs(workspaceData);
  if (!createdMs) {
    return { ready: false, active: false, daysLeft: 0, expired: false };
  }

  const endMs = createdMs + TRIAL_LENGTH_DAYS * 24 * 60 * 60 * 1000;
  const remainingMs = endMs - Date.now();
  const daysLeft = Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));

  return {
    ready: true,
    active: false,
    daysLeft,
    expired: remainingMs <= 0,
  };
}
