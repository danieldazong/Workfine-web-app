import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  query as firestoreQuery,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import {
  X,
  Send,
  Trash2,
  Edit2,
  ArrowLeft,
  Calendar,
  User as UserIcon,
  Tag,
  Clock,
  MessageCircle,
  FolderKanban,
  Smile,
  Search,
  Clock3,
  Heart,
  Coffee,
  Activity,
  Plane,
  Lightbulb,
  Hash,
  Flag,
  Plus,
  Type,
  AtSign,
  Star,
  Paperclip,
  Sparkles,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Code2,
  Link as LinkIcon,
} from "lucide-react";

import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import { useMentionableUsers } from "../hooks/useMentionableUsers";
import { storageService, UploadedAttachment } from "../lib/firebase/storage";




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

interface TaskDetailPanelProps {
  task: Task;
  onClose: () => void;
  onEdit: (task: Task) => void;
}

interface Comment {
  id: string;
  text: string;
  authorId: string;
  authorName: string;
  createdAt?: any;
  mentions?: string[];
  attachments?: UploadedAttachment[];
  /** emoji char (with skin tone applied) → array of user UIDs who reacted */
  reactions?: Record<string, string[]>;
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
const PRIORITY_DOT: Record<string, string> = {
  High: "bg-red-500",
  Medium: "bg-amber-400",
  Low: "bg-gray-400",
};

// ── Emoji reaction picker (Asana-style) ──────────────────────────────────────
const RECENT_EMOJI_KEY = "wf:recentEmojis";
const SKIN_TONE_KEY = "wf:emojiSkinTone";
const MAX_RECENT = 24;
const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "😮", "😢"];

type EmojiCategoryKey =
  | "recent"
  | "smileys"
  | "people"
  | "nature"
  | "food"
  | "activity"
  | "travel"
  | "objects"
  | "symbols"
  | "flags";

interface EmojiCategory {
  key: EmojiCategoryKey;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  emojis: string[];
  /** Indexes within emojis[] that accept skin-tone modifiers (people/hands). */
  toneable?: Set<number>;
}

const SKIN_TONES = ["", "🏻", "🏼", "🏽", "🏾", "🏿"] as const;
type SkinTone = (typeof SKIN_TONES)[number];

const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    key: "smileys",
    label: "Smileys & Emotion",
    icon: Smile,
    emojis: [
      "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩",
      "😘","😗","☺️","😚","😙","🥲","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔",
      "🤐","🤨","😐","😑","😶","😏","😒","🙄","😬","🤥","😌","😔","😪","🤤","😴","😷",
      "🤒","🤕","🤢","🤮","🤧","🥵","🥶","🥴","😵","🤯","🤠","🥳","🥸","😎","🤓","🧐",
      "😕","😟","🙁","☹️","😮","😯","😲","😳","🥺","😦","😧","😨","😰","😥","😢","😭",
      "😱","😖","😣","😞","😓","😩","😫","🥱","😤","😡","😠","🤬","😈","👿","💀","💩",
    ],
  },
  {
    key: "people",
    label: "People & Body",
    icon: UserIcon,
    // First 24 here are skin-toneable hands/people gestures
    emojis: [
      "👍","👎","👌","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","👇","☝️","✋","🤚","🖐️",
      "🖖","👋","🤝","👏","🙌","🙏","💪","🦵","🦶","👂","👃","🧠","👀","👁️","👅","👄",
      "👶","🧒","👦","👧","🧑","👱","👨","🧔","👩","🧓","👴","👵","🙍","🙎","🙅","🙆",
      "💁","🙋","🧏","🙇","🤦","🤷","👮","🕵️","💂","👷","🤴","👸","🥷","🧑‍🚀","👨‍🍳","👩‍⚕️",
    ],
    toneable: new Set(Array.from({ length: 24 }, (_, i) => i)),
  },
  {
    key: "nature",
    label: "Animals & Nature",
    icon: Heart,
    emojis: [
      "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🐔",
      "🐧","🐦","🐤","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🐛","🦋","🐌","🐞",
      "🐢","🐍","🦎","🐙","🦑","🦀","🐠","🐟","🐡","🐬","🦈","🐳","🐋","🌵","🎄","🌲",
      "🌳","🌴","🌱","🌿","☘️","🍀","🎋","🍃","🍂","🍁","🌾","🌺","🌻","🌹","🌷","🌼",
    ],
  },
  {
    key: "food",
    label: "Food & Drink",
    icon: Coffee,
    emojis: [
      "🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍈","🍒","🍑","🥭","🍍","🥥",
      "🥝","🍅","🍆","🥑","🥦","🥬","🥒","🌶️","🌽","🥕","🧄","🧅","🥔","🍠","🥐","🥯",
      "🍞","🥖","🥨","🧀","🥚","🍳","🧈","🥞","🧇","🥓","🥩","🍗","🍖","🌭","🍔","🍟",
      "🍕","🥪","🌮","🌯","🥗","🍝","🍜","🍲","🍣","🍱","🍤","🍙","🍚","🍰","🎂","🍩",
      "🍪","🍫","🍬","🍭","🍮","🍯","🍵","☕","🍺","🍷","🥂","🍸","🍹","🥤","🧋","🍾",
    ],
  },
  {
    key: "activity",
    label: "Activities",
    icon: Activity,
    emojis: [
      "⚽","🏀","🏈","⚾","🥎","🎾","🏐","🏉","🎱","🏓","🏸","🥅","🏒","🏑","🥍","🏏",
      "⛳","🏹","🎣","🥊","🥋","🎽","🛹","🛼","🛷","⛸️","🥌","🎿","⛷️","🏂","🏋️","🤼",
      "🤸","⛹️","🤺","🤾","🏌️","🏇","🧘","🏄","🏊","🤽","🚣","🧗","🚵","🚴","🏆","🥇",
      "🥈","🥉","🏅","🎖️","🎗️","🎫","🎟️","🎪","🎭","🎨","🎬","🎤","🎧","🎼","🎹","🥁",
    ],
  },
  {
    key: "travel",
    label: "Travel & Places",
    icon: Plane,
    emojis: [
      "🚗","🚕","🚙","🚌","🚎","🏎️","🚓","🚑","🚒","🚐","🛻","🚚","🚛","🚜","🛵","🏍️",
      "🛴","🚲","🛺","🚔","🚍","🚘","🚖","🚡","🚠","🚟","🚃","🚋","🚞","🚝","🚄","🚅",
      "🚈","🚂","🚆","🚇","🚊","🚉","✈️","🛫","🛬","🛩️","💺","🛰️","🚀","🛸","🚁","🛶",
      "⛵","🚤","🛥️","🛳️","⛴️","🚢","⚓","⛽","🚧","🚦","🚥","🗺️","🗿","🗽","🗼","🏰",
    ],
  },
  {
    key: "objects",
    label: "Objects",
    icon: Lightbulb,
    emojis: [
      "💡","🔦","🕯️","🧯","🛢️","💸","💵","💴","💶","💷","🪙","💰","💳","💎","⚖️","🪜",
      "🧰","🔧","🔨","⚒️","🛠️","⛏️","🪚","🔩","⚙️","🪛","🧲","🔫","💣","🧨","🪓","🔪",
      "🛡️","🚬","⚰️","🪦","⚱️","🏺","🔮","📿","🧿","💈","⚗️","🔭","🔬","🕳️","🩹","🩺",
      "💊","💉","🩸","🧬","🦠","🧫","🧪","🌡️","🧹","🧺","🧻","🚽","🚰","🚿","🛁","🛀",
    ],
  },
  {
    key: "symbols",
    label: "Symbols",
    icon: Hash,
    emojis: [
      "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖",
      "💘","💝","💟","☮️","✝️","☪️","🕉️","☸️","✡️","🔯","🕎","☯️","☦️","🛐","⛎","♈",
      "♉","♊","♋","♌","♍","♎","♏","♐","♑","♒","♓","🆔","⚛️","🉑","☢️","☣️",
      "📴","📳","🈶","🈚","🈸","🈺","🈷️","✴️","🆚","💮","🉐","㊙️","㊗️","🈴","🈵","🈹",
      "✅","❎","❌","⭕","🛑","⛔","📛","🚫","💯","💢","♨️","🚷","🚯","🚳","🚱","🔞",
    ],
  },
  {
    key: "flags",
    label: "Flags",
    icon: Flag,
    emojis: [
      "🏁","🚩","🎌","🏴","🏳️","🏳️‍🌈","🏳️‍⚧️","🏴‍☠️","🇺🇸","🇬🇧","🇨🇦","🇦🇺","🇩🇪","🇫🇷","🇪🇸","🇮🇹",
      "🇯🇵","🇨🇳","🇰🇷","🇮🇳","🇧🇷","🇲🇽","🇿🇦","🇳🇬","🇰🇪","🇪🇬","🇸🇦","🇦🇪","🇹🇷","🇷🇺","🇸🇪","🇳🇴",
      "🇩🇰","🇫🇮","🇳🇱","🇧🇪","🇨🇭","🇦🇹","🇵🇱","🇨🇿","🇬🇷","🇵🇹","🇮🇪","🇳🇿","🇸🇬","🇲🇾","🇹🇭","🇻🇳",
    ],
  },
];

