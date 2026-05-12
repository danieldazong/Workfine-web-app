import React, { useState, useCallback } from "react";
import { useAuth }        from "../context/AuthContext";
import { useAppData }     from "../context/AppDataContext";
import { createProject }  from "../lib/firebase/projects";

interface Props {
  onClose: () => void;
}

const COLORS = [
  { hex: "#6366f1", label: "Violet"  },
  { hex: "#22c55e", label: "Green"   },
  { hex: "#f97316", label: "Orange"  },
  { hex: "#ef4444", label: "Red"     },
  { hex: "#ec4899", label: "Pink"    },
  { hex: "#a855f7", label: "Purple"  },
  { hex: "#14b8a6", label: "Teal"    },
  { hex: "#3b82f6", label: "Blue"    },
];

const STATUSES  = ["active", "planning", "on-hold", "completed"];
const PRIORITIES = [
  { label: "Low",    color: "#22c55e" },
  { label: "Medium", color: "#f97316" },
  { label: "High",   color: "#ef4444" },
];

export default function CreateProjectModal({ onClose }: Props) {
  const { user, workspaceId } = useAuth();
  const { projects = [] } = useAppData() as any;

  // ── Step (never driven by external state so never resets) ──
  const [step, setStep] = useState<1 | 2>(1);

  // ── Step 1 fields ──────────────────────────────────────────
  const [name,        setName]        = useState("");
  const [description, setDescription] = useState("");
  const [color,       setColor]       = useState("#6366f1");

  // ── Step 2 fields ──────────────────────────────────────────
  const [status,   setStatus]   = useState("active");
  const [priority, setPriority] = useState("Medium");
  const [dueDate,  setDueDate]  = useState("");

  // ── UI state ───────────────────────────────────────────────
  const [error,  setError]  = useState("");
  const [saving, setSaving] = useState(false);

  // ── Step 1 → Step 2 (NEVER submits, NEVER creates) ────────
  const handleNext = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();

      if (!name.trim()) {
        setError("Project name is required.");
        return;
      }
      setError("");
      setStep(2);          // just change step — nothing else
    },
    [name]
  );

  // ── Step 2 → Step 1 (preserves all data) ──────────────────
  const handleBack = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setError("");
      setStep(1);
    },
    []
  );

  // ── Final Firestore write (ONLY called from Create button) ─
  const handleCreate = useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();

      // Hard guard — only allow creation from step 2
      if (step !== 2) return;

      if (!user?.uid) {
  setError("You must be signed in.");
  return;
}

