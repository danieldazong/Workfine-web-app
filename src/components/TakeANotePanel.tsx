/**
 * "Take a note" slide-in panel — Sticky-Notes style.
 * Reads/writes users/{uid}/notes (same path AppDataContext uses), so notes
 * sync with the Dashboard "My Notes" card in real-time and survive refresh.
 *
 * Features:
 *  - "Recent notes" list rendered as soft colored cards (title, preview, date).
 *  - Each note stores a `color` (backward-compatible: missing => default).
 *  - Kebab (...) menu -> Settings sub-panel with a "Default note color" picker,
 *    persisted per-user in localStorage (no secrets, global, account-agnostic).
 *  - Per-note kebab: change color, Copy Note, Delete (all real-time).
 *  - Click a note card to expand it into an inline editor.
 *
 * GLOBAL: identical for every account. No hardcoded user data. No secrets.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  StickyNote,
  Trash2,
  MoreHorizontal,
  Settings as SettingsIcon,
  Plus,
  ChevronLeft,
  Copy,
} from "lucide-react";
import {
  addDoc,
  collection,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
  deleteDoc,
  updateDoc,
  doc,
} from "firebase/firestore";
import { db } from "../lib/firebase/config";
import { useAuth } from "../context/AuthContext";

interface NoteItem {
  id: string;
  title?: string;
  content?: string;
  color?: string;
  createdAt?: any;
}

interface Props {
  open: boolean;
  onClose: () => void;
  uid?: string | null;
  /** When set, the panel scrolls to & highlights this note on open. */
  focusNoteId?: string | null;
}


// Soft Sticky-Notes palette. Order is stable so indices are deterministic.
const NOTE_COLORS = [
  { key: "yellow", bg: "#FFF8C5", border: "#FCE38A" },
  { key: "pink", bg: "#FCE4EC", border: "#F8BBD0" },
  { key: "blue", bg: "#E3F2FD", border: "#BBDEFB" },
  { key: "green", bg: "#E8F5E9", border: "#C8E6C9" },
  { key: "purple", bg: "#EDE7F6", border: "#D1C4E9" },
  { key: "gray", bg: "#F3F4F6", border: "#E5E7EB" },
];

const DEFAULT_COLOR_KEY = "pink";
const SETTINGS_STORAGE_KEY = "takeANote.defaultColorKey";

function colorByKey(key?: string) {
  return NOTE_COLORS.find((c) => c.key === key) || NOTE_COLORS[1];
}

function formatNoteDate(value: any): string {
  if (!value) return "";
  let d: Date | null = null;
  if (typeof value?.toDate === "function") d = value.toDate();
  else if (typeof value?.seconds === "number") d = new Date(value.seconds * 1000);
  else {
    const t = new Date(value);
    d = Number.isNaN(t.getTime()) ? null : t;
  }
  if (!d) return "";
  return d.toLocaleDateString();
}

