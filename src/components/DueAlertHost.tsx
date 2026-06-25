import React, { useEffect, useState } from "react";

interface DueAlert {
  id: number;
  title: string;
}

// Global host that listens for "wf-due-elapsed" events (fired by DueCountdown
// the instant a task's deadline passes) and shows a small in-app popup.
// Self-contained, no permissions, no data logic, no protected regions touched.
export default function DueAlertHost() {
  const [alerts, setAlerts] = useState<DueAlert[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      const title = String(detail.title || "A task").trim() || "A task";
      const id = Date.now() + Math.random();
      setAlerts((prev) => [...prev, { id, title }]);
      // No auto-dismiss: popup persists until the user clicks ×.
    };

    window.addEventListener("wf-due-elapsed", handler as EventListener);
    return () =>
      window.removeEventListener("wf-due-elapsed", handler as EventListener);
  }, []);

  const dismiss = (id: number) =>
    setAlerts((prev) => prev.filter((a) => a.id !== id));

  if (alerts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2">
      {alerts.map((a) => (
        <div
          key={a.id}
          className="flex items-start gap-3 bg-white border border-red-200 shadow-lg rounded-xl px-4 py-3 w-72 animate-[fadeIn_0.2s_ease-out]"
        >
          <div className="w-8 h-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center text-base flex-shrink-0">
            ⏰
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">Time's up!</p>
            <p className="text-xs text-gray-600 truncate mt-0.5">
              "{a.title}" is now due.
            </p>
          </div>
          <button
            onClick={() => dismiss(a.id)}
            className="text-gray-300 hover:text-gray-500 text-lg leading-none flex-shrink-0"
            title="Dismiss"
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}