function applySkinTone(emoji: string, tone: SkinTone): string {
  if (!tone) return emoji;
  // Strip any existing tone modifier first
  const stripped = emoji.replace(/[\u{1F3FB}-\u{1F3FF}]/gu, "");
  return stripped + tone;
}

function loadRecentEmojis(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_EMOJI_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function saveRecentEmoji(emoji: string): string[] {
  const current = loadRecentEmojis().filter((e) => e !== emoji);
  const next = [emoji, ...current].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_EMOJI_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return next;
}

function loadSkinTone(): SkinTone {
  try {
    const raw = (localStorage.getItem(SKIN_TONE_KEY) ?? "") as SkinTone;
    return SKIN_TONES.includes(raw) ? raw : "";
  } catch {
    return "";
  }
}

function saveSkinTone(tone: SkinTone): void {
  try {
    localStorage.setItem(SKIN_TONE_KEY, tone);
  } catch {
    /* ignore */
  }
}

const MENTION_SPLIT = /(#(?:TSK|PRJ)-\d+)/g;


function extractMentions(text: string): string[] {
  const regex = /#((?:TSK|PRJ)-\d+)/g;
  const matches: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
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

function timeAgo(timestamp: any): string {
  const ms = toMs(timestamp);
  if (!ms) return "";
  const date = new Date(ms);
  const diff = Date.now() - date.getTime();
  if (diff < 0) return "just now";
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isOverdue(task: Task): boolean {
  if (!task.dueDate) return false;
  const status = (task.status ?? "").toLowerCase();
  if (status === "done" || status === "completed") return false;
  const due = new Date(task.dueDate + "T12:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

export default function TaskDetailPanel({
  task,
  onClose,
  onEdit,
}: TaskDetailPanelProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { projects = [], tasks: allTasks = [] } = useAppData() as any;

    const [comments, setComments] = useState<Comment[]>([]);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [savingDescription, setSavingDescription] = useState(false);
  const [commentText, setCommentText] = useState("");
const [uploadingAttachment, setUploadingAttachment] = useState(false);
const [sending, setSending] = useState(false);


  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);

    // Task/project mentions (triggered by #)
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [mentionStart, setMentionStart] = useState<number>(-1);

  // User mentions (triggered by @)
  const [showUserSuggestions, setShowUserSuggestions] = useState(false);
  const [userMentionFilter, setUserMentionFilter] = useState("");
  const [userMentionStart, setUserMentionStart] = useState<number>(-1);

  // Mentionable users (workspace members + shared project members).
  // Phase 1: returns []. Phase 2: real list.
  const mentionableUsers = useMentionableUsers(task.projectId);

   const [toast, setToast] = useState<string | null>(null);

  // Composer expand/collapse state (Asana-style progressive disclosure)
 const [composerExpanded, setComposerExpanded] = useState(false);
const [showComposerEmojiPicker, setShowComposerEmojiPicker] = useState(false);
const [showFormattingToolbar, setShowFormattingToolbar] = useState(false);


  // Reaction picker state
  const [pickerForCommentId, setPickerForCommentId] = useState<string | null>(null);
  const [emojiSearch, setEmojiSearch] = useState("");
  const [activeCategory, setActiveCategory] =
    useState<EmojiCategoryKey>("smileys");
  const [recentEmojis, setRecentEmojis] = useState<string[]>(() =>
    loadRecentEmojis()
  );
  const [skinTone, setSkinTone] = useState<SkinTone>(() => loadSkinTone());
  const [showSkinTonePicker, setShowSkinTonePicker] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
const fileInputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const emojiSearchInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const composerEmojiPickerRef = useRef<HTMLDivElement>(null);

  // Insert an emoji at the current cursor position in the composer textarea
  const insertEmojiIntoComposer = useCallback(
    (rawEmoji: string, isToneable: boolean) => {
      const emoji = isToneable ? applySkinTone(rawEmoji, skinTone) : rawEmoji;
      const ta = inputRef.current;
      const start = ta?.selectionStart ?? commentText.length;
      const end = ta?.selectionEnd ?? commentText.length;
      const next = commentText.slice(0, start) + emoji + commentText.slice(end);
      setCommentText(next);
      setRecentEmojis(saveRecentEmoji(emoji));
      setShowComposerEmojiPicker(false);
      requestAnimationFrame(() => {
        const pos = start + emoji.length;
        ta?.focus();
        ta?.setSelectionRange(pos, pos);
      });
    },
    [commentText, skinTone]
  );

  // Auto-collapse composer when clicking outside, but only if textarea is empty
  useEffect(() => {
    if (!composerExpanded) return;
    const onDown = (e: MouseEvent) => {
      const node = composerRef.current;
      if (node && !node.contains(e.target as Node)) {
        if (!commentText.trim()) {
  setComposerExpanded(false);
  setShowComposerEmojiPicker(false);
  setShowFormattingToolbar(false);
}

      }
    };
    const id = window.setTimeout(() => {
      document.addEventListener("mousedown", onDown);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", onDown);
    };
  }, [composerExpanded, commentText]);

  // Close composer emoji picker on outside click
  useEffect(() => {
    if (!showComposerEmojiPicker) return;
    const onDown = (e: MouseEvent) => {
      const node = composerEmojiPickerRef.current;
      if (node && !node.contains(e.target as Node)) {
        setShowComposerEmojiPicker(false);
      }
    };
    const id = window.setTimeout(() => {
      document.addEventListener("mousedown", onDown);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", onDown);
    };
  }, [showComposerEmojiPicker]);

  const project = task.projectId

    ? projects.find((p: any) => p.id === task.projectId)
    : null;

  const overdue = isOverdue(task);

  // Trigger slide-in animation on mount
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);



   // Close on Escape — but not while a popover (mention picker, emoji picker) is open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (pickerForCommentId) {
        setPickerForCommentId(null);
        setShowSkinTonePicker(false);
        return;
      }
      if (showSuggestions) return;
      handleClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSuggestions, pickerForCommentId]);
  // Close emoji picker on outside click
  useEffect(() => {
    if (!pickerForCommentId) return;
    const onDown = (e: MouseEvent) => {
      const node = pickerRef.current;
      if (node && !node.contains(e.target as Node)) {
        setPickerForCommentId(null);
        setShowSkinTonePicker(false);
      }
    };
    // Defer one frame so the click that OPENED the picker doesn't immediately close it
    const id = window.setTimeout(() => {
      document.addEventListener("mousedown", onDown);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", onDown);
    };
  }, [pickerForCommentId]);

  // Auto-focus the search field when the picker opens
  useEffect(() => {
    if (pickerForCommentId) {
      requestAnimationFrame(() => emojiSearchInputRef.current?.focus());
    } else {
      setEmojiSearch("");
      setActiveCategory("smileys");
    }
  }, [pickerForCommentId]);
  // Toggle a reaction on a comment (atomic write of the reactions map)
  const toggleReaction = useCallback(
    async (comment: Comment, emoji: string) => {
      if (!user?.uid) return;
      const reactions: Record<string, string[]> = { ...(comment.reactions ?? {}) };
      const current = reactions[emoji] ?? [];
      const has = current.includes(user.uid);
      const next = has
        ? current.filter((u) => u !== user.uid)
        : [...current, user.uid];
      if (next.length === 0) {
        delete reactions[emoji];
      } else {
        reactions[emoji] = next;
      }
      try {
        await updateDoc(
          doc(db, "users", user.uid, "tasks", task.id, "comments", comment.id),
          { reactions }
        );
      } catch (e) {
        console.error("[TaskDetailPanel] toggle reaction:", e);
      }
    },
    [user?.uid, task.id]
  );

  const handlePickEmoji = useCallback(
    (rawEmoji: string, isToneable: boolean) => {
      const emoji = isToneable ? applySkinTone(rawEmoji, skinTone) : rawEmoji;
      const commentId = pickerForCommentId;
      if (!commentId) return;
      const target = comments.find((c) => c.id === commentId);
      if (!target) return;
      toggleReaction(target, emoji);
      setRecentEmojis(saveRecentEmoji(emoji));
      setPickerForCommentId(null);
      setShowSkinTonePicker(false);
    },
    [pickerForCommentId, comments, toggleReaction, skinTone]
  );


   // Real-time comments listener — oldest first (chat order)
  useEffect(() => {
    if (!user?.uid || !task.id) return;
    const q = firestoreQuery(
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
      (err) => console.error("[TaskDetailPanel] comments listener:", err.message)
    );
    return () => unsub();
  }, [user?.uid, task.id]);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => onClose(), 280);
  }, [onClose]);

  const handleSend = useCallback(async () => {
  if (!user?.uid || !commentText.trim() || sending) return;

  setSending(true);

  try {
    const text = commentText.trim();
    const authorName = user.displayName ?? user.email ?? "User";

    await addDoc(
      collection(db, "users", user.uid, "tasks", task.id, "comments"),
      {
        text,
        authorId: user.uid,
        authorName,
        createdAt: serverTimestamp(),
        mentions: extractMentions(text),
        attachments: [],
      }
    );

    setCommentText("");
    setShowSuggestions(false);
    setMentionFilter("");
    setMentionStart(-1);
    setShowUserSuggestions(false);
    setUserMentionFilter("");
    setUserMentionStart(-1);
    setComposerExpanded(false);
    setShowComposerEmojiPicker(false);
  } catch (e) {
    console.error("[TaskDetailPanel] add comment:", e);
    setToast("Failed to send comment");
    setTimeout(() => setToast(null), 2500);
  } finally {
    setSending(false);
  }
}, [user, commentText, sending, task.id]);

const handleAttachFile = useCallback(
  async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    // Allows selecting the same file again later
    e.target.value = "";

    if (!file) return;

    if (!user?.uid) {
      setToast("You must be signed in to upload files");
      setTimeout(() => setToast(null), 2500);
      return;
    }

    if (!task.id) {
      setToast("Task ID is missing");
      setTimeout(() => setToast(null), 2500);
      return;
    }

    if (!task.projectId) {
      setToast("Project ID is missing for this task");
      setTimeout(() => setToast(null), 2500);
      return;
    }

    const maxSizeMb = 25;
    if (file.size > maxSizeMb * 1024 * 1024) {
      setToast(`File is too large. Max ${maxSizeMb}MB allowed.`);
      setTimeout(() => setToast(null), 2500);
      return;
    }

    setUploadingAttachment(true);

    try {
      const attachment = await storageService.uploadFile(
        user.uid,
        task.projectId,
        task.id,
        file
      );

      const authorName = user.displayName ?? user.email ?? "User";

await addDoc(
  collection(db, "users", user.uid, "tasks", task.id, "comments"),
  {
    text: "",
    authorId: user.uid,
    authorName,
    createdAt: serverTimestamp(),
    mentions: [],
    attachments: [attachment],
  }
);


      setCommentText("");
      setShowSuggestions(false);
      setMentionFilter("");
      setMentionStart(-1);
      setShowUserSuggestions(false);
      setUserMentionFilter("");
      setUserMentionStart(-1);
      setComposerExpanded(false);
      setShowComposerEmojiPicker(false);

      setToast("File uploaded");
      setTimeout(() => setToast(null), 1800);
    } catch (err) {
      console.error("[TaskDetailPanel] upload attachment:", err);
      setToast("File upload failed");
      setTimeout(() => setToast(null), 2500);
    } finally {
      setUploadingAttachment(false);
    }
  },
  [user, task.id, task.projectId, commentText]
);




    async function handleSaveDescription() {
    if (!user?.uid || savingDescription) return;
    const trimmed = descriptionDraft.trim();
    // No-op if unchanged
    if (trimmed === (task.description ?? "").trim()) {
      setEditingDescription(false);
      return;
    }
    setSavingDescription(true);
    try {
      await updateDoc(doc(db, "users", user.uid, "tasks", task.id), {
        description: trimmed,
        updatedAt: serverTimestamp(),
      });
      setEditingDescription(false);
    } catch (e) {
      console.error("[TaskDetailPanel] save description:", e);
    } finally {
      setSavingDescription(false);
    }
  }

  function startEditingDescription() {
    setDescriptionDraft(task.description ?? "");
    setEditingDescription(true);
  }

  function cancelEditingDescription() {
    setEditingDescription(false);
    setDescriptionDraft("");
  }

  async function handleDelete(c: Comment) {
    if (!user?.uid) return;
    if (c.authorId !== user.uid) return;
    try {
      await deleteDoc(
        doc(db, "users", user.uid, "tasks", task.id, "comments", c.id)
      );
    } catch (e) {
      console.error("[TaskDetailPanel] delete comment:", e);
    }
  }

  function handleMentionClick(code: string) {

    if (code.startsWith("TSK-")) {
      navigate("/my-tasks?highlight=" + code);
      handleClose();
    } else if (code.startsWith("PRJ-")) {
      const found = projects.find((p: any) => p.code === code);
      if (found) {
        navigate("/projects/" + found.id);
        handleClose();
      } else {
        setToast(`Project ${code} not found`);
        setTimeout(() => setToast(null), 2000);
      }
    }
  }

  function renderCommentText(text: string): React.ReactNode {
    const parts = text.split(MENTION_SPLIT);
    return parts.map((part, i) => {
      const m = part.match(/^#((?:TSK|PRJ)-\d+)$/);
      if (m) {
        const code = m[1];
        const isProject = code.startsWith("PRJ-");
        return (
          <span
            key={i}
            onClick={(e) => {
              e.stopPropagation();
              handleMentionClick(code);
            }}
            className={`${
              isProject ? "text-violet-700" : "text-violet-600"
            } font-medium bg-violet-50 px-1.5 py-0.5 rounded cursor-pointer hover:bg-violet-100 hover:underline transition-colors font-mono text-sm`}
          >
            {part}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
  }
function applyInlineFormat(prefix: string, suffix: string, placeholder: string) {
  const ta = inputRef.current;
  const start = ta?.selectionStart ?? commentText.length;
  const end = ta?.selectionEnd ?? commentText.length;
  const selected = commentText.slice(start, end);
  const content = selected || placeholder;
  const inserted = `${prefix}${content}${suffix}`;
  const next = commentText.slice(0, start) + inserted + commentText.slice(end);

  setCommentText(next);

  requestAnimationFrame(() => {
    ta?.focus();
    if (selected) {
      ta?.setSelectionRange(start, start + inserted.length);
    } else {
      ta?.setSelectionRange(
        start + prefix.length,
        start + prefix.length + placeholder.length
      );
    }
  });
}

function applyLineFormat(type: "bullet" | "number" | "quote") {
  const ta = inputRef.current;
  const start = ta?.selectionStart ?? commentText.length;
  const end = ta?.selectionEnd ?? commentText.length;
  const selected = commentText.slice(start, end) || "List item";

  const lines = selected.split("\n");

  const inserted = lines
    .map((line, index) => {
      const clean = line.replace(/^(-\s+|\d+\.\s+|>\s+)/, "");

      if (type === "bullet") return `- ${clean}`;
      if (type === "number") return `${index + 1}. ${clean}`;
      return `> ${clean}`;
    })
    .join("\n");

  const next = commentText.slice(0, start) + inserted + commentText.slice(end);

  setCommentText(next);

  requestAnimationFrame(() => {
    ta?.focus();
    ta?.setSelectionRange(start, start + inserted.length);
  });
}

function applyCodeBlock() {
  const ta = inputRef.current;
  const start = ta?.selectionStart ?? commentText.length;
  const end = ta?.selectionEnd ?? commentText.length;
  const selected = commentText.slice(start, end) || "code";
  const inserted = `\`\`\`\n${selected}\n\`\`\``;
  const next = commentText.slice(0, start) + inserted + commentText.slice(end);

  setCommentText(next);

  requestAnimationFrame(() => {
    ta?.focus();
    ta?.setSelectionRange(start + 4, start + 4 + selected.length);
  });
}

function applyLinkFormat() {
  const ta = inputRef.current;
  const start = ta?.selectionStart ?? commentText.length;
  const end = ta?.selectionEnd ?? commentText.length;
  const selected = commentText.slice(start, end) || "link text";

  const url = window.prompt("Enter URL");
  if (!url) {
    requestAnimationFrame(() => ta?.focus());
    return;
  }

  const safeUrl =
    url.startsWith("http://") || url.startsWith("https://")
      ? url
      : `https://${url}`;

  const inserted = `[${selected}](${safeUrl})`;
  const next = commentText.slice(0, start) + inserted + commentText.slice(end);

  setCommentText(next);

  requestAnimationFrame(() => {
    ta?.focus();
    ta?.setSelectionRange(start, start + inserted.length);
  });
}

function renderInlineFormattedText(
  text: string,
  isMine: boolean,
  keyPrefix = "inline"
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];

  const regex =
    /(\*\*([\s\S]+?)\*\*|_([\s\S]+?)_|~~([\s\S]+?)~~|<u>([\s\S]+?)<\/u>|`([^`]+?)`|\[([^\]]+?)\]\((https?:\/\/[^\s)]+)\)|#(?:TSK|PRJ)-\d+)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <React.Fragment key={`${keyPrefix}-plain-${idx}`}>
          {renderCommentText(text.slice(lastIndex, match.index))}
        </React.Fragment>
      );
      idx++;
    }

    const token = match[0];

    if (token.startsWith("**")) {
      nodes.push(
        <strong key={`${keyPrefix}-bold-${idx}`} className="font-semibold">
          {renderInlineFormattedText(match[2], isMine, `${keyPrefix}-bold-${idx}`)}
        </strong>
      );
    } else if (token.startsWith("_")) {
      nodes.push(
        <em key={`${keyPrefix}-italic-${idx}`} className="italic">
          {renderInlineFormattedText(match[3], isMine, `${keyPrefix}-italic-${idx}`)}
        </em>
      );
    } else if (token.startsWith("~~")) {
      nodes.push(
        <span key={`${keyPrefix}-strike-${idx}`} className="line-through">
          {renderInlineFormattedText(match[4], isMine, `${keyPrefix}-strike-${idx}`)}
        </span>
      );
    } else if (token.startsWith("<u>")) {
      nodes.push(
        <span key={`${keyPrefix}-underline-${idx}`} className="underline underline-offset-2">
          {renderInlineFormattedText(match[5], isMine, `${keyPrefix}-underline-${idx}`)}
        </span>
      );
    } else if (token.startsWith("`")) {
      nodes.push(
        <code
          key={`${keyPrefix}-code-${idx}`}
          className={`px-1.5 py-0.5 rounded text-[12px] font-mono ${
            isMine
              ? "bg-white/15 text-white"
              : "bg-slate-200/80 text-slate-800"
          }`}
        >
          {match[6]}
        </code>
      );
    } else if (token.startsWith("[")) {
      nodes.push(
        <a
          key={`${keyPrefix}-link-${idx}`}
          href={match[8]}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`font-medium underline underline-offset-2 ${
            isMine
              ? "text-white hover:text-violet-100"
              : "text-violet-600 hover:text-violet-700"
          }`}
        >
          {match[7]}
        </a>
      );
    } else if (token.startsWith("#")) {
      nodes.push(
        <React.Fragment key={`${keyPrefix}-mention-${idx}`}>
          {renderCommentText(token)}
        </React.Fragment>
      );
    }

    lastIndex = regex.lastIndex;
    idx++;
  }

  if (lastIndex < text.length) {
    nodes.push(
      <React.Fragment key={`${keyPrefix}-plain-end`}>
        {renderCommentText(text.slice(lastIndex))}
      </React.Fragment>
    );
  }

  return nodes;
}

function renderFormattedCommentText(
  text: string,
  isMine: boolean
): React.ReactNode {
  const codeBlockRegex = /```([\s\S]*?)```/g;
  const parts: React.ReactNode[] = [];

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let blockIndex = 0;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);

    if (before) {
      parts.push(
        <div key={`text-block-${blockIndex}`} className="space-y-1">
          {renderFormattedLines(before, isMine, `before-${blockIndex}`)}
        </div>
      );
    }

    parts.push(
      <pre
        key={`code-block-${blockIndex}`}
        className={`my-1 max-w-full overflow-x-auto rounded-xl px-3 py-2 text-xs font-mono leading-relaxed ${
          isMine
            ? "bg-black/20 text-white"
            : "bg-slate-900 text-slate-100"
        }`}
      >
        <code>{match[1].trim()}</code>
      </pre>
    );

    lastIndex = codeBlockRegex.lastIndex;
    blockIndex++;
  }

  const after = text.slice(lastIndex);

  if (after) {
    parts.push(
      <div key="text-block-after" className="space-y-1">
        {renderFormattedLines(after, isMine, "after")}
      </div>
    );
  }

  return <>{parts}</>;
}