export default function TakeANotePanel({ open, onClose, uid, focusNoteId }: Props) {
  const { user } = useAuth();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState<NoteItem[]>([]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Per-note kebab popover state + transient "copied" confirmation id.
  const [openNoteMenuId, setOpenNoteMenuId] = useState<string | null>(null);
  const [copiedNoteId, setCopiedNoteId] = useState<string | null>(null);
  const noteMenuRef = useRef<HTMLDivElement>(null);

  // Which note is expanded into the inline editor (by id), plus the working
  // draft for that note's title/body while editing.
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editSaving, setEditSaving] = useState(false);
    // Transient highlight + scroll target for a note opened from another page.
  const [highlightNoteId, setHighlightNoteId] = useState<string | null>(null);
  const noteRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Default note color (persisted per-user in localStorage — no secrets).
  const [defaultColorKey, setDefaultColorKey] = useState<string>(() => {
    try {
      return localStorage.getItem(SETTINGS_STORAGE_KEY) || DEFAULT_COLOR_KEY;
    } catch {
      return DEFAULT_COLOR_KEY;
    }
  });

  // Color chosen for the note currently being composed.
  const [composerColorKey, setComposerColorKey] = useState<string>(defaultColorKey);

  const menuRef = useRef<HTMLDivElement>(null);

  // Keep composer color in sync with the default when default changes.
  useEffect(() => {
    setComposerColorKey(defaultColorKey);
  }, [defaultColorKey]);

  // Persist the default color choice.
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, defaultColorKey);
    } catch {
      /* ignore */
    }
  }, [defaultColorKey]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || saving) return;
      if (expandedNoteId) setExpandedNoteId(null);
      else if (showSettings) setShowSettings(false);
      else if (menuOpen) setMenuOpen(false);
      else onClose();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, saving, onClose, menuOpen, showSettings, expandedNoteId]);

  // Close kebab menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  // Close the per-note kebab popover on outside click.
  useEffect(() => {
    if (!openNoteMenuId) return;
    const onClick = (e: MouseEvent) => {
      if (
        noteMenuRef.current &&
        !noteMenuRef.current.contains(e.target as Node)
      ) {
        setOpenNoteMenuId(null);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [openNoteMenuId]);

  // Live list of this user's notes.
  useEffect(() => {
    if (!open || !uid) return;
    const q = query(
      collection(db, "users", uid, "notes"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setNotes(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      },
      (err) => console.error("[TakeANotePanel] notes listener:", err)
    );
    return () => unsub();
  }, [open, uid]);
    // When opened with a focusNoteId, scroll that note into view and flash a
  // highlight ring once the notes list is available.
  useEffect(() => {
    if (!open || !focusNoteId) return;
    if (!notes.some((n) => n.id === focusNoteId)) return;

    setHighlightNoteId(focusNoteId);

    const t = setTimeout(() => {
      const el = noteRefs.current[focusNoteId];
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);

    const clear = setTimeout(() => setHighlightNoteId(null), 2200);

    return () => {
      clearTimeout(t);
      clearTimeout(clear);
    };
  }, [open, focusNoteId, notes]);

  const handleSave = async () => {
    if (!uid) return;
    if (!title.trim() && !content.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "users", uid, "notes"), {
        title: title.trim(),
        content: content.trim(),
        color: composerColorKey,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setTitle("");
      setContent("");
      setComposerColorKey(defaultColorKey);
    } catch (err) {
      console.error("[TakeANotePanel] save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (noteId: string) => {
    if (!uid) return;
    try {
      await deleteDoc(doc(db, "users", uid, "notes", noteId));
    } catch (err) {
      console.error("[TakeANotePanel] delete failed:", err);
    }
  };

  // Change an existing note's color in real-time.
  const handleChangeColor = async (noteId: string, colorKey: string) => {
    if (!uid) return;
    try {
      await updateDoc(doc(db, "users", uid, "notes", noteId), {
        color: colorKey,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("[TakeANotePanel] color change failed:", err);
    }
  };

  // Copy a note's text to the clipboard.
  const handleCopyNote = async (note: NoteItem) => {
    const text = [note.title, note.content].filter(Boolean).join("\n").trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedNoteId(note.id);
      setTimeout(() => setCopiedNoteId((id) => (id === note.id ? null : id)), 1500);
    } catch (err) {
      console.error("[TakeANotePanel] copy failed:", err);
    }
  };

  // Expand a note into the inline editor, seeding the draft from its data.
  const openNoteEditor = (note: NoteItem) => {
    setExpandedNoteId(note.id);
    setEditTitle(String(note.title ?? ""));
    setEditContent(String(note.content ?? ""));
  };

  // Save the inline edits back to Firestore, then collapse the card.
  const saveNoteEditor = async () => {
    if (!uid || !expandedNoteId) return;
    setEditSaving(true);
    try {
      await updateDoc(doc(db, "users", uid, "notes", expandedNoteId), {
        title: editTitle.trim(),
        content: editContent.trim(),
        updatedAt: serverTimestamp(),
      });
      setExpandedNoteId(null);
    } catch (err) {
      console.error("[TakeANotePanel] note edit save failed:", err);
    } finally {
      setEditSaving(false);
    }
  };

  const accountName = useMemo(
    () =>
      user?.displayName ||
      (user?.email ? user.email.split("@")[0] : "") ||
      "You",
    [user]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => {
          if (!saving) onClose();
        }}
      />

      {/* Right-hand slide-in panel */}
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl border-l border-slate-200 flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="relative flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
              <StickyNote size={16} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                {showSettings ? "Settings" : "Take a note"}
              </h2>
              <p className="text-[11px] text-slate-500">
                {showSettings
                  ? "Customize your notes."
                  : "Quick notes, saved to your account."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1" ref={menuRef}>
            {/* Kebab menu */}
            {!showSettings && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="More options"
                >
                  <MoreHorizontal size={18} />
                </button>

                {menuOpen && (
                  <div className="absolute right-0 top-10 z-10 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl">
                    {/* Account row */}
                    <div className="px-3 py-2 border-b border-slate-100">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {accountName}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {user?.email || ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowSettings(true);
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                    >
                      <SettingsIcon size={15} className="text-slate-500" />
                      Settings
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Back (from settings) or Close */}
            {showSettings ? (
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Back"
              >
                <ChevronLeft size={18} />
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                aria-label="Close notes panel"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* ── SETTINGS VIEW ── */}
        {showSettings ? (
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                General
              </p>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Default note color
              </label>
              <div className="flex flex-wrap gap-2">
                {NOTE_COLORS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setDefaultColorKey(c.key)}
                    className={`h-9 w-9 rounded-full border-2 transition ${
                      defaultColorKey === c.key
                        ? "scale-110 border-slate-900"
                        : "border-transparent"
                    }`}
                    style={{ backgroundColor: c.bg }}
                    aria-label={`Default color ${c.key}`}
                  />
                ))}
              </div>
              <p className="mt-2 text-[11px] text-slate-400">
                New notes will use this color by default.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
              <p className="text-sm font-medium text-slate-800 truncate">
                {accountName}
              </p>
              <p className="text-[11px] text-slate-400 truncate">
                {user?.email || ""}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* ── COMPOSER ── */}
            <div className="border-b border-slate-100 px-5 py-4 space-y-2">
              <input
                type="text"
                placeholder="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 120))}
                disabled={saving}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              />
              <textarea
                placeholder="Write your note…"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={3}
                disabled={saving}
                className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              />

              {/* Composer color picker */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {NOTE_COLORS.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setComposerColorKey(c.key)}
                      className={`h-5 w-5 rounded-full border-2 transition ${
                        composerColorKey === c.key
                          ? "scale-110 border-slate-700"
                          : "border-transparent"
                      }`}
                      style={{ backgroundColor: c.bg }}
                      aria-label={`Note color ${c.key}`}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || (!title.trim() && !content.trim())}
                  style={{ backgroundColor: "#4C28EE" }}
                  className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus size={15} />
                  {saving ? "Saving…" : "Save note"}
                </button>
              </div>
            </div>

            {/* ── RECENT NOTES (Sticky-Notes style colored cards) ── */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <p className="text-sm font-semibold text-slate-700 mb-3">
                Recent notes
              </p>

              {notes.length > 0 ? (
                <div className="space-y-3">
                  {notes.map((n) => {
                    const c = colorByKey(n.color);
                    const isMenuOpen = openNoteMenuId === n.id;
                    const isExpanded = expandedNoteId === n.id;
                                        return (
                      <div
                        key={n.id}
                        ref={(el) => {
                          noteRefs.current[n.id] = el;
                        }}
                        onClick={() => {
                          if (!isExpanded) openNoteEditor(n);
                        }}
                        className={`group relative rounded-xl px-4 py-3 shadow-sm border transition ${
                          isExpanded ? "" : "cursor-pointer hover:shadow-md"
                        } ${
                          highlightNoteId === n.id
                            ? "ring-2 ring-violet-500 ring-offset-1"
                            : ""
                        }`}
                        style={{ backgroundColor: c.bg, borderColor: c.border }}
                      >

                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="text-[10px] font-medium text-slate-500">
                            {formatNoteDate(n.createdAt)}
                          </span>

                          {/* Per-note kebab — appears on hover */}
                          <div className="relative flex-shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenNoteMenuId(isMenuOpen ? null : n.id);
                              }}
                              className={`rounded p-0.5 text-slate-500 transition hover:bg-black/5 hover:text-slate-800 ${
                                isMenuOpen
                                  ? "opacity-100"
                                  : "opacity-0 group-hover:opacity-100"
                              }`}
                              title="More options"
                            >
                              <MoreHorizontal size={16} />
                            </button>

                            {isMenuOpen && (
                              <div
                                ref={noteMenuRef}
                                className="absolute right-0 top-7 z-20 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white py-2 shadow-xl"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {/* Color swatch row */}
                                <div className="flex items-center gap-1.5 px-3 pb-2">
                                  {NOTE_COLORS.map((sw) => (
                                    <button
                                      key={sw.key}
                                      type="button"
                                      onClick={() => {
                                        handleChangeColor(n.id, sw.key);
                                        setOpenNoteMenuId(null);
                                      }}
                                      className={`relative h-7 w-7 rounded-md border transition hover:scale-110 ${
                                        (n.color || DEFAULT_COLOR_KEY) === sw.key
                                          ? "border-slate-700"
                                          : "border-slate-200"
                                      }`}
                                      style={{ backgroundColor: sw.bg }}
                                      aria-label={`Set color ${sw.key}`}
                                    >
                                      {(n.color || DEFAULT_COLOR_KEY) === sw.key && (
                                        <span className="absolute inset-0 flex items-center justify-center text-slate-700 text-xs">
                                          ✓
                                        </span>
                                      )}
                                    </button>
                                  ))}
                                </div>

                                <div className="my-1 h-px bg-slate-100" />

                                {/* Copy Note */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleCopyNote(n);
                                    setOpenNoteMenuId(null);
                                  }}
                                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                                >
                                  <Copy size={15} className="text-slate-500" />
                                  {copiedNoteId === n.id ? "Copied!" : "Copy Note"}
                                </button>

                                {/* Delete */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleDelete(n.id);
                                    setOpenNoteMenuId(null);
                                  }}
                                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-red-600 transition hover:bg-red-50"
                                >
                                  <Trash2 size={15} />
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {isExpanded ? (
                          <div
                            className="space-y-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="text"
                              value={editTitle}
                              onChange={(e) =>
                                setEditTitle(e.target.value.slice(0, 120))
                              }
                              placeholder="Title"
                              disabled={editSaving}
                              autoFocus
                              className="w-full bg-transparent text-sm font-bold text-slate-800 outline-none placeholder:font-normal placeholder:text-slate-400"
                            />
                            <textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              placeholder="Write your note…"
                              rows={6}
                              disabled={editSaving}
                              className="w-full resize-none bg-transparent text-xs text-slate-700 leading-relaxed outline-none placeholder:text-slate-400"
                            />
                            <div className="flex items-center justify-end gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => setExpandedNoteId(null)}
                                disabled={editSaving}
                                className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-black/5 disabled:opacity-50"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={saveNoteEditor}
                                disabled={editSaving}
                                style={{ backgroundColor: "#4C28EE" }}
                                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
                              >
                                {editSaving ? "Saving…" : "✓ Done"}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {n.title && (
                              <p className="text-sm font-bold text-slate-800 break-words mb-1">
                                {n.title}
                              </p>
                            )}
                            {n.content && (
                              <p className="text-xs text-slate-700 whitespace-pre-wrap break-words leading-relaxed">
                                {n.content}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-48 flex flex-col items-center justify-center text-center">
                  <StickyNote size={28} className="text-slate-300 mb-2" />
                  <p className="text-xs text-slate-400">No notes yet.</p>
                  <p className="text-[10px] text-slate-300">
                    Write something above to get started.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
