import React, { useEffect, useState } from "react";

interface DueCountdownProps {
  startDate?: string;
  startTime?: string;
  dueDate?: string;
  dueTime?: string;
  status?: string;
  title?: string;
  className?: string;
}


// Fires a one-time global event the instant a task's deadline elapses.
// Listened to by <DueAlertHost/>. Purely presentational signalling — no data logic.
function emitDueElapsed(detail: { dueMs: number; status?: string; title?: string }) {
  try {
    window.dispatchEvent(new CustomEvent("wf-due-elapsed", { detail }));
  } catch {
    // no-op
  }
}

function resolveDueMs(dueDate?: string, dueTime?: string): number {
  const dateStr = String(dueDate || "").trim();
  if (!dateStr) return 0;
  const timeStr = String(dueTime || "").trim();
  const composed = timeStr ? `${dateStr}T${timeStr}:00` : `${dateStr}T23:59:00`;
  const ms = new Date(composed).getTime();
  return Number.isFinite(ms) ? ms : 0;
}
// Additive helper for the START-phase countdown. Deliberately SEPARATE from
// the protected resolveDueMs() so DUE_ELAPSED_FIRE_LOGIC is never touched.
function resolveStartMs(startDate?: string, startTime?: string): number {
  const dateStr = String(startDate || "").trim();
  if (!dateStr) return 0;
  const timeStr = String(startTime || "").trim();
  const composed = timeStr ? `${dateStr}T${timeStr}:00` : `${dateStr}T00:00:00`;
  const ms = new Date(composed).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function formatRemaining(ms: number): string {
  const abs = Math.abs(ms);
  const totalSec = Math.floor(abs / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export default function DueCountdown({
  startDate,
  startTime,
  dueDate,
  dueTime,
  status,
  title,
  className = "",
}: DueCountdownProps) {

  const [now, setNow] = useState(() => Date.now());
  const dueMs = resolveDueMs(dueDate, dueTime);
  const startMs = resolveStartMs(startDate, startTime);
  const isDone = /done|completed/i.test(status || "");

  // START-PHASE: if a start time is set and has NOT yet arrived, show an
  // amber "Starts in ..." chip that ticks every second. Additive only —
  // this runs BEFORE the protected due logic and never interferes with it.
  const inStartPhase = !isDone && startMs > 0 && now < startMs;


    const firedRef = React.useRef(false);

  useEffect(() => {
    // Reset the one-time guard whenever the deadline changes.
    firedRef.current = false;
  }, [dueMs]);

   useEffect(() => {
    // Tick while counting down to START or to DUE.
    if (isDone) return;
    if (!dueMs && !startMs) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [dueMs, startMs, isDone]);


  // Fire the popup the instant we cross zero (once per deadline).
  useEffect(() => {
    if (!dueMs || isDone) return;
    if (firedRef.current) return;
    if (now >= dueMs) {
      firedRef.current = true;
      emitDueElapsed({ dueMs, status, title });
    }
  }, [now, dueMs, isDone, status, title]);

  // START-PHASE render — takes precedence until the start moment passes.
  if (inStartPhase) {
    const startRemaining = startMs - now;
    return (
      <span
        className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border font-medium whitespace-nowrap bg-amber-50 text-amber-700 border-amber-200 ${className}`}
        title="Time until start"
      >
        ⏳ Starts in {formatRemaining(startRemaining)}
      </span>
    );
  }

  if (!dueMs || isDone) return null;

  const remaining = dueMs - now;
  const overdue = remaining < 0;

  let tone = "bg-emerald-50 text-emerald-600 border-emerald-100";
  if (overdue) tone = "bg-red-100 text-red-600 border-red-200";
  else if (remaining <= 60 * 60 * 1000)
    tone = "bg-red-50 text-red-500 border-red-100";
  else if (remaining <= 24 * 60 * 60 * 1000)
    tone = "bg-amber-50 text-amber-600 border-amber-100";

  const label = overdue
    ? `Overdue ${formatRemaining(remaining)}`
    : `${formatRemaining(remaining)} left`;

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border font-medium whitespace-nowrap ${tone} ${className}`}
      title={overdue ? "Past due" : "Time remaining"}
    >
      ⏱ {label}
    </span>
  );
}
