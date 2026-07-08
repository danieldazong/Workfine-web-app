// Resolves a task's exact deadline to a millisecond timestamp using BOTH
// dueDate and dueTime. This MUST mirror resolveDueMs() in
// src/components/DueCountdown.tsx (dueDate + dueTime, or 23:59 when no time)
// so the Overdue tab, the Dashboard count, and the Dashboard banner all agree
// with the live "Overdue …" countdown chip. Do NOT revert to a date-only
// comparison — that was the bug: a task due later TODAY was never counted as
// overdue because midnight-stripping made (today < today) === false.
function resolveDueMs(dueDate?: string, dueTime?: string): number {
  const dateStr = String(dueDate || "").trim();
  if (!dateStr) return 0;
  const timeStr = String(dueTime || "").trim();
  const composed = timeStr ? `${dateStr}T${timeStr}:00` : `${dateStr}T23:59:00`;
  const ms = new Date(composed).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function getOverdueTasks(tasks: any[]) {
  const nowMs = Date.now();

  return tasks.filter((task) => {
    if (!task?.dueDate) return false;

    const isDone =
      String(task.status || "").toLowerCase() === "done" ||
      String(task.status || "").toLowerCase() === "completed";
    if (isDone) return false;

    const dueMs = resolveDueMs(task.dueDate, (task as any).dueTime);
    if (!dueMs) return false;

    // Overdue = the exact deadline (date + time) has already passed.
    return dueMs < nowMs;
  });
}
