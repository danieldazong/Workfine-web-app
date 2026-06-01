import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAppData } from "../context/AppDataContext";
import { useAuth } from "../context/AuthContext";
import { db } from "../lib/firebase/config";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  X,
  Send,
  Trash2,
  Clock,
  Calendar,
  User as UserIcon,
  Tag,
  FolderKanban,
} from "lucide-react";

export interface Task {
  id: string;
  taskCode?: string;
  title: string;
  status: string;
  priority: string;
  projectId?: string;
  projectCode?: string;
  assignee?: string;
  dueDate?: string;
  description?: string;
  createdAt?: any;
  [key: string]: any;
}

interface TaskDetailModalProps {
  task: Task;
  onClose: () => void;
}

interface Comment {
  id: string;
  text: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  createdAt?: any;
  mentions?: string[];
}

const STATUS_STYLE: Record<string, string> = {
  "To Do": "bg-gray-100 text-gray-600",
  "In Progress": "bg-blue-100 text-blue-600",
  "In Review": "bg-purple-100 text-purple-600",
  "Done": "bg-emerald-100 text-emerald-600",
};

const PRIORITY_STYLE: Record<string, string> = {
  High: "bg-red-100 text-red-600",
  Medium: "bg-amber-100 text-amber-600",
  Low: "bg-gray-100 text-gray-500",
};

