// src/pages/TeamPage.tsx
import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import {
  Users,
  UserPlus,
  Shield,
  Clock,
  Star,
  Copy,
  Check,
  ChevronDown,
  Search,
  FolderOpen,
} from "lucide-react";

import {
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  setDoc,
  getDoc,
  getDocs,
  onSnapshot,
  collection,
  query,
  where,
} from "firebase/firestore";




import { db } from "../lib/firebase/config";
import { useAuth } from "../context/AuthContext";
import { useAppData } from "../context/AppDataContext";
import InviteMemberModal from "../components/InviteMemberModal";
import emailjs from "@emailjs/browser";
import { resolveWorkspaceDisplayId } from "../lib/utils";


// ─── Inline skeleton placeholder ──────────────────────────────────────────────
// Tiny replacement for the missing Skeleton component.
function SkeletonBox({
  width,
  height = 12,
  circle = false,
  className = "",
}: {
  width?: number | string;
  height?: number | string;
  circle?: boolean;
  className?: string;
}) {
  const style: React.CSSProperties = {
    width: typeof width === "number" ? `${width}px` : width,
    height: typeof height === "number" ? `${height}px` : height,
  };
  return (
    <div
      aria-hidden="true"
      style={style}
      className={`animate-pulse bg-slate-200 ${
        circle ? "rounded-full" : "rounded-md"
      } ${className}`}
    />
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "#8b5cf6",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
];

function getAvatarColor(userId: string): string {
  if (!userId) return AVATAR_COLORS[0];
  return AVATAR_COLORS[userId.charCodeAt(0) % AVATAR_COLORS.length];
}

function timeAgo(ts: any): string {
  if (!ts) return "Never";

  const ms =
    typeof ts?.toMillis === "function"
      ? ts.toMillis()
      : typeof ts?.seconds === "number"
        ? ts.seconds * 1000
        : new Date(ts).getTime();

  if (!Number.isFinite(ms)) return "Never";

  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);

  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;

  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;

  return `${Math.floor(h / 24)}d ago`;
}

function isOnline(ts: any): boolean {
  if (!ts) return false;

  const ms =
    typeof ts?.toMillis === "function"
      ? ts.toMillis()
      : typeof ts?.seconds === "number"
        ? ts.seconds * 1000
        : new Date(ts).getTime();

  if (!Number.isFinite(ms)) return false;

  return Date.now() - ms < 5 * 60 * 1000;
}

function isExpired(expiresAt: any): boolean {
  if (!expiresAt) return false;

  const ms =
    typeof expiresAt?.toMillis === "function"
      ? expiresAt.toMillis()
      : typeof expiresAt?.seconds === "number"
        ? expiresAt.seconds * 1000
        : new Date(expiresAt).getTime();

  if (!Number.isFinite(ms)) return false;

  return ms < Date.now();
}

const ROLE_HIERARCHY: Record<string, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
};

function canManage(currentRole: string, targetRole: string): boolean {
  return (ROLE_HIERARCHY[currentRole] ?? 0) > (ROLE_HIERARCHY[targetRole] ?? 0);
}

const ROLE_BADGE: Record<string, string> = {
  owner: "text-white",
  admin: "bg-blue-100 text-blue-700",
  member: "bg-slate-100 text-slate-600",
  viewer: "bg-gray-100 text-gray-600",
};


// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ msg, onDone }: { msg: string; onDone: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 3000);
    return () => window.clearTimeout(t);
  }, [onDone]);

  return (
    <div
      className="fixed bottom-6 right-6 z-50 bg-slate-800 text-white px-4 py-3 rounded-xl shadow-lg text-sm"
      style={{ animation: "slideUp 0.2s ease" }}
    >
      {msg}
    </div>
  );
}
// Deterministic gradient for the initials fallback. Same seed → same colors,
// so each guest keeps a stable, premium-looking monogram.
// IMPORTANT: This MUST stay byte-for-byte identical to monogramGradient() in
// src/components/TaskDetailPanel.tsx so the External Guests avatar and the
// Share-task modal avatar render the SAME gradient for the same email.
function monogramGradient(seed: string): string {
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
function monogramInitials(name?: string | null, email?: string | null): string {
  const label = String(name || email || "?").trim();
  if (!label || label === "?") return "?";
  const initials = label
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return initials || label[0]?.toUpperCase() || "?";
}

// Only Firebase Storage uploads are real user photos. Any other URL
// (e.g. Google lh3.googleusercontent.com) is ignored so every account
// shows its monogram gradient — identical to the sidebar/navbar policy.
function resolveAvatarPhoto(photoURL?: string | null): string {
  const url = String(photoURL || "").trim();
  return url.includes("firebasestorage") ? url : "";
}

// ─── Live guest avatar (mirrors TaskDetailPanel.ModernAvatar) ────────────────
// Subscribes to users/{uid} directly — the SAME source the Task modal uses —
// so when an invited user changes their photo in Settings, this updates in
// real time. Falls back to a by-email listener when no uid is harvestable,
// then to the accept-time photo, then to initials.
// GLOBAL: one independent subscription per guest row, no account hardcoded.



// ─── Live guest avatar — uses the EXACT same mechanism as the Task modal ─────
// The Share modal updates avatars in real time via:
//     onSnapshot(doc(db, "users", profileUid), ...)
// We do the identical thing here. activateTaskGuestPerson() writes the
// accepting user's uid to the people-doc root (userId/uid), and
// harvestGuestUid() reads exactly those fields — so this listener subscribes
// to the same users/{uid} document the modal watches. When the invited user
// changes their photo in Settings, users/{uid}.photoURL changes, this
// onSnapshot fires, and ONLY this guest's avatar re-renders. GLOBAL: one
// independent subscription per guest row, no account hardcoded.
interface GuestAvatarProps {
  uid: string;
  email: string;
  initials: string;
  bgColor: string;
  displayName: string;
  isGoogle: boolean;
  shareRefs: { workspaceId: string; taskId: string; shareId: string }[];
}


function GuestAvatar({
  uid,
  email,
  initials,
  bgColor,
  displayName,
  isGoogle,
  shareRefs,
}: GuestAvatarProps) {
  const [photoURL, setPhotoURL] = useState<string>("");
  const [imgFailed, setImgFailed] = useState(false);
    const isRealUidVal = (v?: string | null) =>
    Boolean(v) && !String(v).trim().startsWith("guest_");

  const [resolvedUid, setResolvedUid] = useState<string>(
    isRealUidVal(uid) ? uid : "",
  );


  // Resolve the UID: 1) prop uid, 2) acceptedByUid from share doc,
  // 3) lookup users/{uid} by emailLower. The email path is what makes this
  // work when the people doc has no uid and the share doc is unreadable.
  useEffect(() => {
    let cancelled = false;

       if (isRealUidVal(uid)) {
      setResolvedUid(uid);
      return;
    }


    (async () => {
      // (a) Try the share doc(s).
      if (shareRefs && shareRefs.length > 0) {
        for (const ref of shareRefs) {
          if (cancelled) return;
          try {
            const snap = await getDoc(
              doc(
                db,
                "workspaces",
                ref.workspaceId,
                "tasks",
                ref.taskId,
                "shares",
                ref.shareId,
              ),
            );
            if (snap.exists()) {
              const data = snap.data() as any;
              const found = String(
                data.acceptedByUid || data.acceptedBy || "",
              ).trim();
              if (found) {
                if (!cancelled) setResolvedUid(found);
                return;
              }
            }
          } catch (err) {
            console.warn("[GuestAvatar] share doc read failed:", ref, err);
          }
        }
      }

      // (b) Fall back to resolving the uid by email.
      const clean = String(email || "").trim().toLowerCase();
      if (!clean) return;
      try {
        const q = query(
          collection(db, "users"),
          where("emailLower", "==", clean),
        );
        const qs = await getDocs(q);
        if (!cancelled && !qs.empty) {
          setResolvedUid(qs.docs[0].id);
        }
      } catch (err) {
        console.warn("[GuestAvatar] email→uid lookup failed:", clean, err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uid, email, shareRefs]);

    // Watch users/{uid} live — identical mechanism to the modal.
  useEffect(() => {
    setImgFailed(false);

    console.log("[GuestAvatar] resolved →", {
      email,
      propUid: uid,
      resolvedUid,
      shareRefs,
    });

    if (!resolvedUid) {
      console.warn("[GuestAvatar] NO uid resolved for:", email);
      setPhotoURL("");
      return;
    }


    const unsub = onSnapshot(
      doc(db, "users", resolvedUid),
            (snap) => {
        const u = (snap.exists() ? snap.data() : {}) as any;
        // GLOBAL POLICY: only Firebase Storage uploads count as a real photo —
        // identical to resolveAvatarPhoto() used by the sidebar, navbar, member
        // rows, and the Task modal "Who has access" row. Google/Gmail URLs are
        // rejected so this surface shows the SAME thing as the modal.
        const real = resolveAvatarPhoto(
          u.photoURL ||
            u.avatarUrl ||
            u.googlePhotoURL ||
            u.providerPhotoURL ||
            u.authPhotoURL ||
            "",
        );
        setPhotoURL(real);
      },

      (err) => {
        console.warn(
          "[GuestAvatar] users/{uid} listener failed:",
          resolvedUid,
          err,
        );
        setPhotoURL("");
      },
    );

    return () => unsub();
  }, [resolvedUid]);

  const showPhoto = Boolean(photoURL) && !imgFailed;

  return (
    <div className="relative w-10 h-10 flex-shrink-0">
      {showPhoto ? (
        <img
          src={photoURL}
          alt={displayName}
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          onError={() => setImgFailed(true)}
          className="w-full h-full rounded-full object-cover ring-1 ring-slate-200 bg-slate-100"
        />
      ) : (
        <div
          className="w-full h-full rounded-full flex items-center justify-center text-white text-sm font-semibold ring-1 ring-black/5 select-none"
          style={{
            background: monogramGradient(
              String(email || "").trim().toLowerCase() ||
                displayName ||
                initials,
            ),
            letterSpacing: "0.02em",
          }}
        >
          {initials}
        </div>
      )}

            {/* Google "G" badge intentionally removed: under the global Firebase-only
          policy, showPhoto is only ever true for an uploaded Storage photo, so
          this badge could never render correctly. */}

    </div>
  );

}








// ─── Component ────────────────────────────────────────────────────────────────

export default function TeamPage() {
  const { user, workspaceId, setWorkspaceId } = useAuth();
  const appData = useAppData();

  const members = Array.isArray(appData.members) ? appData.members : [];
  const pendingInvites = Array.isArray(appData.pendingInvites)
    ? appData.pendingInvites
    : [];
  const workspacePeople = Array.isArray(appData.workspacePeople)
    ? appData.workspacePeople
    : [];
  const workspaceData = appData.workspaceData;
  const cancelInvite = appData.cancelInvite;


  /**
   * Workspace-scoped data lives outside the main AppDataContext loading flag.
   * So TeamPage derives its own loading state.
   */
  const teamLoading = !workspaceData;

  const [mounted, setMounted] = useState(false);
  const [loadTimedOut, setLoadTimedOut] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!teamLoading) {
      setLoadTimedOut(false);
      return;
    }
    const t = window.setTimeout(() => setLoadTimedOut(true), 2500);
    return () => window.clearTimeout(t);
  }, [teamLoading]);

  // Inline replacement for useDelayedLoading hook.
  // Show skeleton while still loading (and not yet timed out) OR not mounted.
  const showSkeleton = (teamLoading && !loadTimedOut) || !mounted;
  // Fix #10 — close role menu when clicking outside.
  const roleMenuRef = useRef<HTMLDivElement | null>(null);

  // Fix #14 — notify when my own role changes.
  const prevMyRoleRef = useRef<string | null>(null);

  // Fix #3 — control upgrade dialog.
  const [showUpgrade, setShowUpgrade] = useState(false);

  const [search, setSearch] = useState("");

  const [showInvite, setShowInvite] = useState(false);
  const [toast, setToast] = useState("");
  const [copiedWid, setCopiedWid] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [roleMenuFor, setRoleMenuFor] = useState<string | null>(null);
  const [cancellingCode, setCancellingCode] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [resendingCode, setResendingCode] = useState<string | null>(null);
  const [resendCooldowns, setResendCooldowns] = useState<Record<string, number>>({});
  const [recentlyResentCode, setRecentlyResentCode] = useState<string | null>(null);
  const [cooldownTick, setCooldownTick] = useState(0);

  const showToast = useCallback((msg: string) => setToast(msg), []);

  // Fix #10 — outside-click handler for role dropdown.
  useEffect(() => {
    if (!roleMenuFor) return;
    function onDocClick(e: MouseEvent) {
      if (
        roleMenuRef.current &&
        !roleMenuRef.current.contains(e.target as Node)
      ) {
        setRoleMenuFor(null);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [roleMenuFor]);

    // Tick every second while any cooldown is active so the countdown re-renders.
  useEffect(() => {
    const hasActive = Object.values(resendCooldowns).some(
      (ts) => Date.now() - ts < 30_000
    );
    if (!hasActive) return;

    const interval = window.setInterval(() => {
      setCooldownTick((t) => t + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [resendCooldowns, cooldownTick]);


  /**
   * The real owner must come from workspaceData.ownerId.
   * If that is missing, fallback to the current authenticated user.
   */
  const ownerUserId = workspaceData?.ownerId ?? user?.uid ?? null;

  const ownerMember =
    members.find((m) => m.userId === ownerUserId) ??
    (user
      ? {
          userId: user.uid,
          email: user.email ?? "",
          displayName:
            user.displayName ??
            user.email?.split("@")[0] ??
            "Workspace owner",
          role: "owner",
        }
      : null);

  const activeMembersRaw = members.filter(
    (m) => (m.status ?? "active") === "active"
  );

  const myMember = members.find((m) => m.userId === user?.uid);

  const myRole =
    user?.uid && user.uid === ownerUserId
      ? "owner"
      : myMember?.role === "owner"
        ? "member"
        : myMember?.role ?? "member";

  // Fix #14 — toast when my role changes (e.g. another admin promotes me).
  useEffect(() => {
    if (prevMyRoleRef.current && prevMyRoleRef.current !== myRole) {
      showToast(`Your workspace role is now: ${myRole}`);
    }
    prevMyRoleRef.current = myRole;
  }, [myRole, showToast]);

  const visibleMembers = activeMembersRaw.filter((m) => {
    if (!m.userId) return false;
    if (m.userId === ownerUserId) return false;
    return true;
  });

  const activeMemberIds = new Set(activeMembersRaw.map((m) => m.userId));

  // NOTE: We intentionally do NOT gate guest projects by `livePidSet` here.
  // `appData.projects` is filtered to projects the CURRENT user can see, which
  // excludes private projects the owner isn't a collaborator on — but the guest
  // still has legitimate access to those projects. The People page should reflect
  // the guest's actual access, not the viewer's project visibility.
   function getActiveGuestProjects(person: any) {
    const personProjects = person.projects ?? {};
    return Object.entries(personProjects)
      .filter(([, p]: [string, any]) => {
        const status = String(p?.status ?? "").toLowerCase();
        const source = String(p?.source ?? "").toLowerCase();
        const accepted =
          p?.accepted === true ||
          p?.acceptedAt != null ||
          status === "accepted" ||
          status === "active";

        // FAANG rule: must be a real granted access (invite/share/member),
        // not a passive assignee write. Assignee-only rows are excluded.
        const isRealAccess =
          source === "invite" ||
          source === "share" ||
          source === "member" ||
          source === "collaborator" ||
          p?.invitedAt != null ||
          p?.sharedAt != null ||
          p?.role != null;

        if (source === "assignee" && !isRealAccess) return false;
        return accepted && isRealAccess;
      })
      .map(([pid, p]: [string, any]) => ({
        ...(p as any),
        projectId: pid,
      })) as any[];
  }



   function getActiveGuestTasks(person: any) {
    const personTasks = person.tasks ?? {};
    return Object.entries(personTasks)
      .filter(([, t]: [string, any]) => {
        const status = String(t?.status ?? "").toLowerCase();
        const source = String(t?.source ?? "").toLowerCase();

        // Must be an accepted task share — assignee-only rows are excluded.
        const accepted =
          t?.accepted === true ||
          t?.acceptedAt != null ||
          status === "accepted" ||
          status === "active";

        const isRealAccess =
          source === "share" ||
          source === "invite" ||
          t?.shareId != null ||
          t?.sharedAt != null ||
          t?.invitedAt != null;

        // Hard exclude pure assignee writes (the bug you saw with ctahighlight@gmail.com).
        if (source === "assignee") return false;
        if (!isRealAccess) return false;

        return accepted;
      })
      .map(([tid, t]: [string, any]) => ({
        ...(t as any),
        taskId: tid,
      })) as any[];
  }


   const externalGuests = workspacePeople.filter((p) => {
    // Match by uid OR by email — guests often have no uid until they accept.
    const personUid = p.userId || p.uid || "";
    const personEmail = String(p.emailLower || p.email || "")
      .toLowerCase()
      .trim();

    // Exclude anyone who is already a real workspace member.
    if (personUid && activeMemberIds.has(personUid)) {
      console.log("[TeamPage] guest skipped (already member by uid):", personEmail);
      return false;
    }

    const memberByEmail = personEmail
      ? activeMembersRaw.find(
          (m) => String(m.email || "").toLowerCase().trim() === personEmail,
        )
      : null;
    if (memberByEmail) {
      console.log("[TeamPage] guest skipped (already member by email):", personEmail);
      return false;
    }

        if ((p.type ?? "guest") !== "guest") {
      console.log("[TeamPage] guest skipped (type != guest):", personEmail, "type:", p.type);
      return false;
    }

    // FAANG rule: someone is only an "External Guest" if they have at least one
    // real granted access (accepted invite or share). A user whose entire footprint
    // is being typed into a task's assignee field is NOT a guest — they have no
    // authenticated access. They are an "unregistered contact" and must not appear here.
    const projectEntries = Object.values(p.projects ?? {}) as any[];
    const taskEntries = Object.values(p.tasks ?? {}) as any[];
    const allEntries = [...projectEntries, ...taskEntries];

    const hasAnyRealAccess = allEntries.some((entry: any) => {
      const source = String(entry?.source ?? "").toLowerCase();
      if (source === "assignee") return false;
      return (
        source === "invite" ||
        source === "share" ||
        source === "member" ||
        source === "collaborator" ||
        entry?.shareId != null ||
        entry?.invitedAt != null ||
        entry?.sharedAt != null ||
        entry?.accepted === true ||
        entry?.acceptedAt != null
      );
    });

    if (!hasAnyRealAccess) {
      console.log(
        "[TeamPage] guest skipped (assignee-only, no accepted invite/share):",
        personEmail
      );
      return false;
    }


      // Reject only hard-revoked guests. Everyone else is included, and their
    // Active/Pending badge is derived from their nested task/project entries
    // below — this self-heals even if the root `status` field is stale.
    const status = String(p.status ?? "active").toLowerCase();
    if (status === "revoked" || status === "removed" || status === "suspended") {
      console.log("[TeamPage] guest skipped (revoked):", personEmail, "status:", status);
      return false;
    }

    const projectCount = getActiveGuestProjects(p).length;
    const taskCount = getActiveGuestTasks(p).length;

    // Also count not-yet-accepted task entries so newly invited guests still
    // appear under External Guests with a Pending badge.
    const taskEntriesAll = Object.values(p.tasks ?? {}) as any[];
    const projectEntriesAll = Object.values(p.projects ?? {}) as any[];

    const hasAnyTaskOrProjectEntry =
      taskEntriesAll.some((t: any) => {
        const s = String(t?.source ?? "").toLowerCase();
        return s === "invite" || s === "share" || t?.shareId != null;
      }) ||
      projectEntriesAll.some((pr: any) => {
        const s = String(pr?.source ?? "").toLowerCase();
        return (
          s === "invite" ||
          s === "share" ||
          s === "member" ||
          s === "collaborator"
        );
      });

    if (projectCount === 0 && taskCount === 0 && !hasAnyTaskOrProjectEntry) {
      console.log(
        "[TeamPage] guest skipped (no project/task entries at all):",
        personEmail
      );
      return false;
    }

            console.log(
      "[TeamPage] guest INCLUDED:",
      personEmail,
      "active projects:",
      projectCount,
      "active tasks:",
      taskCount
    );
    return true;
  });
  // A real Firebase Auth uid never starts with "guest_" (that prefix is our
  // people-doc id scheme). Reject doc-ids so we never subscribe to a
  // non-existent users/{guest_...} document.
  function isRealUid(value?: string | null): boolean {
    const v = String(value || "").trim();
    return v.length > 0 && !v.startsWith("guest_");
  }

  // ── Guest avatar resolver — MIRRORS the Share-task modal exactly ──────────
  // The modal resolves photos from users/{uid} using each share's
  // acceptedByUid / acceptedByEmail. The people doc rarely stores a usable
  // photoURL, which is why guests show initials here. We harvest the uid from
  // every guest's task/project entries (acceptedByUid), subscribe to
  // users/{uid} live, and resolve the real Google photo — identical to the
  // modal. Global: runs for EVERY guest, no account hardcoded.
   function harvestGuestUid(guest: any): string {
    const direct = String(
      guest.userId || guest.uid || guest.acceptedByUid || guest.acceptedBy || ""
    ).trim();
    if (isRealUid(direct)) return direct; // ⬅️ only accept REAL uids

    const entries = [
      ...Object.values(guest.tasks ?? {}),
      ...Object.values(guest.projects ?? {}),
    ] as any[];
    for (const e of entries) {
      const u = String(
        e?.acceptedByUid ||
          e?.acceptedBy ||
          e?.userId ||
          e?.uid ||
          e?.invitedByUid ||
          ""
      ).trim();
      if (isRealUid(u)) return u; // ⬅️ only accept REAL uids
    }
    return "";
  }

  // Collect every {workspaceId, taskId, shareId} from the guest's task entries
  // so GuestAvatar can read acceptedByUid from the SAME share doc the modal uses.
  function harvestGuestShareRefs(guest: any): {
  workspaceId: string;
  taskId: string;
  shareId: string;
}[] {
  const tasks = (guest.tasks ?? {}) as Record<string, any>;
  return Object.values(tasks)
    .map((t: any) => ({
      workspaceId: String(
        t?.workspaceId || guest.workspaceId || workspaceId || ""
      ).trim(),
      taskId: String(t?.taskId || "").trim(),
      shareId: String(t?.shareId || "").trim(),
    }))
    .filter((r) => r.workspaceId && r.taskId && r.shareId);
}


  // Harvest the guest's email so we can resolve their photo even before a uid
  // is stamped on the people doc. Global — works for every guest.
  function harvestGuestEmail(guest: any): string {
    return String(guest.emailLower || guest.email || "")
      .trim()
      .toLowerCase();
  }



  // Detect whether a guest is a Google account (drives the "G" badge),
  // mirroring isGoogleEmail() in TaskDetailPanel.
  function isGuestGoogleAccount(guest: any): boolean {
    const email = String(guest.emailLower || guest.email || "")
      .trim()
      .toLowerCase();
    return email.endsWith("@gmail.com") || email.endsWith("@googlemail.com");
  }

  // FAANG-grade self-heal: if any guest doc has a stale root `status: "pending"`
  // but actually has accepted task or project access, flip the root status to
  // "active" so every downstream consumer (Team page, sidebar, search, etc.)
  // converges in real time. This is idempotent and runs at most once per doc
  // per session via a ref-guarded set.
  const healedGuestIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!workspaceId) return;

    externalGuests.forEach((p: any) => {
      const personDocId = p.id || p.userId || p.uid;
      if (!personDocId) return;
      if (healedGuestIdsRef.current.has(personDocId)) return;

      const rootStatus = String(p.status ?? "").toLowerCase();
      const hasAccepted =
        getActiveGuestProjects(p).length > 0 ||
        getActiveGuestTasks(p).length > 0;

      if (rootStatus === "pending" && hasAccepted) {
        healedGuestIdsRef.current.add(personDocId);

        updateDoc(
          doc(db, "workspaces", workspaceId, "people", personDocId),
          {
            status: "active",
            accepted: true,
            acceptedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }
        )
          .then(() => {
            console.log(
              "[TeamPage] 🛠️ self-healed stale guest status → active:",
              personDocId
            );
          })
          .catch((err) => {
            console.warn(
              "[TeamPage] self-heal guest status failed:",
              personDocId,
              err?.message || err
            );
          });
      }
    });
  }, [externalGuests, workspaceId]);
   // ── Self-heal MISSING / BAD UID on guest people docs ────────────────────
  // Older guest docs were written before the accept flow stamped a REAL uid,
  // and some have a bogus userId equal to the "guest_..." doc id. Without a
  // real uid, GuestAvatar can't subscribe to users/{uid} and shows a gradient
  // even though the modal (which reads the share doc) shows the real photo.
  //
  // Repair order (as workspace owner, A can read all of these):
  //   1) the share doc's acceptedByUid / acceptedBy
  //   2) fallback: users query where emailLower == the guest's email
  //
  // Whichever yields a REAL uid (not "guest_...") is written back onto the
  // people doc. Idempotent, ref-guarded, GLOBAL — runs for every guest.
  const healedGuestUidRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!workspaceId) return;

    externalGuests.forEach((p: any) => {
      const personDocId = p.id || p.userId || p.uid;
      if (!personDocId) return;

      // Already has a REAL uid? nothing to do. ("guest_..." is the doc id,
      // NOT a real uid, so it must NOT count as usable.)
      const existing = String(p.userId || p.uid || "").trim();
      if (isRealUid(existing)) return;

      if (healedGuestUidRef.current.has(personDocId)) return;
      healedGuestUidRef.current.add(personDocId);

      (async () => {
        let foundUid = "";

        // (1) Try the share doc(s).
        const refs = harvestGuestShareRefs(p);
        for (const ref of refs) {
          try {
            const snap = await getDoc(
              doc(
                db,
                "workspaces",
                ref.workspaceId,
                "tasks",
                ref.taskId,
                "shares",
                ref.shareId,
              ),
            );
            if (!snap.exists()) continue;
            const s = snap.data() as any;
            const u = String(s.acceptedByUid || s.acceptedBy || "").trim();
            if (isRealUid(u)) {
              foundUid = u;
              break;
            }
          } catch (err) {
            console.warn(
              "[TeamPage] uid backfill share read failed:",
              ref,
              (err as any)?.message || err,
            );
          }
        }

        // (2) Fallback — resolve uid by email from the users collection.
        if (!foundUid) {
          const emailLower = String(p.emailLower || p.email || "")
            .trim()
            .toLowerCase();
          if (emailLower) {
            try {
              const qs = await getDocs(
                query(
                  collection(db, "users"),
                  where("emailLower", "==", emailLower),
                ),
              );
              if (!qs.empty && isRealUid(qs.docs[0].id)) {
                foundUid = qs.docs[0].id;
              }
            } catch (err) {
              console.warn(
                "[TeamPage] uid backfill email lookup failed:",
                emailLower,
                (err as any)?.message || err,
              );
            }
          }
        }

        if (!foundUid) {
          console.warn(
            "[TeamPage] uid backfill: no real uid found for guest:",
            personDocId,
          );
          return;
        }

        // Write the REAL uid back onto the people doc.
        try {
          await updateDoc(
            doc(db, "workspaces", workspaceId, "people", personDocId),
            {
              userId: foundUid,
              uid: foundUid,
              updatedAt: serverTimestamp(),
            },
          );
          console.log(
            "[TeamPage] 🛠️ backfilled guest uid:",
            personDocId,
            "→",
            foundUid,
          );
        } catch (err) {
          console.warn(
            "[TeamPage] uid backfill write failed:",
            personDocId,
            (err as any)?.message || err,
          );
        }
      })();
    });
  }, [externalGuests, workspaceId]);



  // Diagnostic — confirms TeamPage is seeing the people documents.
  useEffect(() => {
    console.log(
      "[TeamPage] workspacePeople received:",
      workspacePeople.length,
      "| externalGuests after filter:",
      externalGuests.length,
      workspacePeople.map((p: any) => ({
        id: p.id || p.userId || p.uid,
        email: p.email,
        type: p.type,
        status: p.status,
        projects: p.projects ? Object.keys(p.projects).length : 0,
        tasks: p.tasks ? Object.keys(p.tasks).length : 0,
      }))
    );
  }, [workspacePeople, externalGuests.length]);


  const filtered = visibleMembers.filter((m) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;

    return (
      (m.displayName || "").toLowerCase().includes(q) ||
      (m.email || "").toLowerCase().includes(q)
    );
  });

    const filteredGuests = externalGuests.filter((p) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;

    const activeProjects = getActiveGuestProjects(p);
    const activeTasks = getActiveGuestTasks(p);

    return (
      (p.displayName || "").toLowerCase().includes(q) ||
      (p.email || "").toLowerCase().includes(q) ||
      activeProjects.some((project: any) =>
        (project.projectName || "").toLowerCase().includes(q),
      ) ||
      activeTasks.some((task: any) =>
        (task.taskTitle || "").toLowerCase().includes(q),
      )
    );
  });


    // Workspace initialization is handled centrally in AuthContext
  // (ensurePersonalWorkspace / ensureWorkspaceAndMembership). No init needed here.

  // ── Actions ───────────────────────────────────────────────────────────────

  async function changeRole(userId: string, name: string, newRole: string) {
    if (!workspaceId) return;

    if (userId === ownerUserId) {
      showToast("The workspace owner role cannot be changed here.");
      setRoleMenuFor(null);
      return;
    }

    try {
      await updateDoc(doc(db, "workspaces", workspaceId, "members", userId), {
        role: newRole,
        updatedAt: serverTimestamp(),
      });

      setRoleMenuFor(null);
      showToast(
        `${name} is now a${/^[aeiou]/i.test(newRole) ? "n" : ""} ${newRole}`
      );
    } catch (err) {
      console.error("[TeamPage] changeRole error:", err);
      showToast("Failed to update role.");
    }
  }

  async function removeMember(memberId: string, name: string) {
    if (!workspaceId || !memberId) return;

    const target = members.find((m) => m.userId === memberId);

    const targetRole =
      memberId === ownerUserId
        ? "owner"
        : target?.role === "owner"
          ? "member"
          : target?.role ?? "member";

    if (memberId === user?.uid) {
      showToast("You cannot remove yourself from this screen.");
      setConfirmRemove(null);
      return;
    }

    if (memberId === ownerUserId) {
      showToast("The workspace owner cannot be removed.");
      setConfirmRemove(null);
      return;
    }

    if (!canManage(myRole, targetRole)) {
      showToast("You do not have permission to remove this member.");
      setConfirmRemove(null);
      return;
    }

    try {
      await resetRemovedUserWorkspace(memberId);
      await deleteDoc(doc(db, "workspaces", workspaceId, "members", memberId));

      setConfirmRemove(null);
      showToast(`${name || "Member"} has been removed from the workspace`);
    } catch (err) {
      console.error("[TeamPage] removeMember error:", err);
      showToast("Failed to remove member. Please try again.");
    }
  }

  async function resetRemovedUserWorkspace(memberId: string) {
    if (!memberId) return;

    const removedUserRef = doc(db, "users", memberId);
    const removedUserSnap = await getDoc(removedUserRef);

    const removedData = removedUserSnap.exists()
      ? (removedUserSnap.data() as any)
      : {};

    const existingPersonalWsId =
      typeof removedData.personalWorkspaceId === "string" &&
      removedData.personalWorkspaceId.trim()
        ? removedData.personalWorkspaceId.trim()
        : "";

    const safeMemberId = memberId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24);

    const personalWsId =
      existingPersonalWsId || `WF-PERSONAL-${safeMemberId}`;

    const displayName =
      removedData.displayName ??
      removedData.email?.split("@")[0] ??
      "User";

    const email = removedData.email ?? "";
    const photoURL = removedData.photoURL ?? "";

    const personalWsRef = doc(db, "workspaces", personalWsId);
    const personalWsSnap = await getDoc(personalWsRef);

    if (!personalWsSnap.exists()) {
      await setDoc(
        personalWsRef,
        {
          id: personalWsId,
          workspaceId: personalWsId,
          name: displayName ? `${displayName}'s Workspace` : "My Workspace",
          ownerId: memberId,
          ownerEmail: email,
          plan: "free",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          memberCount: 1,
        },
        { merge: true }
      );
    }

    await setDoc(
      doc(db, "workspaces", personalWsId, "members", memberId),
      {
        userId: memberId,
        displayName,
        email,
        photoURL,
        avatar: (displayName || email || "U")[0].toUpperCase(),
        avatarColor: getAvatarColor(memberId),
        role: "owner",
        status: "active",
        joinedAt: serverTimestamp(),
        lastActive: serverTimestamp(),
        invitedBy: "",
        permissions: {
          canCreateProjects: true,
          canDeleteProjects: true,
          canInviteMembers: true,
          canManageTasks: true,
        },
      },
      { merge: true }
    );

    await updateDoc(removedUserRef, {
      workspaceId: personalWsId,
      personalWorkspaceId: personalWsId,
      lastRemovedFromWorkspaceId: workspaceId,
      removedFromWorkspaceAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (memberId === user?.uid) {
      setWorkspaceId(personalWsId);
    }
  }

   const handleCancelInvite = async (inviteCode: string) => {
    if (cancellingCode) return;

    setCancellingCode(inviteCode);
    setCancelError(null);

    try {
      const invite = pendingInvites.find((i) => i.code === inviteCode) as any;

      console.log("[TeamPage] cancel invite:", {
        inviteCode,
        inviteType: invite?.inviteType,
        taskId: invite?.taskId,
        workspaceId,
        invite,
      });

      const isTaskShare =
        invite?.inviteType === "task" ||
        Boolean(invite?.taskId);

      if (isTaskShare && invite?.taskId && workspaceId) {
        // Task-share invite: mark the share doc as revoked.
        await updateDoc(
          doc(
            db,
            "workspaces",
            workspaceId,
            "tasks",
            invite.taskId,
            "shares",
            inviteCode
          ),
          {
            status: "revoked",
            revokedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }
        );
        console.log("[TeamPage] ✅ task share revoked:", inviteCode);
      } else {
        await cancelInvite(inviteCode);
        console.log("[TeamPage] ✅ workspace invite cancelled:", inviteCode);
      }
    } catch (err) {
      console.error("[TeamPage] cancel invite failed:", err);
      setCancelError("Failed to cancel invite. Please try again.");
      setTimeout(() => setCancelError(null), 4000);
    } finally {
      setCancellingCode(null);
    }
  };


  // Fix #7 — workspace ownership transfer.
  async function transferOwnership(targetUid: string, targetName: string) {
    if (!workspaceId || !user?.uid) return;
    if (targetUid === user.uid) return;
    if (myRole !== "owner") {
      showToast("Only the current owner can transfer ownership.");
      return;
    }
    const confirmed = window.confirm(
      `Transfer ownership of this workspace to ${targetName}? You will be demoted to admin and lose owner privileges.`
    );
    if (!confirmed) return;

    try {
      const wsRef = doc(db, "workspaces", workspaceId);
      const newOwnerMemberRef = doc(
        db,
        "workspaces",
        workspaceId,
        "members",
        targetUid
      );
      const oldOwnerMemberRef = doc(
        db,
        "workspaces",
        workspaceId,
        "members",
        user.uid
      );

      await updateDoc(wsRef, {
        ownerId: targetUid,
        updatedAt: serverTimestamp(),
      });
      await updateDoc(newOwnerMemberRef, {
        role: "owner",
        updatedAt: serverTimestamp(),
      });
      await updateDoc(oldOwnerMemberRef, {
        role: "admin",
        updatedAt: serverTimestamp(),
      });

      setRoleMenuFor(null);
      showToast(`Ownership transferred to ${targetName}`);
    } catch (err) {
      console.error("[TeamPage] transferOwnership error:", err);
      showToast("Failed to transfer ownership.");
    }
  }


    async function resendInvite(invite: any) {
    if (!workspaceId || !invite?.code) return;

    // Rate limit: 30s cooldown per invite (FAANG-grade — prevents spam)
    const lastSentAt = resendCooldowns[invite.code] ?? 0;
    const elapsed = Date.now() - lastSentAt;
    const COOLDOWN_MS = 30_000;

    if (elapsed < COOLDOWN_MS) {
      const remaining = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
      showToast(`Please wait ${remaining}s before resending`);
      return;
    }

    if (resendingCode) return;
    setResendingCode(invite.code);

    // Optimistic UI — mark as just-sent immediately
    setResendCooldowns((prev) => ({ ...prev, [invite.code]: Date.now() }));
    setRecentlyResentCode(invite.code);
    window.setTimeout(() => {
      setRecentlyResentCode((curr) => (curr === invite.code ? null : curr));
    }, 2500);

    const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const isTaskShare =
      invite?.inviteType === "task" || Boolean(invite?.taskId);

    const inviterName =
      user?.displayName || user?.email?.split("@")[0] || "Someone";

    try {
      // 1) Update the invite document (extend expiry)
      if (isTaskShare && invite.taskId) {
        await updateDoc(
          doc(
            db,
            "workspaces",
            workspaceId,
            "tasks",
            invite.taskId,
            "shares",
            invite.code
          ),
          {
            expiresAt: newExpiry,
            updatedAt: serverTimestamp(),
            lastResentAt: serverTimestamp(),
            lastResentBy: user?.uid ?? "",
          }
        );
      } else {
        await updateDoc(
          doc(db, "workspaces", workspaceId, "invites", invite.code),
          {
            expiresAt: newExpiry,
            updatedAt: serverTimestamp(),
            lastResentAt: serverTimestamp(),
            lastResentBy: user?.uid ?? "",
          }
        );
      }

      // 2) Re-send the email — dynamic, no hardcoded values
      if (isTaskShare && invite.taskId) {
        const taskInviteLink = `${window.location.origin}/accept-task-invite?workspaceId=${encodeURIComponent(
          workspaceId
        )}&taskId=${encodeURIComponent(invite.taskId)}&shareId=${encodeURIComponent(
          invite.code
        )}`;

        await emailjs.send(
          "service_mexk2nq",
          "template_v6ojdzn",
          {
            to_email: invite.email,
            to_name: String(invite.email || "").split("@")[0],
            from_name: invite.invitedByName || inviterName,
            from_email: invite.invitedByEmail || user?.email || "",
            reply_to: invite.invitedByEmail || user?.email || "",
            task_title: invite.taskTitle || "Shared task",
            task_code: invite.taskCode || "",
            task_status: "",
            task_priority: "",
            task_due_date: "",
            project_name: invite.projectName || "",
            workspace_id: workspaceId,
            share_id: invite.code,
            message: `${invite.invitedByName || inviterName} re-sent you a task invite on Workfine. Expires in 7 days.`,
            invite_link: taskInviteLink,
            task_link: taskInviteLink,
            workspace_name: "Workfine Task Share",
            invite_code: invite.code,
            role: "Task viewer",
            expires_in: "7 days",
          },
          { publicKey: "meHwiauyfE3xFWE66" }
        );
      } else {
        const inviteLink = `${window.location.origin}/join/${invite.code}`;

        await emailjs.send(
          "service_mexk2nq",
          "template_tbhiftp",
          {
            to_email: invite.email,
            to_name: String(invite.email || "").split("@")[0],
            from_name: invite.invitedByName || inviterName,
            reply_to: invite.invitedByEmail || user?.email || "",
            workspace_name:
              invite.workspaceName ||
              workspaceData?.name ||
              "Workfine Workspace",
            invite_link: inviteLink,
            invite_code: invite.code,
            expires_in: "7 days",
            role: invite.role || "member",
            message: `${invite.invitedByName || inviterName} re-sent you an invite to join their workspace on Workfine. This invite expires in 7 days.`,
          },
          { publicKey: "meHwiauyfE3xFWE66" }
        );
      }

      showToast(`✓ Invite re-sent to ${invite.email}`);
    } catch (err) {
      console.error("[TeamPage] resendInvite error:", err);
      // Rollback cooldown on failure
      setResendCooldowns((prev) => {
        const next = { ...prev };
        delete next[invite.code];
        return next;
      });
      setRecentlyResentCode(null);
      showToast("Failed to resend invite. Please try again.");
    } finally {
      setResendingCode(null);
    }
  }



  function copyWorkspaceId() {
    navigator.clipboard.writeText(workspaceId ?? "").then(() => {
      setCopiedWid(true);
      setTimeout(() => setCopiedWid(false), 2000);
      showToast("Workspace ID copied to clipboard");
    });
  }

  // ── Derived stats ─────────────────────────────────────────────────────────

    const activeCount = visibleMembers.length;
  const workspaceUserCount = activeMembersRaw.length;
  const guestCount = externalGuests.length;
  const activePendingCount = pendingInvites.filter(
    (i) => !isExpired(i.expiresAt)
  ).length;
  const expiredInvitesCount = pendingInvites.filter((i) =>
    isExpired(i.expiresAt)
  ).length;
  const pendingCount = pendingInvites.length;
  const plan = workspaceData?.plan ?? "free";
  const seatLimit =
    typeof (workspaceData as any)?.seatLimit === "number"
      ? (workspaceData as any).seatLimit
      : plan === "pro"
        ? Infinity
        : 10;


   const STATS = [
    {
      label: "Workspace Users",
      value: workspaceUserCount,
      icon: Users,
      bg: "bg-violet-100",
      color: "text-violet-600",
    },
    {
      label: "External Guests",
      value: guestCount,
      icon: Shield,
      bg: "bg-blue-100",
      color: "text-blue-600",
    },
    {
      label:
        expiredInvitesCount > 0
          ? `Pending (${activePendingCount}) · Expired (${expiredInvitesCount})`
          : "Pending Invites",
      value: activePendingCount,
      icon: Clock,
      bg: "bg-orange-100",
      color: "text-orange-500",
    },
    {
      label: "Workspace Plan",
      value: plan === "pro" ? "Pro" : "Free",
      icon: Star,
      bg: "bg-emerald-100",
      color: "text-emerald-600",
    },
  ];


  const wsName =
    workspaceData?.name ??
    `${user?.displayName ?? user?.email?.split("@")[0] ?? "My"}'s Workspace`;
  const canInviteWorkspaceMembers = myRole === "owner" || myRole === "admin";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="ml-0 bg-[#f4f5f7] min-h-screen overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 pt-14 pb-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
              People & Access
            </h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Manage workspace members, external guests, roles, and invitations.
            </p>
          </div>

                    {canInviteWorkspaceMembers && (
            <button
              type="button"
              onClick={() => setShowInvite(true)}
              disabled={!workspaceId || showSkeleton}
              style={{ backgroundColor: "#4C28EE" }}
              className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <UserPlus size={16} />
              Invite Workspace Member
            </button>
          )}

        </div>

        {/* Educational Banner */}
        <div className="mb-8 bg-violet-50 border border-violet-100 rounded-2xl p-5 flex items-start gap-4 shadow-sm">
          <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Users size={20} className="text-violet-600" />
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-800">
              Workspace Members vs External Guests
            </h3>
            <p className="text-sm text-slate-600 mt-1">
              Workspace members have full workspace-level access. Project collaborators
              appear here as external guests and only have access to the specific projects
              shared with them.
            </p>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {showSkeleton
            ? Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={`team-stat-skel-${i}`}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-4"
                  aria-hidden="true"
                >
                  <SkeletonBox
                    width={40}
                    height={40}
                    className="rounded-xl flex-shrink-0"
                  />
                  <div className="flex-1">
                    <SkeletonBox height={22} width={48} className="mb-1.5" />
                    <SkeletonBox height={10} width={90} />
                  </div>
                </div>
              ))
            : STATS.map((s) => (
                <div
                  key={s.label}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-4"
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${s.bg}`}
                  >
                    <s.icon size={20} className={s.color} />
                  </div>

                  <div>
                    <p className="text-2xl font-bold text-slate-800">
                      {s.value}
                    </p>
                    <p className="text-xs text-slate-400">{s.label}</p>
                  </div>
                </div>
              ))}
        </div>

        {/* Main grid */}
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* LEFT — Members list */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-semibold text-slate-800">
                Workspace Members
              </h2>

              {showSkeleton ? (
                <SkeletonBox height={18} width={28} className="rounded-full" />
              ) : (
                <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">
                  {activeCount}
                </span>
              )}
            </div>

            {/* Search */}
            <div className="relative mb-4">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={15}
              />
              <input
                type="text"
                placeholder="Search members, guests, or projects..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-600 focus:outline-none focus:border-violet-400 transition-colors"
              />
            </div>

            {/* Members */}
            {showSkeleton ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={`member-skel-${i}`}
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4"
                    aria-hidden="true"
                  >
                    <div className="flex items-center gap-3">
                      <SkeletonBox
                        width={40}
                        height={40}
                        circle
                        className="flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <SkeletonBox height={12} className="w-1/3 mb-1.5" />
                        <SkeletonBox height={10} className="w-2/3" />
                      </div>
                      <SkeletonBox
                        height={16}
                        width={56}
                        className="rounded-full flex-shrink-0"
                      />
                    </div>

                    <div className="flex items-center gap-4 mt-2">
                      <SkeletonBox height={10} width={90} />
                      <SkeletonBox height={10} width={110} />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 &&
              visibleMembers.length === 0 &&
              filteredGuests.length === 0 &&
              externalGuests.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 border-dashed py-20 flex flex-col items-center justify-center gap-3">
                <Users size={48} className="text-violet-200" strokeWidth={1} />

                <p className="text-sm font-medium text-slate-700">
                  No workspace teammates yet
                </p>

                <p className="text-xs text-slate-400 text-center max-w-xs">
                  Invite workspace members to collaborate across your full workspace.
                  Project-only collaborators will appear below as external guests.
                </p>

                {canInviteWorkspaceMembers && (
                  <button
                    type="button"
                    onClick={() => setShowInvite(true)}
                    disabled={!workspaceId}
                    className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <UserPlus size={16} />
                    Invite Workspace Member
                  </button>
                )}
              </div>
            ) : filtered.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 py-12 flex flex-col items-center gap-2">
                <FolderOpen
                  size={36}
                  className="text-slate-300"
                  strokeWidth={1}
                />

                {search.trim() ? (
                  <p className="text-sm text-slate-400">
                    No people match your search
                  </p>
                ) : (
                  <>
                    <p className="text-sm font-medium text-slate-700">
                      No workspace teammates yet
                    </p>

                    <p className="text-xs text-slate-400 text-center max-w-xs">
                      Invite workspace members to collaborate across your full workspace.
                    </p>

                    {canInviteWorkspaceMembers && (
                      <button
                        type="button"
                        onClick={() => setShowInvite(true)}
                        disabled={!workspaceId}
                        className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-violet-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <UserPlus size={14} />
                        Invite Workspace Member
                      </button>
                    )}
                  </>
                )}
              </div>
            ) : (
                            <div className="space-y-3">
                {/* Fix #11 — render the owner at the top (read-only). */}
                {ownerMember && !search.trim() && (
                  <div className="bg-white rounded-2xl border border-violet-100 shadow-sm p-4">
                    <div className="flex items-center gap-3">
                                            <div className="relative flex-shrink-0">
                        {resolveAvatarPhoto((ownerMember as any).photoURL) ? (
                          <img
                            src={resolveAvatarPhoto((ownerMember as any).photoURL)}
                            alt={ownerMember.displayName || ownerMember.email}
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 rounded-full object-cover ring-1 ring-black/5"
                            onError={(e) => {
                              const img = e.currentTarget as HTMLImageElement;
                              img.style.display = "none";
                              const fb =
                                img.nextElementSibling as HTMLElement | null;
                              if (fb) fb.style.display = "flex";
                            }}
                          />
                        ) : null}

                        <div
                          className={`w-10 h-10 rounded-full items-center justify-center text-white font-semibold text-sm ring-1 ring-black/5 select-none ${
                            resolveAvatarPhoto((ownerMember as any).photoURL)
                              ? "hidden"
                              : "flex"
                          }`}
                          style={{
                            background: monogramGradient(
                              String(ownerMember.email || "")
                                .trim()
                                .toLowerCase() ||
                                String(ownerMember.displayName || "?")
                                  .trim()
                                  .toLowerCase(),
                            ),
                            letterSpacing: "0.02em",
                          }}
                        >
                          {monogramInitials(
                            ownerMember.displayName,
                            ownerMember.email,
                          )}
                        </div>

                        {isOnline((ownerMember as any).lastActive) && (
                          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">
                          <span className="mr-1">👑</span>
                          {ownerMember.displayName || ownerMember.email}
                          {ownerMember.userId === user?.uid && (
                            <span className="ml-1 text-xs text-slate-400 font-normal">
                              (you)
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-400 truncate">
                          {ownerMember.email}
                        </p>
                      </div>

                                            <span
                        style={{ backgroundColor: "#4C28EE" }}
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize flex-shrink-0 ${ROLE_BADGE.owner}`}
                      >
                        owner
                      </span>

                    </div>

                    <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                      <span>
                        Joined{" "}
                        {timeAgo(
                          (ownerMember as any).joinedAt ||
                            workspaceData?.createdAt
                        )}
                      </span>
                      <span>
                        Last active{" "}
                        {timeAgo((ownerMember as any).lastActive)}
                      </span>
                    </div>
                  </div>
                )}

                {filtered.map((member) => {

                  const isOwnerMember = member.userId === ownerUserId;

                  const displayRole =
                    isOwnerMember
                      ? "owner"
                      : member.role === "owner"
                        ? "member"
                        : member.role ?? "member";

                  const isMe = member.userId === user?.uid;

                  const canAct =
                    !isOwnerMember &&
                    !isMe &&
                    canManage(myRole, displayRole);

                  const online = isOnline(member.lastActive);
                                 const initials = monogramInitials(
                    member.displayName,
                    member.email,
                  );


                  const bgColor =
                    member.avatarColor || getAvatarColor(member.userId || "x");

                  const confirmingRemove = confirmRemove === member.userId;

                  return (
                    <div
                      key={member.userId}
                      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 hover:shadow-md transition-all"
                    >
                      <div className="flex items-center gap-3">
                                                              <div className="relative flex-shrink-0">
                          {resolveAvatarPhoto((member as any).photoURL) ? (
                            <img
                              src={resolveAvatarPhoto((member as any).photoURL)}
                              alt={member.displayName || member.email || "User"}
                              referrerPolicy="no-referrer"
                              className="w-10 h-10 rounded-full object-cover ring-1 ring-black/5"
                              onError={(e) => {
                                const img = e.currentTarget as HTMLImageElement;
                                img.style.display = "none";
                                const fb =
                                  img.nextElementSibling as HTMLElement | null;
                                if (fb) fb.style.display = "flex";
                              }}
                            />
                          ) : null}

                          <div
                            className={`w-10 h-10 rounded-full items-center justify-center text-white font-semibold text-sm ring-1 ring-black/5 select-none ${
                              resolveAvatarPhoto((member as any).photoURL)
                                ? "hidden"
                                : "flex"
                            }`}
                            style={{
                              background: monogramGradient(
                                String(member.email || "")
                                  .trim()
                                  .toLowerCase() ||
                                  String(member.displayName || "?")
                                    .trim()
                                    .toLowerCase(),
                              ),
                              letterSpacing: "0.02em",
                            }}
                          >
                            {monogramInitials(member.displayName, member.email)}
                          </div>

                          {online && (
                            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white" />
                          )}
                        </div>



                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">
                            {isOwnerMember && <span className="mr-1">👑</span>}
                            {member.displayName || member.email}
                            {isMe && (
                              <span className="ml-1 text-xs text-slate-400 font-normal">
                                (you)
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-slate-400 truncate">
                            {member.email}
                          </p>
                        </div>

                                                <span
                          style={displayRole === "owner" ? { backgroundColor: "#4C28EE" } : undefined}
                          className={`text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize flex-shrink-0 ${
                            ROLE_BADGE[displayRole] ?? ROLE_BADGE.member
                          }`}
                        >
                          {displayRole}
                        </span>

                      </div>

                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                        {member.joinedAt && (
                          <span>Joined {timeAgo(member.joinedAt)}</span>
                        )}
                        <span>Last active {timeAgo(member.lastActive)}</span>
                      </div>

                      {canAct && !confirmingRemove && (
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-50">
                                                    <div
                            className="relative"
                            ref={
                              roleMenuFor === member.userId
                                ? roleMenuRef
                                : undefined
                            }
                          >
                            <button
                              onClick={() =>
                                setRoleMenuFor(
                                  roleMenuFor === member.userId
                                    ? null
                                    : member.userId
                                )
                              }
                              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 border border-slate-200 rounded-lg px-2.5 py-1.5 transition-colors"
                            >
                              Change Role <ChevronDown size={12} />
                            </button>

                            {roleMenuFor === member.userId && (
                              <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 w-44 overflow-hidden">
                                {["admin", "member", "viewer"]
                                  .filter((r) => r !== displayRole)
                                  .map((r) => (
                                    <button
                                      key={r}
                                      onClick={() =>
                                        changeRole(
                                          member.userId,
                                          member.displayName ||
                                            member.email ||
                                            "Member",
                                          r
                                        )
                                      }
                                      className="w-full px-4 py-2 text-xs text-left text-slate-700 hover:bg-violet-50 hover:text-violet-700 capitalize transition-colors"
                                    >
                                      {r}
                                    </button>
                                  ))}
                                {myRole === "owner" && (
                                  <button
                                    onClick={() =>
                                      transferOwnership(
                                        member.userId,
                                        member.displayName ||
                                          member.email ||
                                          "Member"
                                      )
                                    }
                                    className="w-full px-4 py-2 text-xs text-left text-amber-700 hover:bg-amber-50 capitalize transition-colors border-t border-slate-100 font-semibold"
                                  >
                                    Transfer Ownership…
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => setConfirmRemove(member.userId)}
                            className="text-xs text-red-500 hover:text-red-700 border border-red-100 hover:border-red-300 rounded-lg px-2.5 py-1.5 transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                      )}

                      {confirmingRemove && (
                        <div className="mt-3 pt-3 border-t border-slate-100 bg-red-50 rounded-xl p-3">
                          <p className="text-xs text-slate-700 mb-2">
                            Remove{" "}
                            <span className="font-semibold">
                              {member.displayName ||
                                member.email ||
                                "this member"}
                            </span>{" "}
                            from the workspace?
                          </p>

                          <div className="flex gap-2">
                            <button
                              onClick={() => setConfirmRemove(null)}
                              className="flex-1 text-xs py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-white transition-colors"
                            >
                              Cancel
                            </button>

                            <button
                              onClick={() =>
                                removeMember(
                                  member.userId,
                                  member.displayName ||
                                    member.email ||
                                    "Member"
                                )
                              }
                              className="flex-1 text-xs py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* External Guests */}
            {!showSkeleton && externalGuests.length > 0 && (
              <div className="mt-8">
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-sm font-semibold text-slate-800">
                    External Guests
                  </h2>
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                    {filteredGuests.length}
                  </span>
                </div>

                {filteredGuests.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200 py-10 flex flex-col items-center gap-2">
                    <FolderOpen
                      size={32}
                      className="text-slate-300"
                      strokeWidth={1}
                    />
                    <p className="text-sm text-slate-400">
                      No guests match your search
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredGuests.map((guest) => {
                                                            const guestId = guest.userId || guest.uid || guest.email;
                      const activeProjects = getActiveGuestProjects(guest);
                      const activeTasks = getActiveGuestTasks(guest);
                      const primaryProject = activeProjects[0] as any;
                      const primaryTask = activeTasks[0] as any;

                      const displayRole =
                        primaryProject?.role ??
                        (activeTasks.length > 0 ? "Task guest" : "viewer");

                      // FAANG-grade: derive Pending/Active from the nested
                      // task/project entries themselves — this self-heals
                      // even when the root `status` field is stale, and
                      // updates in real time the instant a share doc flips
                      // to "active" (because AppDataContext re-emits the
                      // people doc on every nested change).
                      const hasAnyAcceptedAccess =
                        activeProjects.length > 0 || activeTasks.length > 0;

                      const hasAcceptedFlag =
                        guest.accepted === true ||
                        guest.acceptedAt != null ||
                        Boolean(guest.userId || guest.uid);

                      const isPending = !(hasAnyAcceptedAccess || hasAcceptedFlag);



                      const initials = (
                        guest.displayName ||
                        guest.email ||
                        "?"
                      )[0].toUpperCase();

                      const bgColor =
                        guest.avatarColor || getAvatarColor(guestId || "guest");

                      const online = isOnline(guest.lastActive);
                                            // Count assignee-only mentions (no accepted share) — shown as a soft hint, not as access.
                      const assigneeOnlyCount = Object.values(
                        (guest.tasks ?? {}) as Record<string, any>
                      ).filter((t: any) => {
                        const source = String(t?.source ?? "").toLowerCase();
                        return source === "assignee";
                      }).length;
                                            return (
                        <div
                          key={guestId}
                          className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 hover:shadow-md transition-all"
                        >
                          <div className="flex items-center gap-3">
                            <div className="relative flex-shrink-0">
                                                            <GuestAvatar
                                uid={harvestGuestUid(guest)}
                                email={harvestGuestEmail(guest)}
                                initials={initials}
                                bgColor={bgColor}
                                displayName={guest.displayName || guest.email || "Guest"}
                                isGoogle={isGuestGoogleAccount(guest)}
                                shareRefs={harvestGuestShareRefs(guest)}
                              />


                              {online && (
                                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white" />
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-800 truncate">
                                {guest.displayName || guest.email}
                              </p>
                              <p className="text-xs text-slate-400 truncate">
                                {guest.email}
                              </p>
                            </div>

                                                        <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize flex-shrink-0 ${
                                isPending
                                  ? "bg-amber-100 text-amber-700"
                                  : activeTasks.length > 0 && activeProjects.length === 0
                                    ? "bg-indigo-100 text-indigo-700"
                                    : "bg-blue-100 text-blue-700"
                              }`}
                            >
                              {isPending
                                ? "Pending"
                                : activeTasks.length > 0 && activeProjects.length === 0
                                  ? "Task guest"
                                  : "Project-only"}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 mt-3 text-xs text-slate-400">
                            {activeProjects.length > 0 && (
                              <span>
                                Access to{" "}
                                <span className="font-semibold text-slate-600">
                                  {activeProjects.length}
                                </span>{" "}
                                project{activeProjects.length === 1 ? "" : "s"}
                              </span>
                            )}

                            {activeTasks.length > 0 && (
                              <span>
                                Access to{" "}
                                <span className="font-semibold text-slate-600">
                                  {activeTasks.length}
                                </span>{" "}
                                task{activeTasks.length === 1 ? "" : "s"}
                              </span>
                            )}

                            {primaryProject?.projectName && (
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                                {primaryProject.projectName}
                              </span>
                            )}

                            {!primaryProject && primaryTask?.taskTitle && (
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full truncate max-w-[180px]">
                                {primaryTask.taskTitle}
                              </span>
                            )}

                                                        {activeProjects.length + activeTasks.length > 1 && (
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full">
                                +{activeProjects.length + activeTasks.length - 1} more
                              </span>
                            )}

                            {assigneeOnlyCount > 0 && (
                              <span
                                className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full"
                                title="This person is mentioned as an assignee on tasks but has not been granted access. They cannot sign in to view these tasks until invited."
                              >
                                Mentioned on {assigneeOnlyCount} task
                                {assigneeOnlyCount === 1 ? "" : "s"} (no access)
                              </span>
                            )}
                          </div>



                          <div className="flex items-center justify-between mt-2">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize ${
                                ROLE_BADGE[displayRole] ?? ROLE_BADGE.viewer
                              }`}
                            >
                              {displayRole}
                            </span>

                            <span className="text-xs text-slate-400">
                              Last active {timeAgo(guest.lastActive)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT — Pending Invites + Workspace Info */}
          <div className="w-full lg:w-80 flex-none flex flex-col gap-4">
            {/* Pending Invites */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-800">
                  Pending Invites
                </h3>

                {showSkeleton ? (
                  <SkeletonBox height={18} width={24} className="rounded-full" />
                ) : (
                  pendingCount > 0 && (
                    <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-medium">
                      {pendingCount}
                    </span>
                  )
                )}
              </div>

              {cancelError && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-xl text-xs flex items-center justify-between">
                  <span>{cancelError}</span>
                  <button
                    onClick={() => setCancelError(null)}
                    className="text-red-400 hover:text-red-600 ml-2"
                  >
                    ✕
                  </button>
                </div>
              )}

                            {showSkeleton ? (
                <div className="space-y-3">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div
                      key={`invite-skel-${i}`}
                      className="border border-slate-100 rounded-xl p-3 flex flex-col gap-2"
                      aria-hidden="true"
                    >
                      <div className="flex items-center justify-between">
                        <SkeletonBox height={12} className="flex-1 max-w-[140px]" />
                        <SkeletonBox
                          height={16}
                          width={48}
                          className="rounded-full flex-shrink-0 ml-2"
                        />
                      </div>

                      <SkeletonBox height={9} width={160} />

                      <div className="flex gap-2 mt-1">
                        <SkeletonBox height={24} className="flex-1 rounded-lg" />
                        <SkeletonBox height={24} className="flex-1 rounded-lg" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                (() => {
                  const q = search.toLowerCase().trim();
                  const filteredInvites = q
                    ? pendingInvites.filter((i) =>
                        (i.email || "").toLowerCase().includes(q)
                      )
                    : pendingInvites;

                  if (filteredInvites.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center py-8 gap-2">
                        <div className="text-2xl">📭</div>
                        <p className="text-xs text-slate-400">
                          {q ? "No invites match your search" : "No pending invites"}
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-3">
                      {filteredInvites.map((inv) => {
                        const expired = isExpired(inv.expiresAt);
                        const isCancelling = cancellingCode === inv.code;

                        return (
                          <div
                            key={inv.code}
                            className="border border-slate-100 rounded-xl p-3 flex flex-col gap-2"
                          >
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-bold text-slate-700 truncate mr-2">
                                {inv.email}
                              </p>

                              {expired ? (
                                <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                                  Expired
                                </span>
                              ) : (
                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 capitalize ${
                                    ROLE_BADGE[inv.role] ?? ROLE_BADGE.member
                                  }`}
                                >
                                  {inv.role}
                                </span>
                              )}
                            </div>

                                                       <p className="text-[10px] text-slate-400">
                              {(inv as any).inviteType === "task" ? (
                                <>
                                  Task invite
                                  {(inv as any).taskTitle
                                    ? ` · ${(inv as any).taskTitle}`
                                    : ""}{" "}
                                  · Sent {timeAgo(inv.createdAt)}
                                </>
                              ) : (
                                <>
                                  Sent {timeAgo(inv.createdAt)} · Code:{" "}
                                  <span className="font-mono">
                                    {inv.inviteCode || inv.code}
                                  </span>
                                </>
                              )}
                            </p>


                                                        {(() => {
                              const lastSent = resendCooldowns[inv.code] ?? 0;
                              const remainingMs = 30_000 - (Date.now() - lastSent);
                              const onCooldown = remainingMs > 0;
                              const remainingSec = Math.ceil(remainingMs / 1000);
                              const isResending = resendingCode === inv.code;
                              const justSent = recentlyResentCode === inv.code;

                              const expiryMs =
                                typeof (inv.expiresAt as any)?.toMillis === "function"
                                  ? (inv.expiresAt as any).toMillis()
                                  : typeof (inv.expiresAt as any)?.seconds === "number"
                                    ? (inv.expiresAt as any).seconds * 1000
                                    : inv.expiresAt
                                      ? new Date(inv.expiresAt as any).getTime()
                                      : 0;

                              const daysLeft = expiryMs
                                ? Math.max(
                                    0,
                                    Math.ceil((expiryMs - Date.now()) / 86_400_000)
                                  )
                                : null;

                              return (
                                <>
                                  {daysLeft !== null && !expired && (
                                    <p className="text-[10px] text-slate-400 -mt-1 mb-0.5">
                                      Expires in {daysLeft} day{daysLeft === 1 ? "" : "s"}
                                    </p>
                                  )}

                                  <div className="flex gap-2 mt-1">
                                    <button
                                      onClick={() => resendInvite(inv)}
                                      disabled={
                                        !!cancellingCode ||
                                        isResending ||
                                        onCooldown ||
                                        justSent
                                      }
                                      className={`flex-1 text-[10px] py-1.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-1 ${
                                        justSent
                                          ? "bg-emerald-50 text-emerald-600"
                                          : onCooldown
                                            ? "text-slate-400 bg-slate-50 cursor-not-allowed"
                                            : "text-violet-600 hover:bg-violet-50 disabled:opacity-50"
                                      }`}
                                      title={
                                        onCooldown
                                          ? `Please wait ${remainingSec}s`
                                          : "Re-send the invite email and extend expiry by 7 days"
                                      }
                                    >
                                      {isResending ? (
                                        <>
                                          <svg
                                            className="animate-spin h-3 w-3"
                                            xmlns="http://www.w3.org/2000/svg"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                          >
                                            <circle
                                              className="opacity-25"
                                              cx="12"
                                              cy="12"
                                              r="10"
                                              stroke="currentColor"
                                              strokeWidth="4"
                                            />
                                            <path
                                              className="opacity-75"
                                              fill="currentColor"
                                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                            />
                                          </svg>
                                          Sending...
                                        </>
                                      ) : justSent ? (
                                        <>
                                          <Check size={11} />
                                          Sent
                                        </>
                                      ) : onCooldown ? (
                                        `Resend in ${remainingSec}s`
                                      ) : (
                                        "Resend"
                                      )}
                                    </button>


                              <button
                                onClick={() => handleCancelInvite(inv.code)}
                                disabled={!!cancellingCode}
                                className={`flex-1 text-[10px] py-1.5 rounded-lg border font-medium transition-colors flex items-center justify-center gap-1 ${
                                  isCancelling
                                    ? "border-slate-200 text-slate-400 bg-slate-50 cursor-wait"
                                    : "border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-50"
                                }`}
                              >
                                                              {isCancelling ? (
                                  <>
                                    <svg
                                      className="animate-spin h-3 w-3 text-slate-400"
                                      xmlns="http://www.w3.org/2000/svg"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                    >
                                      <circle
                                        className="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                      />
                                      <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                      />
                                    </svg>
                                    Cancelling...
                                  </>
                                ) : (
                                  "Cancel"
                                )}
                              </button>
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()
              )}
            </div>




            {/* Workspace Info */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">
                Workspace Info
              </h3>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-400">Workspace ID</p>

                    {showSkeleton ? (
                      <SkeletonBox height={14} width={80} className="mt-1" />
                    ) : (
                                                                                        <p className="text-sm font-mono font-bold text-violet-700">
                        {resolveWorkspaceDisplayId(workspaceId, workspaceData, user?.uid)}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={copyWorkspaceId}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                    title="Copy workspace ID"
                  >
                    {copiedWid ? (
                      <Check size={15} className="text-emerald-500" />
                    ) : (
                      <Copy size={15} />
                    )}
                  </button>
                </div>

                <div>
                  <p className="text-xs text-slate-400">Workspace Name</p>

                  {showSkeleton ? (
                    <SkeletonBox height={14} width={160} className="mt-1" />
                  ) : (
                    <p className="text-sm font-medium text-slate-700">
                      {wsName}
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-xs text-slate-400">Owner</p>

                  {showSkeleton ? (
                    <SkeletonBox height={14} width={120} className="mt-1" />
                  ) : (
                    <p className="text-sm font-medium text-slate-700">
                      {ownerMember?.displayName ||
                        ownerMember?.email ||
                        workspaceData?.ownerEmail ||
                        user?.displayName ||
                        user?.email ||
                        "Workspace owner"}
                    </p>
                  )}
                </div>

                <div>
                  <p className="text-xs text-slate-400">Workspace Users</p>

                                    {showSkeleton ? (
                    <SkeletonBox height={14} width={140} className="mt-1" />
                  ) : (
                    <p className="text-sm font-medium text-slate-700">
                      {workspaceUserCount} /{" "}
                      {seatLimit === Infinity ? "∞" : seatLimit} users{" "}
                      <span className="text-slate-400 font-normal">
                        ({plan === "pro" ? "Pro" : "Free"} plan)
                      </span>
                    </p>
                  )}

                </div>

                                               {!showSkeleton && plan !== "pro" && (
                  <button
                    onClick={() => setShowUpgrade(true)}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-colors hover:opacity-90 active:scale-[0.98]"
                    style={{
                      backgroundColor: "#4C28EE",
                    }}
                  >
                    ✨ Upgrade to Pro
                  </button>
                )}


              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Fix #3 — Upgrade dialog */}
      {showUpgrade && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowUpgrade(false);
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-2">
              Upgrade to Pro
            </h2>
            <p className="text-sm text-slate-500 mb-4">
              Unlock unlimited workspace members, unlimited projects, and
              priority support. Billing is currently set to manual — please
              contact your administrator to enable the Pro plan.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowUpgrade(false)}
                className="px-4 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
              <a
                href="mailto:billing@wurkfine.app?subject=Upgrade%20to%20Pro"
                className="px-4 py-2 text-sm rounded-lg text-white font-semibold"
                style={{
                  background: "linear-gradient(135deg, #8b5cf6, #6d28d9)",
                }}
              >
                Contact Billing
              </a>
            </div>
          </div>
        </div>
      )}


      {/* Invite Modal */}
      {showInvite && workspaceId && (
        <InviteMemberModal
          onClose={() => setShowInvite(false)}
          workspaceId={workspaceId}
          workspaceName={wsName}
          members={members}
          pendingInvites={pendingInvites}
        />
      )}

      {/* Toast */}
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

