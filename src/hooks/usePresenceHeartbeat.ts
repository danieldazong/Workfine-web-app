import { useEffect } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase/config";

/**
 * Updates the current user's `lastActive` timestamp every 60 seconds
 * while the tab is active and visible. Used for real presence detection.
 */
export function usePresenceHeartbeat(
  workspaceId: string | null,
  uid: string | null
) {
  useEffect(() => {
    if (!workspaceId || !uid) return;

    const memberRef = doc(db, "workspaces", workspaceId, "members", uid);

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState !== "visible") return;
      try {
        await updateDoc(memberRef, {
          lastActive: serverTimestamp(),
        });
      } catch {
        // Silently ignore — member doc may not exist or rules may deny.
      }
    };

    // Immediate tick on mount + every 60s thereafter.
    tick();
    const interval = window.setInterval(tick, 60_000);

    // Also tick when the tab becomes visible again.
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [workspaceId, uid]);
}
