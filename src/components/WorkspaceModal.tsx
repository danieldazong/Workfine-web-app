import React, { useState } from "react";
import {
  X,
  UserPlus,
  Shield,
  User as UserIcon,
  Eye,
  Crown,
  Trash2,
  Clock,
  Mail,
  Check,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useAppData } from "../context/AppDataContext";
import {
  updateMemberRole,
  removeMember,
  WorkspaceRole,
} from "../lib/firebase/workspaceMembers";
import InviteMemberModal from "./InviteMemberModal";

interface Props {
  onClose: () => void;
}

const ROLE_META: Record<
  WorkspaceRole,
  { label: string; icon: any; color: string; bg: string }
> = {
  owner:  { label: "Owner",  icon: Crown,    color: "text-amber-600",   bg: "bg-amber-50" },
  admin:  { label: "Admin",  icon: Shield,   color: "text-blue-600",    bg: "bg-blue-50" },
  member: { label: "Member", icon: UserIcon, color: "text-emerald-600", bg: "bg-emerald-50" },
  viewer: { label: "Viewer", icon: Eye,      color: "text-orange-500",  bg: "bg-orange-50" },
};

export default function WorkspaceModal({ onClose }: Props) {
  const { user, workspaceId } = useAuth();
  const { members, pendingInvites, workspaceData, cancelInvite } = useAppData();

  const [tab, setTab] = useState<"members" | "pending">("members");
  const [showInvite, setShowInvite] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Find current user's role to decide what UI to show
  const myMembership = members.find((m) => m.userId === user?.uid);
  const myRole: WorkspaceRole = (myMembership?.role as WorkspaceRole) ?? "member";
  const canManage = myRole === "owner" || myRole === "admin";

  const activeMembers  = members.filter((m) => m.status === "active");
  const pendingCount   = pendingInvites.filter((i) => i.status === "pending").length;

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function handleRoleChange(userId: string, newRole: WorkspaceRole) {
    if (!workspaceId) return;
    setError("");
    setBusyId(userId);
    try {
      await updateMemberRole(workspaceId, userId, newRole);
    } catch (e: any) {
      console.error("[WorkspaceModal] role change failed:", e);
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
      console.error("[WorkspaceModal] remove failed:", e);
      setError(e?.message || "Failed to remove member.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancelInvite(code: string) {
    setError("");
    setBusyId(code);
    try {
      await cancelInvite(code);
    } catch (e: any) {
      console.error("[WorkspaceModal] cancel invite failed:", e);
      setError(e?.message || "Failed to cancel invitation.");
    } finally {
      setBusyId(null);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4">
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
          style={{ animation: "fadeInUp 0.2s ease" }}
        >
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-start justify-between flex-shrink-0">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {workspaceData?.name ?? "Workspace"}
              </h2>
              <p className="text-sm text-slate-400 mt-0.5">
                Manage members and invitations
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Tabs + Invite button */}
          <div className="px-6 pt-4 flex items-center justify-between border-b border-slate-100 flex-shrink-0">
            <div className="flex gap-1">
              <button
                onClick={() => setTab("members")}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                  tab === "members"
                    ? "border-violet-600 text-violet-700"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                Members
                <span className="ml-1.5 text-xs text-slate-400">
                  {activeMembers.length}
                </span>
              </button>
              <button
                onClick={() => setTab("pending")}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                  tab === "pending"
                    ? "border-violet-600 text-violet-700"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                Pending
                {pendingCount > 0 && (
                  <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">
                    {pendingCount}
                  </span>
                )}
              </button>
            </div>

            {canManage && (
              <button
                onClick={() => setShowInvite(true)}
                className="mb-2 flex items-center gap-2 px-3 py-1.5 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors"
              >
                <UserPlus size={14} />
                Invite Member
              </button>
            )}
          </div>

          {/* Error banner */}
          {error && (
            <div className="px-6 pt-3 flex-shrink-0">
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                <AlertCircle size={14} />
                <span className="flex-1">{error}</span>
                <button onClick={() => setError("")} className="text-red-500 hover:text-red-700">
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {tab === "members" && (
              <MemberList
                members={activeMembers}
                myUid={user?.uid ?? ""}
                myRole={myRole}
                canManage={canManage}
                busyId={busyId}
                onRoleChange={handleRoleChange}
                onRemove={handleRemove}
              />
            )}

            {tab === "pending" && (
              <PendingList
                invites={pendingInvites}
                canManage={canManage}
                busyId={busyId}
                onCancel={handleCancelInvite}
              />
            )}
          </div>
        </div>

        <style>{`
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(14px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>

      {/* Nested invite modal */}
      {showInvite && workspaceId && (
        <InviteMemberModal
          onClose={() => setShowInvite(false)}
          workspaceId={workspaceId}
          workspaceName={workspaceData?.name ?? "Workspace"}
          members={members}
          pendingInvites={pendingInvites}
        />
      )}
    </>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function MemberList({
  members,
  myUid,
  myRole,
  canManage,
  busyId,
  onRoleChange,
  onRemove,
}: {
  members: any[];
  myUid: string;
  myRole: WorkspaceRole;
  canManage: boolean;
  busyId: string | null;
  onRoleChange: (uid: string, role: WorkspaceRole) => void;
  onRemove: (uid: string, name: string) => void;
}) {
  if (members.length === 0) {
    return (
      <div className="text-center py-10">
        <UserIcon className="mx-auto mb-3 text-slate-300" size={36} />
        <p className="text-sm text-slate-500">No active members yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {members.map((m) => {
        const role = (m.role as WorkspaceRole) ?? "member";
        const meta = ROLE_META[role] ?? ROLE_META.member;
        const Icon = meta.icon;
        const isMe = m.userId === myUid;
        const isBusy = busyId === m.userId;

        // Owners can change any role; admins can change member/viewer only.
        // No one can change the owner's role from the UI.
        const editable =
          canManage &&
          role !== "owner" &&
          !isMe &&
          (myRole === "owner" || (myRole === "admin" && role !== "admin"));

        // Owners cannot be removed; admins can remove only members/viewers.
        const removable =
          canManage &&
          role !== "owner" &&
          !isMe &&
          (myRole === "owner" || (myRole === "admin" && role !== "admin"));

        return (
          <div
            key={m.userId}
            className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors"
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
              style={{ backgroundColor: m.avatarColor || "#8b5cf6" }}
            >
              {m.avatar || (m.displayName?.[0] ?? "M").toUpperCase()}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">
                {m.displayName} {isMe && <span className="text-xs text-slate-400">(you)</span>}
              </p>
              <p className="text-xs text-slate-400 truncate">{m.email}</p>
            </div>

            {/* Role badge or dropdown */}
            {editable ? (
              <select
                disabled={isBusy}
                value={role}
                onChange={(e) => onRoleChange(m.userId, e.target.value as WorkspaceRole)}
                className={`text-xs font-semibold px-2 py-1 rounded-lg border border-slate-200 ${meta.color} bg-white focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50`}
              >
                {myRole === "owner" && <option value="admin">Admin</option>}
                {myRole === "admin"  && <option value="admin">Admin</option>}
                <option value="member">Member</option>
                <option value="viewer">Viewer</option>
              </select>
            ) : (
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold ${meta.bg} ${meta.color}`}>
                <Icon size={12} />
                {meta.label}
              </div>
            )}

            {removable && (
              <button
                onClick={() => onRemove(m.userId, m.displayName)}
                disabled={isBusy}
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                title="Remove member"
              >
                {isBusy ? (
                  <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-red-500 rounded-full animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PendingList({
  invites,
  canManage,
  busyId,
  onCancel,
}: {
  invites: any[];
  canManage: boolean;
  busyId: string | null;
  onCancel: (code: string) => void;
}) {
  const pending = invites.filter((i) => i.status === "pending");

  if (pending.length === 0) {
    return (
      <div className="text-center py-10">
        <Mail className="mx-auto mb-3 text-slate-300" size={36} />
        <p className="text-sm text-slate-500">No pending invitations.</p>
        <p className="text-xs text-slate-400 mt-1">
          Invite teammates to collaborate on this workspace.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {pending.map((inv) => {
        const role = (inv.role as WorkspaceRole) ?? "member";
        const meta = ROLE_META[role] ?? ROLE_META.member;
        const isBusy = busyId === inv.code;

        return (
          <div
            key={inv.code}
            className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
              <Clock className="text-amber-600" size={16} />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">
                {inv.email}
              </p>
              <p className="text-xs text-slate-400 truncate">
                Invited by {inv.invitedByName ?? "Someone"} ·{" "}
                <span className="font-mono">{inv.code}</span>
              </p>
            </div>

            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold ${meta.bg} ${meta.color}`}>
              {meta.label}
            </div>

            {canManage && (
              <button
                onClick={() => onCancel(inv.code)}
                disabled={isBusy}
                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                title="Cancel invitation"
              >
                {isBusy ? (
                  <div className="w-3.5 h-3.5 border-2 border-slate-300 border-t-red-500 rounded-full animate-spin" />
                ) : (
                  <X size={14} />
                )}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
