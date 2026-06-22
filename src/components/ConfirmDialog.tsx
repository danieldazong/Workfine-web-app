/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Reusable confirmation modal for the whole web app.
 * Matches the existing modal vibe (rounded card, dark backdrop,
 * danger-red confirm button). Use anywhere: delete task, leave
 * workspace, discard changes, etc.
 */

import React, { useEffect } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title = "Are you sure?",
  message = "This action cannot be undone.",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Close on Escape (ignored while busy).
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const confirmClasses =
    tone === "danger"
      ? "bg-red-600 hover:bg-red-700"
      : "bg-blue-600 hover:bg-blue-700";

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Card */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-slate-200 animate-in zoom-in-95 fade-in duration-200"
      >
        <div className="px-6 pt-6 pb-2">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <div className="mt-2 text-sm text-slate-500 leading-relaxed">
            {message}
          </div>
        </div>

        <div className="px-6 pb-6 pt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`flex-1 py-2.5 rounded-xl text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${confirmClasses}`}
          >
            {busy ? "Please wait..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
