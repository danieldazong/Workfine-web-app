/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { Lock, ArrowRight, AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react";
import {
  verifyPasswordResetCode,
  confirmPasswordReset,
  applyActionCode,
} from "firebase/auth";
import { auth } from "../lib/firebase/config";
import { cn } from "../lib/utils";

type Phase = "loading" | "resetForm" | "resetDone" | "verified" | "error";

export default function AuthActionPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const mode = params.get("mode") || "";
  const oobCode = params.get("oobCode") || "";

  const [phase, setPhase] = useState<Phase>("loading");
  const [accountEmail, setAccountEmail] = useState<string>("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Verify the incoming action code on mount and decide which UI to show.
  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!oobCode) {
        setError("This link is invalid or has expired. Please request a new one.");
        setPhase("error");
        return;
      }

      try {
        if (mode === "resetPassword") {
          const email = await verifyPasswordResetCode(auth, oobCode);
          if (cancelled) return;
          setAccountEmail(email);
          setPhase("resetForm");
        } else if (mode === "verifyEmail") {
          await applyActionCode(auth, oobCode);
          if (cancelled) return;
          setPhase("verified");
        } else {
          setError("Unsupported request. Please use the link from your email.");
          setPhase("error");
        }
      } catch {
        if (cancelled) return;
        setError("This link is invalid or has expired. Please request a new one.");
        setPhase("error");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [mode, oobCode]);

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      await confirmPasswordReset(auth, oobCode, password);
      setPhase("resetDone");
    } catch (err: any) {
      const code: string = err?.code ?? "";
      if (code === "auth/weak-password") {
        setError("Password is too weak. Use at least 6 characters.");
      } else if (code === "auth/expired-action-code" || code === "auth/invalid-action-code") {
        setError("This link has expired. Please request a new password reset.");
      } else {
        setError("Could not reset your password. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  // ─── Shared shell (matches LoginPage split-screen exactly) ───
  return (
    <div className="min-h-screen flex bg-white font-sans">
      {/* LEFT: branded panel — identical surface to LoginPage */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-[#0F172A]">
        <div className="absolute top-[-10%] left-[-10%] w-[420px] h-[420px] rounded-full bg-indigo-500/20 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-15%] right-[-5%] w-[420px] h-[420px] rounded-full bg-[#A78BFA]/15 blur-[120px] pointer-events-none" />

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <Link to="/login" className="flex items-center gap-3">
            <img
              src="/logo.png?v=2"
              alt="WorkFine Logo"
              className="h-8 w-8 rounded-lg object-contain shadow-lg shadow-indigo-500/20"
            />
            <span className="text-2xl tracking-tight">
              <span className="font-extrabold text-white">Work</span>
              <span className="font-light text-white">Fine</span>
            </span>
          </Link>

          <div className="max-w-md">
            <h1 className="text-4xl font-bold text-white leading-tight tracking-tight">
              Secure account<br />recovery.
            </h1>
            <p className="mt-4 text-slate-400 text-base leading-relaxed">
              Set a new password and get straight back to your workspace.
            </p>
          </div>

          <p className="text-[10px] text-slate-600 font-semibold uppercase tracking-[0.25em]">
            &copy; {new Date().getFullYear()} WorkFine
          </p>
        </div>
      </div>

      {/* RIGHT: action content */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-10 bg-white">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          <div className="flex flex-col items-center">
            {/* Mobile-only logo */}
            <Link to="/login" className="lg:hidden flex items-center gap-2 mb-6">
              <img
                src="/logo.png?v=2"
                alt="WorkFine Logo"
                className="h-8 w-8 rounded-lg object-contain"
              />
              <span className="text-xl tracking-tight">
                <span className="font-extrabold text-slate-900">Work</span>
                <span className="font-light text-slate-900">Fine</span>
              </span>
            </Link>

            {phase === "loading" && (
              <div className="flex flex-col items-center py-10">
                <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <p className="mt-4 text-sm text-slate-500">Verifying your link…</p>
              </div>
            )}

            {phase === "resetForm" && (
              <>
                <h2 className="text-2xl font-semibold text-slate-900 tracking-tight mb-2">
                  Reset your password
                </h2>
                <p className="text-slate-500 text-sm mb-6 text-center">
                  For <span className="font-medium text-slate-700">{accountEmail}</span>
                </p>

                <form onSubmit={handleConfirmReset} className="w-full space-y-3">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-widest pl-1">New Password</label>
                    <div className="relative group">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" size={16} />
                      <input
                        required
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-10 py-2.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-slate-900 placeholder:text-slate-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-widest pl-1">Confirm Password</label>
                    <div className="relative group">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" size={16} />
                      <input
                        required
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-slate-900 placeholder:text-slate-400"
                      />
                    </div>
                  </div>

                  <AnimatePresence>
                    {error && (
                      <motion.div
                        key="err"
                        initial={{ opacity: 0, scale: 0.95, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5"
                      >
                        <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                        <p className="text-red-600 text-xs font-normal leading-snug">{error}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-indigo-500/20 disabled:opacity-50"
                  >
                    {busy ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        Save new password
                        <ArrowRight size={18} />
                      </>
                    )}
                  </button>
                </form>
              </>
            )}

            {phase === "resetDone" && (
              <div className="flex flex-col items-center text-center py-4">
                <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mb-4">
                  <CheckCircle2 className="text-emerald-500" size={28} />
                </div>
                <h2 className="text-2xl font-semibold text-slate-900 tracking-tight mb-2">
                  Password changed
                </h2>
                <p className="text-slate-500 text-sm mb-6">
                  You can now sign in with your new password.
                </p>
                <button
                  type="button"
                  onClick={() => navigate("/login", { replace: true })}
                  className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-indigo-500/20"
                >
                  Back to sign in
                  <ArrowRight size={18} />
                </button>
              </div>
            )}

            {phase === "verified" && (
              <div className="flex flex-col items-center text-center py-4">
                <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mb-4">
                  <CheckCircle2 className="text-emerald-500" size={28} />
                </div>
                <h2 className="text-2xl font-semibold text-slate-900 tracking-tight mb-2">
                  Email verified
                </h2>
                <p className="text-slate-500 text-sm mb-6">
                  Your email address has been confirmed.
                </p>
                <button
                  type="button"
                  onClick={() => navigate("/login", { replace: true })}
                  className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-indigo-500/20"
                >
                  Continue to sign in
                  <ArrowRight size={18} />
                </button>
              </div>
            )}

            {phase === "error" && (
              <div className="flex flex-col items-center text-center py-4">
                <div className="w-14 h-14 rounded-full bg-red-50 border border-red-200 flex items-center justify-center mb-4">
                  <AlertCircle className="text-red-500" size={28} />
                </div>
                <h2 className="text-2xl font-semibold text-slate-900 tracking-tight mb-2">
                  Link problem
                </h2>
                <p className="text-slate-500 text-sm mb-6 max-w-[300px]">
                  {error || "This link is invalid or has expired."}
                </p>
                <button
                  type="button"
                  onClick={() => navigate("/login", { replace: true })}
                  className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-indigo-500/20"
                >
                  Back to sign in
                  <ArrowRight size={18} />
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