if (!workspaceId) {
  setError("No active workspace found.");
  return;
}

      if (!name.trim()) {
        setError("Project name is required.");
        return;
      }

      setSaving(true);
      setError("");

      try {
        const projectCode = "WF-" + String(projects.length + 1).padStart(3, "0");
        const id = await createProject(workspaceId, {
          code:        projectCode,
          name:        name.trim(),
          description: description.trim(),
          color,
          status,
          priority,
          dueDate:     dueDate || null,
}, user.uid);

        console.log("[CreateProjectModal] ✅ Project saved:", id, "with code", projectCode);
        onClose();   // ← ONLY place onClose is called on success
      } catch (err) {
        console.error("[CreateProjectModal] ❌ Save error:", err);
        setError("Failed to save project. Check your connection.");
        setSaving(false);
      }
    },
    [step, user, workspaceId, projects, name, description, color, status, priority, dueDate, onClose]
  );

  // Prevent Enter key in inputs from triggering any implicit submission.
  // Since we're using a <div> wrapper (no <form>), there is no native
  // submit to worry about, but this also stops Enter from clicking the
  // first button in the DOM (the focused button) accidentally.
  const blockEnterKey = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === "Enter" && e.currentTarget.tagName !== "TEXTAREA") {
        e.preventDefault();
      }
    },
    []
  );

  return (
    // Backdrop — clicking it does NOT close the modal mid-flow
    <div
      className="fixed inset-0 z-50 flex items-center justify-center
                 bg-black/50 backdrop-blur-sm"
      onClick={(e) => e.stopPropagation()} // prevent backdrop close
    >
      {/* Modal card */}
      <div
        className="bg-white rounded-2xl w-full max-w-lg shadow-2xl
                   overflow-hidden"
        onClick={(e) => e.stopPropagation()} // isolate clicks inside
      >

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 pt-5 pb-2">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              New Project
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Step {step} of 2 —{" "}
              {step === 1 ? "Basic Info" : "Settings"}
            </p>
          </div>
          <button
            type="button"               // ← must be type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition
                       w-8 h-8 flex items-center justify-center
                       rounded-full hover:bg-gray-100 text-xl"
          >
            ✕
          </button>
        </div>

        {/* ── Progress bar ── */}
        <div className="px-6 pb-4">
          <div className="w-full h-1 bg-gray-100 rounded-full">
            <div
              className="h-1 rounded-full bg-blue-500 transition-all
                         duration-300"
              style={{ width: step === 1 ? "50%" : "100%" }}
            />
          </div>
        </div>

        {/*
          CRITICAL: We use a plain <div> (NOT a <form>) so there is
          no possibility of an implicit/native submit. All actions
          are wired through individual button onClick handlers.
        */}
        <div>
          <div className="px-6 pb-2 flex flex-col gap-4">

            {/* ════════════ STEP 1 ════════════ */}
            {step === 1 && (
              <>
                {/* Project Name */}
                <div>
                  <label className="block text-sm font-medium
                                    text-gray-700 mb-1">
                    Project Name{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={blockEnterKey}
                    placeholder="e.g. Website Redesign"
                    autoFocus
                    className="w-full border border-gray-200 rounded-xl
                               px-4 py-2.5 text-sm text-gray-900
                               placeholder-gray-400 focus:outline-none
                               focus:border-blue-500 focus:ring-2
                               focus:ring-blue-100 transition"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium
                                    text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onKeyDown={blockEnterKey}
                    placeholder="What is this project about?"
                    rows={3}
                    className="w-full border border-gray-200 rounded-xl
                               px-4 py-2.5 text-sm text-gray-900
                               placeholder-gray-400 focus:outline-none
                               focus:border-blue-500 focus:ring-2
                               focus:ring-blue-100 transition resize-none"
                  />
                </div>

                {/* Color picker */}
                <div>
                  <label className="block text-sm font-medium
                                    text-gray-700 mb-2">
                    Project Color
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {COLORS.map((c) => (
                      <button
                        key={c.hex}
                        type="button"       // ← must be type="button"
                        title={c.label}
                        onClick={() => setColor(c.hex)}
                        className={`w-9 h-9 rounded-full border-[3px]
                          transition-all ${
                            color === c.hex
                              ? "border-gray-800 scale-125 shadow-md"
                              : "border-transparent hover:scale-110"
                          }`}
                        style={{ backgroundColor: c.hex }}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ════════════ STEP 2 ════════════ */}
            {step === 2 && (
              <>
                {/* Status */}
                <div>
                  <label className="block text-sm font-medium
                                    text-gray-700 mb-2">
                    Status
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {STATUSES.map((s) => (
                      <button
                        key={s}
                        type="button"     // ← must be type="button"
                        onClick={() => setStatus(s)}
                        className={`py-2.5 rounded-xl text-sm font-medium
                          border transition capitalize ${
                            status === s
                              ? "bg-blue-600 text-white border-blue-600"
                              : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                          }`}
                      >
                        {s === "on-hold"
                          ? "On Hold"
                          : s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Priority */}
                <div>
                  <label className="block text-sm font-medium
                                    text-gray-700 mb-2">
                    Priority
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {PRIORITIES.map((p) => (
                      <button
                        key={p.label}
                        type="button"     // ← must be type="button"
                        onClick={() => setPriority(p.label)}
                        className={`py-2.5 rounded-xl text-sm font-medium
                          border transition flex items-center
                          justify-center gap-1.5 ${
                            priority === p.label
                              ? "bg-gray-900 text-white border-gray-900"
                              : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                          }`}
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: p.color }}
                        />
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Due Date */}
                <div>
                  <label className="block text-sm font-medium
                                    text-gray-700 mb-1">
                    Due Date{" "}
                    <span className="text-gray-400 text-xs font-normal">
                      (optional)
                    </span>
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    onKeyDown={blockEnterKey}
                    className="w-full border border-gray-200 rounded-xl
                               px-4 py-2.5 text-sm text-gray-900
                               focus:outline-none focus:border-blue-500
                               focus:ring-2 focus:ring-blue-100 transition"
                  />
                </div>

                {/* Live preview card */}
                <div className="rounded-xl border border-gray-100
                                bg-gray-50 p-3 flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex-shrink-0 flex
                               items-center justify-center text-white
                               font-bold text-lg"
                    style={{ backgroundColor: color }}
                  >
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800
                                  truncate">
                      {name}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {description || "No description"}
                    </p>
                    <div className="flex gap-1.5 mt-1 flex-wrap">
                      <span className="text-[10px] bg-blue-100
                                       text-blue-700 px-2 py-0.5
                                       rounded-full capitalize">
                        {status === "on-hold" ? "On Hold" : status}
                      </span>
                      <span className="text-[10px] bg-gray-100
                                       text-gray-600 px-2 py-0.5
                                       rounded-full">
                        {priority} Priority
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Error message */}
            {error && (
              <p className="text-red-500 text-sm bg-red-50 border
                            border-red-200 rounded-xl px-3 py-2">
                {error}
              </p>
            )}
          </div>

          {/* ── Footer buttons ── */}
          <div className="px-6 pt-2 pb-6 flex gap-3">
            {step === 1 ? (
              <>
                {/* Cancel — type="button" — never submits */}
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 border border-gray-200 text-gray-600
                             rounded-xl py-2.5 text-sm font-medium
                             hover:bg-gray-50 transition"
                >
                  Cancel
                </button>

                {/* Next — type="button" — ONLY changes step */}
                <button
                  type="button"
                  onClick={handleNext}
                  className="flex-1 bg-blue-600 hover:bg-blue-700
                             text-white rounded-xl py-2.5 text-sm
                             font-semibold transition flex items-center
                             justify-center gap-1"
                >
                  Next →
                </button>
              </>
            ) : (
              <>
                {/* Back — type="button" — goes back to step 1, keeps data */}
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex-1 border border-gray-200 text-gray-600
                             rounded-xl py-2.5 text-sm font-medium
                             hover:bg-gray-50 transition"
                >
                  ← Back
                </button>

                {/* Create Project — type="button" — ONLY this creates */}
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-700
                             disabled:opacity-60 disabled:cursor-not-allowed
                             text-white rounded-xl py-2.5 text-sm
                             font-semibold transition"
                >
                  {saving ? "Creating..." : "Create Project"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
