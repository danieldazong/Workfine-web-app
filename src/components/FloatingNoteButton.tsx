/**
 * Global floating "Take a note" button + panel.
 * Mounted ONCE in App.tsx (inside ProtectedRoute), so it appears at the same
 * bottom-right position on every page. Hidden on the Settings page.
 *
 * Also listens for a global "open-note-panel" window event so any page (e.g.
 * the Dashboard "My Notes" card) can open the drawer AND focus a specific note.
 * GLOBAL: same for every account, no per-user logic, no secrets.
 */
import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { StickyNote } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import TakeANotePanel from "./TakeANotePanel";

export const OPEN_NOTE_PANEL_EVENT = "open-note-panel";

export default function FloatingNoteButton() {
  const { user } = useAuth();
  const location = useLocation();
  const [showNotePanel, setShowNotePanel] = useState(false);
  const [focusNoteId, setFocusNoteId] = useState<string | null>(null);

  // Listen for a global request to open the panel (optionally focusing a note).
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail as { noteId?: string } | undefined;
      setFocusNoteId(detail?.noteId ?? null);
      setShowNotePanel(true);
    };
    window.addEventListener(OPEN_NOTE_PANEL_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_NOTE_PANEL_EVENT, onOpen);
  }, []);

  // Hide on the Settings page (and any /settings sub-route).
  if (location.pathname.startsWith("/settings")) return null;

  return (
    <>
      {/* Floating button — hidden while the panel is open. */}
      {!showNotePanel && (
        <div className="fixed bottom-6 right-6 flex flex-col items-end gap-3 z-40">
          <button
            onClick={() => {
              setFocusNoteId(null);
              setShowNotePanel(true);
            }}
            style={{ backgroundColor: "#4C28EE" }}
            className="flex items-center gap-2 px-4 py-3 text-white text-sm font-medium rounded-full shadow-lg transition-all hover:shadow-xl hover:opacity-90"
          >
            <StickyNote size={16} />
            Take a note
          </button>
        </div>
      )}

      {/* Slide-in panel */}
      <TakeANotePanel
        open={showNotePanel}
        onClose={() => {
          setShowNotePanel(false);
          setFocusNoteId(null);
        }}
        uid={user?.uid}
        focusNoteId={focusNoteId}
      />
    </>
  );
}