const MENTION_REGEX = /(#(?:TSK|PRJ)-\d+)/g;
const MENTION_EXTRACT = /#((?:TSK|PRJ)-\d+)/g;

function extractMentions(text: string): string[] {
  const matches: string[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(MENTION_EXTRACT.source, "g");
  while ((match = re.exec(text)) !== null) {
    matches.push(match[1]);
  }
  return matches;
}

function toMs(v: any): number {
  if (!v) return 0;
  if (typeof v?.toMillis === "function") return v.toMillis();
  if (typeof v?.seconds === "number") return v.seconds * 1000;
  return new Date(v).getTime();
}

function timeAgo(date: Date): string {
  const now = Date.now();
  const then = date.getTime();
  if (!then || isNaN(then)) return "";
  const diff = Math.max(0, now - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function monogramGradient(seed: string): string {
  const s = String(seed || "?").trim().toLowerCase();

  let h1 = 0;
  let h2 = 0;
  let h3 = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = (c + ((h1 << 5) - h1)) | 0;
    h2 = (c * 31 + ((h2 << 7) - h2)) | 0;
    h3 = (c * 17 + ((h3 << 3) - h3)) | 0;
  }

  const hue1 = Math.abs(h1) % 360;
  const hueGap = 25 + (Math.abs(h2) % 90);
  const hue2 = (hue1 + hueGap) % 360;

  const sat1 = 58 + (Math.abs(h2) % 28);
  const sat2 = 58 + (Math.abs(h3) % 28);
  const light1 = 48 + (Math.abs(h3) % 16);
  const light2 = 38 + (Math.abs(h1) % 14);
  const angle = Math.abs(h2 ^ h3) % 360;

  return `linear-gradient(${angle}deg, hsl(${hue1} ${sat1}% ${light1}%), hsl(${hue2} ${sat2}% ${light2}%))`;
}


export default function TaskDetailModal({ task, onClose }: TaskDetailModalProps) {
  const navigate = useNavigate();
    const { user, workspaceId } = useAuth();
  const {
    projects = [],
    tasks: allTasks = [],
    members = [],
    workspaceData,
  } = useAppData() as any;

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);
  const [description, setDescription] = useState(task.description ?? "");
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [mentionStart, setMentionStart] = useState<number>(-1);
  const [mentionTooltip, setMentionTooltip] = useState<string | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  const project = task.projectId
    ? projects.find((p: any) => p.id === task.projectId)
    : null;
       const myMembership = Array.isArray(members)
    ? members.find((member: any) => {
        const memberUid = member.userId || member.uid || member.id;
        return !!user?.uid && memberUid === user.uid;
      })
    : null;

  const myRole = (
    workspaceData?.ownerId === user?.uid
      ? "owner"
      : String(myMembership?.role || "viewer").toLowerCase()
  ) as "owner" | "admin" | "member" | "viewer";

  const isViewerOnly =
    myRole === "viewer" ||
    myMembership?.permissions?.canViewOnly === true;

  const canEditTaskContent =
    !isViewerOnly &&
    (myRole === "owner" ||
      myRole === "admin" ||
      myMembership?.permissions?.canEdit === true ||
      myMembership?.permissions?.canManageTasks === true);

  const canCommentOnTask =
    !isViewerOnly &&
    (canEditTaskContent ||
      myRole === "member" ||
      myMembership?.permissions?.canComment === true);
  // Slide-in animation
  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Real-time comments listener
  useEffect(() => {
    if (!user?.uid || !task.id) return;
    const q = query(
      collection(db, "users", user.uid, "tasks", task.id, "comments"),
      orderBy("createdAt", "asc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const data: Comment[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Comment, "id">),
        }));
        setComments(data);
      },
      (err) => console.error("[TaskDetailModal] comments listener:", err.message)
    );
    return () => unsub();
  }, [user?.uid, task.id]);

  // Sync local description when task changes
  useEffect(() => {
    setDescription(task.description ?? "");
  }, [task.id, task.description]);

  // Auto-scroll to newest comment
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments.length]);

  function handleClose() {
    setClosing(true);
    setTimeout(() => onClose(), 280);
  }

  async function handleDescriptionBlur() {
        if (!user?.uid || !canEditTaskContent) return;
    if ((task.description ?? "") === description) return;
    try {
      await updateDoc(doc(db, "users", user.uid, "tasks", task.id), {
        description,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error("[TaskDetailModal] description save:", e);
    }
  }

  async function handleSendComment() {
    if (!user?.uid || !commentText.trim() || sending) return;
    if (!canCommentOnTask) {
      console.warn("[TaskDetailModal] comment blocked: viewer access");
      return;
    }
    setSending(true);
    try {
      const text = commentText.trim();
      const authorName =
        user.displayName ?? user.email ?? "User";
      await addDoc(
        collection(db, "users", user.uid, "tasks", task.id, "comments"),
        {
          text,
          authorId: user.uid,
          authorName,
          authorAvatar: authorName[0]?.toUpperCase() ?? "U",
          createdAt: serverTimestamp(),
          mentions: extractMentions(text),
        }
      );
      setCommentText("");
      setShowMentionPicker(false);
    } catch (e) {
      console.error("[TaskDetailModal] send comment:", e);
    } finally {
      setSending(false);
    }
  }

  async function handleDeleteComment(c: Comment) {
    if (!user?.uid) return;
    if (c.authorId !== user.uid) return;
    try {
      await deleteDoc(
        doc(db, "users", user.uid, "tasks", task.id, "comments", c.id)
      );
    } catch (e) {
      console.error("[TaskDetailModal] delete comment:", e);
    }
  }

  function handleMentionClick(token: string) {
    const code = token.startsWith("#") ? token.slice(1) : token;
    if (code.startsWith("TSK-")) {
      navigate("/my-tasks?highlight=" + code);
      handleClose();
    } else if (code.startsWith("PRJ-")) {
      const found = projects.find((p: any) => p.code === code);
      if (found) {
        navigate("/projects/" + found.id);
        handleClose();
      } else {
        setMentionTooltip("Project not found: " + code);
        setTimeout(() => setMentionTooltip(null), 2000);
      }
    }
  }

  function renderCommentText(text: string): React.ReactNode {
    const parts = text.split(MENTION_REGEX);
    return parts.map((part, i) => {
      if (MENTION_REGEX.test(part)) {
        // Reset lastIndex because /g regex retains state across .test calls
        MENTION_REGEX.lastIndex = 0;
        return (
          <span
            key={i}
            onClick={(e) => {
              e.stopPropagation();
              handleMentionClick(part);
            }}
            className="text-violet-600 font-medium bg-violet-50 px-1 rounded cursor-pointer hover:bg-violet-100 hover:underline transition-colors font-mono text-sm"
          >
            {part}
          </span>
        );
      }
      MENTION_REGEX.lastIndex = 0;
      return <span key={i}>{part}</span>;
    });
  }

  // Mention autocomplete suggestions
  const mentionSuggestions = useMemo(() => {
    if (!showMentionPicker) return [];
    const q = mentionFilter.toLowerCase();
    const taskItems = allTasks
      .filter((t: any) => t.taskCode)
      .map((t: any) => ({
        code: t.taskCode as string,
        label: t.title as string,
        kind: "TSK" as const,
      }));
    const projectItems = projects
      .filter((p: any) => p.code)
      .map((p: any) => ({
        code: p.code as string,
        label: p.name as string,
        kind: "PRJ" as const,
      }));
    const all = [...taskItems, ...projectItems];
    if (!q) return all.slice(0, 8);
    return all
      .filter(
        (it) =>
          it.code.toLowerCase().includes(q) ||
          it.label.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [showMentionPicker, mentionFilter, allTasks, projects]);

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setCommentText(val);
    const caret = e.target.selectionStart ?? val.length;
    // Look back for nearest # within current word (no whitespace between)
    const upToCaret = val.slice(0, caret);
    const hashIdx = upToCaret.lastIndexOf("#");
    if (hashIdx >= 0) {
      const between = upToCaret.slice(hashIdx + 1);
      if (!/\s/.test(between)) {
        setShowMentionPicker(true);
        setMentionFilter(between);
        setMentionStart(hashIdx);
        return;
      }
    }
    setShowMentionPicker(false);
    setMentionFilter("");
    setMentionStart(-1);
  }

  function insertMention(item: { code: string; kind: "TSK" | "PRJ" }) {
    if (mentionStart < 0) return;
    const before = commentText.slice(0, mentionStart);
    const caret = inputRef.current?.selectionStart ?? commentText.length;
    const after = commentText.slice(caret);
    const inserted = `#${item.code} `;
    const next = before + inserted + after;
    setCommentText(next);
    setShowMentionPicker(false);
    setMentionFilter("");
    setMentionStart(-1);
    requestAnimationFrame(() => {
      const pos = (before + inserted).length;
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(pos, pos);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (showMentionPicker && e.key === "Enter" && mentionSuggestions.length > 0) {
      e.preventDefault();
      insertMention(mentionSuggestions[0]);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSendComment();
      return;
    }
    if (e.key === "Escape" && showMentionPicker) {
      e.preventDefault();
      e.stopPropagation();
      setShowMentionPicker(false);
    }
  }

  const createdDate = task.createdAt
    ? new Date(toMs(task.createdAt)).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  const dueDateLabel = task.dueDate
    ? new Date(task.dueDate + "T12:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "No due date";

  const slideClass =
    !mounted || closing ? "translate-x-full" : "translate-x-0";

  return (
    <>
      {/* Overlay */}
      <div
        onClick={handleClose}
        className={`fixed inset-0 bg-black/30 z-[80] transition-opacity duration-300 ${
          mounted && !closing ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Side panel */}
      <div
        className={`fixed right-0 top-0 h-screen w-full max-w-2xl bg-white shadow-2xl z-[81] flex flex-col transform transition-transform duration-300 ease-in-out ${slideClass}`}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-slate-200">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {task.taskCode && (
                <span className="font-mono bg-slate-100 text-slate-500 text-xs px-2 py-1 rounded">
                  {task.taskCode}
                </span>
              )}
              <span
                className={`text-xs px-2 py-1 rounded-full font-medium ${
                  STATUS_STYLE[task.status] ?? "bg-gray-100 text-gray-500"
                }`}
              >
                {task.status ?? "To Do"}
              </span>
              <span
                className={`text-xs px-2 py-1 rounded-full font-medium ${
                  PRIORITY_STYLE[task.priority] ?? "bg-gray-100 text-gray-500"
                }`}
              >
                {task.priority ?? "Low"}
              </span>
              {project && (
                <span
                  onClick={() => {
                    navigate("/projects/" + project.id);
                    handleClose();
                  }}
                  className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-slate-50 border border-slate-200 text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: project.color ?? "#8b5cf6" }}
                  />
                  {project.code ? `${project.code} · ` : ""}
                  {project.name}
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold text-slate-800 leading-snug pr-4">
              {task.title}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full w-8 h-8 flex items-center justify-center transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Task details card */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-slate-600">
              <Calendar size={14} className="text-slate-400" />
              <span className="text-xs text-slate-400">Due:</span>
              <span className="font-medium">{dueDateLabel}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <UserIcon size={14} className="text-slate-400" />
              <span className="text-xs text-slate-400">Assignee:</span>
              {task.assignee ? (
                                <div className="flex items-center gap-1.5">
                  <div
                    className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold ring-1 ring-black/5 select-none"
                    style={{
                      background: monogramGradient(task.assignee),
                      letterSpacing: "0.02em",
                    }}
                  >
                    {task.assignee[0]?.toUpperCase()}
                  </div>
                  <span className="font-medium truncate">{task.assignee}</span>
                </div>

              ) : (
                <span className="text-slate-400 italic">Unassigned</span>
              )}
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <Clock size={14} className="text-slate-400" />
              <span className="text-xs text-slate-400">Created:</span>
              <span className="font-medium">{createdDate}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <FolderKanban size={14} className="text-slate-400" />
              <span className="text-xs text-slate-400">Project:</span>
              {project ? (
                <span
                  onClick={() => {
                    navigate("/projects/" + project.id);
                    handleClose();
                  }}
                  className="font-medium text-violet-600 cursor-pointer hover:underline truncate"
                >
                  {project.code ? `${project.code} · ` : ""}
                  {project.name}
                </span>
              ) : (
                <span className="text-slate-400 italic">No project</span>
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Tag size={14} className="text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-700">
                Description
              </h3>
            </div>
            <textarea
              value={description}
                            onChange={(e) => {
                if (!canEditTaskContent) return;
                setDescription(e.target.value);
              }}
              onBlur={handleDescriptionBlur}
              placeholder={
                canEditTaskContent
                  ? "Add a description..."
                  : "You do not have permission to edit this description."
              }
              disabled={!canEditTaskContent}
              className="bg-slate-50 rounded-xl p-4 border border-slate-200 w-full min-h-[100px] text-sm text-slate-600 focus:outline-none focus:border-violet-400 resize-none disabled:cursor-not-allowed disabled:opacity-70"
            />
          </div>

          {/* Comments */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-slate-700">Comments</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">
                {comments.length}
              </span>
            </div>

            {comments.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-3">
                No comments yet. Be the first to comment.
              </p>
            ) : (
              <div className="space-y-3">
                {comments.map((c) => {
                  const ts = c.createdAt ? new Date(toMs(c.createdAt)) : null;
                  const isMine = c.authorId === user?.uid;
                  return (
                    <div
                      key={c.id}
                      className="group flex items-start gap-3 p-3 rounded-xl bg-white border border-slate-100 hover:border-slate-200 transition-colors"
                    >
                                            <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ring-1 ring-black/5 select-none"
                        style={{
                          background: monogramGradient(c.authorName || c.authorId || "U"),
                          letterSpacing: "0.02em",
                        }}
                      >
                        {c.authorAvatar || "U"}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-slate-600 truncate">
                            {c.authorName}
                          </span>
                          {ts && (
                            <span className="text-[10px] text-slate-400">
                              {timeAgo(ts)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-700 leading-snug whitespace-pre-wrap break-words">
                          {renderCommentText(c.text)}
                        </p>
                      </div>
                      {isMine && (
                        <button
                          onClick={() => handleDeleteComment(c)}
                          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all flex-shrink-0"
                          title="Delete comment"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
                <div ref={commentsEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Comment input */}
        <div className="border-t border-slate-200 px-6 py-4 bg-white relative">
          {mentionTooltip && (
            <div className="absolute -top-9 left-6 bg-slate-800 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg">
              {mentionTooltip}
            </div>
          )}

          {showMentionPicker && mentionSuggestions.length > 0 && (
            <div className="absolute bottom-[calc(100%-4px)] left-6 right-6 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto z-50 mb-2">
              {mentionSuggestions.map((it) => (
                <button
                  key={it.kind + it.code}
                  type="button"
                  onClick={() => insertMention(it)}
                  className="w-full text-left px-3 py-2 hover:bg-violet-50 transition-colors flex items-center gap-2 border-b border-slate-50 last:border-0"
                >
                  <span
                    className={`font-mono text-xs px-1.5 py-0.5 rounded ${
                      it.kind === "TSK"
                        ? "bg-blue-50 text-blue-600"
                        : "bg-violet-50 text-violet-600"
                    }`}
                  >
                    {it.code}
                  </span>
                  <span className="text-sm text-slate-700 truncate">
                    {it.label}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
                                   <textarea
              ref={inputRef}
              value={commentText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={
                isViewerOnly
                  ? "You have viewer access — commenting is disabled."
                  : canCommentOnTask
                    ? "Add a comment... use #TSK-001 or #PRJ-001 to mention"
                    : "You only have view access."
              }
              rows={2}
              disabled={!canCommentOnTask}
              className="flex-1 bg-slate-50 rounded-xl px-3 py-2 border border-slate-200 text-sm text-slate-700 focus:outline-none focus:border-violet-400 resize-none disabled:cursor-not-allowed disabled:opacity-70"
            />

            <button
              onClick={handleSendComment}
              disabled={!commentText.trim() || sending || !canCommentOnTask}
              className="bg-violet-600 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >

              <Send size={14} />
              Send
            </button>
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5">
            Press Ctrl/Cmd + Enter to send · Type # to mention
          </p>
        </div>
      </div>
    </>
  );
}