function renderFormattedLines(
  text: string,
  isMine: boolean,
  keyPrefix: string
): React.ReactNode[] {
  return text.split("\n").map((line, index) => {
    const bulletMatch = line.match(/^-\s+(.+)$/);
    const numberMatch = line.match(/^(\d+)\.\s+(.+)$/);
    const quoteMatch = line.match(/^>\s+(.+)$/);

    if (bulletMatch) {
      return (
        <div key={`${keyPrefix}-bullet-${index}`} className="flex gap-2">
          <span className="mt-[1px]">•</span>
          <span>{renderInlineFormattedText(bulletMatch[1], isMine, `${keyPrefix}-bullet-${index}`)}</span>
        </div>
      );
    }

    if (numberMatch) {
      return (
        <div key={`${keyPrefix}-number-${index}`} className="flex gap-2">
          <span className="min-w-[18px]">{numberMatch[1]}.</span>
          <span>{renderInlineFormattedText(numberMatch[2], isMine, `${keyPrefix}-number-${index}`)}</span>
        </div>
      );
    }

    if (quoteMatch) {
      return (
        <blockquote
          key={`${keyPrefix}-quote-${index}`}
          className={`border-l-2 pl-2 italic ${
            isMine
              ? "border-white/40 text-white/90"
              : "border-slate-300 text-slate-600"
          }`}
        >
          {renderInlineFormattedText(quoteMatch[1], isMine, `${keyPrefix}-quote-${index}`)}
        </blockquote>
      );
    }

    return (
      <p key={`${keyPrefix}-line-${index}`} className="whitespace-pre-wrap break-words">
        {renderInlineFormattedText(line, isMine, `${keyPrefix}-line-${index}`)}
      </p>
    );
  });
}

  // Mention autocomplete suggestions, split into groups
  const taskItems = useMemo(
    () =>
      allTasks
        .filter((t: any) => t.taskCode)
        .map((t: any) => ({
          code: t.taskCode as string,
          label: t.title as string,
          priority: (t.priority as string) ?? "Low",
        })),
    [allTasks]
  );

  const projectItems = useMemo(
    () =>
      projects
        .filter((p: any) => p.code)
        .map((p: any) => ({
          code: p.code as string,
          label: p.name as string,
          color: (p.color as string) ?? "#8b5cf6",
        })),
    [projects]
  );

  const filteredTasks = useMemo(() => {
    if (!showSuggestions) return [];
    const q = mentionFilter.toLowerCase();
    if (!q) return taskItems.slice(0, 5);
    return taskItems
      .filter(
        (it: any) =>
          it.code.toLowerCase().includes(q) ||
          it.label.toLowerCase().includes(q)
      )
      .slice(0, 5);
  }, [showSuggestions, mentionFilter, taskItems]);

  const filteredProjects = useMemo(() => {
    if (!showSuggestions) return [];
    const q = mentionFilter.toLowerCase();
    if (!q) return projectItems.slice(0, 5);
    return projectItems
      .filter(
        (it: any) =>
          it.code.toLowerCase().includes(q) ||
          it.label.toLowerCase().includes(q)
      )
      .slice(0, 5);
  }, [showSuggestions, mentionFilter, projectItems]);

  const hasSuggestions =
    showSuggestions && (filteredTasks.length > 0 || filteredProjects.length > 0);

  // Filtered users for @ mention autocomplete
  const filteredUsers = useMemo(() => {
    if (!showUserSuggestions) return [];
    const q = userMentionFilter.toLowerCase();
    if (!q) return mentionableUsers.slice(0, 6);
    return mentionableUsers
      .filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          (u.email ?? "").toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [showUserSuggestions, userMentionFilter, mentionableUsers]);

  // Visible emojis based on search/category
  const visibleEmojiGroups = useMemo(() => {
    const q = emojiSearch.trim().toLowerCase();
    if (q) {
      // Search across all categories: match category label or emoji codepoint
      const all: { emoji: string; toneable: boolean }[] = [];
      EMOJI_CATEGORIES.forEach((cat) => {
        const labelMatch = cat.label.toLowerCase().includes(q);
        cat.emojis.forEach((e, idx) => {
          if (labelMatch || e.includes(q)) {
            all.push({ emoji: e, toneable: !!cat.toneable?.has(idx) });
          }
        });
      });
      return [{ key: "search" as const, label: "Search results", items: all }];
    }
    if (activeCategory === "recent") {
      return [
        {
          key: "recent" as const,
          label: "Frequently used",
          items: recentEmojis.map((e) => ({ emoji: e, toneable: false })),
        },
      ];
    }
    const cat = EMOJI_CATEGORIES.find((c) => c.key === activeCategory);
    if (!cat) return [];
    return [
      {
        key: cat.key,
        label: cat.label,
        items: cat.emojis.map((e, idx) => ({
          emoji: e,
          toneable: !!cat.toneable?.has(idx),
        })),
      },
    ];
  }, [emojiSearch, activeCategory, recentEmojis]);

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setCommentText(val);
    const caret = e.target.selectionStart ?? val.length;
    const upToCaret = val.slice(0, caret);

    const hashIdx = upToCaret.lastIndexOf("#");
    const atIdx = upToCaret.lastIndexOf("@");

    // Whichever trigger is closest to the caret wins
    if (atIdx > hashIdx && atIdx >= 0) {
      const between = upToCaret.slice(atIdx + 1);
      if (!/\s/.test(between)) {
        setShowUserSuggestions(true);
        setUserMentionFilter(between);
        setUserMentionStart(atIdx);
        setShowSuggestions(false);
        return;
      }
    } else if (hashIdx >= 0) {
      const between = upToCaret.slice(hashIdx + 1);
      if (!/\s/.test(between)) {
        setShowSuggestions(true);
        setMentionFilter(between);
        setMentionStart(hashIdx);
        setShowUserSuggestions(false);
        return;
      }
    }

    setShowSuggestions(false);
    setMentionFilter("");
    setMentionStart(-1);
    setShowUserSuggestions(false);
    setUserMentionFilter("");
    setUserMentionStart(-1);
  }


  function insertMention(code: string) {
    if (mentionStart < 0) return;
    const before = commentText.slice(0, mentionStart);
    const caret = inputRef.current?.selectionStart ?? commentText.length;
    const after = commentText.slice(caret);
    const inserted = `#${code} `;
    const next = before + inserted + after;
    setCommentText(next);
    setShowSuggestions(false);
    setMentionFilter("");
    setMentionStart(-1);
    requestAnimationFrame(() => {
      const pos = (before + inserted).length;
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(pos, pos);
    });
  }
  function insertUserMention(u: { id: string; name: string }) {
    if (userMentionStart < 0) return;
    const before = commentText.slice(0, userMentionStart);
    const caret = inputRef.current?.selectionStart ?? commentText.length;
    const after = commentText.slice(caret);
    // Store as @[Name](userId) for future structured rendering / notifications
    const inserted = `@[${u.name}](${u.id}) `;
    const next = before + inserted + after;
    setCommentText(next);
    setShowUserSuggestions(false);
    setUserMentionFilter("");
    setUserMentionStart(-1);
    requestAnimationFrame(() => {
      const pos = (before + inserted).length;
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(pos, pos);
    });
  }

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // User mention autocomplete (@): Enter picks the first suggestion
    if (showUserSuggestions && filteredUsers.length > 0 && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      insertUserMention(filteredUsers[0]);
      return;
    }
    // Task/project mention autocomplete (#): Enter picks the first suggestion
    if (hasSuggestions && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const first = filteredTasks[0] ?? filteredProjects[0];
      if (first) insertMention(first.code);
      return;
    }
    // Plain Enter sends; Shift+Enter inserts newline (chat convention)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }
    if (e.key === "Escape") {
      if (showSuggestions) {
        e.preventDefault();
        e.stopPropagation();
        setShowSuggestions(false);
      } else if (showUserSuggestions) {
        e.preventDefault();
        e.stopPropagation();
        setShowUserSuggestions(false);
      }
    }
  }



  const dueDateLabel = task.dueDate
    ? new Date(task.dueDate + "T12:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  const createdLabel = task.createdAt
    ? new Date(toMs(task.createdAt)).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  const userInitial =
    (user?.displayName ?? user?.email ?? "U")[0]?.toUpperCase() ?? "U";

  const slideClass = !mounted || closing ? "translate-x-full" : "translate-x-0";
  const overlayClass = mounted && !closing ? "opacity-100" : "opacity-0";

  return (
    <>
      {/* Overlay — clicking closes the panel */}
      <div
        onClick={handleClose}
        className={`fixed inset-0 bg-black/30 z-40 transition-opacity duration-300 ${overlayClass}`}
      />

      {/* Side panel */}
      <div
        className={`fixed right-0 top-0 h-screen w-full max-w-2xl bg-white shadow-2xl border-l border-slate-200 z-50 flex flex-col transform transition-transform duration-300 ease-in-out ${slideClass}`}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 flex-shrink-0">
          <button
            onClick={handleClose}
            className="text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg p-2 transition-colors flex-shrink-0"
            title="Back"
          >
            <ArrowLeft size={18} />
          </button>

          {task.taskCode && (
            <span className="font-mono text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded mr-2 flex-shrink-0">
              {task.taskCode}
            </span>
          )}

          <h2 className="text-xl font-bold text-slate-800 flex-1 min-w-0 truncate">
            {task.title}
          </h2>

          <button
            onClick={() => onEdit(task)}
            className="bg-violet-50 hover:bg-violet-100 text-violet-600 rounded-lg p-2 transition-colors flex-shrink-0"
            title="Edit task"
          >
            <Edit2 size={16} />
          </button>

          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg p-2 transition-colors flex-shrink-0"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

                {/* Body — scrollable area (task info + description + chat history) */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto px-5 pt-5 pb-3"
        >

                  {/* SECTION 1 + 2 — Sticky collapsible task summary */}
          <div className="sticky top-0 -mx-5 -mt-5 mb-4 px-5 pt-3 pb-3 bg-white/95 backdrop-blur border-b border-slate-200 z-10">
            <button
              type="button"
              onClick={() => setDetailsExpanded((v) => !v)}
              className="w-full flex items-center gap-2 text-left hover:bg-slate-50 rounded-lg px-2 py-1.5 transition-colors"
              aria-expanded={detailsExpanded}
              aria-label={detailsExpanded ? "Collapse task details" : "Expand task details"}
            >
              {/* Compact summary row — always visible */}
              <span
                className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                  STATUS_STYLE[task.status] ?? "bg-gray-100 text-gray-500"
                }`}
              >
                {task.status ?? "To Do"}
              </span>
              <span className="flex items-center gap-1 text-xs text-slate-600">
                <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[task.priority] ?? "bg-gray-400"}`} />
                {task.priority ?? "Low"}
              </span>
              {task.assignee ? (
                <span className="flex items-center gap-1 text-xs text-slate-600 truncate">
                  <span className="w-4 h-4 rounded-full bg-violet-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {task.assignee[0]?.toUpperCase()}
                  </span>
                  <span className="truncate max-w-[120px]">{task.assignee}</span>
                </span>
              ) : (
                <span className="text-xs text-slate-400 italic">Unassigned</span>
              )}
              <span className={`flex items-center gap-1 text-xs ${overdue ? "text-red-500 font-medium" : "text-slate-500"}`}>
                <Calendar size={12} />
                {dueDateLabel}
              </span>
              <span className="ml-auto text-slate-400 text-xs flex items-center gap-1">
                {detailsExpanded ? "Hide" : "Details"}
                <svg
                  className={`w-3.5 h-3.5 transition-transform ${detailsExpanded ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </button>

            {/* Expanded full details — hidden by default */}
            {detailsExpanded && (
              <div className="mt-3 bg-slate-50 rounded-2xl p-4 border border-slate-100">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">Status</p>
                    <span className={`inline-block text-xs px-2 py-1 rounded-full font-medium ${STATUS_STYLE[task.status] ?? "bg-gray-100 text-gray-500"}`}>
                      {task.status ?? "To Do"}
                    </span>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">Priority</p>
                    <span className={`inline-block text-xs px-2 py-1 rounded-full font-medium ${PRIORITY_STYLE[task.priority] ?? "bg-gray-100 text-gray-500"}`}>
                      {task.priority ?? "Low"}
                    </span>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">Due Date</p>
                    <div className={`flex items-center gap-1.5 ${overdue ? "text-red-500 font-medium" : "text-slate-700"}`}>
                      <Calendar size={14} />
                      <span>{dueDateLabel}</span>
                      {overdue && <span className="text-[10px] font-semibold uppercase ml-1">Overdue</span>}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">Assignee</p>
                    {task.assignee ? (
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-violet-500 flex items-center justify-center text-white text-[10px] font-bold">
                          {task.assignee[0]?.toUpperCase()}
                        </div>
                        <span className="text-slate-700 truncate">{task.assignee}</span>
                      </div>
                    ) : (
                      <span className="text-slate-400 italic flex items-center gap-1.5">
                        <UserIcon size={14} />
                        Unassigned
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">Project</p>
                    {project ? (
                      <div
                        onClick={() => {
                          navigate("/projects/" + project.id);
                          handleClose();
                        }}
                        className="flex items-center gap-2 cursor-pointer hover:text-violet-600 transition-colors"
                      >
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: project.color ?? "#8b5cf6" }} />
                        <span className="text-slate-700 truncate hover:text-violet-600">{project.name}</span>
                      </div>
                    ) : (
                      <span className="text-slate-400 italic flex items-center gap-1.5">
                        <FolderKanban size={14} />
                        No project
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">Task Code</p>
                    <span className="font-mono text-slate-500 text-sm">{task.taskCode ?? "—"}</span>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1.5">Created</p>
                    <div className="flex items-center gap-1.5 text-slate-700">
                      <Clock size={14} className="text-slate-400" />
                      <span>{createdLabel}</span>
                    </div>
                  </div>
                                   <div className="col-span-2 pt-3 border-t border-slate-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Tag size={14} className="text-slate-500" />
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 flex-1">Description</p>
                      {!editingDescription && (
                        <button
                          type="button"
                          onClick={startEditingDescription}
                          className="text-[11px] text-violet-600 hover:text-violet-700 font-medium flex items-center gap-1 hover:bg-violet-50 px-2 py-0.5 rounded transition-colors"
                          title="Edit description"
                        >
                          <Edit2 size={11} />
                          Edit
                        </button>
                      )}
                    </div>

                    {editingDescription ? (
                      <div className="space-y-2">
                        <textarea
                          autoFocus
                          value={descriptionDraft}
                          onChange={(e) => setDescriptionDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                              e.preventDefault();
                              handleSaveDescription();
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              e.stopPropagation();
                              cancelEditingDescription();
                            }
                          }}
                          placeholder="Add a description for this task..."
                          rows={4}
                          disabled={savingDescription}
                          className="w-full bg-white border border-violet-300 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 resize-y min-h-[80px] disabled:opacity-60"
                        />
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-slate-400">
                            <kbd className="font-mono bg-slate-100 px-1 rounded">⌘/Ctrl + Enter</kbd> to save · <kbd className="font-mono bg-slate-100 px-1 rounded">Esc</kbd> to cancel
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={cancelEditingDescription}
                              disabled={savingDescription}
                              className="text-xs px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={handleSaveDescription}
                              disabled={savingDescription}
                              className="text-xs px-3 py-1.5 rounded-lg bg-violet-600 text-white font-medium hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                            >
                              {savingDescription ? (
                                <>
                                  <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                  Saving...
                                </>
                              ) : (
                                "Save"
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : task.description ? (
                      <p
                        onClick={startEditingDescription}
                        className="text-sm text-slate-600 whitespace-pre-wrap cursor-text hover:bg-slate-100 rounded-lg px-2 py-1.5 -mx-2 transition-colors"
                        title="Click to edit"
                      >
                        {task.description}
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={startEditingDescription}
                        className="text-sm text-slate-400 italic hover:text-violet-600 hover:bg-violet-50 rounded-lg px-2 py-1.5 -mx-2 transition-colors w-full text-left"
                      >
                        + Add a description...
                      </button>
                    )}
                  </div>

                </div>
              </div>
            )}
          </div>

                 <div className="mt-6">
            <div className="flex items-center gap-2 mb-4 px-1">
              <MessageCircle size={14} className="text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-700 tracking-tight">Comments</h3>
              <span className="bg-violet-100 text-violet-600 text-[11px] px-2 py-0.5 rounded-full font-semibold">
                {comments.length}
              </span>
            </div>


           

                       {/* Comment list — chat-style bubbles */}
            {comments.length === 0 ? (
              <p className="text-sm text-slate-400 italic py-3 text-center">
                No comments yet. Start the conversation.
              </p>
            ) : (
              <div className="flex flex-col gap-1 px-1 py-2">
                {comments.map((c, idx) => {
                  const isMine = c.authorId === user?.uid;
                  const prev = comments[idx - 1];
                  const next = comments[idx + 1];

                  const cMs = toMs(c.createdAt);
                  const prevMs = toMs(prev?.createdAt);
                  const nextMs = toMs(next?.createdAt);

                  // Group consecutive messages from same author within 5 min
                  const sameAuthorAsPrev =
                    !!prev &&
                    prev.authorId === c.authorId &&
                    Math.abs(cMs - prevMs) < 5 * 60 * 1000;

                  const sameAuthorAsNext =
                    !!next &&
                    next.authorId === c.authorId &&
                    Math.abs(nextMs - cMs) < 5 * 60 * 1000;

                  // Day separator between different days (or before first message)
                  const showDaySeparator =
                    !prev ||
                    new Date(cMs || Date.now()).toDateString() !==
                      new Date(prevMs || Date.now()).toDateString();

                  const dayLabel = (() => {
                    if (!cMs) return "Today";
                    const d = new Date(cMs);
                    const today = new Date();
                    const yest = new Date();
                    yest.setDate(today.getDate() - 1);
                    if (d.toDateString() === today.toDateString()) return "Today";
                    if (d.toDateString() === yest.toDateString()) return "Yesterday";
                    return d.toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year:
                        d.getFullYear() !== today.getFullYear()
                          ? "numeric"
                          : undefined,
                    });
                  })();

                  const timeLabel = cMs
                    ? new Date(cMs).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "";

                  const initial =
                    (c.authorName ?? "U")[0]?.toUpperCase() ?? "U";

                  const reactionEntries = Object.entries(
                    c.reactions ?? {}
                  ) as [string, string[]][];

                  const isPickerOpen = pickerForCommentId === c.id;

const hasAttachments =
  Array.isArray(c.attachments) && c.attachments.length > 0;

const displayText = hasAttachments ? "" : c.text;

const messageActions = (
  <div
    className={`relative flex shrink-0 items-center gap-1 pb-1 transition-opacity ${
      isPickerOpen
        ? "opacity-100"
        : "opacity-100 md:opacity-0 md:group-hover:opacity-100"
    }`}
  >
    <button
      type="button"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        setPickerForCommentId((prev) =>
          prev === c.id ? null : c.id
        );
        setShowSkinTonePicker(false);
      }}
      className={`w-7 h-7 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center hover:bg-violet-50 hover:text-violet-600 transition-colors ${
        isPickerOpen
          ? "text-violet-600 bg-violet-50"
          : "text-slate-500"
      }`}
      title="Add reaction"
      aria-label="Add reaction"
    >
      <Smile size={13} />
    </button>

    {isMine && (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleDelete(c);
        }}
        className="w-7 h-7 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
        title="Delete comment"
        aria-label="Delete comment"
      >
        <Trash2 size={13} />
      </button>
    )}

    {/* Compact emoji picker — anchored to the side action icon */}
    {isPickerOpen && (
      <div
        ref={pickerRef}
        onMouseDown={(e) => e.stopPropagation()}
        className={`absolute bottom-9 z-[70] w-[280px] max-w-[calc(100vw-48px)] bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col ${
          isMine ? "right-0" : "left-0"
        }`}
        role="dialog"
        aria-label="Emoji reaction picker"
      >
        {/* Quick reactions row */}
        <div className="flex items-center gap-1 px-2.5 pt-2.5 pb-2 border-b border-slate-100">
          {QUICK_REACTIONS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => handlePickEmoji(e, false)}
              className="text-lg leading-none hover:scale-125 transition-transform p-1 rounded-md hover:bg-slate-50"
              title={`React with ${e}`}
            >
              {e}
            </button>
          ))}

          <div className="ml-auto relative">
            <button
              type="button"
              onClick={() => setShowSkinTonePicker((v) => !v)}
              className="w-7 h-7 rounded-lg border border-slate-200 hover:border-violet-300 flex items-center justify-center text-base bg-white"
              title="Skin tone"
              aria-label="Choose default skin tone"
            >
              {applySkinTone("✋", skinTone)}
            </button>

            {showSkinTonePicker && (
              <div className="absolute right-0 top-8 bg-white border border-slate-200 rounded-lg shadow-lg p-1 flex gap-0.5 z-10">
                {SKIN_TONES.map((tone) => (
                  <button
                    key={tone || "default"}
                    type="button"
                    onClick={() => {
                      setSkinTone(tone);
                      saveSkinTone(tone);
                      setShowSkinTonePicker(false);
                    }}
                    className={`w-7 h-7 rounded-md flex items-center justify-center text-base hover:bg-slate-100 ${
                      tone === skinTone
                        ? "bg-violet-50 ring-1 ring-violet-300"
                        : ""
                    }`}
                    title={tone ? `Tone ${tone}` : "Default"}
                  >
                    {applySkinTone("✋", tone)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="px-2.5 py-2 border-b border-slate-100">
          <div className="relative">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              ref={emojiSearchInputRef}
              value={emojiSearch}
              onChange={(e) => setEmojiSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  if (emojiSearch) setEmojiSearch("");
                  else setPickerForCommentId(null);
                }
              }}
              placeholder="Search emojis"
              className="w-full h-8 bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 text-xs text-slate-700 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
          </div>
        </div>

        {/* Category tabs */}
        {!emojiSearch && (
          <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-slate-100 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveCategory("recent")}
              className={`flex-shrink-0 p-1.5 rounded-md transition-colors ${
                activeCategory === "recent"
                  ? "bg-violet-100 text-violet-600"
                  : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              }`}
              title="Recent"
              aria-label="Recent"
            >
              <Clock3 size={14} />
            </button>

            {EMOJI_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const active = activeCategory === cat.key;

              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setActiveCategory(cat.key)}
                  className={`flex-shrink-0 p-1.5 rounded-md transition-colors ${
                    active
                      ? "bg-violet-100 text-violet-600"
                      : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                  }`}
                  title={cat.label}
                  aria-label={cat.label}
                >
                  <Icon size={14} />
                </button>
              );
            })}
          </div>
        )}

        {/* Emoji grid */}
        <div className="flex-1 overflow-y-auto max-h-[190px] px-2 py-2">
          {visibleEmojiGroups.map((group) => (
            <div key={group.key} className="mb-2">
              <p className="text-[9px] uppercase tracking-wider text-slate-400 px-1.5 py-1 font-semibold">
                {group.label}
              </p>

              {group.items.length === 0 ? (
                <p className="text-xs text-slate-400 italic px-2 py-3 text-center">
                  {emojiSearch ? "No emojis found" : "No recent emojis yet"}
                </p>
              ) : (
                <div className="grid grid-cols-7 gap-0.5">
                  {group.items.map((it, idx) => (
                    <button
                      key={`${group.key}-${it.emoji}-${idx}`}
                      type="button"
                      onClick={() =>
                        handlePickEmoji(it.emoji, it.toneable)
                      }
                      className="text-lg leading-none p-1.5 rounded-lg hover:bg-violet-50 hover:scale-110 transition-all"
                      title={
                        it.toneable
                          ? `${it.emoji} (skin tone applies)`
                          : it.emoji
                      }
                    >
                      {it.toneable
                        ? applySkinTone(it.emoji, skinTone)
                        : it.emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
);


return (


                    <div key={c.id}>
                      {/* Day separator pill */}
                      {showDaySeparator && (
                        <div className="flex justify-center my-3">
                          <span className="text-[11px] text-slate-500 bg-slate-100 px-3 py-1 rounded-full font-medium">
                            {dayLabel}
                          </span>
                        </div>
                      )}

                      {/* Message row */}
                      <div
                        className={`group flex items-end gap-2 ${
                          isMine ? "justify-end" : "justify-start"
                        } ${sameAuthorAsPrev ? "mt-0.5" : "mt-3"}`}
                      >
                        {/* Left avatar (incoming only, last in a group) */}
                        {!isMine && (
                          <div className="w-7 flex-shrink-0">
                            {!sameAuthorAsNext && (
                              <div className="w-7 h-7 rounded-full bg-violet-100 text-violet-600 text-xs font-bold flex items-center justify-center">
                                {initial}
                              </div>
                            )}
                          </div>
                        )}

                       {/* Bubble + meta column */}
<div
  className={`relative flex flex-col max-w-[82%] ${
    isMine ? "items-end" : "items-start"
  }`}
>
  {/* Sender name — incoming only, first in a group */}
  {!isMine && !sameAuthorAsPrev && (
    <span className="text-xs font-semibold text-slate-700 mb-1 px-1">
      {c.authorName}
    </span>
  )}

  {/* Bubble row — actions sit beside the bubble/card like WhatsApp */}
  <div
    className={`flex items-end gap-1.5 max-w-full ${
      isMine ? "justify-end" : "justify-start"
    }`}
  >
    {isMine && messageActions}

    {/* The bubble */}
    <div
      className={`relative w-fit max-w-full px-2 py-2 text-sm leading-snug shadow-sm break-words ${

    isMine
      ? "bg-violet-600 text-white"
      : "bg-slate-100 text-slate-800"
  } ${
    isMine
      ? `rounded-2xl ${
          sameAuthorAsNext
            ? "rounded-br-md"
            : "rounded-br-sm"
        }`
      : `rounded-2xl ${
          sameAuthorAsNext
            ? "rounded-bl-md"
            : "rounded-bl-sm"
        }`
  }`}
>

{displayText && (
  <div className={`break-words ${hasAttachments ? "mb-2" : ""}`}>
    {renderFormattedCommentText(displayText, isMine)}
  </div>
)}


{hasAttachments && (
  <div className="space-y-2">
    {c.attachments!.map((file) => {
      const isImage = file.type?.startsWith("image/");
      const sizeLabel =
        typeof file.size === "number"
          ? file.size >= 1024 * 1024
            ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
            : `${(file.size / 1024).toFixed(1)} KB`
          : "Unknown size";

      return (
        <a
          key={file.id || file.url}
          href={file.url}
          target="_blank"
          rel="noreferrer"
          download={file.name}
          onClick={(e) => e.stopPropagation()}
          className={`block w-[320px] max-w-[calc(100vw-96px)] rounded-xl overflow-hidden border transition-all ${
            isMine
              ? "border-white/20 bg-white/10 hover:bg-white/15 text-white"
              : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
          }`}
          title="Open attachment"
        >
          {isImage ? (
            <div
              className={`w-full h-[180px] overflow-hidden ${
                isMine ? "bg-white/10" : "bg-slate-100"
              }`}
            >
              <img
                src={file.url}
                alt={file.name}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div
              className={`h-[92px] flex items-center justify-center ${
                isMine ? "bg-white/10" : "bg-slate-50"
              }`}
            >
              <Paperclip
                size={28}
                className={isMine ? "text-white/80" : "text-slate-400"}
              />
            </div>
          )}

          <div className="flex items-center gap-2 px-3 py-2">
            <Paperclip size={13} className="flex-shrink-0 opacity-80" />

            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium truncate leading-tight">
                {file.name}
              </p>
              <p
                className={`text-[10px] mt-0.5 ${
                  isMine ? "text-white/65" : "text-slate-400"
                }`}
              >
                {sizeLabel}
              </p>
            </div>
          </div>
        </a>
      );
    })}
  </div>
)}




                                </div>

    {!isMine && messageActions}
  </div>


                          {/* Timestamp — only on last message of a group */}
                          {!sameAuthorAsNext && (
                            <span className="text-[10px] text-slate-400 mt-1 px-1">
                              {timeLabel}
                              {cMs ? ` · ${timeAgo(c.createdAt)}` : ""}
                            </span>
                          )}

                          {/* Reaction chips */}
                          {reactionEntries.length > 0 && (
                            <div
                              className={`flex flex-wrap gap-1 mt-1 ${
                                isMine ? "justify-end" : "justify-start"
                              }`}
                            >
                              {reactionEntries.map(([emoji, uids]) => {
                                const mine =
                                  !!user?.uid && uids.includes(user.uid);
                                return (
                                  <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => toggleReaction(c, emoji)}
                                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs transition-colors ${
                                      mine
                                        ? "bg-violet-50 border-violet-300 text-violet-700"
                                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                    }`}
                                    title={
                                      mine
                                        ? "Click to remove your reaction"
                                        : "Click to react"
                                    }
                                  >
                                    <span className="text-sm leading-none">
                                      {emoji}
                                    </span>
                                    <span className="font-medium">
                                      {uids.length}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}

                         
                        </div>
                      </div>
                    </div>
                  );
                               })}
              </div>
            )}

            {/* Scroll anchor — keeps the latest message in view */}
            <div ref={messagesEndRef} />
          </div>
        </div>

              {/* Sticky composer — Asana-style progressive disclosure */}
        <div ref={composerRef} className="flex-shrink-0 border-t border-slate-200 bg-white px-5 py-3">
          {!composerExpanded ? (
            // ── COLLAPSED STATE — slim one-line bar ────────────────────────────
            <button
              type="button"
              onClick={() => {
                setComposerExpanded(true);
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 hover:border-violet-300 hover:bg-white transition-colors text-left group"
            >
              <div className="w-8 h-8 rounded-full bg-violet-600 text-white flex items-center justify-center flex-shrink-0 font-bold text-xs">
                {userInitial}
              </div>
              <span className="text-sm text-slate-400 group-hover:text-slate-500 transition-colors flex-1">
                Add a comment...
              </span>
              <span className="text-[10px] text-slate-400 hidden group-hover:inline">
                Click to write
              </span>
            </button>
          ) : (
            // ── EXPANDED STATE — full composer with toolbar ───────────────────
            <div className="flex items-start gap-2 relative">
              <div className="w-8 h-8 rounded-full bg-violet-600 text-white flex items-center justify-center flex-shrink-0 font-bold text-xs mt-1">
                {userInitial}
              </div>
              <div className="flex-1 relative border border-violet-300 rounded-2xl bg-white focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-100 transition-shadow">
                <textarea
                  ref={inputRef}
                  value={commentText}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message... use # to mention a task or project"
                  rows={3}
                  className="w-full bg-transparent rounded-t-2xl px-4 pt-3 pb-2 text-sm text-slate-700 focus:outline-none resize-none max-h-48"
                  style={{ minHeight: "72px" }}
                  autoFocus
                />

                               {/* Toolbar — Asana order: + · A · 😊 · @ · ⭐ · 📎 · ✨ */}
                <div className="flex items-center gap-0.5 px-2 py-1.5 border-t border-slate-100">
                  {/* 1. Plus — quick add (placeholder, Phase 4) */}
                  <button
                    type="button"
                    disabled
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 cursor-not-allowed"
                    title="Quick add (coming soon)"
                    aria-label="Quick add"
                  >
                    <Plus size={16} />
                  </button>

                  {/* 2. Text formatting — Asana-style lightweight toolbar */}
<div className="relative">
  <button
    type="button"
    onMouseDown={(e) => e.preventDefault()}
    onClick={() => {
      setShowFormattingToolbar((v) => !v);
      setShowComposerEmojiPicker(false);
    }}
    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
      showFormattingToolbar
        ? "bg-violet-100 text-violet-600"
        : "text-slate-500 hover:bg-slate-100 hover:text-violet-600"
    }`}
    title="Text formatting"
    aria-label="Text formatting"
  >
    <Type size={16} />
  </button>

  {showFormattingToolbar && (
    <div
      onMouseDown={(e) => e.preventDefault()}
      className="absolute bottom-10 left-0 z-[60] rounded-2xl border border-slate-200 bg-white shadow-2xl p-2 flex items-center gap-1"
      role="toolbar"
      aria-label="Text formatting toolbar"
    >
      <button
        type="button"
        onClick={() => applyInlineFormat("**", "**", "bold text")}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:bg-violet-50 hover:text-violet-600"
        title="Bold"
      >
        <Bold size={15} />
      </button>

      <button
        type="button"
        onClick={() => applyInlineFormat("_", "_", "italic text")}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:bg-violet-50 hover:text-violet-600"
        title="Italic"
      >
        <Italic size={15} />
      </button>

      <button
        type="button"
        onClick={() => applyInlineFormat("<u>", "</u>", "underlined text")}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:bg-violet-50 hover:text-violet-600"
        title="Underline"
      >
        <Underline size={15} />
      </button>

      <button
        type="button"
        onClick={() => applyInlineFormat("~~", "~~", "strikethrough text")}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:bg-violet-50 hover:text-violet-600"
        title="Strikethrough"
      >
        <Strikethrough size={15} />
      </button>

      <div className="h-6 w-px bg-slate-200 mx-1" />

      <button
        type="button"
        onClick={() => applyLineFormat("bullet")}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:bg-violet-50 hover:text-violet-600"
        title="Bullet list"
      >
        <List size={15} />
      </button>

      <button
        type="button"
        onClick={() => applyLineFormat("number")}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:bg-violet-50 hover:text-violet-600"
        title="Numbered list"
      >
        <ListOrdered size={15} />
      </button>

      <button
        type="button"
        onClick={() => applyLineFormat("quote")}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:bg-violet-50 hover:text-violet-600"
        title="Quote"
      >
        <Quote size={15} />
      </button>

      <div className="h-6 w-px bg-slate-200 mx-1" />

      <button
        type="button"
        onClick={() => applyInlineFormat("`", "`", "code")}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:bg-violet-50 hover:text-violet-600"
        title="Inline code"
      >
        <Code2 size={15} />
      </button>

      <button
        type="button"
        onClick={applyCodeBlock}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:bg-violet-50 hover:text-violet-600 font-mono text-xs"
        title="Code block"
      >
        {"{ }"}
      </button>

      <button
        type="button"
        onClick={applyLinkFormat}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:bg-violet-50 hover:text-violet-600"
        title="Link"
      >
        <LinkIcon size={15} />
      </button>
    </div>
  )}
</div>


                  {/* 3. Emoji — works */}
                  <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => setShowComposerEmojiPicker((v) => !v)}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                      showComposerEmojiPicker
                        ? "bg-violet-100 text-violet-600"
                        : "text-slate-500 hover:bg-slate-100 hover:text-violet-600"
                    }`}
                    title="Add emoji"
                    aria-label="Add emoji"
                  >
                    <Smile size={16} />
                  </button>

                  {/* 4. @ Mention user — works (empty list until Workspace feature ships) */}
                  <button
                    type="button"
                    onClick={() => {
                      const ta = inputRef.current;
                      const start = ta?.selectionStart ?? commentText.length;
                      const end = ta?.selectionEnd ?? commentText.length;
                      const next = commentText.slice(0, start) + "@" + commentText.slice(end);
                      setCommentText(next);
                      requestAnimationFrame(() => {
                        const pos = start + 1;
                        ta?.focus();
                        ta?.setSelectionRange(pos, pos);
                        setShowUserSuggestions(true);
                        setUserMentionFilter("");
                        setUserMentionStart(start);
                      });
                    }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-violet-600 transition-colors"
                    title="Mention a teammate"
                    aria-label="Mention user"
                  >
                    <AtSign size={16} />
                  </button>

                  {/* 5. Star — stickers/celebrations (Phase 4 placeholder) */}
                  <button
                    type="button"
                    disabled
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 cursor-not-allowed"
                    title="Stickers (coming soon)"
                    aria-label="Stickers"
                  >
                    <Star size={16} />
                  </button>

                  {/* 6. Attachment — upload file */}
<input
  ref={fileInputRef}
  type="file"
  className="hidden"
  onChange={handleAttachFile}
/>

<button
  type="button"
  disabled={uploadingAttachment}
  onClick={() => fileInputRef.current?.click()}
  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
    uploadingAttachment
      ? "text-violet-400 bg-violet-50 cursor-wait"
      : "text-slate-500 hover:bg-slate-100 hover:text-violet-600"
  }`}
  title={uploadingAttachment ? "Uploading..." : "Attach file"}
  aria-label="Attach file"
>
  {uploadingAttachment ? (
    <span className="w-4 h-4 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin" />
  ) : (
    <Paperclip size={16} />
  )}
</button>


                  {/* 7. Sparkles — AI assistant (Phase 4 placeholder) */}
                  <button
                    type="button"
                    disabled
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 cursor-not-allowed"
                    title="AI assistant (coming soon)"
                    aria-label="AI assistant"
                  >
                    <Sparkles size={16} />
                  </button>

                  {/* Right side — hint + cancel + send */}
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 hidden sm:inline">
                      Enter to send · Shift+Enter for new line
                    </span>
                    <button
                      type="button"
                      onClick={() => {
  setCommentText("");
  setComposerExpanded(false);
  setShowComposerEmojiPicker(false);
  setShowFormattingToolbar(false);
  setShowSuggestions(false);
  setShowUserSuggestions(false);
}}

                      className="text-xs px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={!commentText.trim() || sending || uploadingAttachment}
                      className="text-xs px-4 py-1.5 rounded-lg bg-violet-600 text-white font-medium hover:bg-violet-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                    >
                      {sending ? (
  <>
    <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
    Sending...
  </>
) : uploadingAttachment ? (
  <>
    <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
    Uploading...
  </>
) : (
  <>
    <Send size={12} />
    Comment
  </>
)}

                    </button>
                  </div>
                </div>

                              {/* Composer emoji picker — emoji-mart (Asana-grade) */}
                {showComposerEmojiPicker && (
                  <div
                    ref={composerEmojiPickerRef}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="absolute bottom-full left-0 mb-2 z-[55] shadow-2xl rounded-2xl overflow-hidden"
                    role="dialog"
                    aria-label="Insert emoji"
                  >
                    <Picker
                      data={data}
                      onEmojiSelect={(e: any) => {
                        insertEmojiIntoComposer(e.native, false);
                      }}
                      theme="light"
                      previewPosition="bottom"
                      skinTonePosition="search"
                      maxFrequentRows={2}
                      perLine={8}
                      navPosition="top"
                    />
                  </div>
                )}

                {/* Task/Project mention autocomplete (#) */}
                {hasSuggestions && (
                  <div className="absolute bottom-full left-0 w-full bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto z-50 p-2 mb-2">
                    {filteredTasks.length > 0 && (
                      <div className="mb-1">
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 px-2 py-1 font-semibold">
                          Tasks
                        </p>
                        {filteredTasks.map((it: any) => (
                          <button
                            key={"t-" + it.code}
                            type="button"
                            onClick={() => insertMention(it.code)}
                            className="w-full text-left px-2 py-1.5 hover:bg-violet-50 rounded-lg flex items-center gap-2 transition-colors"
                          >
                            <span
                              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                PRIORITY_DOT[it.priority] ?? "bg-gray-400"
                              }`}
                            />
                            <span className="font-mono text-xs text-violet-600">{it.code}</span>
                            <span className="text-sm text-slate-700 truncate">· {it.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {filteredProjects.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 px-2 py-1 font-semibold">
                          Projects
                        </p>
                        {filteredProjects.map((it: any) => (
                          <button
                            key={"p-" + it.code}
                            type="button"
                            onClick={() => insertMention(it.code)}
                            className="w-full text-left px-2 py-1.5 hover:bg-violet-50 rounded-lg flex items-center gap-2 transition-colors"
                          >
                            <span
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: it.color }}
                            />
                            <span className="font-mono text-xs text-violet-700">{it.code}</span>
                            <span className="text-sm text-slate-700 truncate">· {it.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* User mention autocomplete (@) */}
                {showUserSuggestions && (
                  <div className="absolute bottom-full left-0 w-full bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto z-50 p-2 mb-2">
                    <p className="text-[10px] uppercase tracking-wider text-slate-400 px-2 py-1 font-semibold">
                      Teammates
                    </p>
                    {filteredUsers.length === 0 ? (
                      <div className="px-3 py-4 text-center">
                        <p className="text-sm text-slate-500 mb-1">
                          {mentionableUsers.length === 0
                            ? "No teammates yet"
                            : "No matches"}
                        </p>
                        <p className="text-xs text-slate-400">
                          {mentionableUsers.length === 0
                            ? "Invite members from Workspace settings to @-mention them."
                            : "Try a different name."}
                        </p>
                      </div>
                    ) : (
                      filteredUsers.map((u) => (
                        <button
                          key={"u-" + u.id}
                          type="button"
                          onClick={() => insertUserMention(u)}
                          className="w-full text-left px-2 py-1.5 hover:bg-violet-50 rounded-lg flex items-center gap-2 transition-colors"
                        >
                          <span className="w-6 h-6 rounded-full bg-violet-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                            {u.name[0]?.toUpperCase()}
                          </span>
                          <span className="text-sm text-slate-700 truncate">{u.name}</span>
                          {u.email && (
                            <span className="text-xs text-slate-400 truncate ml-auto">
                              {u.email}
                            </span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        


        {/* Toast */}

        {toast && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-4 py-2 rounded-lg shadow-lg z-[60]">
            {toast}
          </div>
        )}
      </div>
    </>
  );
}
