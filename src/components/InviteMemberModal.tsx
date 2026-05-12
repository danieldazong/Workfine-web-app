import React, { useState } from "react";
import emailjs from "@emailjs/browser";
import {
  doc, setDoc,
  serverTimestamp, Timestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase/config";
import { useAuth } from "../context/AuthContext";
import {
  Shield, User, Eye, X, CheckCircle,
  Copy, Check, AlertTriangle
} from "lucide-react";

// ── EmailJS credentials ──────────────────────────────────────────────────────
const EJ_SERVICE = "service_mexk2nq";
const EJ_TEMPLATE = "template_tbhiftp";
const EJ_PUBLIC_KEY = "meHwiauyfE3xFWE66";


// ── Types ────────────────────────────────────────────────────────────────────
interface Props {
  onClose: () => void;
  workspaceId: string;
  workspaceName: string;
  members: any[];
  pendingInvites: any[];
}

type RoleId = "admin" | "member" | "viewer";

// ── Helpers ──────────────────────────────────────────────────────────────────
function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}

// ── Role options ─────────────────────────────────────────────────────────────
const ROLES: {
  id: RoleId;
  label: string;
  description: string;
  icon: any;
  color: string;
  bg: string;
}[] = [
  {
    id: "admin",
    label: "Admin",
    description: "Can manage projects, tasks, and invite members",
    icon: Shield,
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
  {
    id: "member",
    label: "Member",
    description: "Can create and manage tasks and projects",
    icon: User,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
  },
  {
    id: "viewer",
    label: "Viewer",
    description: "Can view projects and tasks but cannot edit",
    icon: Eye,
    color: "text-orange-500",
    bg: "bg-orange-50",
  },
];

// ── Component ────────────────────────────────────────────────────────────────
export default function InviteMemberModal({
  onClose,
  workspaceId,
  workspaceName,
  members,
  pendingInvites,
}: Props) {
  const { user } = useAuth();

  const [email,   setEmail]   = useState("");
  const [role,    setRole]    = useState<RoleId>("member");
  const [message, setMessage] = useState("");
  const [error,   setError]   = useState("");
  const [sending, setSending] = useState(false);
  const [copied,  setCopied]  = useState(false);

  const [success, setSuccess] = useState<{
    code: string;
    email: string;
    emailFailed: boolean;
  } | null>(null);

  // ── Copy helper ─────────────────────────────────────────────────────────────
  function copyLink(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── Send invite ─────────────────────────────────────────────────────────────
  async function handleSend() {
    setError("");
    const trimmed = email.trim().toLowerCase();

    if (!isValidEmail(trimmed)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (members.some((m) => (m.email || "").toLowerCase() === trimmed)) {
      setError("This email is already a workspace member.");
      return;
    }
    if (pendingInvites.some((i) => (i.email || "").toLowerCase() === trimmed)) {
      setError("An invitation is already pending for this email.");
      return;
    }

    setSending(true);
    let emailFailed = false;

    try {
      const code      = generateInviteCode();
      const inviteLink = `${window.location.origin}/join/${code}`;
      const expiresAt  = Timestamp.fromMillis(
        Date.now() + 7 * 24 * 60 * 60 * 1000
      );

      const inviterName =
  user?.displayName || user?.email?.split("@")[0] || "Someone";

const payload = {
  code,
  inviteCode: code,
  email: trimmed,
  workspaceId,
  workspaceName: workspaceName || "Workfine Workspace",
  invitedBy: user?.uid ?? "",
  invitedByName: inviterName,
  invitedByEmail: user?.email ?? "",
  role,
  message: message.trim(),
  status: "pending",
  createdAt: serverTimestamp(),
  expiresAt,
};


      // ✅ PATH 1 — workspace subcollection
      // Using setDoc + code as document ID so cancelInvite can find it
      await setDoc(
        doc(db, "workspaces", workspaceId, "invites", code),
        payload
      );

      // ✅ PATH 2 — global invites collection
      // Using setDoc + code as document ID (same as before, already correct)
      await setDoc(
        doc(db, "invites", code),
        payload
      );

     // ✅ PATH 3 — Send invite email via EmailJS
try {
  await emailjs.send(
    EJ_SERVICE,
    EJ_TEMPLATE,
    {
      to_email: trimmed,
      to_name: trimmed.split("@")[0],
      from_name: inviterName,
      reply_to: user?.email ?? "",
      workspace_name: workspaceName || "Workfine Workspace",
      invite_link: inviteLink,
      invite_code: code,
      expires_in: "7 days",
      role,
      message:
        message.trim() ||
        "You have been invited to join a Workfine workspace.",
    },
    {
      publicKey: EJ_PUBLIC_KEY,
    }
  );

  console.log("[InviteModal] ✅ EmailJS invitation sent to:", trimmed);
} catch (ejErr: any) {
  console.error("[InviteModal] ❌ EmailJS failed:", ejErr);
  emailFailed = true;
}


      setSuccess({ code, email: trimmed, emailFailed });

    } catch (err: any) {
      console.error("[InviteModal] Invite error:", err);
      setError("Failed to send invitation. Please try again.");
    } finally {
      setSending(false);
    }
  }

  const inviteLink = success
    ? `${window.location.origin}/join/${success.code}`
    : "";

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-auto overflow-hidden"
        style={{ animation: "fadeInUp 0.2s ease" }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Invite Team Member
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">
              Send an invitation to join your workspace
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors mt-0.5"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5">

          {/* ── Success screen ── */}
          {success ? (
            <div className="text-center py-2">
              <div
                className={`w-14 h-14 ${
                  success.emailFailed ? "bg-amber-100" : "bg-emerald-100"
                } rounded-full flex items-center justify-center mx-auto mb-4`}
              >
                {success.emailFailed ? (
                  <AlertTriangle className="text-amber-500" size={26} />
                ) : (
                  <CheckCircle className="text-emerald-600" size={26} />
                )}
              </div>

              <p className="text-base font-semibold text-slate-800 mb-1">
                {success.emailFailed ? "Invite created!" : "Invite sent!"}
              </p>
              <p className="text-sm text-slate-500 mb-4">
                {success.emailFailed ? (
                  <span className="text-amber-600 text-xs font-medium">
                    Email delivery failed — share this link manually
                  </span>
                ) : (
                  <>
                    Invitation sent to{" "}
                    <span className="font-medium text-slate-700">
                      {success.email}
                    </span>
                  </>
                )}
              </p>

              <div className="bg-slate-50 rounded-xl p-4 mb-3">
                <p className="text-xs text-slate-400 mb-1">Invite code</p>
                <p className="font-mono text-xl font-bold tracking-widest text-violet-700">
                  {success.code}
                </p>
              </div>

              <div className="flex items-center gap-2 bg-slate-100 rounded-xl px-3 py-2.5 mb-4">
                <span className="text-xs text-slate-500 truncate flex-1">
                  {inviteLink}
                </span>
                <button
                  onClick={() => copyLink(inviteLink)}
                  className="flex items-center gap-1 text-xs text-violet-600 font-semibold flex-shrink-0"
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? "Copied!" : "Copy Link"}
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setSuccess(null);
                    setEmail("");
                    setMessage("");
                    setError("");
                  }}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
                >
                  Send Another
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>

          ) : (

            /* ── Form ── */
            <div className="space-y-5">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  placeholder="colleague@company.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  className={`w-full border rounded-xl px-4 py-2.5 text-sm text-slate-700
                    focus:outline-none focus:ring-2 focus:ring-violet-500 transition-all ${
                    error ? "border-red-400 bg-red-50" : "border-slate-200"
                  }`}
                />
                {error && (
                  <p className="text-xs text-red-500 mt-1.5">{error}</p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-2">
                  Assign Role
                </label>
                <div className="space-y-2">
                  {ROLES.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setRole(r.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2
                        text-left transition-all ${
                        role === r.id
                          ? "border-violet-500 bg-violet-50"
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center
                          ${r.bg} flex-shrink-0`}
                      >
                        <r.icon size={15} className={r.color} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800">
                          {r.label}
                        </p>
                        <p className="text-xs text-slate-400 leading-tight">
                          {r.description}
                        </p>
                      </div>
                      {role === r.id && (
                        <div className="w-4 h-4 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0">
                          <div className="w-1.5 h-1.5 rounded-full bg-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                  Personal Message{" "}
                  <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <textarea
                  placeholder="Add a personal message to your invitation..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, 200))}
                  rows={2}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5
                    text-sm text-slate-700 focus:outline-none focus:ring-2
                    focus:ring-violet-500 resize-none"
                />
                <p className="text-xs text-slate-400 text-right mt-0.5">
                  {message.length}/200
                </p>
              </div>

              <button
                onClick={handleSend}
                disabled={sending || !email.trim()}
                className="w-full py-3 bg-violet-600 text-white rounded-xl text-sm
                  font-semibold hover:bg-violet-700 transition-colors
                  disabled:opacity-50 disabled:cursor-not-allowed
                  flex items-center justify-center gap-2"
              >
                {sending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send Invitation →"
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
      `}</style>
    </div>
  );
}
