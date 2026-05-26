import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase/config";
import { useAuth } from "../context/AuthContext";

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

function avatarColor(uid: string): string {
  if (!uid) return AVATAR_COLORS[0];

  const index = Math.abs(uid.charCodeAt(0)) % AVATAR_COLORS.length;

  return AVATAR_COLORS[index];
}

function normalizeEmail(email?: string | null): string {
  return String(email || "").trim().toLowerCase();
}

function getDisplayName(user: any): string {
  return user?.displayName || user?.email?.split("@")[0] || "Member";
}
function getRolePermissions(role: "admin" | "member" | "viewer") {
  if (role === "admin") {
    return {
      canView: true,
      canComment: true,
      canEdit: true,
      canDelete: true,
      canInvite: true,
      canCreateProjects: true,
      canDeleteProjects: true,
      canInviteMembers: true,
      canManageTasks: true,
      canViewOnly: false,
    };
  }

  if (role === "member") {
    return {
      canView: true,
      canComment: true,
      canEdit: false,
      canDelete: false,
      canInvite: false,
      canCreateProjects: false,
      canDeleteProjects: false,
      canInviteMembers: false,
      canManageTasks: false,
      canViewOnly: false,
    };
  }

  return {
    canView: true,
    canComment: false,
    canEdit: false,
    canDelete: false,
    canInvite: false,
    canCreateProjects: false,
    canDeleteProjects: false,
    canInviteMembers: false,
    canManageTasks: false,
    canViewOnly: true,
  };
}

function getTimestampMillis(value: any): number {
  if (!value) return 0;

  if (typeof value?.toMillis === "function") {
    return value.toMillis();
  }

  if (typeof value?.seconds === "number") {
    return value.seconds * 1000;
  }

  const parsed = new Date(value).getTime();

  return Number.isFinite(parsed) ? parsed : 0;
}

type PageState = "loading" | "invalid" | "used" | "valid" | "joining" | "done";

