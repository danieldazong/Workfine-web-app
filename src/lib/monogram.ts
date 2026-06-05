/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SINGLE SOURCE OF TRUTH for avatar monograms.
 * Every surface (Navbar, Sidebar, TaskDetailPanel, TeamPage, SettingsPage)
 * MUST import from here so the same account always renders the same
 * gradient AND the same initials everywhere.
 */

// Deterministic gradient from a seed string.
export function monogramGradient(seed: string): string {
  const s = String(seed || "?").trim().toLowerCase();

  let h1 = 0;
  let h2 = 0;
  let h3 = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = (c + ((h1 << 5) - h1)) | 0;
    h2 = (c * 31 + ((h2 << 7) - h2)) | 0;
    h3 = (c * 17 + ((h3 << 3) - h3)) | 0;
  }

  const hue1 = Math.abs(h1) % 360;
  const hueGap = 25 + (Math.abs(h2) % 90);
  const hue2 = (hue1 + hueGap) % 360;

  const sat1 = 58 + (Math.abs(h2) % 28);
  const sat2 = 58 + (Math.abs(h3) % 28);
  const light1 = 48 + (Math.abs(h3) % 16);
  const light2 = 38 + (Math.abs(h1) % 14);
  const angle = Math.abs(h2 ^ h3) % 360;

  return `linear-gradient(${angle}deg, hsl(${hue1} ${sat1}% ${light1}%), hsl(${hue2} ${sat2}% ${light2}%))`;
}

// Email-first initials (never stale vs. displayName).
export function monogramInitials(
  name?: string | null,
  email?: string | null
): string {
  const emailLocal = String(email || "").trim().split("@")[0];
  const label = String(emailLocal || name || "?")
    .replace(/[._-]+/g, " ")
    .trim();
  if (!label || label === "?") return "?";
  const initials = label
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return initials || label[0]?.toUpperCase() || "?";
}

// The ONE canonical seed expression. Use this for BOTH the gradient
// and the initials so color and letter always agree.
export function monogramSeed(
  email?: string | null,
  name?: string | null
): string {
  const emailLocal = String(email || "").trim().toLowerCase().split("@")[0];
  return emailLocal || String(name || "?").trim().toLowerCase();
}

// Only Firebase Storage uploads count as a real photo.
export function resolveAvatarPhoto(photoURL?: string | null): string {
  const url = String(photoURL || "").trim();
  return url.includes("firebasestorage") ? url : "";
}