export default function JoinWorkspacePage() {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const { user, loading: authLoading, setWorkspaceId } = useAuth();
  const navigate = useNavigate();

  const [pageState, setPageState] = useState<PageState>("loading");
  const [invite, setInvite] = useState<any>(null);
  const [joinError, setJoinError] = useState("");

  // ── 1. Fetch & validate invite ─────────────────────────────────────────────
  useEffect(() => {
    if (authLoading || !inviteCode) return;

    let cancelled = false;

    async function load() {
      try {
        setJoinError("");

        const globalInviteRef = doc(db, "invites", inviteCode);
        const snap = await getDoc(globalInviteRef);

        if (cancelled) return;

        if (!snap.exists()) {
          setPageState("invalid");
          return;
        }

        const data = {
          id: snap.id,
          code: snap.id,
          inviteCode: snap.id,
          ...snap.data(),
        } as any;

        const expiresAtMs = getTimestampMillis(data.expiresAt);

        if (expiresAtMs && expiresAtMs < Date.now()) {
          setPageState("invalid");
          return;
        }

                if (!data.workspaceId) {
          setPageState("invalid");
          return;
        }

        /**
         * Allow the same invited user to reopen an accepted invite.
         * This repairs cases where AuthContext previously reset them
         * back to personal workspace after refresh.
         */
        if (data.status && data.status !== "pending") {
          const signedInEmail = normalizeEmail(user?.email);

          const inviteEmail = normalizeEmail(
            data.email ||
              data.emailLower ||
              data.email_lowercase ||
              data.invitedEmail ||
              data.invitedEmailLower ||
              data.acceptedByEmail ||
              data.acceptedByEmailLower
          );

          const acceptedByUid = String(data.acceptedByUid || data.acceptedBy || "");

          const belongsToCurrentUser =
            (!!user?.uid && acceptedByUid === user.uid) ||
            (!!signedInEmail && !!inviteEmail && signedInEmail === inviteEmail);

          if (!belongsToCurrentUser) {
            setPageState("used");
            return;
          }
        }

        setInvite(data);
        setPageState("valid");
      } catch (error) {
        console.error("[JoinPage] fetch error:", error);

        if (!cancelled) {
          setPageState("invalid");
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [inviteCode, authLoading]);

  // ── 2. Accept invite ───────────────────────────────────────────────────────
  async function acceptInvite() {
    if (!user || !invite || !inviteCode) return;

    setPageState("joining");
    setJoinError("");

    try {
      const workspaceId = String(invite.workspaceId || "").trim();

      const role = String(invite.role || "member").toLowerCase() as
        | "admin"
        | "member"
        | "viewer";

      const safeRole: "admin" | "member" | "viewer" =
        role === "admin" || role === "viewer" ? role : "member";

      const uid = user.uid;

      if (!workspaceId) {
        throw new Error("Invite is missing workspaceId.");
      }

      const currentEmail = normalizeEmail(user.email);

      const invitedEmail = normalizeEmail(
        invite.email ||
          invite.emailLower ||
          invite.email_lowercase ||
          invite.invitedEmail ||
          invite.invitedEmailLower
      );

      if (invitedEmail && currentEmail && invitedEmail !== currentEmail) {
        setJoinError(
          `This invite was sent to ${invitedEmail}. Please sign in with that email.`
        );
        setPageState("valid");
        return;
      }

      const displayName = getDisplayName(user);
      const email = user.email ?? "";
      const emailLower = normalizeEmail(email);
      const photoURL = user.photoURL ?? "";

           const memberRef = doc(db, "workspaces", workspaceId, "members", uid);
                 const invitedEmailMemberRef =
        invitedEmail && invitedEmail !== uid
          ? doc(db, "workspaces", workspaceId, "members", invitedEmail)
          : null;

      const userRef = doc(db, "users", uid);
      const globalInviteRef = doc(db, "invites", inviteCode);
      const wsInviteRef = doc(
        db,
        "workspaces",
        workspaceId,
        "invites",
        inviteCode
      );

      console.log("[JoinPage] STEP 1: creating member doc", {
        workspaceId,
        uid,
        inviteCode,
      });

      /**
       * STEP 1:
       * Create/update workspace member document FIRST.
       * This gives the invited user real access to the workspace before
       * users/{uid}.workspaceId changes.
       */
        const memberPayload = {
        uid,
        userId: uid,

        email,
        emailLower,
        email_lowercase: emailLower,

        displayName,
        name: displayName,

        photoURL,
        avatarUrl: photoURL,
        avatarURL: photoURL,
        googlePhotoURL: photoURL,

        avatar: (displayName || email || "M")[0].toUpperCase(),
        avatarColor: avatarColor(uid),

        role: safeRole,
        status: "active",
        workspaceId,

        code: inviteCode,
        inviteCode,
        acceptedInviteCode: inviteCode,

        invitedBy: invite.invitedBy ?? "",
        invitedByUid: invite.invitedByUid ?? invite.invitedBy ?? "",
        invitedByName: invite.invitedByName ?? "",
        invitedByEmail: invite.invitedByEmail ?? "",

        joinedAt: serverTimestamp(),
        acceptedAt: serverTimestamp(),
        lastActive: serverTimestamp(),
        updatedAt: serverTimestamp(),

        permissions: getRolePermissions(safeRole),
      };

      await setDoc(memberRef, memberPayload, { merge: true });

      if (invitedEmailMemberRef) {
        await setDoc(
          invitedEmailMemberRef,
          {
            ...memberPayload,
            migratedToUidMemberDoc: uid,
            duplicateForEmailLookup: true,
          },
          { merge: true }
        );
      }


      console.log("[JoinPage] STEP 1 OK: member doc created");

      console.log("[JoinPage] STEP 2: updating user workspaceId");

      /**
       * STEP 2:
       * Switch user into the invited workspace AFTER member doc exists.
       */
      await setDoc(
        userRef,
        {
          uid,
          userId: uid,

          email,
          emailLower,
          email_lowercase: emailLower,

          displayName,
          name: displayName,

          photoURL,
          avatarUrl: photoURL,
          avatarURL: photoURL,
          googlePhotoURL: photoURL,

          plan: "free",
          workspaceId,

          updatedAt: serverTimestamp(),
          lastActive: serverTimestamp(),
        },
        { merge: true }
      );

      console.log("[JoinPage] STEP 2 OK: user workspace switched");

      /**
       * STEP 3:
       * Mark global invite accepted.
       * Non-blocking because membership already succeeded.
       */
      try {
        console.log("[JoinPage] STEP 3: updating global invite");

        await updateDoc(globalInviteRef, {
          status: "accepted",
          acceptedAt: serverTimestamp(),
          acceptedBy: uid,
          acceptedByUid: uid,
          acceptedByEmail: email,
          acceptedByEmailLower: emailLower,
          updatedAt: serverTimestamp(),
        });

        console.log("[JoinPage] STEP 3 OK: global invite accepted");
      } catch (error: any) {
        console.warn(
          "[JoinPage] STEP 3 SKIPPED: global invite update failed:",
          error?.code || error?.message || error
        );
      }

      /**
       * STEP 4:
       * Mark workspace invite accepted.
       * Non-blocking because membership already succeeded.
       */
      try {
        console.log("[JoinPage] STEP 4: updating workspace invite");

        await updateDoc(wsInviteRef, {
          status: "accepted",
          acceptedAt: serverTimestamp(),
          acceptedBy: uid,
          acceptedByUid: uid,
          acceptedByEmail: email,
          acceptedByEmailLower: emailLower,
          updatedAt: serverTimestamp(),
        });

        console.log("[JoinPage] STEP 4 OK: workspace invite accepted");
      } catch (error: any) {
        console.warn(
          "[JoinPage] STEP 4 SKIPPED: workspace invite update failed:",
          error?.code || error?.message || error
        );
      }

      /**
       * STEP 5:
       * Update app state and redirect.
       */
      setWorkspaceId(workspaceId);
      localStorage.removeItem("pendingInviteCode");

      console.log("[JoinPage] ✅ Joined workspace:", workspaceId, "as:", safeRole);

      setPageState("done");

      setTimeout(() => {
        navigate("/", { replace: true });
      }, 1200);
    } catch (error: any) {
      console.error("[JoinPage] accept error:", error);

      setJoinError(
        error?.code === "permission-denied"
          ? "Permission denied while joining. Please refresh and try again."
          : error?.message || "Failed to join workspace. Please try again."
      );

      setPageState("valid");
    }
  }

  function storeAndGo(path: string) {
    if (inviteCode) {
      localStorage.setItem("pendingInviteCode", inviteCode);
    }

    navigate(path);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-violet-600 to-violet-900 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
        {/* Logo */}
        <div className="mb-7 flex items-center justify-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 shadow-lg">
            <span className="text-sm font-extrabold text-white">W</span>
          </div>

          <span className="text-2xl tracking-tight">
            <span className="font-extrabold text-slate-900">Wurk</span>
            <span className="font-light text-slate-900">fine</span>
          </span>
        </div>

        {/* Loading */}
        {(pageState === "loading" || authLoading) && (
          <div className="py-10 text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-violet-200 border-t-violet-600" />
            <p className="text-sm text-slate-500">
              Verifying your invitation...
            </p>
          </div>
        )}

        {/* Invalid / expired */}
        {pageState === "invalid" && (
          <div className="py-4 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-3xl">
              ❌
            </div>

            <h2 className="mb-2 text-lg font-bold text-slate-800">
              Invalid or Expired Link
            </h2>

            <p className="mb-1 text-sm text-slate-500">
              This invite link is invalid or has expired.
            </p>

            <p className="mb-6 text-xs text-slate-400">
              Please ask your workspace admin to send a new invitation.
            </p>

            <button
              type="button"
              onClick={() => navigate("/login")}
              className="w-full rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700"
            >
              Go to Login
            </button>
          </div>
        )}

        {/* Already used / revoked */}
        {pageState === "used" && (
          <div className="py-4 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-3xl">
              ⚠️
            </div>

            <h2 className="mb-2 text-lg font-bold text-slate-800">
              Invite Already Used
            </h2>

            <p className="mb-6 text-sm text-slate-500">
              This invite has already been accepted or revoked. Please ask your
              admin for a new one.
            </p>

            <button
              type="button"
              onClick={() => navigate("/login")}
              className="w-full rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-700"
            >
              Go to Login
            </button>
          </div>
        )}

        {/* Valid invite */}
        {(pageState === "valid" || pageState === "joining") && invite && (
          <div>
            <div className="mb-6 text-center">
              <div className="mb-3 text-4xl">🎉</div>

              <h2 className="mb-1 text-xl font-bold text-slate-800">
                You've been invited!
              </h2>

              <p className="text-sm text-slate-500">
                <span className="font-semibold text-slate-700">
                  {invite.invitedByName || "Someone"}
                </span>{" "}
                invited you to join the{" "}
                <span className="font-semibold text-violet-700">
                  {invite.workspaceName || invite.workspaceId}
                </span>{" "}
                workspace as a{" "}
                <span className="font-semibold capitalize text-slate-700">
                  {invite.role || "member"}
                </span>
                .
              </p>
            </div>

            <div className="mb-5 space-y-2.5 rounded-2xl bg-slate-50 p-4">
              <Row
                label="Workspace"
                value={invite.workspaceName || invite.workspaceId}
              />

              <Row
                label="Your Role"
                value={
                  <span className="capitalize">
                    {invite.role || "member"}
                  </span>
                }
              />

              <Row label="Invited by" value={invite.invitedByName || "—"} />
            </div>

            {invite.message && (
              <p className="mb-4 rounded-xl bg-slate-50 p-3 text-center text-sm italic text-slate-500">
                "{invite.message}"
              </p>
            )}

            {joinError && (
              <p className="mb-3 text-center text-xs text-red-500">
                {joinError}
              </p>
            )}

            {!user ? (
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => storeAndGo("/login")}
                  className="w-full rounded-xl bg-violet-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-700"
                >
                  Sign In to Accept
                </button>

                <button
                  type="button"
                  onClick={() => storeAndGo("/login")}
                  className="w-full rounded-xl border border-violet-300 py-3 text-sm font-semibold text-violet-700 transition-colors hover:bg-violet-50"
                >
                  Create Account
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={acceptInvite}
                disabled={pageState === "joining"}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-700 disabled:opacity-60"
              >
                {pageState === "joining" ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Joining workspace...
                  </>
                ) : (
                  "Accept Invitation →"
                )}
              </button>
            )}
          </div>
        )}

        {/* Done */}
        {pageState === "done" && (
          <div className="py-6 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">
              ✅
            </div>

            <h2 className="mb-1 text-xl font-bold text-slate-800">
              Welcome to the team!
            </h2>

            <p className="text-sm text-slate-400">
              Redirecting to your dashboard...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-400">{label}</span>
      <span className="font-medium text-slate-700">{value}</span>
    </div>
  );
}
