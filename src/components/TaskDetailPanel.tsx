  import React, {
    useState,
    useEffect,
    useRef,
    useCallback,
    useMemo,
  } from "react";
  import emailjs from "@emailjs/browser";
  import { useNavigate } from "react-router-dom";
  import { useAppData } from "../context/AppDataContext";
  import { useAuth } from "../context/AuthContext";
  import { db } from "../lib/firebase/config";
       import {
    arrayRemove,
    arrayUnion,
    collection,
    getDocs,
    addDoc,
    deleteDoc,
    deleteField,
    doc,
    getDoc,
    onSnapshot,
    orderBy,
    query as firestoreQuery,
    serverTimestamp,
    updateDoc,
    setDoc,
    writeBatch,
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
    Type,
    AtSign,
    Paperclip,
    FileText,
    FileAudio,
    FileImage,
    Bold,
    Italic,
    Underline,
    Strikethrough,
    List,
    ListOrdered,
    Quote,
    Code2,
    Link as LinkIcon,
    Share2,
    ThumbsUp,
    Copy,
    Check,
    MoreVertical,
        Reply,
    Pin,
    ChevronDown,
  } from "lucide-react";



  import data from "@emoji-mart/data";
  import Picker from "@emoji-mart/react";
  import { useMentionableUsers } from "../hooks/useMentionableUsers";
  import { storageService, UploadedAttachment } from "../lib/firebase/storage";
  import { createCommentNotifications } from "../lib/firebase/notifications";
  import { upsertTaskGuestPerson } from "../lib/firebase/tasks";

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
    highlightCommentId?: string | null;
  }


  interface CommentReplyReference {
    commentId: string;
    authorId: string;
    authorName: string;
    text: string;
    attachmentName?: string;
    attachmentType?: string;
  }

  interface TaskComment {
    id: string;
    text: string;
    authorId: string;
    authorName: string;
    authorEmail?: string;
    authorPhotoURL?: string;
    workspaceId?: string;
    taskId?: string;
        createdAt?: any;
    createdAtMs?: number;
    clientCreatedAt?: string;
    editedAt?: any;

    editedBy?: string;
    editHistory?: {
      text: string;
      editedAt: any;
    }[];
    mentions?: string[];
    mentionedUids?: string[];
    attachments?: UploadedAttachment[];
    replyTo?: CommentReplyReference;
    pinned?: boolean;
    pinnedAt?: any;
    pinnedBy?: string;
    /** emoji char → array of user UIDs who reacted */
    reactions?: Record<string, string[]>;
  }


  interface TaskShare {
    id: string;

    // Existing share fields used by your share modal
    sharedWithEmail?: string;
    sharedByUid?: string;
    sharedByName?: string;
    sharedByEmail?: string;

    // Extra invite fields used by AcceptTaskInvitePage
    invitedEmail?: string;
    invitedEmailLower?: string;
    invitedBy?: string;
    invitedByName?: string;
    invitedByEmail?: string;

    taskId?: string;
    taskTitle?: string;
    taskCode?: string;
    taskStatus?: string;
    taskPriority?: string;
    taskDueDate?: string;
    taskLink?: string;

    workspaceId?: string;
    projectId?: string;
    projectName?: string;

    message?: string;
        status?: "pending" | "active" | "revoked" | "removed" | "failed" | "accepted" | string;
    accessType?: string;
    inviteLink?: string;

    acceptedAt?: any;
    acceptedBy?: string;
    acceptedByUid?: string;
    acceptedByEmail?: string;

    revokedAt?: any;
    revokedByUid?: string;

    createdAt?: any;
    updatedAt?: any;
  }
  interface ResolvedUserProfile {
    uid?: string;
    email: string;
    name: string;
    photoURL: string;
  }

  function getProviderPhotoURL(user: any): string {
    const providers = Array.isArray(user?.providerData) ? user.providerData : [];

    const providerWithPhoto = providers.find((provider: any) =>
      String(provider?.photoURL || "").trim(),
    );

    return String(providerWithPhoto?.photoURL || "").trim();
  }

  function isGeneratedInitialAvatar(url?: string | null): boolean {
    const clean = String(url || "")
      .trim()
      .toLowerCase();

    if (!clean) return false;

    return (
      clean.includes("ui-avatars.com") ||
      clean.includes("dicebear") ||
      clean.includes("initial") ||
      clean.includes("avatar.iran.liara.run") ||
      clean.startsWith("data:image/svg")
    );
  }

  function getFirstRealPhotoURL(
    ...values: Array<string | null | undefined>
  ): string {
    for (const value of values) {
      const clean = String(value || "").trim();

      if (!clean) continue;

      // This prevents generated firstname/initial avatars from being used.
      if (isGeneratedInitialAvatar(clean)) continue;

      return clean;
    }

    return "";
  }

  type TaskAccessMode = "task_project" | "invited_only" | "anyone_with_link";

  const TASK_ACCESS_OPTIONS: {
    value: TaskAccessMode;
    label: string;
    description: string;
  }[] = [
    {
      value: "task_project",
      label: "Members of this task and connected project",
      description: "Task members and project members can view this task.",
    },
    {
      value: "invited_only",
      label: "Only invited people",
      description: "Only the owner, assignee, and invited emails can view.",
    },
    {
      value: "anyone_with_link",
      label: "Anyone with the task link",
      description: "Anyone with this task link can view this task.",
    },
  ];

  const STATUS_STYLE: Record<string, string> = {
    "To Do": "bg-gray-100 text-gray-600",
    "In Progress": "bg-blue-100 text-blue-600",
    "In Review": "bg-purple-100 text-purple-600",
    Done: "bg-emerald-100 text-emerald-600",
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
  // ── EmailJS credentials for Task Share ──────────────────────────────────────
  // IMPORTANT:
  // Workspace invites use their own EmailJS template elsewhere.
  // Task sharing uses only this dedicated task invite template.
  const EJ_SERVICE = "service_mexk2nq";
  const EJ_TASK_TEMPLATE = "template_v6ojdzn";
  const EJ_PUBLIC_KEY = "meHwiauyfE3xFWE66";

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
        "😀",
        "😃",
        "😄",
        "😁",
        "😆",
        "😅",
        "🤣",
        "😂",
        "🙂",
        "🙃",
        "😉",
        "😊",
        "😇",
        "🥰",
        "😍",
        "🤩",
        "😘",
        "😗",
        "☺️",
        "😚",
        "😙",
        "🥲",
        "😋",
        "😛",
        "😜",
        "🤪",
        "😝",
        "🤑",
        "🤗",
        "🤭",
        "🤫",
        "🤔",
        "🤐",
        "🤨",
        "😐",
        "😑",
        "😶",
        "😏",
        "😒",
        "🙄",
        "😬",
        "🤥",
        "😌",
        "😔",
        "😪",
        "🤤",
        "😴",
        "😷",
        "🤒",
        "🤕",
        "🤢",
        "🤮",
        "🤧",
        "🥵",
        "🥶",
        "🥴",
        "😵",
        "🤯",
        "🤠",
        "🥳",
        "🥸",
        "😎",
        "🤓",
        "🧐",
        "😕",
        "😟",
        "🙁",
        "☹️",
        "😮",
        "😯",
        "😲",
        "😳",
        "🥺",
        "😦",
        "😧",
        "😨",
        "😰",
        "😥",
        "😢",
        "😭",
        "😱",
        "😖",
        "😣",
        "😞",
        "😓",
        "😩",
        "😫",
        "🥱",
        "😤",
        "😡",
        "😠",
        "🤬",
        "😈",
        "👿",
        "💀",
        "💩",
      ],
    },
    {
      key: "people",
      label: "People & Body",
      icon: UserIcon,
      // First 24 here are skin-toneable hands/people gestures
      emojis: [
        "👍",
        "👎",
        "👌",
        "✌️",
        "🤞",
        "🤟",
        "🤘",
        "🤙",
        "👈",
        "👉",
        "👆",
        "👇",
        "☝️",
        "✋",
        "🤚",
        "🖐️",
        "🖖",
        "👋",
        "🤝",
        "👏",
        "🙌",
        "🙏",
        "💪",
        "🦵",
        "🦶",
        "👂",
        "👃",
        "🧠",
        "👀",
        "👁️",
        "👅",
        "👄",
        "👶",
        "🧒",
        "👦",
        "👧",
        "🧑",
        "👱",
        "👨",
        "🧔",
        "👩",
        "🧓",
        "👴",
        "👵",
        "🙍",
        "🙎",
        "🙅",
        "🙆",
        "💁",
        "🙋",
        "🧏",
        "🙇",
        "🤦",
        "🤷",
        "👮",
        "🕵️",
        "💂",
        "👷",
        "🤴",
        "👸",
        "🥷",
        "🧑‍🚀",
        "👨‍🍳",
        "👩‍⚕️",
      ],
      toneable: new Set(Array.from({ length: 24 }, (_, i) => i)),
    },
    {
      key: "nature",
      label: "Animals & Nature",
      icon: Heart,
      emojis: [
        "🐶",
        "🐱",
        "🐭",
        "🐹",
        "🐰",
        "🦊",
        "🐻",
        "🐼",
        "🐨",
        "🐯",
        "🦁",
        "🐮",
        "🐷",
        "🐸",
        "🐵",
        "🐔",
        "🐧",
        "🐦",
        "🐤",
        "🦆",
        "🦅",
        "🦉",
        "🦇",
        "🐺",
        "🐗",
        "🐴",
        "🦄",
        "🐝",
        "🐛",
        "🦋",
        "🐌",
        "🐞",
        "🐢",
        "🐍",
        "🦎",
        "🐙",
        "🦑",
        "🦀",
        "🐠",
        "🐟",
        "🐡",
        "🐬",
        "🦈",
        "🐳",
        "🐋",
        "🌵",
        "🎄",
        "🌲",
        "🌳",
        "🌴",
        "🌱",
        "🌿",
        "☘️",
        "🍀",
        "🎋",
        "🍃",
        "🍂",
        "🍁",
        "🌾",
        "🌺",
        "🌻",
        "🌹",
        "🌷",
        "🌼",
      ],
    },
    {
      key: "food",
      label: "Food & Drink",
      icon: Coffee,
      emojis: [
        "🍏",
        "🍎",
        "🍐",
        "🍊",
        "🍋",
        "🍌",
        "🍉",
        "🍇",
        "🍓",
        "🫐",
        "🍈",
        "🍒",
        "🍑",
        "🥭",
        "🍍",
        "🥥",
        "🥝",
        "🍅",
        "🍆",
        "🥑",
        "🥦",
        "🥬",
        "🥒",
        "🌶️",
        "🌽",
        "🥕",
        "🧄",
        "🧅",
        "🥔",
        "🍠",
        "🥐",
        "🥯",
        "🍞",
        "🥖",
        "🥨",
        "🧀",
        "🥚",
        "🍳",
        "🧈",
        "🥞",
        "🧇",
        "🥓",
        "🥩",
        "🍗",
        "🍖",
        "🌭",
        "🍔",
        "🍟",
        "🍕",
        "🥪",
        "🌮",
        "🌯",
        "🥗",
        "🍝",
        "🍜",
        "🍲",
        "🍣",
        "🍱",
        "🍤",
        "🍙",
        "🍚",
        "🍰",
        "🎂",
        "🍩",
        "🍪",
        "🍫",
        "🍬",
        "🍭",
        "🍮",
        "🍯",
        "🍵",
        "☕",
        "🍺",
        "🍷",
        "🥂",
        "🍸",
        "🍹",
        "🥤",
        "🧋",
        "🍾",
      ],
    },
    {
      key: "activity",
      label: "Activities",
      icon: Activity,
      emojis: [
        "⚽",
        "🏀",
        "🏈",
        "⚾",
        "🥎",
        "🎾",
        "🏐",
        "🏉",
        "🎱",
        "🏓",
        "🏸",
        "🥅",
        "🏒",
        "🏑",
        "🥍",
        "🏏",
        "⛳",
        "🏹",
        "🎣",
        "🥊",
        "🥋",
        "🎽",
        "🛹",
        "🛼",
        "🛷",
        "⛸️",
        "🥌",
        "🎿",
        "⛷️",
        "🏂",
        "🏋️",
        "🤼",
        "🤸",
        "⛹️",
        "🤺",
        "🤾",
        "🏌️",
        "🏇",
        "🧘",
        "🏄",
        "🏊",
        "🤽",
        "🚣",
        "🧗",
        "🚵",
        "🚴",
        "🏆",
        "🥇",
        "🥈",
        "🥉",
        "🏅",
        "🎖️",
        "🎗️",
        "🎫",
        "🎟️",
        "🎪",
        "🎭",
        "🎨",
        "🎬",
        "🎤",
        "🎧",
        "🎼",
        "🎹",
        "🥁",
      ],
    },
    {
      key: "travel",
      label: "Travel & Places",
      icon: Plane,
      emojis: [
        "🚗",
        "🚕",
        "🚙",
        "🚌",
        "🚎",
        "🏎️",
        "🚓",
        "🚑",
        "🚒",
        "🚐",
        "🛻",
        "🚚",
        "🚛",
        "🚜",
        "🛵",
        "🏍️",
        "🛴",
        "🚲",
        "🛺",
        "🚔",
        "🚍",
        "🚘",
        "🚖",
        "🚡",
        "🚠",
        "🚟",
        "🚃",
        "🚋",
        "🚞",
        "🚝",
        "🚄",
        "🚅",
        "🚈",
        "🚂",
        "🚆",
        "🚇",
        "🚊",
        "🚉",
        "✈️",
        "🛫",
        "🛬",
        "🛩️",
        "💺",
        "🛰️",
        "🚀",
        "🛸",
        "🚁",
        "🛶",
        "⛵",
        "🚤",
        "🛥️",
        "🛳️",
        "⛴️",
        "🚢",
        "⚓",
        "⛽",
        "🚧",
        "🚦",
        "🚥",
        "🗺️",
        "🗿",
        "🗽",
        "🗼",
        "🏰",
      ],
    },
    {
      key: "objects",
      label: "Objects",
      icon: Lightbulb,
      emojis: [
        "💡",
        "🔦",
        "🕯️",
        "🧯",
        "🛢️",
        "💸",
        "💵",
        "💴",
        "💶",
        "💷",
        "🪙",
        "💰",
        "💳",
        "💎",
        "⚖️",
        "🪜",
        "🧰",
        "🔧",
        "🔨",
        "⚒️",
        "🛠️",
        "⛏️",
        "🪚",
        "🔩",
        "⚙️",
        "🪛",
        "🧲",
        "🔫",
        "💣",
        "🧨",
        "🪓",
        "🔪",
        "🛡️",
        "🚬",
        "⚰️",
        "🪦",
        "⚱️",
        "🏺",
        "🔮",
        "📿",
        "🧿",
        "💈",
        "⚗️",
        "🔭",
        "🔬",
        "🕳️",
        "🩹",
        "🩺",
        "💊",
        "💉",
        "🩸",
        "🧬",
        "🦠",
        "🧫",
        "🧪",
        "🌡️",
        "🧹",
        "🧺",
        "🧻",
        "🚽",
        "🚰",
        "🚿",
        "🛁",
        "🛀",
      ],
    },
    {
      key: "symbols",
      label: "Symbols",
      icon: Hash,
      emojis: [
        "❤️",
        "🧡",
        "💛",
        "💚",
        "💙",
        "💜",
        "🖤",
        "🤍",
        "🤎",
        "💔",
        "❣️",
        "💕",
        "💞",
        "💓",
        "💗",
        "💖",
        "💘",
        "💝",
        "💟",
        "☮️",
        "✝️",
        "☪️",
        "🕉️",
        "☸️",
        "✡️",
        "🔯",
        "🕎",
        "☯️",
        "☦️",
        "🛐",
        "⛎",
        "♈",
        "♉",
        "♊",
        "♋",
        "♌",
        "♍",
        "♎",
        "♏",
        "♐",
        "♑",
        "♒",
        "♓",
        "🆔",
        "⚛️",
        "🉑",
        "☢️",
        "☣️",
        "📴",
        "📳",
        "🈶",
        "🈚",
        "🈸",
        "🈺",
        "🈷️",
        "✴️",
        "🆚",
        "💮",
        "🉐",
        "㊙️",
        "㊗️",
        "🈴",
        "🈵",
        "🈹",
        "✅",
        "❎",
        "❌",
        "⭕",
        "🛑",
        "⛔",
        "📛",
        "🚫",
        "💯",
        "💢",
        "♨️",
        "🚷",
        "🚯",
        "🚳",
        "🚱",
        "🔞",
      ],
    },
    {
      key: "flags",
      label: "Flags",
      icon: Flag,
      emojis: [
        "🏁",
        "🚩",
        "🎌",
        "🏴",
        "🏳️",
        "🏳️‍🌈",
        "🏳️‍⚧️",
        "🏴‍☠️",
        "🇺🇸",
        "🇬🇧",
        "🇨🇦",
        "🇦🇺",
        "🇩🇪",
        "🇫🇷",
        "🇪🇸",
        "🇮🇹",
        "🇯🇵",
        "🇨🇳",
        "🇰🇷",
        "🇮🇳",
        "🇧🇷",
        "🇲🇽",
        "🇿🇦",
        "🇳🇬",
        "🇰🇪",
        "🇪🇬",
        "🇸🇦",
        "🇦🇪",
        "🇹🇷",
        "🇷🇺",
        "🇸🇪",
        "🇳🇴",
        "🇩🇰",
        "🇫🇮",
        "🇳🇱",
        "🇧🇪",
        "🇨🇭",
        "🇦🇹",
        "🇵🇱",
        "🇨🇿",
        "🇬🇷",
        "🇵🇹",
        "🇮🇪",
        "🇳🇿",
        "🇸🇬",
        "🇲🇾",
        "🇹🇭",
        "🇻🇳",
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

  const MENTION_SPLIT =
  /(#(?:TSK|PRJ)-\d+|@\[[^\]]+\]\([^)]+\)|@[A-Za-z0-9][A-Za-z0-9._-]*)/g;

const STRUCTURED_USER_MENTION_REGEX = /^@\[([^\]]+)\]\(([^)]+)\)$/;

function getUserMentionHandle(user: {
  name?: string | null;
  email?: string | null;
}): string {
  const rawName = String(user.name || "").trim();
  const rawEmail = String(user.email || "").trim();

  const source =
    rawName ||
    (rawEmail.includes("@") ? rawEmail.split("@")[0] : rawEmail) ||
    "user";

  return source
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(/[^\w.-]/g, "")
    .trim();
}

function normalizeLegacyStructuredMentions(text: string): string {
  return String(text || "").replace(
    /@\[([^\]]+)\]\([^)]+\)/g,
    (_match, name) => {
      const handle = getUserMentionHandle({ name });
      return handle ? `@${handle}` : String(name || "");
    },
  );
}

function extractUserMentionIds(
  text: string,
  users: Array<{ id: string; name: string; email?: string }>,
): string[] {
  const normalizedText = normalizeLegacyStructuredMentions(text);
  const mentioned = new Set<string>();

  users.forEach((mentionUser) => {
    const handle = getUserMentionHandle(mentionUser);

    if (!handle) return;

    const pattern = new RegExp(
      `(^|\\s)@${handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$|[.,!?;:])`,
      "i",
    );

    if (pattern.test(normalizedText)) {
      mentioned.add(mentionUser.id);
    }
  });

  return Array.from(mentioned);
}


  function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }
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

    if (typeof v?.toMillis === "function") {
      return v.toMillis();
    }

    if (typeof v?.seconds === "number") {
      return v.seconds * 1000;
    }

    if (typeof v === "number") {
      return Number.isFinite(v) ? v : 0;
    }

    const parsed = new Date(v).getTime();

    return Number.isFinite(parsed) ? parsed : 0;
  }

 function getCommentSortMs(comment?: Partial<TaskComment> | null): number {
  if (!comment) return 0;

  /**
   * IMPORTANT:
   * replyTo must NEVER be used for ordering.
   * A reply/reference is only display metadata.
   * The comment's own timestamp decides where it appears.
   */

  const directCreatedAtMs = Number((comment as any).createdAtMs);

  if (Number.isFinite(directCreatedAtMs) && directCreatedAtMs > 0) {
    return directCreatedAtMs;
  }

  const clientCreatedAtMs = toMs((comment as any).clientCreatedAt);

  if (clientCreatedAtMs > 0) {
    return clientCreatedAtMs;
  }

  const createdAtMs = toMs(comment.createdAt);

  if (createdAtMs > 0) {
    return createdAtMs;
  }

  const updatedAtMs = toMs((comment as any).updatedAt);

  if (updatedAtMs > 0) {
    return updatedAtMs;
  }

  const editedAtMs = toMs(comment.editedAt);

  if (editedAtMs > 0) {
    return editedAtMs;
  }

  return 0;
}
function normalizeIncomingComment(
  id: string,
  raw: Omit<TaskComment, "id">,
): TaskComment {
  const comment: TaskComment = {
    id,
    ...raw,
  };

  const sortMs = getCommentSortMs(comment);

  /**
   * For old comments that have createdAt but not createdAtMs,
   * create a local normalized value so the UI sorts consistently.
   */
  if (
    (!Number.isFinite(Number(comment.createdAtMs)) ||
      Number(comment.createdAtMs) <= 0) &&
    sortMs > 0
  ) {
    comment.createdAtMs = sortMs;
  }

  if (!comment.clientCreatedAt && sortMs > 0) {
    comment.clientCreatedAt = new Date(sortMs).toISOString();
  }

  return comment;
}

function normalizeEmail(email?: string | null): string {

    return String(email || "")
      .trim()
      .toLowerCase();
  }

  function isGoogleEmail(email?: string | null): boolean {
    const clean = normalizeEmail(email);
    return clean.endsWith("@gmail.com") || clean.endsWith("@googlemail.com");
  }

  function getAvatarInitials(
    name?: string | null,
    email?: string | null,
  ): string {
    const display = String(name || email || "U").trim();

    if (!display) return "U";

    const clean = display
      .replace(/@.+$/, "")
      .replace(/[._-]+/g, " ")
      .trim();

    const parts = clean.split(/\s+/).filter(Boolean);

    if (parts.length >= 2) {
      return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
    }

    return (clean[0] || "U").toUpperCase();
  }

  function hashString(value: string): number {
    let hash = 0;
    const input = value || "user";

    for (let i = 0; i < input.length; i++) {
      hash = input.charCodeAt(i) + ((hash << 5) - hash);
    }

    return Math.abs(hash);
  }

  function avatarGradient(email?: string | null, name?: string | null): string {
    const key = normalizeEmail(email) || String(name || "user");
    const gradients = [
      "linear-gradient(135deg, #8b5cf6, #6366f1)",
      "linear-gradient(135deg, #06b6d4, #3b82f6)",
      "linear-gradient(135deg, #10b981, #059669)",
      "linear-gradient(135deg, #f59e0b, #ef4444)",
      "linear-gradient(135deg, #ec4899, #8b5cf6)",
      "linear-gradient(135deg, #14b8a6, #0ea5e9)",
      "linear-gradient(135deg, #f97316, #db2777)",
      "linear-gradient(135deg, #84cc16, #10b981)",
    ];

    return gradients[hashString(key) % gradients.length];
  }

  function ModernAvatar({
    email,
    name,
    photoURL,
    size = 32,
    className = "",
  }: {
    email?: string | null;
    name?: string | null;
    photoURL?: string | null;
    size?: number;
    className?: string;
  }) {
    const [imageFailed, setImageFailed] = useState(false);

    const safePhotoURL = getFirstRealPhotoURL(photoURL);
    const showPhoto = Boolean(safePhotoURL) && !imageFailed;
    const showGoogleBadge = showPhoto && isGoogleEmail(email);

    useEffect(() => {
      setImageFailed(false);
    }, [safePhotoURL]);

    return (
      <div
        className={`relative flex-shrink-0 ${className}`}
        style={{ width: size, height: size }}
        title={String(name || email || "User")}
      >
        {showPhoto ? (
          <img
            src={safePhotoURL}
            alt={String(name || email || "User")}
            referrerPolicy="no-referrer"
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
            className="w-full h-full rounded-full object-cover ring-1 ring-slate-200 bg-slate-100"
          />
        ) : (
          <div className="w-full h-full rounded-full bg-slate-100 text-slate-400 flex items-center justify-center ring-1 ring-slate-200 shadow-sm">
            <UserIcon size={Math.max(14, Math.floor(size * 0.5))} />
          </div>
        )}

        {showGoogleBadge && (
          <span
            className="absolute -right-0.5 -bottom-0.5 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center font-black"
            style={{
              width: Math.max(12, Math.floor(size * 0.42)),
              height: Math.max(12, Math.floor(size * 0.42)),
              fontSize: Math.max(8, Math.floor(size * 0.24)),
              color: "#4285F4",
              lineHeight: 1,
            }}
            title="Google account"
          >
            G
          </span>
        )}
      </div>
    );
  }

  function formatAttachmentSize(size?: number): string {
    if (typeof size !== "number") return "Unknown size";

    if (size >= 1024 * 1024) {
      return `${(size / 1024 / 1024).toFixed(1)} MB`;
    }

    return `${(size / 1024).toFixed(1)} KB`;
  }

  const ACCEPTED_COMMENT_ATTACHMENT_TYPES = [
    "image/*",
    "audio/*",
    "text/*",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/rtf",
    "application/json",
    ".pdf",
    ".txt",
    ".md",
    ".csv",
    ".json",
    ".doc",
    ".docx",
    ".rtf",
    ".mp3",
    ".wav",
    ".m4a",
    ".aac",
    ".ogg",
    ".oga",
    ".webm",
    ".flac",
  ].join(",");

  const ALLOWED_COMMENT_ATTACHMENT_EXTENSIONS = new Set([
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".bmp",
    ".svg",
    ".pdf",
    ".txt",
    ".md",
    ".csv",
    ".json",
    ".doc",
    ".docx",
    ".rtf",
    ".mp3",
    ".wav",
    ".m4a",
    ".aac",
    ".ogg",
    ".oga",
    ".webm",
    ".flac",
  ]);

  const ALLOWED_COMMENT_ATTACHMENT_MIME_TYPES = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/rtf",
    "application/json",
    "text/plain",
    "text/markdown",
    "text/csv",
    "text/rtf",
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-wav",
    "audio/mp4",
    "audio/aac",
    "audio/ogg",
    "audio/webm",
    "audio/flac",
  ]);

  function getAttachmentExtension(name?: string): string {
    const clean = String(name || "").trim();
    const ext = clean.includes(".") ? clean.split(".").pop() : "";

    return ext ? ext.toUpperCase() : "FILE";
  }

  function getAttachmentExtensionLower(name?: string): string {
    const clean = String(name || "").trim();
    const ext = clean.includes(".") ? clean.split(".").pop() : "";

    return ext ? `.${ext.toLowerCase()}` : "";
  }

  function getAttachmentMimeType(file: { type?: string }): string {
    return String(file.type || "")
      .trim()
      .toLowerCase();
  }
  function isFirestoreSpecialValue(value: any): boolean {
  if (!value || typeof value !== "object") return false;

  const constructorName = String(value.constructor?.name || "");

  return (
    constructorName.includes("FieldValue") ||
    constructorName.includes("ServerTimestamp") ||
    typeof value._methodName === "string" ||
    typeof value.isEqual === "function"
  );
}

function removeUndefinedFields<T>(value: T): T {
  if (value === undefined) {
    return undefined as T;
  }

  if (value === null) {
    return value;
  }

  if (value instanceof Date) {
    return value;
  }

  if (isFirestoreSpecialValue(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => removeUndefinedFields(item)) as T;
  }

  if (value && typeof value === "object") {
    const cleaned: Record<string, any> = {};

    Object.entries(value as Record<string, any>).forEach(([key, item]) => {
      if (item !== undefined) {
        cleaned[key] = removeUndefinedFields(item);
      }
    });

    return cleaned as T;
  }

  return value;
}


  function isAllowedCommentAttachment(file: File): boolean {
    const type = getAttachmentMimeType(file);
    const ext = getAttachmentExtensionLower(file.name);

    return (
      type.startsWith("image/") ||
      type.startsWith("audio/") ||
      type.startsWith("text/") ||
      ALLOWED_COMMENT_ATTACHMENT_MIME_TYPES.has(type) ||
      ALLOWED_COMMENT_ATTACHMENT_EXTENSIONS.has(ext)
    );
  }

  function isImageAttachment(file: UploadedAttachment): boolean {
    return getAttachmentMimeType(file).startsWith("image/");
  }

  function isAudioAttachment(file: UploadedAttachment): boolean {
    return getAttachmentMimeType(file).startsWith("audio/");
  }

  function isPdfAttachment(file: UploadedAttachment): boolean {
    const type = getAttachmentMimeType(file);
    const ext = getAttachmentExtensionLower(file.name);

    return type === "application/pdf" || ext === ".pdf";
  }

  function isTextAttachment(file: UploadedAttachment): boolean {
    const type = getAttachmentMimeType(file);
    const ext = getAttachmentExtensionLower(file.name);

    return (
      type.startsWith("text/") ||
      type === "application/json" ||
      [".txt", ".md", ".csv", ".json"].includes(ext)
    );
  }

  function getAttachmentIcon(file: UploadedAttachment) {
    if (isImageAttachment(file)) return FileImage;
    if (isAudioAttachment(file)) return FileAudio;

    return FileText;
  }

  function OptimizedAttachmentCard({
    file,
    isMine,
  }: {
    file: UploadedAttachment;
    isMine: boolean;
  }) {
    const [loaded, setLoaded] = useState(false);
    const [failed, setFailed] = useState(false);

    const isImage = isImageAttachment(file);
    const isAudio = isAudioAttachment(file);
    const isPdf = isPdfAttachment(file);
    const isText = isTextAttachment(file);

    const sizeLabel = formatAttachmentSize(file.size);
    const extension = getAttachmentExtension(file.name);
    const AttachmentIcon = getAttachmentIcon(file);

    /**
     * Use the lightweight preview in the chat bubble.
     * Use the original full-quality URL when clicked.
     */
    const previewSrc = file.previewUrl || file.url;
    const originalSrc = file.url;

    return (
      <div
        className={`group/attachment w-fit overflow-hidden rounded-[22px] border shadow-sm transition-all duration-200 ${
          isMine
            ? "border-white/35 bg-white/95 text-slate-800"
            : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:shadow-md"
        }`}
        style={{
          maxWidth: "min(340px, calc(100vw - 112px))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {isImage ? (
          <a
            href={originalSrc}
            target="_blank"
            rel="noreferrer"
            download={file.name}
            title="Open original image"
            className="block"
          >
            <div className="p-2">
              <div className="relative flex w-fit max-w-full items-center justify-center overflow-hidden rounded-[18px] bg-white ring-1 ring-slate-200/80">
                {!loaded && !failed && (
                  <div
                    className="absolute inset-0 animate-pulse"
                    style={{
                      backgroundImage: file.blurDataUrl
                        ? `url(${file.blurDataUrl})`
                        : undefined,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      backgroundColor: "rgb(241 245 249)",
                      filter: file.blurDataUrl ? "blur(12px)" : undefined,
                      transform: file.blurDataUrl ? "scale(1.08)" : undefined,
                    }}
                  />
                )}

                {!failed ? (
                  <img
                    src={previewSrc}
                    alt={file.name}
                    loading="lazy"
                    decoding="async"
                    fetchPriority="low"
                    onLoad={() => setLoaded(true)}
                    onError={() => {
                      setLoaded(true);
                      setFailed(true);
                    }}
                    className={`relative z-10 block h-auto w-auto rounded-[16px] object-contain transition-opacity duration-300 ${
                      loaded ? "opacity-100" : "opacity-0"
                    }`}
                    style={{
                      maxWidth: "min(320px, calc(100vw - 132px))",
                      maxHeight: 320,
                    }}
                  />
                ) : (
                  <div className="flex h-[180px] w-[260px] items-center justify-center bg-slate-50">
                    <FileImage size={28} className="text-slate-400" />
                  </div>
                )}

                {file.previewUrl && (
                  <span className="absolute right-2 top-2 z-20 rounded-full border border-white/70 bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-slate-500 shadow-sm backdrop-blur">
                    Preview
                  </span>
                )}
              </div>
            </div>
          </a>
        ) : isAudio ? (
          <div className="p-2">
            <div className="w-[300px] max-w-[calc(100vw-132px)] rounded-[18px] bg-slate-50 p-3 ring-1 ring-slate-200/80">
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
                  <FileAudio size={22} />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-700">
                    {file.name}
                  </p>

                  <p className="mt-0.5 text-[10px] text-slate-400">
                    {extension} · {sizeLabel}
                  </p>
                </div>
              </div>

              <audio
                controls
                preload="metadata"
                src={originalSrc}
                className="w-full"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
        ) : (
          <a
            href={originalSrc}
            target="_blank"
            rel="noreferrer"
            download={file.name}
            title="Open or download file"
            className="block"
          >
            <div className="p-2">
              <div className="flex h-[112px] w-[260px] max-w-[calc(100vw-132px)] items-center justify-center rounded-[18px] bg-slate-50 ring-1 ring-slate-200/80">
                <div
                  className={`flex h-14 w-14 flex-col items-center justify-center rounded-2xl border shadow-sm ${
                    isPdf
                      ? "border-red-100 bg-red-50 text-red-500"
                      : isText
                        ? "border-blue-100 bg-blue-50 text-blue-500"
                        : "border-slate-200 bg-white text-slate-500"
                  }`}
                >
                  <AttachmentIcon size={21} />

                  <span className="mt-1 max-w-[42px] truncate text-[9px] font-bold">
                    {extension}
                  </span>
                </div>
              </div>
            </div>
          </a>
        )}

        <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-2">
          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
            <AttachmentIcon size={12} />
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold leading-tight text-slate-700">
              {file.name}
            </p>

            <p className="mt-0.5 text-[10px] text-slate-400">
              {sizeLabel}
              {isImage ? " · opens full quality" : ""}
              {isAudio ? " · audio file" : ""}
              {isPdf ? " · PDF document" : ""}
              {isText ? " · text document" : ""}
            </p>
          </div>
        </div>
      </div>
    );
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
function formatWhatsAppMessageTime(timestamp: any): string {
  const ms = toMs(timestamp);

  if (!ms) return "";

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

function formatFullLocalDateTime(timestamp: any): string {
  const ms = toMs(timestamp);

  if (!ms) return "";

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(ms));
}

  const COMMENT_EDIT_WINDOW_MS = 15 * 60 * 1000;

  function getCommentPlainPreview(comment: TaskComment): string {
    const text = String(comment.text || "").trim();

    if (text) {
      return text.length > 140 ? `${text.slice(0, 140)}…` : text;
    }

    const firstAttachment = Array.isArray(comment.attachments)
      ? comment.attachments[0]
      : null;

    if (firstAttachment?.name) {
      return `Attachment: ${firstAttachment.name}`;
    }

    return "Comment";
  }

  function buildCommentReplyReference(
    comment: TaskComment,
  ): CommentReplyReference {
    const firstAttachment = Array.isArray(comment.attachments)
      ? comment.attachments[0]
      : null;

    return removeUndefinedFields<CommentReplyReference>({
      commentId: comment.id,
      authorId: comment.authorId,
      authorName: comment.authorName || "User",
      text: getCommentPlainPreview(comment),
      attachmentName: firstAttachment?.name,
      attachmentType: firstAttachment?.type,
    });
  }

  function isCommentEditableNow(comment: TaskComment, currentUserUid: string) {
    if (!currentUserUid || comment.authorId !== currentUserUid) return false;

    const createdMs = getCommentSortMs(comment);

    if (!createdMs) return false;

    return Date.now() - createdMs <= COMMENT_EDIT_WINDOW_MS;
  }


  function isOverdue(task: Task): boolean {
    if (!task.dueDate) return false;

    const status = String(task.status || "").toLowerCase();

    if (status === "done" || status === "completed") {
      return false;
    }

    const dueDate = new Date(`${task.dueDate}T12:00:00`);

    if (Number.isNaN(dueDate.getTime())) {
      return false;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return dueDate < today;
  }

  export default function TaskDetailPanel({
    task,
    onClose,
    onEdit,
    highlightCommentId,
  }: TaskDetailPanelProps) {
      const navigate = useNavigate();
    const { user, workspaceId } = useAuth();

    const appData = useAppData() as any;

    const projects = Array.isArray(appData?.projects) ? appData.projects : [];
    const allTasks = Array.isArray(appData?.tasks) ? appData.tasks : [];
    const members = Array.isArray(appData?.members) ? appData.members : [];

    const [taskView, setTaskView] = useState<Task>(task);


    const taskWorkspaceId = useMemo(() => {
      return (
        (taskView as any).workspaceId ||
        (task as any).workspaceId ||
        workspaceId ||
        ""
      );
    }, [taskView.workspaceId, (task as any).workspaceId, workspaceId]);

    const sourceTaskId = useMemo(() => {
      return (
        (taskView as any).originalTaskId ||
        (taskView as any).sharedTaskId ||
        (task as any).originalTaskId ||
        (task as any).sharedTaskId ||
        taskView.id ||
        task.id ||
        ""
      );
    }, [
      (taskView as any).originalTaskId,
      (taskView as any).sharedTaskId,
      (task as any).originalTaskId,
      (task as any).sharedTaskId,
      taskView.id,
      task.id,
    ]);

    function getCanonicalCommentsCollection() {
      if (!taskWorkspaceId || !sourceTaskId) return null;

      return collection(
        db,
        "workspaces",
        taskWorkspaceId,
        "tasks",
        sourceTaskId,
        "comments",
      );
    }

    const [comments, setComments] = useState<TaskComment[]>([]);

    // Keep the task panel synced with the canonical workspace task when possible.
    // Shared tasks must show the original task data, not only the user's copied index.
    useEffect(() => {
      setTaskView(task);

      if (!task.id) return;

      if (taskWorkspaceId && sourceTaskId) {
        const sourceTaskRef = doc(
          db,
          "workspaces",
          taskWorkspaceId,
          "tasks",
          sourceTaskId,
        );

        const unsub = onSnapshot(
          sourceTaskRef,
          (snap) => {
            if (!snap.exists()) return;

            setTaskView((prev) => ({
              ...prev,
              ...task,
              ...(snap.data() as Partial<Task>),
              id: task.id,
              originalTaskId: sourceTaskId,
              workspaceId: taskWorkspaceId,
              isSharedTask:
                (task as any).isSharedTask ?? (prev as any).isSharedTask,
              sharedWithMe:
                (task as any).sharedWithMe ?? (prev as any).sharedWithMe,
              shareId: (task as any).shareId ?? (prev as any).shareId,
            }));
          },
          (err) => {
            console.error("[TaskDetailPanel] source task listener:", err.message);
          },
        );

        return () => unsub();
      }

      if (!user?.uid) return;

      const taskRef = doc(db, "users", user.uid, "tasks", task.id);

      const unsub = onSnapshot(
        taskRef,
        (snap) => {
          if (!snap.exists()) return;

          setTaskView((prev) => ({
            ...prev,
            ...task,
            ...(snap.data() as Partial<Task>),
            id: task.id,
          }));
        },
        (err) => {
          console.error("[TaskDetailPanel] user task listener:", err.message);
        },
      );

      return () => unsub();
    }, [user?.uid, task.id, task, taskWorkspaceId, sourceTaskId]);

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

  const [toast, setToast] = useState<string | null>(null);
  const [copiedTaskLink, setCopiedTaskLink] = useState(false);
  const [likedByMe, setLikedByMe] = useState(false);
  const [taskLikeCount, setTaskLikeCount] = useState(0);
  const [likingTask, setLikingTask] = useState(false);

  // Share task modal state
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [shareError, setShareError] = useState("");
  const [sharingTask, setSharingTask] = useState(false);
  const [shareSent, setShareSent] = useState(false);
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [taskShares, setTaskShares] = useState<TaskShare[]>([]);
  const [showShareMessage, setShowShareMessage] = useState(false);

  const workspaceMembers = useMemo(() => {
    return Array.isArray(members) ? members : [];
  }, [members]);

  const hookMentionableUsers = useMentionableUsers(
    taskView.projectId || task.projectId,
    {
      task: taskView,
      taskShares,
      members: workspaceMembers,
    },
  );
  const safeHookMentionableUsers = Array.isArray(hookMentionableUsers)
    ? hookMentionableUsers
    : [];

  const mentionableUsers = useMemo(() => {
    const uniqueUsers = new Map<
      string,
      {
        id: string;
        name: string;
        email?: string;
        avatarUrl?: string;
        photoURL?: string;
        googlePhotoURL?: string;
        providerPhotoURL?: string;
      }
    >();

    const cleanString = (value?: unknown) => String(value || "").trim();

    const cleanEmail = (value?: string | null) =>
      String(value || "")
        .trim()
        .toLowerCase();

    const addMentionUser = (rawUser: any) => {
      const id = cleanString(
        rawUser?.uid ||
          rawUser?.userId ||
          rawUser?.id ||
          rawUser?.memberId ||
          rawUser?.userUid ||
          rawUser?.acceptedByUid ||
          rawUser?.acceptedBy ||
          rawUser?.sharedByUid ||
          rawUser?.invitedBy,
      );

      const email = cleanEmail(
        rawUser?.email ||
          rawUser?.emailLower ||
          rawUser?.emailAddress ||
          rawUser?.sharedWithEmail ||
          rawUser?.invitedEmail ||
          rawUser?.invitedEmailLower ||
          rawUser?.acceptedByEmail,
      );

      const name =
        cleanString(
          rawUser?.displayName ||
            rawUser?.name ||
            rawUser?.fullName ||
            rawUser?.username ||
            rawUser?.acceptedByName ||
            rawUser?.sharedWithName ||
            rawUser?.invitedName,
        ) ||
        (email ? email.split("@")[0] : "") ||
        id ||
        "User";

      const avatarUrl = cleanString(
        rawUser?.avatarUrl ||
          rawUser?.photoURL ||
          rawUser?.avatar ||
          rawUser?.googlePhotoURL ||
          rawUser?.providerPhotoURL ||
          rawUser?.authPhotoURL,
      );

      if (!id && !email && !name) return;

      if (user?.uid && id && id === user.uid) return;

      if (user?.email && email && email === cleanEmail(user.email)) {
        return;
      }

      const key = id ? `uid:${id}` : email ? `email:${email}` : `name:${name}`;

      if (!uniqueUsers.has(key)) {
        uniqueUsers.set(key, {
          id: id || email || name,
          name,
          email,
          avatarUrl,
          photoURL: avatarUrl,
          googlePhotoURL: cleanString(rawUser?.googlePhotoURL),
          providerPhotoURL: cleanString(rawUser?.providerPhotoURL),
        });
      }
    };

    // 1. Users returned by the hook.
       safeHookMentionableUsers.forEach((member: any) => {
      addMentionUser(member);
    });

    // 2. Workspace members from AppData.
    workspaceMembers.forEach((member: any) => {
      const status = cleanString(member?.status).toLowerCase();

      if (
        status &&
        !["active", "accepted", "owner", "admin", "member"].includes(status)
      ) {
        return;
      }

      addMentionUser(member);
    });

    // 3. Extra members array fallback.
    members.forEach((member: any) => {
      const status = cleanString(member?.status).toLowerCase();

      if (
        status &&
        !["active", "accepted", "owner", "admin", "member"].includes(status)
      ) {
        return;
      }

      addMentionUser(member);
    });

    // 4. Task assignee.
    if (taskView.assignee || task.assignee) {
      addMentionUser({
        name: taskView.assignee || task.assignee,
        displayName: taskView.assignee || task.assignee,
        email:
          (taskView as any).assigneeEmail ||
          (taskView as any).assignedToEmail ||
          (task as any).assigneeEmail ||
          (task as any).assignedToEmail,
        uid:
          (taskView as any).assigneeUid ||
          (taskView as any).assigneeId ||
          (taskView as any).assignedToUid ||
          (taskView as any).assignedToId ||
          (task as any).assigneeUid ||
          (task as any).assigneeId ||
          (task as any).assignedToUid ||
          (task as any).assignedToId,
        photoURL:
          (taskView as any).assigneePhotoURL ||
          (taskView as any).assignedToPhotoURL ||
          (task as any).assigneePhotoURL ||
          (task as any).assignedToPhotoURL,
      });
    }

    // 5. Explicit task participant/member IDs.
    const taskParticipantIds = [
      ...(((taskView as any).memberIds as string[]) || []),
      ...(((taskView as any).participantIds as string[]) || []),
      ...(((taskView as any).collaboratorUids as string[]) || []),
      ...(((taskView as any).sharedWithUids as string[]) || []),
      ...(((task as any).memberIds as string[]) || []),
      ...(((task as any).participantIds as string[]) || []),
      ...(((task as any).collaboratorUids as string[]) || []),
      ...(((task as any).sharedWithUids as string[]) || []),
    ]
      .map((id) => cleanString(id))
      .filter(Boolean);

    taskParticipantIds.forEach((participantUid) => {
      const matchingMember = workspaceMembers.find((member: any) => {
        const memberUid = cleanString(
          member?.uid || member?.userId || member?.id || member?.memberId,
        );

        return memberUid === participantUid;
      });

      addMentionUser(
        matchingMember || {
          uid: participantUid,
          id: participantUid,
          name: participantUid,
        },
      );
    });

    // 6. Accepted, active, or pending task share users.
    taskShares.forEach((share: any) => {
      const status = cleanString(share?.status).toLowerCase();

      if (status && !["active", "accepted", "pending"].includes(status)) {
        return;
      }

      addMentionUser({
        uid:
          share?.acceptedByUid ||
          share?.acceptedBy ||
          share?.sharedByUid ||
          share?.invitedBy,
        email:
          share?.acceptedByEmail ||
          share?.sharedWithEmail ||
          share?.invitedEmail ||
          share?.invitedEmailLower,
        name:
          share?.acceptedByName ||
          share?.sharedWithName ||
          share?.invitedName,
        displayName:
          share?.acceptedByName ||
          share?.sharedWithName ||
          share?.invitedName,
        photoURL: share?.acceptedByPhotoURL || share?.photoURL,
      });
    });

    const resolvedMentionUsers = Array.from(uniqueUsers.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );


    return resolvedMentionUsers;
  }, [
        safeHookMentionableUsers,
    workspaceMembers,
    members,
    taskShares,
    taskView,
    task,
    user?.uid,
    user?.email,
  ]);





    const [taskAccessOpen, setTaskAccessOpen] = useState(false);
    const [savingTaskAccess, setSavingTaskAccess] = useState(false);
    const [taskAccessMode, setTaskAccessMode] = useState<TaskAccessMode>(() => {
      const savedMode = (task as any).shareAccessMode;

      if (
        savedMode === "task_project" ||
        savedMode === "invited_only" ||
        savedMode === "anyone_with_link"
      ) {
        return savedMode;
      }

      return "task_project";
    });

      const activeTaskAccessOption =
    TASK_ACCESS_OPTIONS.find((option) => option.value === taskAccessMode) ??
    TASK_ACCESS_OPTIONS[0];

  const getWorkspaceMemberByEmail = useCallback(

      (email?: string | null) => {
        const targetEmail = normalizeEmail(email);

        if (!targetEmail) return null;

        return (
          workspaceMembers.find((member: any) => {
            return normalizeEmail(member.email) === targetEmail;
          }) || null
        );
      },
      [workspaceMembers],
    );

    const [resolvedProfilesByUid, setResolvedProfilesByUid] = useState<
      Record<string, ResolvedUserProfile>
    >({});

    const [resolvedProfilesByEmail, setResolvedProfilesByEmail] = useState<
      Record<string, ResolvedUserProfile>
    >({});

    const currentUserRealPhotoURL = getFirstRealPhotoURL(
      user?.photoURL,
      (user as any)?.googlePhotoURL,
      (user as any)?.providerPhotoURL,
      getProviderPhotoURL(user),
    );

    const safeCurrentUserUid = user?.uid ?? "";
    const safeCurrentUserEmail = user?.email ?? "";
    const safeCurrentUserDisplayName =
      user?.displayName || safeCurrentUserEmail.split("@")[0] || "You";

    const userProfileUidsToWatch = useMemo(() => {
      const ids = new Set<string>();

      if (user?.uid) ids.add(user.uid);

      comments.forEach((comment) => {
        if (comment.authorId) ids.add(comment.authorId);
      });

      taskShares.forEach((share) => {
        if (share.acceptedByUid) ids.add(share.acceptedByUid);
        if (share.acceptedBy) ids.add(share.acceptedBy);
        if (share.sharedByUid) ids.add(share.sharedByUid);
        if (share.invitedBy) ids.add(share.invitedBy);
      });

      workspaceMembers.forEach((member: any) => {
        const memberUid = member?.uid || member?.userId || member?.id;

        if (memberUid) ids.add(memberUid);
      });

      return Array.from(ids)
        .map((id) => String(id || "").trim())
        .filter(Boolean)
        .slice(0, 80);
    }, [user?.uid, comments, taskShares, workspaceMembers]);

    const userProfileUidsKey = userProfileUidsToWatch.join("|");

    useEffect(() => {
      if (!userProfileUidsToWatch.length) {
        setResolvedProfilesByUid({});
        setResolvedProfilesByEmail({});
        return;
      }

      const unsubscribers = userProfileUidsToWatch.map((profileUid) => {
        const profileRef = doc(db, "users", profileUid);

        return onSnapshot(
          profileRef,
          (snap) => {
            const raw = snap.exists() ? snap.data() : {};

            const isCurrentUser = user?.uid === profileUid;

            const email = normalizeEmail(
              raw.email ||
                raw.emailLower ||
                raw.emailAddress ||
                (isCurrentUser ? user?.email : ""),
            );

            const name =
              raw.displayName ||
              raw.name ||
              raw.fullName ||
              (isCurrentUser ? user?.displayName : "") ||
              email ||
              "User";

            const realPhotoURL = getFirstRealPhotoURL(
              raw.photoURL,
              raw.googlePhotoURL,
              raw.providerPhotoURL,
              raw.authPhotoURL,
              isCurrentUser ? currentUserRealPhotoURL : "",
            );

            const profile: ResolvedUserProfile = {
              uid: profileUid,
              email,
              name,
              photoURL: realPhotoURL,
            };

            setResolvedProfilesByUid((prev) => ({
              ...prev,
              [profileUid]: profile,
            }));

            if (email) {
              setResolvedProfilesByEmail((prev) => ({
                ...prev,
                [email]: profile,
              }));
            }
          },
          (err) => {
            console.warn(
              "[TaskDetailPanel] user profile avatar listener skipped:",
              profileUid,
              err.message,
            );
          },
        );
      });

      return () => {
        unsubscribers.forEach((unsubscribe) => unsubscribe());
      };
    }, [
      userProfileUidsKey,
      user?.uid,
      user?.email,
      user?.displayName,
      currentUserRealPhotoURL,
    ]);

    const getResolvedUserProfile = useCallback(
      ({
        uid,
        email,
        name,
        photoURL,
      }: {
        uid?: string | null;
        email?: string | null;
        name?: string | null;
        photoURL?: string | null;
      }) => {
        const cleanEmail = normalizeEmail(email);
        const cleanUid = String(uid || "").trim();

        const profileByUid = cleanUid ? resolvedProfilesByUid[cleanUid] : null;
        const profileByEmail = cleanEmail
          ? resolvedProfilesByEmail[cleanEmail]
          : null;

        const memberByEmail = cleanEmail
          ? workspaceMembers.find((member: any) => {
              return (
                normalizeEmail(member.email || member.emailLower) === cleanEmail
              );
            })
          : null;

        const memberByUid = cleanUid
          ? workspaceMembers.find((member: any) => {
              return (
                member.userId === cleanUid ||
                member.uid === cleanUid ||
                member.id === cleanUid
              );
            })
          : null;

        const matchedMember = memberByEmail || memberByUid;

        const isCurrentUser =
          Boolean(cleanUid && user?.uid && cleanUid === user.uid) ||
          Boolean(
            cleanEmail &&
            user?.email &&
            cleanEmail === normalizeEmail(user.email),
          );

        const resolvedEmail =
          cleanEmail ||
          normalizeEmail(profileByUid?.email) ||
          normalizeEmail(profileByEmail?.email) ||
          normalizeEmail(matchedMember?.email || matchedMember?.emailLower) ||
          (isCurrentUser ? normalizeEmail(user?.email) : "");

        const resolvedName =
          name ||
          profileByUid?.name ||
          profileByEmail?.name ||
          matchedMember?.displayName ||
          matchedMember?.name ||
          matchedMember?.fullName ||
          (isCurrentUser ? user?.displayName || "" : "") ||
          resolvedEmail ||
          "User";

        const resolvedPhotoURL = getFirstRealPhotoURL(
          photoURL,
          profileByUid?.photoURL,
          profileByEmail?.photoURL,
          matchedMember?.photoURL,
          matchedMember?.googlePhotoURL,
          matchedMember?.providerPhotoURL,
          matchedMember?.authPhotoURL,
          isCurrentUser ? currentUserRealPhotoURL : "",
        );

        return {
          name: resolvedName,
          email: resolvedEmail,
          photoURL: resolvedPhotoURL,
        };
      },
      [
        workspaceMembers,
        resolvedProfilesByUid,
        resolvedProfilesByEmail,
        user?.uid,
        user?.displayName,
        user?.email,
        currentUserRealPhotoURL,
      ],
    );

    useEffect(() => {
      const savedMode =
        (taskView as any).shareAccessMode || (task as any).shareAccessMode;

      if (
        savedMode === "task_project" ||
        savedMode === "invited_only" ||
        savedMode === "anyone_with_link"
      ) {
        setTaskAccessMode(savedMode);
      } else {
        setTaskAccessMode("task_project");
      }
    }, [
      task.id,
      taskView.id,
      (taskView as any).shareAccessMode,
      (task as any).shareAccessMode,
    ]);

    // Composer expand/collapse state (Asana-style progressive disclosure)
    const [composerExpanded, setComposerExpanded] = useState(false);
    const [showComposerEmojiPicker, setShowComposerEmojiPicker] = useState(false);
    const [showFormattingToolbar, setShowFormattingToolbar] = useState(false);

        // Comment actions state
    const [actionMenuCommentId, setActionMenuCommentId] = useState<string | null>(
      null,
    );

    const [actionMenuPlacementByCommentId, setActionMenuPlacementByCommentId] =
      useState<Record<string, "up" | "down">>({});

    const [emojiPickerPlacementByCommentId, setEmojiPickerPlacementByCommentId] =
      useState<Record<string, "up" | "down">>({});

    const [replyingTo, setReplyingTo] = useState<CommentReplyReference | null>(
      null,
    );

    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    const [editCommentText, setEditCommentText] = useState("");

    // Reaction picker state
    const [pickerForCommentId, setPickerForCommentId] = useState<string | null>(
      null,
    );

    const [emojiSearch, setEmojiSearch] = useState("");
    const [activeCategory, setActiveCategory] =
      useState<EmojiCategoryKey>("smileys");
    const [recentEmojis, setRecentEmojis] = useState<string[]>(() =>
      loadRecentEmojis(),
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
    const didInitialCommentsScrollRef = useRef(false);
    const lastVisibleCommentIdRef = useRef("");

    const [showScrollToBottomButton, setShowScrollToBottomButton] =
      useState(false);


    const commentRefs = useRef<Record<string, HTMLDivElement | null>>({});
    const highlightTimerRef = useRef<number | null>(null);
    const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(
      null,
    );
    const isNearCommentsBottom = useCallback(() => {
      const container = scrollContainerRef.current;

      if (!container) return true;

      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight;

      return distanceFromBottom < 160;
    }, []);

    const scrollToLatestComment = useCallback(
      (behavior: ScrollBehavior = "smooth") => {
        window.requestAnimationFrame(() => {
          messagesEndRef.current?.scrollIntoView({
            behavior,
            block: "end",
          });

          setShowScrollToBottomButton(false);
        });
      },
      [],
    );

        const scrollToComment = useCallback((commentId?: string | null) => {
      const cleanCommentId = String(commentId || "").trim();

      if (!cleanCommentId) return;

      const target = commentRefs.current[cleanCommentId];

      if (!target) {
        setToast("Original comment not found");
        window.setTimeout(() => setToast(null), 1800);
        return;
      }

      target.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });

      setHighlightedCommentId(cleanCommentId);

      if (highlightTimerRef.current) {
        window.clearTimeout(highlightTimerRef.current);
      }

      highlightTimerRef.current = window.setTimeout(() => {
        setHighlightedCommentId(null);
        highlightTimerRef.current = null;
      }, 3000);
    }, []);

    const getCommentPopoverPlacement = useCallback(
      (triggerElement: HTMLElement | null): "up" | "down" => {
        if (!triggerElement) return "up";

        const triggerRect = triggerElement.getBoundingClientRect();
        const panelRect = scrollContainerRef.current?.getBoundingClientRect();

        const topBoundary = panelRect?.top ?? 0;
        const bottomBoundary = panelRect?.bottom ?? window.innerHeight;

        const spaceAbove = triggerRect.top - topBoundary;
        const spaceBelow = bottomBoundary - triggerRect.bottom;

        /*
          If the comment action is near the top navigation/header,
          opening upward hides the menu. So open downward.
        */
        if (spaceAbove < 220 && spaceBelow > spaceAbove) {
          return "down";
        }

        return "up";
      },
      [],
    );


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
      [commentText, skinTone],
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

        const project = useMemo(() => {
      const currentProjectId = String(
        taskView.projectId || task.projectId || ""
      ).trim();

      if (!currentProjectId) return null;

      return (
        projects.find(
          (p: any) => String(p?.id || "").trim() === currentProjectId
        ) || null
      );
    }, [projects, taskView.projectId, task.projectId]);


    const taskParticipantCount = useMemo(() => {
      const ids = new Set<string>();

      if (safeCurrentUserUid) ids.add(`uid:${safeCurrentUserUid}`);

      workspaceMembers.forEach((member: any) => {
        if (member?.status && member.status !== "active") return;

        const memberUid = String(
          member?.userId || member?.uid || member?.id || "",
        ).trim();

        const memberEmail = normalizeEmail(member?.email || member?.emailLower);

        if (memberUid) ids.add(`uid:${memberUid}`);
        else if (memberEmail) ids.add(`email:${memberEmail}`);
      });

      taskShares.forEach((share) => {
        const email = normalizeEmail(
          share.sharedWithEmail || share.invitedEmail || share.invitedEmailLower,
        );

        if (email) ids.add(`email:${email}`);

        const acceptedUid = String(
          share.acceptedByUid || share.acceptedBy || "",
        ).trim();

        if (acceptedUid) ids.add(`uid:${acceptedUid}`);
      });

      const assignee = String(taskView.assignee || task.assignee || "").trim();

      if (assignee) ids.add(`assignee:${assignee.toLowerCase()}`);

      const projectMemberIds = [
        ...(((project as any)?.memberIds as string[]) || []),
        ...(((project as any)?.collaboratorUids as string[]) || []),
      ];

      projectMemberIds.forEach((id) => {
        const clean = String(id || "").trim();
        if (clean) ids.add(`uid:${clean}`);
      });

      return ids.size;
    }, [
      safeCurrentUserUid,
      workspaceMembers,
      taskShares,
      taskView.assignee,
      task.assignee,
      project,
    ]);

               const currentWorkspaceMember = useMemo(() => {
      if (!user?.uid && !user?.email) return null;

      const currentUid = String(user?.uid || "").trim();
      const currentEmail = normalizeEmail(user?.email);

      return (
        workspaceMembers.find((member: any) => {
          const memberUid = String(
            member?.uid ||
              member?.userId ||
              member?.id ||
              member?.memberId ||
              member?.userUid ||
              "",
          ).trim();

          const memberEmail = normalizeEmail(
            member?.email || member?.emailLower || member?.emailAddress,
          );

          return (
            (currentUid && memberUid === currentUid) ||
            (currentEmail && memberEmail === currentEmail)
          );
        }) || null
      );
    }, [workspaceMembers, user?.uid, user?.email]);

       const currentWorkspaceRole = useMemo(() => {
      const rawRole = String(
        currentWorkspaceMember?.role ||
          currentWorkspaceMember?.accessRole ||
          currentWorkspaceMember?.memberRole ||
          "",
      )
        .trim()
        .toLowerCase();

      if (rawRole === "owner") return "owner";
      if (rawRole === "admin") return "admin";
      if (rawRole === "viewer") return "viewer";
      if (rawRole === "member") return "member";

      return currentWorkspaceMember ? "member" : "";
    }, [currentWorkspaceMember]);

    const currentWorkspacePermissions = currentWorkspaceMember?.permissions || {};

    const isWorkspaceOwner = useMemo(() => {
      const currentUid = String(user?.uid || "").trim();
      const currentEmail = normalizeEmail(user?.email);

      if (!currentUid && !currentEmail) return false;

      const ownerIds = [
        appData?.workspaceData?.ownerId,
        appData?.workspaceData?.createdBy,
        appData?.workspaceData?.uid,
        appData?.workspaceData?.userId,
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean);

      const ownerEmails = [
        appData?.workspaceData?.ownerEmail,
        appData?.workspaceData?.ownerEmailLower,
        appData?.workspaceData?.createdByEmail,
        appData?.workspaceData?.email,
      ]
        .map((value) => normalizeEmail(value))
        .filter(Boolean);

      return (
        Boolean(currentUid && ownerIds.includes(currentUid)) ||
        Boolean(currentEmail && ownerEmails.includes(currentEmail))
      );
    }, [user?.uid, user?.email, appData?.workspaceData]);

    const isTaskOwner = useMemo(() => {
      const currentUid = String(user?.uid || "").trim();
      const currentEmail = normalizeEmail(user?.email);

      if (!currentUid && !currentEmail) return false;

      const ownerUids = [
        (taskView as any).ownerId,
        (taskView as any).createdBy,
        (taskView as any).createdByUid,
        (taskView as any).uid,
        (taskView as any).userId,
        (task as any).ownerId,
        (task as any).createdBy,
        (task as any).createdByUid,
        (task as any).uid,
        (task as any).userId,
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean);

      const ownerEmails = [
        (taskView as any).ownerEmail,
        (taskView as any).createdByEmail,
        (taskView as any).email,
        (task as any).ownerEmail,
        (task as any).createdByEmail,
        (task as any).email,
      ]
        .map((value) => normalizeEmail(value))
        .filter(Boolean);

      return (
        Boolean(currentUid && ownerUids.includes(currentUid)) ||
        Boolean(currentEmail && ownerEmails.includes(currentEmail))
      );
    }, [user?.uid, user?.email, taskView, task]);

    const isProjectOwner = useMemo(() => {
      const currentUid = String(user?.uid || "").trim();
      const currentEmail = normalizeEmail(user?.email);

      if ((!currentUid && !currentEmail) || !project) return false;

      const projectOwnerUids = [
        (project as any).ownerId,
        (project as any).createdBy,
        (project as any).createdByUid,
        (project as any).uid,
        (project as any).userId,
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean);

      const projectOwnerEmails = [
        (project as any).ownerEmail,
        (project as any).createdByEmail,
        (project as any).email,
      ]
        .map((value) => normalizeEmail(value))
        .filter(Boolean);

      return (
        Boolean(currentUid && projectOwnerUids.includes(currentUid)) ||
        Boolean(currentEmail && projectOwnerEmails.includes(currentEmail))
      );
    }, [user?.uid, user?.email, project]);

    const isWorkspaceOwnerOrAdmin =
      isWorkspaceOwner ||
      currentWorkspaceRole === "owner" ||
      currentWorkspaceRole === "admin";

    const isWorkspaceMemberRole = currentWorkspaceRole === "member";

    const isWorkspaceViewerRole =
      currentWorkspaceRole === "viewer" ||
      currentWorkspacePermissions?.canViewOnly === true;

    const canEditTaskContent =
      Boolean(user?.uid) &&
      (isWorkspaceOwnerOrAdmin || isTaskOwner || isProjectOwner);

    const canManageTaskSharing =
      Boolean(user?.uid) &&
      (isWorkspaceOwnerOrAdmin || isTaskOwner || isProjectOwner);

    const canCommentOnTask =
      Boolean(user?.uid) &&
      !isWorkspaceViewerRole &&
      (canEditTaskContent ||
        isWorkspaceMemberRole ||
        currentWorkspacePermissions?.canComment === true);

    const canReactToComments = canCommentOnTask;

    const canUseCommentComposer = canCommentOnTask;

    const canReplyToComments = canCommentOnTask && taskParticipantCount > 1;




    const taskNotificationMemberUids = useMemo(() => {
      const ids = new Set<string>();

      const addUid = (value?: unknown) => {
        const clean = String(value || "").trim();

        if (!clean || clean.includes("/")) return;

        ids.add(clean);
      };

      const addUidArray = (value?: unknown) => {
        if (!Array.isArray(value)) return;

        value.forEach(addUid);
      };

      [taskView, task].forEach((source: any) => {
        addUid(source?.ownerId);
        addUid(source?.createdBy);
        addUid(source?.uid);
        addUid(source?.userId);

        addUid(source?.assigneeId);
        addUid(source?.assigneeUid);
        addUid(source?.assignedToId);
        addUid(source?.assignedToUid);

        addUidArray(source?.assigneeIds);
        addUidArray(source?.memberIds);
        addUidArray(source?.participantIds);
        addUidArray(source?.collaboratorUids);
        addUidArray(source?.sharedWithUids);
      });

      if (project) {
        addUid((project as any).ownerId);
        addUid((project as any).createdBy);
        addUid((project as any).uid);

        addUidArray((project as any).memberIds);
        addUidArray((project as any).collaboratorUids);
      }

      taskShares.forEach((share: any) => {
        const status = String(share?.status || "").toLowerCase();

        if (status && !["active", "accepted"].includes(status)) return;

        addUid(share?.acceptedByUid);
        addUid(share?.acceptedBy);
      });

      const assigneeNameOrEmail = normalizeEmail(taskView.assignee || task.assignee);

      if (assigneeNameOrEmail) {
        workspaceMembers.forEach((member: any) => {
          const memberUid = String(
            member?.uid || member?.userId || member?.id || "",
          ).trim();

          const memberEmail = normalizeEmail(member?.email || member?.emailLower);
          const memberName = normalizeEmail(
            member?.displayName || member?.name || member?.fullName,
          );

          if (
            memberUid &&
            (memberEmail === assigneeNameOrEmail ||
              memberName === assigneeNameOrEmail)
          ) {
            addUid(memberUid);
          }
        });
      }

      if (safeCurrentUserUid) {
        ids.delete(safeCurrentUserUid);
      }

      return Array.from(ids);
    }, [
      taskView,
      task,
      project,
      taskShares,
      workspaceMembers,
      safeCurrentUserUid,
    ]);

    const overdue = isOverdue(task);


    // Trigger slide-in animation on mount
    useEffect(() => {
      const id = requestAnimationFrame(() => setMounted(true));
      return () => cancelAnimationFrame(id);
    }, []);
    useEffect(() => {
      return () => {
        if (highlightTimerRef.current) {
          window.clearTimeout(highlightTimerRef.current);
        }
      };
    }, []);
    useEffect(() => {
      const visibleIds = new Set(comments.map((comment) => comment.id));

      Object.keys(commentRefs.current).forEach((commentId) => {
        if (!visibleIds.has(commentId)) {
          delete commentRefs.current[commentId];
        }
      });
    }, [comments]);

      // Close on Escape — but not while a popover/menu/editor is open
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if (e.key !== "Escape") return;

        if (actionMenuCommentId) {
          setActionMenuCommentId(null);
          return;
        }

        if (editingCommentId) {
          setEditingCommentId(null);
          setEditCommentText("");
          return;
        }

        if (replyingTo) {
          setReplyingTo(null);
          return;
        }

        if (pickerForCommentId) {
          setPickerForCommentId(null);
          setShowSkinTonePicker(false);
          return;
        }

        if (showSuggestions || showUserSuggestions) return;

        handleClose();
      };

      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      showSuggestions,
      showUserSuggestions,
      pickerForCommentId,
      actionMenuCommentId,
      editingCommentId,
      replyingTo,
    ]);

    // Close the three-dot comment action menu when clicking anywhere outside it.
    useEffect(() => {
      if (!actionMenuCommentId) return;

      const onPointerDown = (event: MouseEvent | TouchEvent) => {
        const target = event.target as HTMLElement | null;

        if (!target) return;

        const clickedInsideActionMenu = target.closest(
          "[data-comment-action-menu='true']",
        );

        const clickedActionTrigger = target.closest(
          "[data-comment-action-trigger='true']",
        );

        if (clickedInsideActionMenu || clickedActionTrigger) {
          return;
        }

        setActionMenuCommentId(null);
      };

      const id = window.setTimeout(() => {
        document.addEventListener("mousedown", onPointerDown, true);
        document.addEventListener("touchstart", onPointerDown, true);
      }, 0);

      return () => {
        window.clearTimeout(id);
        document.removeEventListener("mousedown", onPointerDown, true);
        document.removeEventListener("touchstart", onPointerDown, true);
      };
    }, [actionMenuCommentId]);

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
            async (comment: TaskComment, emoji: string) => {
        if (!user?.uid) return;

        if (!canReactToComments) {
          setToast("You do not have permission to react to comments");
          setTimeout(() => setToast(null), 2500);
          return;
        }

        if (!taskWorkspaceId || !sourceTaskId) return;


        const reactions: Record<string, string[]> = {
          ...(comment.reactions ?? {}),
        };

        const current = reactions[emoji] ?? [];
        const has = current.includes(user.uid);

        const next = has
          ? current.filter((uid) => uid !== user.uid)
          : [...current, user.uid];

        if (next.length === 0) {
          delete reactions[emoji];
        } else {
          reactions[emoji] = next;
        }

        try {
          await updateDoc(
            doc(
              db,
              "workspaces",
              taskWorkspaceId,
              "tasks",
              sourceTaskId,
              "comments",
              comment.id,
            ),
            { reactions },
          );
        } catch (e) {
          console.error("[TaskDetailPanel] toggle reaction:", e);
        }
      },
            [user?.uid, taskWorkspaceId, sourceTaskId, canReactToComments],
    );
    const migrateMyLegacyCommentsToCanonical = useCallback(async () => {
      if (!safeCurrentUserUid || !taskWorkspaceId || !sourceTaskId || !task.id)
        return;

      try {
        const canonicalRef = collection(
          db,
          "workspaces",
          taskWorkspaceId,
          "tasks",
          sourceTaskId,
          "comments",
        );

        const legacyRef = collection(
          db,
          "users",
          safeCurrentUserUid,
          "tasks",
          task.id,
          "comments",
        );

        const [canonicalSnap, legacySnap] = await Promise.all([
          getDocs(canonicalRef),
          getDocs(legacyRef),
        ]);

        if (legacySnap.empty) return;

        const existingCanonicalIds = new Set(
          canonicalSnap.docs.map((commentDoc) => commentDoc.id),
        );

        const writes = legacySnap.docs
          .filter((legacyDoc) => !existingCanonicalIds.has(legacyDoc.id))
          .map((legacyDoc) => {
            const legacyData = legacyDoc.data();

            return setDoc(
              doc(
                db,
                "workspaces",
                taskWorkspaceId,
                "tasks",
                sourceTaskId,
                "comments",
                legacyDoc.id,
              ),
              {
                ...legacyData,
                authorId: legacyData.authorId || safeCurrentUserUid,
                authorName:
                  legacyData.authorName ||
                  safeCurrentUserDisplayName ||
                  safeCurrentUserEmail ||
                  "User",
                authorEmail: legacyData.authorEmail || safeCurrentUserEmail || "",
                authorPhotoURL: getFirstRealPhotoURL(
                  legacyData.authorPhotoURL,
                  currentUserRealPhotoURL,
                ),

                workspaceId: taskWorkspaceId,
                taskId: sourceTaskId,
                migratedFromLegacyUserTask: safeCurrentUserUid,
                migratedAt: serverTimestamp(),
              },
              { merge: true },
            );
          });

        if (writes.length > 0) {
          await Promise.all(writes);
          console.log(
            "[TaskDetailPanel] Migrated my legacy comments before sharing:",
            writes.length,
          );
        }
      } catch (err) {
        console.warn(
          "[TaskDetailPanel] pre-share legacy comment migration skipped:",
          err,
        );
      }
    }, [
      safeCurrentUserUid,
      safeCurrentUserEmail,
      safeCurrentUserDisplayName,
      taskWorkspaceId,
      sourceTaskId,
      task.id,
      currentUserRealPhotoURL,
    ]);

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
      [pickerForCommentId, comments, toggleReaction, skinTone],
    );

    // Real-time comments listener — canonical shared task comments.
// Replies/references are stored as metadata only.
// Ordering is handled locally using the comment's own createdAtMs/clientCreatedAt/createdAt.
useEffect(() => {
  if (!user?.uid || !taskWorkspaceId || !sourceTaskId) {
    setComments([]);
    return;
  }

  const commentsRef = collection(
    db,
    "workspaces",
    taskWorkspaceId,
    "tasks",
    sourceTaskId,
    "comments",
  );

  const unsub = onSnapshot(
    commentsRef,
    (snap) => {
      const data: TaskComment[] = snap.docs.map((d) =>
        normalizeIncomingComment(
          d.id,
          d.data() as Omit<TaskComment, "id">,
        ),
      );

      setComments(data);
    },
    (err) =>
      console.error(
        "[TaskDetailPanel] canonical comments listener:",
        err.message,
      ),
  );

  return () => unsub();
}, [user?.uid, taskWorkspaceId, sourceTaskId]);


    // One-time legacy migration:
    // Older comments were stored under users/{uid}/tasks/{taskId}/comments.
    // New shared comments must live under workspaces/{workspaceId}/tasks/{taskId}/comments.
    // When the task owner opens the task, their old comments are copied into the shared location.
    useEffect(() => {
      if (!safeCurrentUserUid || !taskWorkspaceId || !sourceTaskId || !task.id)
        return;

      let cancelled = false;

      async function migrateLegacyCommentsIfNeeded() {
        try {
          const canonicalRef = collection(
            db,
            "workspaces",
            taskWorkspaceId,
            "tasks",
            sourceTaskId,
            "comments",
          );

          const canonicalSnap = await getDocs(canonicalRef);

          // Do not duplicate comments if canonical comments already exist.
          if (!canonicalSnap.empty || cancelled) return;

          const legacyRef = collection(
            db,
            "users",
            safeCurrentUserUid,
            "tasks",
            task.id,
            "comments",
          );

          const legacySnap = await getDocs(legacyRef);

          if (legacySnap.empty || cancelled) return;

          await Promise.all(
            legacySnap.docs.map((legacyDoc) => {
              const legacyData = legacyDoc.data();

              return setDoc(
                doc(
                  db,
                  "workspaces",
                  taskWorkspaceId,
                  "tasks",
                  sourceTaskId,
                  "comments",
                  legacyDoc.id,
                ),
                {
                  ...legacyData,
                  authorId: legacyData.authorId || safeCurrentUserUid,
                  authorName:
                    legacyData.authorName ||
                    safeCurrentUserDisplayName ||
                    safeCurrentUserEmail ||
                    "User",
                  authorEmail:
                    legacyData.authorEmail || safeCurrentUserEmail || "",
                  authorPhotoURL: getFirstRealPhotoURL(
                    legacyData.authorPhotoURL,
                    currentUserRealPhotoURL,
                  ),

                  workspaceId: taskWorkspaceId,
                  taskId: sourceTaskId,
                  migratedFromLegacyUserTask: safeCurrentUserUid,
                  migratedAt: serverTimestamp(),
                },
                { merge: true },
              );
            }),
          );

          console.log(
            "[TaskDetailPanel] Migrated legacy comments:",
            legacySnap.docs.length,
          );
        } catch (err) {
          console.warn(
            "[TaskDetailPanel] legacy comment migration skipped:",
            err,
          );
        }
      }

      migrateLegacyCommentsIfNeeded();

      return () => {
        cancelled = true;
      };
    }, [
      safeCurrentUserUid,
      safeCurrentUserEmail,
      safeCurrentUserDisplayName,
      taskWorkspaceId,
      sourceTaskId,
      task.id,
      currentUserRealPhotoURL,
    ]);

    const handleClose = useCallback(() => {
      setClosing(true);
      setTimeout(() => onClose(), 280);
    }, [onClose]);
    const notifyCommentRecipients = useCallback(
      async ({
        commentId,
        text,
        mentionedUids,
      }: {
        commentId: string;
        text: string;
        mentionedUids: string[];
      }) => {
        if (!user?.uid || !taskWorkspaceId || !sourceTaskId || !commentId) {
          return;
        }

        try {
          const safeMentionedUids = Array.isArray(mentionedUids)
            ? mentionedUids
                .map((uid) => String(uid || "").trim())
                .filter((uid) => uid && uid !== user.uid && !uid.includes("/"))
            : [];

          const safeTaskMemberUids = Array.isArray(taskNotificationMemberUids)
            ? taskNotificationMemberUids
                .map((uid) => String(uid || "").trim())
                .filter((uid) => uid && uid !== user.uid && !uid.includes("/"))
            : [];

          const recipientUids = Array.from(
            new Set([...safeTaskMemberUids, ...safeMentionedUids]),
          );

          if (recipientUids.length === 0) {
            return;
          }

          await createCommentNotifications({
            workspaceId: taskWorkspaceId,
            projectId: String(taskView.projectId || task.projectId || ""),
            taskId: sourceTaskId,
            sourceTaskId,
            commentId,
            taskTitle: String(taskView.title || task.title || "Untitled task"),
            projectName: String((project as any)?.name || ""),
            commentText: text,
            authorId: user.uid,
            authorName: user.displayName || user.email || "User",
            authorPhotoURL: currentUserRealPhotoURL,
            mentionedUids: safeMentionedUids,
            taskMemberUids: safeTaskMemberUids,
          });
        } catch (notificationError) {
          console.error(
            "[TaskDetailPanel] create comment notifications:",
            notificationError,
          );
        }
      },
      [
        user?.uid,
        user?.displayName,
        user?.email,
        taskWorkspaceId,
        sourceTaskId,
        taskView.projectId,
        taskView.title,
        task.projectId,
        task.title,
        project,
        currentUserRealPhotoURL,
        taskNotificationMemberUids,
      ],
    );

          const handleSend = useCallback(async () => {
  if (!user?.uid || !commentText.trim() || sending) return;

  if (!canCommentOnTask) {
    setToast("You do not have permission to comment on this task");
    setTimeout(() => setToast(null), 2500);
    return;
  }

  setSending(true);


  try {
    const text = normalizeLegacyStructuredMentions(commentText.trim());
    const authorName = user.displayName ?? user.email ?? "User";
    const nowMs = Date.now();

    const commentsRef = getCanonicalCommentsCollection();

    if (!commentsRef) {
      setToast("Task comments are not available yet");
      setTimeout(() => setToast(null), 2500);
      return;
    }

    /**
     * replyTo is only a visual reference.
     * It must never control sorting or placement.
     */
    const replyReference = replyingTo
      ? removeUndefinedFields<CommentReplyReference>({
          commentId: replyingTo.commentId,
          authorId: replyingTo.authorId,
          authorName: replyingTo.authorName || "User",
          text: replyingTo.text || "Comment",
          attachmentName: replyingTo.attachmentName,
          attachmentType: replyingTo.attachmentType,
        })
      : undefined;

    const mentionedUids = extractUserMentionIds(text, mentionableUsers);

    const commentPayload = removeUndefinedFields({
      text,
      authorId: user.uid,
      authorName,
      authorEmail: user.email ?? "",
      authorPhotoURL: currentUserRealPhotoURL,
      workspaceId: taskWorkspaceId,
      taskId: sourceTaskId,

      // Stable ordering fields
      createdAt: serverTimestamp(),
      createdAtMs: nowMs,
      clientCreatedAt: new Date(nowMs).toISOString(),

      editedAt: null,
      editedBy: "",
      mentions: extractMentions(text),
      mentionedUids,
      attachments: [],

      // Metadata only, not ordering
      replyTo: replyReference,

      pinned: false,
      pinnedAt: null,
      pinnedBy: "",
    });

    const commentDocRef = await addDoc(commentsRef, commentPayload);

      await notifyCommentRecipients({
      commentId: commentDocRef.id,
      text,
      mentionedUids,
    });


    setCommentText("");
    setReplyingTo(null);
    setShowSuggestions(false);
    setMentionFilter("");
    setMentionStart(-1);
    setShowUserSuggestions(false);
    setUserMentionFilter("");
    setUserMentionStart(-1);
    setComposerExpanded(false);
    setShowComposerEmojiPicker(false);
    setShowFormattingToolbar(false);

    window.setTimeout(() => {
      scrollToLatestComment("smooth");
    }, 100);

  } catch (e) {
    console.error("[TaskDetailPanel] add comment:", e);
    setToast("Failed to send comment");
    setTimeout(() => setToast(null), 2500);
  } finally {
    setSending(false);
  }
}, [
  user,
  commentText,
  sending,
  taskWorkspaceId,
  sourceTaskId,
  currentUserRealPhotoURL,
  replyingTo,
  mentionableUsers,
  scrollToLatestComment,
  notifyCommentRecipients,
  canCommentOnTask,
]);






    const handleAttachFile = useCallback(
            async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];

        e.target.value = "";

        if (!file) return;

        if (!canCommentOnTask) {
          setToast("You do not have permission to attach files");
          setTimeout(() => setToast(null), 2500);
          return;
        }



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

        const commentsRef = getCanonicalCommentsCollection();

        if (!commentsRef) {
          setToast("Task comments are not available yet");
          setTimeout(() => setToast(null), 2500);
          return;
        }

        if (!isAllowedCommentAttachment(file)) {
          setToast(
            "Unsupported file type. Use image, PDF, text document, Word document, or audio.",
          );
          setTimeout(() => setToast(null), 3200);
          return;
        }

        const maxSizeMb = 25;

        if (file.size > maxSizeMb * 1024 * 1024) {
          setToast(`File is too large. Max ${maxSizeMb}MB allowed.`);
          setTimeout(() => setToast(null), 2500);
          return;
        }

        const uploadProjectId = taskView.projectId || task.projectId || "shared";
        const uploadTaskId = sourceTaskId || task.id;
        const text = normalizeLegacyStructuredMentions(commentText.trim());
        const nowMs = Date.now();

        setUploadingAttachment(true);


        try {
          const attachment = await storageService.uploadFile(
            user.uid,
            uploadProjectId,
            uploadTaskId,
            file,
          );

          const cleanAttachment =
            removeUndefinedFields<UploadedAttachment>(attachment);

          const authorName = user.displayName ?? user.email ?? "User";

          const replyReference = replyingTo
  ? removeUndefinedFields<CommentReplyReference>({
      commentId: replyingTo.commentId,
      authorId: replyingTo.authorId,
      authorName: replyingTo.authorName || "User",
      text: replyingTo.text || "Comment",
      attachmentName: replyingTo.attachmentName,
      attachmentType: replyingTo.attachmentType,
    })
  : undefined;

const mentionedUids = extractUserMentionIds(text, mentionableUsers);

const commentDocRef = await addDoc(
  commentsRef,
  removeUndefinedFields({
    text,
    authorId: user.uid,
    authorName,
    authorEmail: user.email ?? "",
    authorPhotoURL: currentUserRealPhotoURL,
    workspaceId: taskWorkspaceId,
    taskId: sourceTaskId,

    // Stable ordering fields
    createdAt: serverTimestamp(),
    createdAtMs: nowMs,
    clientCreatedAt: new Date(nowMs).toISOString(),

    editedAt: null,
    editedBy: "",
    mentions: extractMentions(text),
    mentionedUids,
    attachments: [cleanAttachment],

    // Metadata only, not ordering
    replyTo: replyReference,

    pinned: false,
    pinnedAt: null,
    pinnedBy: "",
  }),
);

await notifyCommentRecipients({
  commentId: commentDocRef.id,
  text: text || `Attachment: ${cleanAttachment.name}`,
  mentionedUids,
});



                             setCommentText("");
          setReplyingTo(null);
          setShowSuggestions(false);
          setMentionFilter("");
          setMentionStart(-1);
          setShowUserSuggestions(false);
          setUserMentionFilter("");
          setUserMentionStart(-1);
          setComposerExpanded(false);
          setShowComposerEmojiPicker(false);
          setShowFormattingToolbar(false);

                  window.setTimeout(() => {
            scrollToLatestComment("smooth");
          }, 100);

          const fileName = String(file.name || "").toLowerCase();
          const fileType = String(file.type || "").toLowerCase();

          if (fileType.startsWith("image/")) {
            setToast("Image uploaded");
          } else if (fileType.startsWith("audio/")) {
            setToast("Audio file uploaded");
          } else if (fileType === "application/pdf" || fileName.endsWith(".pdf")) {
            setToast("PDF uploaded");
          } else if (
            fileType.startsWith("text/") ||
            fileName.endsWith(".txt") ||
            fileName.endsWith(".md") ||
            fileName.endsWith(".csv") ||
            fileName.endsWith(".json")
          ) {
            setToast("Text document uploaded");
          } else if (
            fileName.endsWith(".doc") ||
            fileName.endsWith(".docx") ||
            fileName.endsWith(".rtf")
          ) {
            setToast("Document uploaded");
          } else {
            setToast("File uploaded");
          }


          setTimeout(() => setToast(null), 1800);
        } catch (err) {
          console.error("[TaskDetailPanel] upload attachment:", err);
          setToast("File upload failed");
          setTimeout(() => setToast(null), 2500);
        } finally {
          setUploadingAttachment(false);
        }
      },
                       [
        user,
        task.id,
        task.projectId,
        task.title,
        taskView.projectId,
        taskView.title,
        sourceTaskId,
        commentText,
        currentUserRealPhotoURL,
        taskWorkspaceId,
        replyingTo,
        mentionableUsers,
        scrollToLatestComment,
              notifyCommentRecipients,
        canCommentOnTask,
      ],

    );

        async function handleSaveDescription() {
      if (!user?.uid || savingDescription || !taskView.id) return;

      if (!canEditTaskContent) {
        setToast("Only admins can edit task details");
        setTimeout(() => setToast(null), 2500);
        return;
      }

      const trimmed = descriptionDraft.trim();

      if (trimmed === (taskView.description ?? "").trim()) {
        setEditingDescription(false);
        setDescriptionDraft("");
        return;
      }

      setSavingDescription(true);

      try {
        const taskPayload = {
          title: taskView.title,
          status: taskView.status ?? "To Do",
          priority: taskView.priority ?? "Low",
          projectId: taskView.projectId ?? null,
          projectCode: taskView.projectCode ?? null,
          assignee: taskView.assignee ?? "",
          dueDate: taskView.dueDate ?? "",
          taskCode: taskView.taskCode ?? "",
          description: trimmed,
          updatedAt: serverTimestamp(),
        };

        const writes: Promise<any>[] = [];

        if (taskWorkspaceId && sourceTaskId) {
          writes.push(
            setDoc(
              doc(db, "workspaces", taskWorkspaceId, "tasks", sourceTaskId),
              taskPayload,
              { merge: true },
            ),
          );
        }

        writes.push(
          setDoc(doc(db, "users", user.uid, "tasks", taskView.id), taskPayload, {
            merge: true,
          }),
        );

        await Promise.all(writes);

        setTaskView((prev) => ({
          ...prev,
          description: trimmed,
        }));

        setEditingDescription(false);
        setDescriptionDraft("");

        setToast("Description saved");
        setTimeout(() => setToast(null), 1800);
      } catch (e) {
        console.error("[TaskDetailPanel] save description:", e);
        setToast("Failed to save description");
        setTimeout(() => setToast(null), 2500);
      } finally {
        setSavingDescription(false);
      }
    }


       function startEditingDescription() {
      if (!canEditTaskContent) {
        setToast("Only admins can edit task details");
        setTimeout(() => setToast(null), 2500);
        return;
      }

      setDescriptionDraft(taskView.description ?? "");
      setEditingDescription(true);
    }


    function cancelEditingDescription() {
      setEditingDescription(false);
      setDescriptionDraft("");
    }

     async function handleDelete(c: TaskComment) {
      if (!user?.uid) return;
      if (!taskWorkspaceId || !sourceTaskId) return;

      const canDeleteThisComment = canEditTaskContent || c.authorId === user.uid;

      if (!canCommentOnTask && !canEditTaskContent) {
        setToast("You do not have permission to delete comments");
        setTimeout(() => setToast(null), 2500);
        return;
      }

      if (!canDeleteThisComment) {
        setToast("You can only delete your own comments");
        setTimeout(() => setToast(null), 2500);
        return;
      }

      try {
        await deleteDoc(
          doc(
            db,
            "workspaces",
            taskWorkspaceId,
            "tasks",
            sourceTaskId,
            "comments",
            c.id,
          ),
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
  const cleanText = normalizeLegacyStructuredMentions(text);
  const parts = cleanText.split(MENTION_SPLIT);

  return parts.map((part, i) => {
    const taskOrProjectMention = part.match(/^#((?:TSK|PRJ)-\d+)$/);

    if (taskOrProjectMention) {
      const code = taskOrProjectMention[1];
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

    const structuredUserMention = part.match(STRUCTURED_USER_MENTION_REGEX);

    if (structuredUserMention) {
      const handle = getUserMentionHandle({ name: structuredUserMention[1] });

      return (
        <span
          key={i}
          className="inline-flex items-center rounded-md bg-slate-200/80 px-1.5 py-0.5 font-medium text-slate-700"
        >
          @{handle}
        </span>
      );
    }

    if (/^@[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part)) {
      return (
        <span
          key={i}
          className="inline-flex items-center rounded-md bg-slate-200/80 px-1.5 py-0.5 font-medium text-slate-700"
        >
          {part}
        </span>
      );
    }

    return <span key={i}>{part}</span>;
  });
}

    function applyInlineFormat(
      prefix: string,
      suffix: string,
      placeholder: string,
    ) {
      const ta = inputRef.current;
      const start = ta?.selectionStart ?? commentText.length;
      const end = ta?.selectionEnd ?? commentText.length;
      const selected = commentText.slice(start, end);
      const content = selected || placeholder;
      const inserted = `${prefix}${content}${suffix}`;
      const next =
        commentText.slice(0, start) + inserted + commentText.slice(end);

      setCommentText(next);

      requestAnimationFrame(() => {
        ta?.focus();
        if (selected) {
          ta?.setSelectionRange(start, start + inserted.length);
        } else {
          ta?.setSelectionRange(
            start + prefix.length,
            start + prefix.length + placeholder.length,
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

      const next =
        commentText.slice(0, start) + inserted + commentText.slice(end);

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
      const next =
        commentText.slice(0, start) + inserted + commentText.slice(end);

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
      const next =
        commentText.slice(0, start) + inserted + commentText.slice(end);

      setCommentText(next);

      requestAnimationFrame(() => {
        ta?.focus();
        ta?.setSelectionRange(start, start + inserted.length);
      });
    }

    function renderInlineFormattedText(
      text: string,
      isMine: boolean,
      keyPrefix = "inline",
    ): React.ReactNode[] {
      const nodes: React.ReactNode[] = [];

     const regex =
  /(\*\*([\s\S]+?)\*\*|_([\s\S]+?)_|~~([\s\S]+?)~~|<u>([\s\S]+?)<\/u>|`([^`]+?)`|\[([^\]]+?)\]\((https?:\/\/[^\s)]+)\)|#(?:TSK|PRJ)-\d+|@\[[^\]]+\]\([^)]+\)|@[A-Za-z0-9][A-Za-z0-9._-]*)/g;



      let lastIndex = 0;
      let match: RegExpExecArray | null;
      let idx = 0;

      while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          nodes.push(
            <React.Fragment key={`${keyPrefix}-plain-${idx}`}>
              {renderCommentText(text.slice(lastIndex, match.index))}
            </React.Fragment>,
          );
          idx++;
        }

        const token = match[0];

        if (token.startsWith("**")) {
          nodes.push(
            <strong key={`${keyPrefix}-bold-${idx}`} className="font-semibold">
              {renderInlineFormattedText(
                match[2],
                isMine,
                `${keyPrefix}-bold-${idx}`,
              )}
            </strong>,
          );
        } else if (token.startsWith("_")) {
          nodes.push(
            <em key={`${keyPrefix}-italic-${idx}`} className="italic">
              {renderInlineFormattedText(
                match[3],
                isMine,
                `${keyPrefix}-italic-${idx}`,
              )}
            </em>,
          );
        } else if (token.startsWith("~~")) {
          nodes.push(
            <span key={`${keyPrefix}-strike-${idx}`} className="line-through">
              {renderInlineFormattedText(
                match[4],
                isMine,
                `${keyPrefix}-strike-${idx}`,
              )}
            </span>,
          );
        } else if (token.startsWith("<u>")) {
          nodes.push(
            <span
              key={`${keyPrefix}-underline-${idx}`}
              className="underline underline-offset-2"
            >
              {renderInlineFormattedText(
                match[5],
                isMine,
                `${keyPrefix}-underline-${idx}`,
              )}
            </span>,
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
            </code>,
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
            </a>,
          );
        } else if (token.startsWith("#") || token.startsWith("@")) {
  nodes.push(
    <React.Fragment key={`${keyPrefix}-mention-${idx}`}>
      {renderCommentText(token)}
    </React.Fragment>,
  );
}


        lastIndex = regex.lastIndex;
        idx++;
      }

      if (lastIndex < text.length) {
        nodes.push(
          <React.Fragment key={`${keyPrefix}-plain-end`}>
            {renderCommentText(text.slice(lastIndex))}
          </React.Fragment>,
        );
      }

      return nodes;
    }

    function renderFormattedCommentText(
      text: string,
      isMine: boolean,
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
            </div>,
          );
        }

        parts.push(
          <pre
            key={`code-block-${blockIndex}`}
            className={`my-1 max-w-full overflow-x-auto rounded-xl px-3 py-2 text-xs font-mono leading-relaxed ${
              isMine ? "bg-black/20 text-white" : "bg-slate-900 text-slate-100"
            }`}
          >
            <code>{match[1].trim()}</code>
          </pre>,
        );

        lastIndex = codeBlockRegex.lastIndex;
        blockIndex++;
      }

      const after = text.slice(lastIndex);

      if (after) {
        parts.push(
          <div key="text-block-after" className="space-y-1">
            {renderFormattedLines(after, isMine, "after")}
          </div>,
        );
      }

      return <>{parts}</>;
    }

    function renderFormattedLines(
      text: string,
      isMine: boolean,
      keyPrefix: string,
    ): React.ReactNode[] {
      return text.split("\n").map((line, index) => {
        const bulletMatch = line.match(/^-\s+(.+)$/);
        const numberMatch = line.match(/^(\d+)\.\s+(.+)$/);
        const quoteMatch = line.match(/^>\s+(.+)$/);

        if (bulletMatch) {
          return (
            <div key={`${keyPrefix}-bullet-${index}`} className="flex gap-2">
              <span className="mt-[1px]">•</span>
              <span>
                {renderInlineFormattedText(
                  bulletMatch[1],
                  isMine,
                  `${keyPrefix}-bullet-${index}`,
                )}
              </span>
            </div>
          );
        }

        if (numberMatch) {
          return (
            <div key={`${keyPrefix}-number-${index}`} className="flex gap-2">
              <span className="min-w-[18px]">{numberMatch[1]}.</span>
              <span>
                {renderInlineFormattedText(
                  numberMatch[2],
                  isMine,
                  `${keyPrefix}-number-${index}`,
                )}
              </span>
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
              {renderInlineFormattedText(
                quoteMatch[1],
                isMine,
                `${keyPrefix}-quote-${index}`,
              )}
            </blockquote>
          );
        }

        return (
          <p
            key={`${keyPrefix}-line-${index}`}
            className="whitespace-pre-wrap break-words"
          >
            {renderInlineFormattedText(
              line,
              isMine,
              `${keyPrefix}-line-${index}`,
            )}
          </p>
        );
      });
    }

    // Mention autocomplete suggestions, split into groups
       const taskItems = useMemo(
      () =>
        (Array.isArray(allTasks) ? allTasks : [])
          .filter((t: any) => t?.taskCode)
          .map((t: any) => ({
            code: String(t?.taskCode || ""),
            label: String(t?.title || "Untitled task"),
            priority: String(t?.priority || "Low"),
          })),
      [allTasks],
    );


       const projectItems = useMemo(
      () =>
        (Array.isArray(projects) ? projects : [])
          .filter((p: any) => p?.code)
          .map((p: any) => ({
            code: String(p?.code || ""),
            label: String(p?.name || p?.title || "Untitled project"),
            color: String(p?.color || "#8b5cf6"),
          })),
      [projects],
    );


    const filteredTasks = useMemo(() => {
      if (!showSuggestions) return [];
      const q = mentionFilter.toLowerCase();
      if (!q) return taskItems.slice(0, 5);
      return taskItems
        .filter(
          (it: any) =>
            it.code.toLowerCase().includes(q) ||
            it.label.toLowerCase().includes(q),
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
            it.label.toLowerCase().includes(q),
        )
        .slice(0, 5);
    }, [showSuggestions, mentionFilter, projectItems]);

       const hasSuggestions =
      showSuggestions &&
      ((Array.isArray(filteredTasks) ? filteredTasks.length : 0) > 0 ||
        (Array.isArray(filteredProjects) ? filteredProjects.length : 0) > 0);


    // Filtered users for @ mention autocomplete
    const filteredUsers = useMemo(() => {
      const safeMentionableUsers = Array.isArray(mentionableUsers)
        ? mentionableUsers
        : [];

      if (!showUserSuggestions) return [];

      const q = String(userMentionFilter || "").toLowerCase();

      if (!q) return safeMentionableUsers.slice(0, 6);

      return safeMentionableUsers
        .filter((u: any) => {
          const name = String(u?.name || "").toLowerCase();
          const email = String(u?.email || "").toLowerCase();

          return name.includes(q) || email.includes(q);
        })
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
  function insertUserMention(u: { id: string; name: string; email?: string }) {
  if (userMentionStart < 0) return;

  const before = commentText.slice(0, userMentionStart);
  const caret = inputRef.current?.selectionStart ?? commentText.length;
  const after = commentText.slice(caret);

  const handle = getUserMentionHandle(u);
  const inserted = `@${handle} `;

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
      if (
        showUserSuggestions &&
        filteredUsers.length > 0 &&
        e.key === "Enter" &&
        !e.shiftKey
      ) {
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

    const dueDateLabel = (() => {
      const rawDueDate = taskView.dueDate || task.dueDate;

      if (!rawDueDate || rawDueDate === "Invalid Date") return "—";

      try {
        const date =
          typeof rawDueDate === "string"
            ? new Date(rawDueDate + "T12:00:00")
            : new Date(toMs(rawDueDate));


        if (Number.isNaN(date.getTime())) return "—";

        return date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      } catch {
        return "—";
      }
    })();

    const taskLink = useMemo(() => {
      const baseUrl = window.location.origin;

      const params = new URLSearchParams();

      const canonicalTaskId = sourceTaskId || taskView.id || task.id;

      params.set("taskId", canonicalTaskId);

      if (taskWorkspaceId) {
        params.set("workspaceId", taskWorkspaceId);
      }

      if (taskView.projectId || task.projectId) {
        params.set("projectId", taskView.projectId || task.projectId || "");
      }

      return `${baseUrl}/my-tasks?${params.toString()}`;
    }, [
      sourceTaskId,
      taskView.id,
      task.id,
      taskWorkspaceId,
      taskView.projectId,
      task.projectId,
    ]);

    async function handleCopyTaskLink() {
      try {
        await navigator.clipboard.writeText(taskLink);

        setCopiedTaskLink(true);

        window.setTimeout(() => {
          setCopiedTaskLink(false);
        }, 1800);
      } catch (err) {
        console.error("[TaskDetailPanel] copy task link failed:", err);

        try {
          const textarea = document.createElement("textarea");
          textarea.value = taskLink;
          textarea.style.position = "fixed";
          textarea.style.opacity = "0";

          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand("copy");
          document.body.removeChild(textarea);

          setCopiedTaskLink(true);

          window.setTimeout(() => {
            setCopiedTaskLink(false);
          }, 1800);
        } catch (fallbackErr) {
          console.error("[TaskDetailPanel] fallback copy failed:", fallbackErr);
          setToast("Failed to copy task link");
          window.setTimeout(() => setToast(null), 2500);
        }
      }
    }
    useEffect(() => {
      if (!user?.uid || !taskWorkspaceId || !sourceTaskId) {
        setTaskShares([]);
        return;
      }

      const sharesQuery = firestoreQuery(
        collection(
          db,
          "workspaces",
          taskWorkspaceId,
          "tasks",
          sourceTaskId,
          "shares",
        ),
        orderBy("createdAt", "desc"),
      );

      const unsub = onSnapshot(
        sharesQuery,
                (snap) => {
          const shares: TaskShare[] = snap.docs
            .map((d) => ({
              id: d.id,
              ...(d.data() as Omit<TaskShare, "id">),
            }))
            .filter(
              (share) =>
                share.status !== "revoked" && share.status !== "removed",
            );

          setTaskShares(shares);
        },

        (err) => {
          console.error("[TaskDetailPanel] shares listener:", err.message);
        },
      );

      return () => unsub();
    }, [user?.uid, taskWorkspaceId, sourceTaskId]);
    /**
     * Real-time task likes listener.
     *
     * Canonical path:
     * workspaces/{workspaceId}/tasks/{sourceTaskId}/likes/{userUid}
     *
     * This makes "Like this Task" fully real-time for:
     * - task owner
     * - invited users
     * - shared task viewers
     */
    useEffect(() => {
      if (!safeCurrentUserUid || !taskWorkspaceId || !sourceTaskId) {
        setLikedByMe(false);
        setTaskLikeCount(0);
        return;
      }

      const likesRef = collection(
        db,
        "workspaces",
        taskWorkspaceId,
        "tasks",
        sourceTaskId,
        "likes",
      );

      const unsubscribe = onSnapshot(
        likesRef,
        (snapshot) => {
          setTaskLikeCount(snapshot.size);

          const currentUserLiked = snapshot.docs.some((likeDoc) => {
            const likeData = likeDoc.data() as any;

            return (
              likeDoc.id === safeCurrentUserUid ||
              likeData.uid === safeCurrentUserUid
            );
          });

          setLikedByMe(currentUserLiked);
        },
        (error) => {
          console.error("[TaskDetailPanel] likes listener:", error.message);
          setLikedByMe(false);
          setTaskLikeCount(0);
        },
      );

      return () => unsubscribe();
    }, [safeCurrentUserUid, taskWorkspaceId, sourceTaskId]);

    async function handleToggleTaskLike() {
      if (!safeCurrentUserUid) {
        setToast("You must be signed in to like a task");
        window.setTimeout(() => setToast(null), 2500);
        return;
      }

      if (!taskWorkspaceId || !sourceTaskId) {
        setToast("Task workspace is missing");
        window.setTimeout(() => setToast(null), 2500);
        return;
      }

      if (likingTask) return;

      setLikingTask(true);

      try {
        const likeRef = doc(
          db,
          "workspaces",
          taskWorkspaceId,
          "tasks",
          sourceTaskId,
          "likes",
          safeCurrentUserUid,
        );

        if (likedByMe) {
          await deleteDoc(likeRef);
        } else {
          const displayName =
            safeCurrentUserDisplayName || safeCurrentUserEmail || "User";

          await setDoc(
            likeRef,
            {
              uid: safeCurrentUserUid,
              userId: safeCurrentUserUid,

              displayName,
              name: displayName,
              email: safeCurrentUserEmail,

              photoURL: currentUserRealPhotoURL,
              authorPhotoURL: currentUserRealPhotoURL,

              taskId: sourceTaskId,
              workspaceId: taskWorkspaceId,

              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
        }
      } catch (err) {
        console.error("[TaskDetailPanel] toggle task like:", err);
        setToast("Failed to update like");
        window.setTimeout(() => setToast(null), 2500);
      } finally {
        setLikingTask(false);
      }
    }

    function resetShareModal() {
      setShowShareModal(false);
      setShareEmail("");
      setShareMessage("");
      setShareError("");
      setSharingTask(false);
      setShareSent(false);
      setCopiedShareLink(false);
      setShowShareMessage(false);
      setTaskAccessOpen(false);
    }
       async function handleChangeTaskAccessMode(nextMode: TaskAccessMode) {
      setTaskAccessOpen(false);
      setShareError("");

      if (!canManageTaskSharing) {
        setShareError("Only admins can change task access.");
        return;
      }

      const previousMode = taskAccessMode;


      setTaskAccessMode(nextMode);

      if (!taskView.id) {
        return;
      }

      try {
        setSavingTaskAccess(true);

        const accessPayload = {
          shareAccessMode: nextMode,
          shareAccessUpdatedAt: serverTimestamp(),
          shareAccessUpdatedBy: user?.uid ?? "",
        };

        const writes: Promise<any>[] = [];

        if (taskWorkspaceId) {
          writes.push(
            setDoc(
              doc(db, "workspaces", taskWorkspaceId, "tasks", taskView.id),
              accessPayload,
              { merge: true },
            ),
          );
        }

        if (user?.uid) {
          writes.push(
            setDoc(
              doc(db, "users", user.uid, "tasks", taskView.id),
              accessPayload,
              { merge: true },
            ),
          );
        }

        await Promise.all(writes);

        setTaskView((prev) => ({
          ...prev,
          shareAccessMode: nextMode,
        }));
      } catch (error: any) {
        console.error("[TaskDetailPanel] update task access mode:", error);
        setTaskAccessMode(previousMode);
        setShareError(error?.message || "Could not update task access.");
      } finally {
        setSavingTaskAccess(false);
      }
    }
       async function handleRevokeTaskShare(share: TaskShare) {
      if (!user?.uid) {
        setShareError("You must be signed in to remove access.");
        return;
      }

      if (!canManageTaskSharing) {
        setShareError("Only admins can remove task access.");
        return;
      }

      if (!taskWorkspaceId || !sourceTaskId || !share.id) {

        setShareError("Task share information is missing.");
        return;
      }

      const shareEmail =
        share.sharedWithEmail ||
        share.invitedEmail ||
        share.invitedEmailLower ||
        "";

      if (!shareEmail) {
        setShareError("This share is missing the invited email address.");
        return;
      }

      const confirmRemove = window.confirm(`Remove access for ${shareEmail}?`);

      if (!confirmRemove) return;

            try {
        await updateDoc(
          doc(
            db,
            "workspaces",
            taskWorkspaceId,
            "tasks",
            sourceTaskId,
            "shares",
            share.id,
          ),
          {
            status: "revoked",
            revokedAt: serverTimestamp(),
            revokedByUid: user.uid,
            updatedAt: serverTimestamp(),
          },
        );

        await setDoc(
          doc(db, "workspaces", taskWorkspaceId, "tasks", sourceTaskId),
          {
            sharedWithEmails: arrayRemove(shareEmail.toLowerCase()),
            accessUpdatedAt: serverTimestamp(),
          },
          { merge: true },
        );

                // FAANG-grade: remove the guest's task entry from the workspace people doc
        // so the Team page External Guests card disappears in real time.
        // IMPORTANT: personId must match upsertTaskGuestPerson()'s scheme: `guest_<sanitized>`
        try {
          const emailLower = String(shareEmail).toLowerCase().trim();
          const personId = `guest_${emailLower.replace(/[^a-z0-9]/g, "_")}`;
          const personRef = doc(
            db,
            "workspaces",
            taskWorkspaceId,
            "people",
            personId,
          );

          const personSnap = await getDoc(personRef);

          if (personSnap.exists()) {
            const personData = personSnap.data() as any;

            const remainingTasks = { ...(personData.tasks || {}) };
            delete remainingTasks[sourceTaskId];

            const remainingProjects = personData.projects || {};

            const totalAccess =
              Object.keys(remainingTasks).length +
              Object.keys(remainingProjects).length;

            if (totalAccess === 0) {
              // No remaining access — hard-delete the guest doc so the
              // External Guests card disappears immediately on the Team page.
              await deleteDoc(personRef);
            } else {
              // Still has other tasks/projects — just remove this task entry.
              await updateDoc(personRef, {
                [`tasks.${sourceTaskId}`]: deleteField(),
                status: "active",
                updatedAt: serverTimestamp(),
              });
            }
          }
        } catch (personErr) {
          console.warn(
            "[TaskDetailPanel] revoke: failed to update workspace person doc:",
            personErr,
          );
        }


        setToast("Access removed");
        window.setTimeout(() => setToast(null), 1800);
      } catch (error) {
        console.error("[TaskDetailPanel] revoke task share:", error);
        setShareError("Could not remove access. Please try again.");
      }
    }

    async function handleCopyShareLink() {
      try {
        await navigator.clipboard.writeText(taskLink);
        setCopiedShareLink(true);

        window.setTimeout(() => {
          setCopiedShareLink(false);
        }, 1800);
      } catch (err) {
        console.error("[TaskDetailPanel] copy share link failed:", err);

        try {
          const textarea = document.createElement("textarea");
          textarea.value = taskLink;
          textarea.style.position = "fixed";
          textarea.style.opacity = "0";

          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand("copy");
          document.body.removeChild(textarea);

          setCopiedShareLink(true);

          window.setTimeout(() => {
            setCopiedShareLink(false);
          }, 1800);
        } catch (fallbackErr) {
          console.error(
            "[TaskDetailPanel] fallback share copy failed:",
            fallbackErr,
          );
          setShareError("Failed to copy task link.");
        }
      }
    }

       async function handleSendTaskShare() {
      setShareError("");

      if (!canManageTaskSharing) {
        setShareError("Only admins can share tasks.");
        return;
      }

      const recipientEmail = shareEmail.trim().toLowerCase();


      if (!isValidEmail(recipientEmail)) {
        setShareError("Please enter a valid email address.");
        return;
      }

      if (!safeCurrentUserUid) {
        setShareError("You must be signed in to share a task.");
        return;
      }

      if (!taskWorkspaceId || !sourceTaskId) {
        setShareError("Task workspace is missing.");
        return;
      }

      if (sharingTask) return;

      const senderName =
        safeCurrentUserDisplayName ||
        safeCurrentUserEmail.split("@")[0] ||
        "Someone";

      const alreadyShared = taskShares.some((share) => {
        const existingEmail =
          share.sharedWithEmail?.toLowerCase?.() ||
          (share as any).invitedEmail?.toLowerCase?.() ||
          "";

        return existingEmail === recipientEmail && share.status !== "revoked";
      });

      if (alreadyShared) {
        setShareError("This email already has access or has a pending invite.");
        return;
      }

      setSharingTask(true);

      try {
        await migrateMyLegacyCommentsToCanonical();

        const taskTitle = taskView.title || task.title || "Untitled task";
        const projectName = project?.name || "No project";
        const status = taskView.status || task.status || "To Do";
        const priority = taskView.priority || task.priority || "Low";
        const dueDate = taskView.dueDate || task.dueDate || "No due date";

        const shareRef = doc(
          collection(
            db,
            "workspaces",
            taskWorkspaceId,
            "tasks",
            sourceTaskId,
            "shares",
          ),
        );

        const taskInviteLink = `${window.location.origin}/accept-task-invite?workspaceId=${encodeURIComponent(
          taskWorkspaceId,
        )}&taskId=${encodeURIComponent(sourceTaskId)}&shareId=${encodeURIComponent(
          shareRef.id,
        )}`;

               const sharePayload = {
          taskId: sourceTaskId,
          taskTitle,
          taskCode: taskView.taskCode || task.taskCode || "",
          taskLink,
          inviteLink: taskInviteLink,

          workspaceId: taskWorkspaceId,
          projectId: taskView.projectId || task.projectId || "",
          projectName,

          taskStatus: status,
          taskPriority: priority,
          taskDueDate: dueDate,

          sharedByUid: safeCurrentUserUid,
          sharedByName: senderName,
          sharedByEmail: safeCurrentUserEmail,
          sharedWithEmail: recipientEmail,
          sharedWithEmailLower: recipientEmail,

          invitedBy: safeCurrentUserUid,
          invitedByName: senderName,
          invitedByEmail: safeCurrentUserEmail,
          invitedEmail: recipientEmail,
          invitedEmailLower: recipientEmail,

          message: shareMessage.trim(),
          status: "pending",
          accessType: "email_invite",

          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        const sourceTaskRef = doc(
          db,
          "workspaces",
          taskWorkspaceId,
          "tasks",
          sourceTaskId,
        );

        const sourceTaskRepairPayload = removeUndefinedFields({
          id: sourceTaskId,
          workspaceId: taskWorkspaceId,

          title: taskTitle,
          description: taskView.description || task.description || "",

          status,
          priority,
          dueDate: dueDate === "No due date" ? "" : dueDate,

          projectId: taskView.projectId || task.projectId || "",
          projectName,

          taskCode: taskView.taskCode || task.taskCode || "",

          ownerId:
            (taskView as any).ownerId ||
            (task as any).ownerId ||
            safeCurrentUserUid,

          createdBy:
            (taskView as any).createdBy ||
            (task as any).createdBy ||
            safeCurrentUserUid,

          createdByEmail:
            (taskView as any).createdByEmail ||
            (task as any).createdByEmail ||
            safeCurrentUserEmail,

          sharedWithEmails: arrayUnion(recipientEmail),
          accessUpdatedAt: serverTimestamp(),

          createdAt: taskView.createdAt || task.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const batch = writeBatch(db);

        // Repair/create parent task doc first.
        // This prevents ghost task paths where shares exist under a missing task doc.
        batch.set(sourceTaskRef, sourceTaskRepairPayload, { merge: true });

        // Create the share invite in the same atomic commit.
        batch.set(shareRef, sharePayload);

        await batch.commit();

                // Register this email as an External Guest on the workspace people list.
        // This makes it appear under "External Guests" on the Team Page.
        try {
          await upsertTaskGuestPerson({
            workspaceId: taskWorkspaceId,
            taskId: sourceTaskId,
            shareId: shareRef.id,
            invitedEmail: recipientEmail,
            invitedBy: safeCurrentUserUid,
            invitedByName: senderName,
            invitedByEmail: safeCurrentUserEmail,
            taskTitle,
            taskCode: taskView.taskCode || task.taskCode || "",
            projectId: taskView.projectId || task.projectId || "",
            projectName,
            status: "pending",
          });
        } catch (guestErr) {
          console.warn(
            "[TaskDetailPanel] upsertTaskGuestPerson failed:",
            guestErr,
          );
        }
        await emailjs.send(
          EJ_SERVICE,
          EJ_TASK_TEMPLATE,
          {
            to_email: recipientEmail,
            to_name: recipientEmail.split("@")[0],

            from_name: senderName,
            from_email: safeCurrentUserEmail,
            reply_to: safeCurrentUserEmail,

            task_title: taskTitle,
            task_code: taskView.taskCode || task.taskCode || "",
            task_status: status,
            task_priority: priority,
            task_due_date: dueDate,

            project_name: projectName,
            workspace_id: taskWorkspaceId,
            share_id: shareRef.id,

            message:
              shareMessage.trim() ||
              `${senderName} shared a task with you on Workfine.`,

            invite_link: taskInviteLink,
            task_link: taskInviteLink,

            workspace_name: "Workfine Task Share",
            invite_code: shareRef.id,
            role: "Task viewer",
            expires_in: "No expiration",
          },
          {
            publicKey: EJ_PUBLIC_KEY,
          },
        );

        setShareSent(true);
        setShareEmail("");
        setShareMessage("");
        setShowShareMessage(false);

        window.setTimeout(() => {
          setShareSent(false);
        }, 2500);
      } catch (err) {
        console.error("[TaskDetailPanel] share task failed:", err);
        setShareError("Failed to share task. Please try again.");
      } finally {
        setSharingTask(false);
      }
    }
    async function handleCopyComment(comment: TaskComment) {
      const textToCopy = normalizeLegacyStructuredMentions(
  String(comment.text || "").trim(),
);


      setActionMenuCommentId(null);

      if (!textToCopy) {
        setToast("No text to copy");
        setTimeout(() => setToast(null), 1800);
        return;
      }

      try {
        await navigator.clipboard.writeText(textToCopy);
        setToast("Text copied");
        setTimeout(() => setToast(null), 1800);
      } catch (err) {
        console.error("[TaskDetailPanel] copy comment failed:", err);

        try {
          const textarea = document.createElement("textarea");
          textarea.value = textToCopy;
          textarea.style.position = "fixed";
          textarea.style.left = "-9999px";
          textarea.style.top = "0";
          textarea.setAttribute("readonly", "true");

          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          document.execCommand("copy");
          document.body.removeChild(textarea);

          setToast("Text copied");
          setTimeout(() => setToast(null), 1800);
        } catch (fallbackErr) {
          console.error("[TaskDetailPanel] fallback copy failed:", fallbackErr);
          setToast("Failed to copy text");
          setTimeout(() => setToast(null), 2500);
        }
      }
    }



      function handleStartReply(comment: TaskComment) {
      if (!canCommentOnTask) {
        setToast("You do not have permission to comment on this task");
        setTimeout(() => setToast(null), 2500);
        return;
      }

      if (!canReplyToComments) {
        setToast("Reply is available when more than one person has access");
        setTimeout(() => setToast(null), 2500);
        return;
      }


      setReplyingTo(buildCommentReplyReference(comment));
      setComposerExpanded(true);
      setActionMenuCommentId(null);

      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }

            function handleStartEditComment(comment: TaskComment) {
      if (!canCommentOnTask) {
        setToast("You do not have permission to edit comments");
        setTimeout(() => setToast(null), 2500);
        return;
      }

      if (!isCommentEditableNow(comment, safeCurrentUserUid)) {
        setToast("You can only edit your comment within 15 minutes");
        setTimeout(() => setToast(null), 2500);
        return;
      }


      if (!String(comment.text || "").trim()) {
        setToast("Attachment-only comments cannot be edited");
        setTimeout(() => setToast(null), 2500);
        return;
      }

      setEditingCommentId(comment.id);
      setEditCommentText(comment.text || "");
      setActionMenuCommentId(null);
    }

    const visibleComments = useMemo(() => {
      const safeComments = Array.isArray(comments) ? comments : [];

      return [...safeComments].sort((a, b) => {
        const aMs = getCommentSortMs(a);
        const bMs = getCommentSortMs(b);

        /**
         * Unknown/legacy timestamps should not jump between modern comments.
         * If both comments have valid timestamps, sort oldest -> newest.
         */
        if (aMs > 0 && bMs > 0 && aMs !== bMs) {
          return aMs - bMs;
        }

        /**
         * If only one comment has a valid timestamp, prefer the valid timestamp.
         */
        if (aMs > 0 && bMs <= 0) {
          return 1;
        }

        if (aMs <= 0 && bMs > 0) {
          return -1;
        }

        /**
         * Final deterministic fallback.
         * Do NOT use replyTo/commentId for sorting.
         */
        return String(a?.id || "").localeCompare(String(b?.id || ""));
      });
    }, [comments]);

    useEffect(() => {
      const cleanHighlightCommentId = String(highlightCommentId || "").trim();

      if (!cleanHighlightCommentId || visibleComments.length === 0) return;

      const exists = visibleComments.some(
        (comment) => String(comment?.id || "") === cleanHighlightCommentId
      );

      if (!exists) return;

      const timeoutId = window.setTimeout(() => {
        scrollToComment(cleanHighlightCommentId);
      }, 250);

      return () => window.clearTimeout(timeoutId);
    }, [highlightCommentId, visibleComments, scrollToComment]);

    const latestVisibleCommentId =
      visibleComments.length > 0
        ? String(visibleComments[visibleComments.length - 1]?.id || "")
        : "";



useEffect(() => {
  const container = scrollContainerRef.current;

  if (!container) return;

  const updateScrollButtonVisibility = () => {
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;

    setShowScrollToBottomButton(distanceFromBottom > 220);
  };

  updateScrollButtonVisibility();

  container.addEventListener("scroll", updateScrollButtonVisibility, {
    passive: true,
  });

  window.addEventListener("resize", updateScrollButtonVisibility);

  return () => {
    container.removeEventListener("scroll", updateScrollButtonVisibility);
    window.removeEventListener("resize", updateScrollButtonVisibility);
  };
}, [visibleComments.length, latestVisibleCommentId]);

useEffect(() => {
  if (!visibleComments.length) {
    didInitialCommentsScrollRef.current = false;
    lastVisibleCommentIdRef.current = "";
    setShowScrollToBottomButton(false);
    return;
  }

  const latestComment = visibleComments[visibleComments.length - 1];
  const latestCommentId = latestComment?.id || "";
  const latestCommentIsMine = latestComment?.authorId === user?.uid;

  const isInitialLoad = !didInitialCommentsScrollRef.current;
  const latestChanged =
    Boolean(latestCommentId) &&
    latestCommentId !== lastVisibleCommentIdRef.current;

  lastVisibleCommentIdRef.current = latestCommentId;

  if (isInitialLoad) {
    didInitialCommentsScrollRef.current = true;

    const timeoutId = window.setTimeout(() => {
      scrollToLatestComment("auto");
    }, 80);

    return () => window.clearTimeout(timeoutId);
  }

  if (latestChanged && (isNearCommentsBottom() || latestCommentIsMine)) {
    const timeoutId = window.setTimeout(() => {
      scrollToLatestComment("smooth");
    }, 80);

    return () => window.clearTimeout(timeoutId);
  }

  if (latestChanged) {
    setShowScrollToBottomButton(true);
  }
}, [
  visibleComments,
  visibleComments.length,
  latestVisibleCommentId,
  user?.uid,
  isNearCommentsBottom,
  scrollToLatestComment,
]);




        const pinnedComment = useMemo(() => {
      return (
        [...comments]
          .filter((comment) => Boolean(comment.pinned))
          .sort((a, b) => toMs(b.pinnedAt) - toMs(a.pinnedAt))[0] || null
      );
    }, [comments]);



    async function handleSaveEditedComment(comment: TaskComment) {
      const nextText = normalizeLegacyStructuredMentions(editCommentText.trim());


      if (!nextText) {
        setToast("Comment cannot be empty");
        setTimeout(() => setToast(null), 2200);
        return;
      }

            if (!canCommentOnTask) {
        setToast("You do not have permission to edit comments");
        setTimeout(() => setToast(null), 2500);
        return;
      }

      if (!safeCurrentUserUid || comment.authorId !== safeCurrentUserUid) {
        setToast("You can only edit your own comment");
        setTimeout(() => setToast(null), 2500);
        return;
      }


      if (!isCommentEditableNow(comment, safeCurrentUserUid)) {
        setToast("Edit time expired");
        setTimeout(() => setToast(null), 2500);
        setEditingCommentId(null);
        setEditCommentText("");
        return;
      }

      if (!taskWorkspaceId || !sourceTaskId) {
        setToast("Task comments are not available yet");
        setTimeout(() => setToast(null), 2500);
        return;
      }

      try {
        await updateDoc(
          doc(
            db,
            "workspaces",
            taskWorkspaceId,
            "tasks",
            sourceTaskId,
            "comments",
            comment.id,
          ),
          {
            text: nextText,
            mentions: extractMentions(nextText),
mentionedUids: extractUserMentionIds(nextText, mentionableUsers),
editedAt: serverTimestamp(),
            editedBy: safeCurrentUserUid,
            editHistory: arrayUnion({
              text: comment.text || "",
              editedAt: new Date().toISOString(),
            }),
          },
        );

        setEditingCommentId(null);
        setEditCommentText("");
        setToast("Comment edited");
        setTimeout(() => setToast(null), 1600);
      } catch (err) {
        console.error("[TaskDetailPanel] edit comment failed:", err);
        setToast("Failed to edit comment");
        setTimeout(() => setToast(null), 2500);
      }
    }

      async function handleTogglePinComment(comment: TaskComment) {
      if (!safeCurrentUserUid) {
        setToast("You must be signed in");
        setTimeout(() => setToast(null), 2500);
        return;
      }

      if (!canEditTaskContent) {
        setToast("Only admins can pin comments");
        setTimeout(() => setToast(null), 2500);
        return;
      }

      if (!taskWorkspaceId || !sourceTaskId) {

        setToast("Task comments are not available yet");
        setTimeout(() => setToast(null), 2500);
        return;
      }

      setActionMenuCommentId(null);

      try {
        const nextPinned = !comment.pinned;

        if (nextPinned) {
          const commentsRef = collection(
            db,
            "workspaces",
            taskWorkspaceId,
            "tasks",
            sourceTaskId,
            "comments",
          );

          const snap = await getDocs(commentsRef);

          await Promise.all(
            snap.docs.map((commentDoc) => {
              const isTarget = commentDoc.id === comment.id;

              return updateDoc(commentDoc.ref, {
                pinned: isTarget,
                pinnedAt: isTarget ? serverTimestamp() : null,
                pinnedBy: isTarget ? safeCurrentUserUid : "",
              });
            }),
          );
        } else {
          await updateDoc(
            doc(
              db,
              "workspaces",
              taskWorkspaceId,
              "tasks",
              sourceTaskId,
              "comments",
              comment.id,
            ),
            {
              pinned: false,
              pinnedAt: null,
              pinnedBy: "",
            },
          );
        }

        setToast(nextPinned ? "Comment pinned to top" : "Comment unpinned");
        setTimeout(() => setToast(null), 1600);
      } catch (err) {
        console.error("[TaskDetailPanel] pin comment failed:", err);
        setToast("Failed to update pinned comment");
        setTimeout(() => setToast(null), 2500);
      }
    }


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
          <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200 flex-shrink-0">
            <button
              onClick={handleClose}
              className="text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg p-2 transition-colors flex-shrink-0"
              title="Back"
            >
              <ArrowLeft size={18} />
            </button>

                        {(taskView.taskCode || task.taskCode) && (
              <span className="font-mono text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded mr-2 flex-shrink-0">
                {taskView.taskCode || task.taskCode}
              </span>
            )}

            <h2 className="text-lg font-bold text-slate-800 flex-1 min-w-0 truncate">
              {taskView.title || task.title}
            </h2>


            {/* Task top actions — Share, Like, Copy Link */}
            <div className="flex items-center gap-1 flex-shrink-0">
                            {/* Share */}
              {canManageTaskSharing && (
                <button
                  type="button"
                  onClick={() => {
                    setShowShareModal(true);
                    setShareError("");
                    setShareSent(false);
                    setShowShareMessage(false);
                    setTaskAccessOpen(false);
                  }}
                  className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:text-violet-600 hover:border-violet-200 hover:bg-violet-50 transition-colors"
                  title="Share task"
                  aria-label="Share task"
                >
                  <Share2 size={14} />
                  <span className="hidden sm:inline">Share</span>
                </button>
              )}


              {/* Like */}
              <button
                type="button"
                onClick={handleToggleTaskLike}
                disabled={likingTask}
                className={`h-8 min-w-8 px-2 rounded-lg border transition-colors flex items-center justify-center gap-1.5 ${
                  likedByMe
                    ? "border-violet-200 bg-violet-50 text-violet-600"
                    : "border-slate-200 bg-white text-slate-500 hover:text-violet-600 hover:border-violet-200 hover:bg-violet-50"
                } ${likingTask ? "opacity-60 cursor-wait" : ""}`}
                title={likedByMe ? "Unlike this task" : "Like this task"}
                aria-label={likedByMe ? "Unlike this task" : "Like this task"}
              >
                {likingTask ? (
                  <span className="w-3.5 h-3.5 border-2 border-violet-300 border-t-violet-600 rounded-full animate-spin" />
                ) : (
                  <ThumbsUp
                    size={14}
                    className={likedByMe ? "fill-current" : ""}
                  />
                )}

                <span className="text-[11px] font-semibold min-w-[10px]">
                  {taskLikeCount > 0 ? taskLikeCount : ""}
                </span>
              </button>

              {/* Copy task link */}
              <button
                type="button"
                onClick={handleCopyTaskLink}
                className={`w-8 h-8 rounded-lg border transition-colors flex items-center justify-center ${
                  copiedTaskLink
                    ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                    : "border-slate-200 bg-white text-slate-500 hover:text-violet-600 hover:border-violet-200 hover:bg-violet-50"
                }`}
                title="Copy task link"
                aria-label="Copy task link"
              >
                {copiedTaskLink ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>

                        {canEditTaskContent && (
              <button
                                onClick={() => onEdit(taskView)}
                className="bg-violet-50 hover:bg-violet-100 text-violet-600 rounded-lg p-2 transition-colors flex-shrink-0"
                title="Edit task"
              >
                <Edit2 size={16} />
              </button>
            )}


            <button
              onClick={handleClose}
              className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg p-2 transition-colors flex-shrink-0"
              title="Close"
            >
              <X size={18} />
            </button>
          </div>
                          {pinnedComment && (
            <button
              type="button"
              onClick={() => scrollToComment(pinnedComment.id)}
              className="flex-shrink-0 border-b border-amber-200 bg-amber-50/95 px-5 py-2.5 text-left hover:bg-amber-100 transition-colors"
              title="Jump to pinned comment"
              aria-label="Jump to pinned comment"
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                  <Pin size={14} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-amber-700 flex-shrink-0">
                      Pinned comment
                    </p>

                    <span className="text-[10px] text-amber-500 flex-shrink-0">
                      Tap to view
                    </span>
                  </div>

                  <p className="mt-0.5 truncate text-xs font-medium text-slate-700">
                    {pinnedComment.authorName || "User"}
                    {" · "}
                    {getCommentPlainPreview(pinnedComment)}
                  </p>
                </div>
              </div>
            </button>
          )}



          {/* Body — scrollable area (task info + description + chat history) */}
          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto px-5 pt-0 pb-3"
          >
            {/* Compact task summary — clean modern layout */}
            <div className="sticky top-0 -mx-5 mb-2 px-5 py-2.5 bg-white/95 backdrop-blur border-b border-slate-200 z-30">
              <div className="flex items-center gap-2 min-w-0">
                {/* Status */}
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                                        STATUS_STYLE[taskView.status || task.status] ?? "bg-gray-100 text-gray-500"
                  }`}
                >
                                    {taskView.status || task.status || "To Do"}
                </span>

                {/* Priority */}
                <span className="flex items-center gap-1 text-xs text-slate-600 flex-shrink-0">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                                 PRIORITY_DOT[taskView.priority || task.priority] ?? "bg-gray-400"

                    }`}
                  />
                                    {taskView.priority || task.priority || "Low"}
                </span>

                {/* Assignee */}
                                {(taskView.assignee || task.assignee) ? (
                  <span className="flex items-center gap-1 text-xs text-slate-600 truncate max-w-[130px]">
                    <span className="w-4 h-4 rounded-full bg-violet-500 text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                      {(taskView.assignee || task.assignee || "")[0]?.toUpperCase()}
                    </span>
                    <span className="truncate">{taskView.assignee || task.assignee}</span>
                  </span>
                ) : (
                  <span className="text-xs text-slate-400 italic flex-shrink-0">
                    Unassigned
                  </span>
                )}

                {/* Due date */}
                <span
                  className={`flex items-center gap-1 text-xs flex-shrink-0 ${
                    overdue ? "text-red-500 font-medium" : "text-slate-500"
                  }`}
                >
                  <Calendar size={12} />
                  {dueDateLabel}
                </span>

                {/* Project */}
                {project && (
                  <button
                    type="button"
                    onClick={() => {
                      navigate("/projects/" + project.id);
                      handleClose();
                    }}
                    className="hidden sm:flex items-center gap-1 text-xs text-slate-500 hover:text-violet-600 truncate max-w-[120px]"
                    title={project.name}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: project.color ?? "#8b5cf6" }}
                    />
                    <span className="truncate">{project.name}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setDetailsExpanded((v) => !v)}
                  className="ml-auto flex items-center gap-1 text-xs text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg px-2 py-1 transition-colors flex-shrink-0"
                  aria-expanded={detailsExpanded}
                  aria-label={
                    detailsExpanded ? "Hide task details" : "Show task details"
                  }
                >
                  {detailsExpanded ? "Hide" : "Details"}
                  <svg
                    className={`w-3.5 h-3.5 transition-transform ${
                      detailsExpanded ? "rotate-180" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
              </div>

              {/* Expanded details — compact and only useful fields */}
              {detailsExpanded && (
                <div className="mt-2 rounded-2xl border border-slate-100 bg-slate-50/80 px-3 py-3">
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                        Status
                      </p>
                      <span
                        className={`inline-block text-xs px-2 py-1 rounded-full font-medium ${
                                                    STATUS_STYLE[taskView.status || task.status] ?? "bg-gray-100 text-gray-500"
                        }`}
                      >
                                                {taskView.status || task.status || "To Do"}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                        Priority
                      </p>
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-medium ${
                                                    PRIORITY_STYLE[taskView.priority || task.priority] ??
                          "bg-gray-100 text-gray-500"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                                              PRIORITY_DOT[taskView.priority || task.priority] ?? "bg-gray-400"
                          }`}
                        />
                                                {taskView.priority || task.priority || "Low"}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                        Assignee
                      </p>
                                            {(taskView.assignee || task.assignee) ? (
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className="w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">
                            {(taskView.assignee || task.assignee || "")[0]?.toUpperCase()}
                          </div>
                          <span className="text-slate-700 truncate text-xs">
                            {taskView.assignee || task.assignee}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-xs">
                          Unassigned
                        </span>
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                        Due
                      </p>
                      <div
                        className={`flex items-center gap-1.5 text-xs ${
                          overdue ? "text-red-500 font-medium" : "text-slate-700"
                        }`}
                      >
                        <Calendar size={13} />
                        <span className="truncate">{dueDateLabel}</span>
                      </div>
                    </div>

                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                        Project
                      </p>
                      {project ? (
                        <button
                          type="button"
                          onClick={() => {
                            navigate("/projects/" + project.id);
                            handleClose();
                          }}
                          className="flex items-center gap-1.5 text-xs text-slate-700 hover:text-violet-600 min-w-0"
                        >
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{
                              backgroundColor: project.color ?? "#8b5cf6",
                            }}
                          />
                          <span className="truncate">{project.name}</span>
                        </button>
                      ) : (
                        <span className="text-slate-400 italic text-xs">
                          No project
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Description — only show real content or edit mode */}
                  {(taskView.description || editingDescription) && (
                    <div className="mt-3 pt-3 border-t border-slate-200">
                      <div className="flex items-center gap-2 mb-2">
                        <Tag size={13} className="text-slate-400" />
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 flex-1">
                          Description
                        </p>

                                                {!editingDescription && canEditTaskContent && (
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
                            placeholder="Add a short description..."
                            rows={3}
                            disabled={savingDescription}
                            className="w-full bg-white border border-violet-300 rounded-xl px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 resize-y min-h-[72px] disabled:opacity-60"
                          />

                          <div className="flex items-center justify-end gap-2">
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
                      ) : (
                                               <p
                          onClick={() => {
                            if (canEditTaskContent) startEditingDescription();
                          }}
                          className={`text-sm text-slate-600 whitespace-pre-wrap rounded-lg px-2 py-1.5 -mx-2 transition-colors ${
                            canEditTaskContent
                              ? "cursor-text hover:bg-slate-100"
                              : "cursor-default"
                          }`}
                          title={
                            canEditTaskContent
                              ? "Click to edit"
                              : "Only admins can edit this description"
                          }
                        >
                          {taskView.description}
                        </p>

                      )}
                    </div>
                  )}

                  {/* Small add-description action only when empty */}
                                                      {!taskView.description && !editingDescription && canEditTaskContent && (
                    <button
                      type="button"
                      onClick={startEditingDescription}
                      className="mt-3 text-xs text-slate-400 hover:text-violet-600 hover:bg-white rounded-lg px-2 py-1 transition-colors"
                    >
                      + Add description
                    </button>
                  )}


                </div>
              )}
            </div>

            <div className="mt-2">
              <div className="flex items-center gap-2 mb-2 px-1">
                <MessageCircle size={14} className="text-slate-500" />
                <h3 className="text-sm font-semibold text-slate-700 tracking-tight">
                  Comments
                </h3>
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
                                  {visibleComments.map((c, idx) => {
                    const isMine = c.authorId === user?.uid;
                    const prev = visibleComments[idx - 1];
                    const next = visibleComments[idx + 1];

                                     const cMs = getCommentSortMs(c);
                    const prevMs = getCommentSortMs(prev);
                    const nextMs = getCommentSortMs(next);


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
                      if (d.toDateString() === today.toDateString())
                        return "Today";
                      if (d.toDateString() === yest.toDateString())
                        return "Yesterday";
                      return d.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year:
                          d.getFullYear() !== today.getFullYear()
                            ? "numeric"
                            : undefined,
                      });
                    })();

                    const messageTimestamp =
  c.createdAtMs || c.clientCreatedAt || c.createdAt || cMs;

const timeLabel = formatWhatsAppMessageTime(messageTimestamp);

const fullTimeLabel = formatFullLocalDateTime(messageTimestamp);


                    const reactionEntries = Object.entries(c.reactions ?? {}) as [
                      string,
                      string[],
                    ][];

                    const isPickerOpen = pickerForCommentId === c.id;

                    const hasAttachments =
                      Array.isArray(c.attachments) && c.attachments.length > 0;

                    const rawDisplayText = String(c.text || "").trim();

                    const displayText =
                      hasAttachments && /^attached\s+/i.test(rawDisplayText)
                        ? ""
                        : rawDisplayText;

                                                    const attachmentOnly = hasAttachments && !displayText;

                    const isActionMenuOpen = actionMenuCommentId === c.id;

                    const actionMenuPlacement =
                      actionMenuPlacementByCommentId[c.id] || "up";

                    const emojiPickerPlacement =
                      emojiPickerPlacementByCommentId[c.id] || "up";

                    const canEditThisComment = isCommentEditableNow(
                      c,
                      safeCurrentUserUid,
                    );
                    const isEditingThisComment = editingCommentId === c.id;
                    const wasEdited = Boolean(c.editedAt);


                                          const messageActions = (
                      <div
                        className={`relative z-[65] flex shrink-0 items-center gap-1 pb-1 transition-opacity ${
                          isPickerOpen || isActionMenuOpen
                            ? "opacity-100"
                            : "opacity-100 md:opacity-0 md:group-hover:opacity-100"
                        }`}
                      >

                                                                      {canReactToComments && (
                          <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();

                              const placement = getCommentPopoverPlacement(
                                e.currentTarget,
                              );

                              setEmojiPickerPlacementByCommentId((prev) => ({
                                ...prev,
                                [c.id]: placement,
                              }));

                              setPickerForCommentId((prev) =>
                                prev === c.id ? null : c.id,
                              );
                              setActionMenuCommentId(null);
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
                        )}



                                                                  <button
                          type="button"
                          data-comment-action-trigger="true"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();

                            const placement = getCommentPopoverPlacement(
                              e.currentTarget,
                            );

                            setActionMenuPlacementByCommentId((prev) => ({
                              ...prev,
                              [c.id]: placement,
                            }));

                            setActionMenuCommentId((prev) =>
                              prev === c.id ? null : c.id,
                            );
                            setPickerForCommentId(null);
                            setShowSkinTonePicker(false);
                          }}
                          className={`w-7 h-7 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center hover:bg-violet-50 hover:text-violet-600 transition-colors ${
                            isActionMenuOpen
                              ? "text-violet-600 bg-violet-50"
                              : "text-slate-500"
                          }`}
                          title="Comment actions"
                          aria-label="Comment actions"
                        >
                          <MoreVertical size={14} />
                        </button>


                                                                  {isActionMenuOpen && (
                          <div
                            data-comment-action-menu="true"
                            onMouseDown={(e) => e.stopPropagation()}
                            className={`absolute ${
                              actionMenuPlacement === "down"
                                ? "top-9"
                                : "bottom-9"
                            } z-[75] w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl ${
                              isMine ? "right-0" : "left-0"
                            }`}
                            role="menu"
                            aria-label="Comment actions menu"
                          >


                                                       {canEditTaskContent && (
                              <button
                                type="button"
                                onClick={() => handleTogglePinComment(c)}
                                className="w-full px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-violet-50 hover:text-violet-700 flex items-center gap-2 transition-colors"
                              >
                                <Pin size={14} />
                                {c.pinned ? "Unpin from top" : "Pin to top"}
                              </button>
                            )}

                                                       {canReplyToComments && canCommentOnTask && (
                              <button
                                type="button"
                                onClick={() => handleStartReply(c)}
                                className="w-full px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-violet-50 hover:text-violet-700 flex items-center gap-2 transition-colors"
                              >
                                <Reply size={14} />
                                Reply
                              </button>
                            )}


                                                      <button
                              type="button"
                              onClick={() => handleCopyComment(c)}
                              className="w-full px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-violet-50 hover:text-violet-700 flex items-center gap-2 transition-colors"
                            >
                              <Copy size={14} />
                              Copy text only
                            </button>


                                                        {isMine && canCommentOnTask && (
                              <button
                                type="button"
                                disabled={!canEditThisComment}
                                onClick={() => handleStartEditComment(c)}
                                className={`w-full px-3 py-2.5 text-left text-sm flex items-center gap-2 transition-colors ${
                                  canEditThisComment
                                    ? "text-slate-700 hover:bg-violet-50 hover:text-violet-700"
                                    : "text-slate-300 cursor-not-allowed bg-slate-50"
                                }`}
                                title={
                                  canEditThisComment
                                    ? "Edit comment"
                                    : "Editing is available for 15 minutes"
                                }
                              >
                                <Edit2 size={14} />
                                Edit
                                {!canEditThisComment && (
                                  <span className="ml-auto text-[10px]">
                                    expired
                                  </span>
                                )}
                              </button>
                            )}


                                                        {(isMine || canEditTaskContent) && (canCommentOnTask || canEditTaskContent) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActionMenuCommentId(null);
                                  handleDelete(c);
                                }}
                                className="w-full px-3 py-2.5 text-left text-sm text-red-500 hover:bg-red-50 flex items-center gap-2 transition-colors"
                              >
                                <Trash2 size={14} />
                                Delete
                              </button>
                            )}

                          </div>
                        )}

                        {/* Compact emoji picker — anchored to the side action icon */}
                                              {isPickerOpen && (
                          <div
                            ref={pickerRef}
                            onMouseDown={(e) => e.stopPropagation()}
                            className={`absolute ${
                              emojiPickerPlacement === "down"
                                ? "top-9"
                                : "bottom-9"
                            } z-[70] w-[280px] max-w-[calc(100vw-48px)] bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col ${
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
                                      {emojiSearch
                                        ? "No emojis found"
                                        : "No recent emojis yet"}
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
                      <div
                        key={c.id}
                        ref={(node) => {
                          commentRefs.current[c.id] = node;
                        }}
                        style={{ scrollMarginTop: 150 }}
                        className={`rounded-2xl px-1 py-0.5 transition-all duration-500 ${
                          highlightedCommentId === c.id
                            ? "bg-slate-200/90 ring-1 ring-slate-300"
                            : "bg-transparent"
                        }`}
                      >

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
                              {!sameAuthorAsNext &&
                                (() => {
                                  const profile = getResolvedUserProfile({
                                    uid: c.authorId,
                                    email: c.authorEmail,
                                    name: c.authorName,
                                    photoURL: c.authorPhotoURL,
                                  });

                                  return (
                                    <ModernAvatar
                                      name={profile.name}
                                      email={profile.email}
                                      photoURL={profile.photoURL}
                                      size={28}
                                    />
                                  );
                                })()}
                            </div>
                          )}

                          {/* Bubble + meta column */}
                          <div
                            className={`relative flex flex-col max-w-[82%] ${
                              isMine ? "items-end" : "items-start"
                            }`}
                          >
                            {/* Sender name — incoming only, first in a group */}
                            {!isMine &&
                              !sameAuthorAsPrev &&
                              (() => {
                                const profile = getResolvedUserProfile({
                                  uid: c.authorId,
                                  email: c.authorEmail,
                                  name: c.authorName,
                                  photoURL: c.authorPhotoURL,
                                });

                                return (
                                  <span className="text-xs font-semibold text-slate-700 mb-1 px-1">
                                    {profile.name}
                                  </span>
                                );
                              })()}
                            {c.pinned && (
                              <div className="mb-1 flex items-center gap-1 rounded-full bg-amber-50 border border-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                                <Pin size={10} />
                                Pinned
                              </div>
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
                                className={`relative w-fit max-w-full text-sm leading-snug break-words ${
                                  attachmentOnly
                                    ? "bg-transparent p-0 shadow-none"
                                    : `${hasAttachments ? "px-1.5 py-1.5" : "px-2 py-2"} shadow-sm ${
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
                                      }`
                                }`}
                              >
                                                          {c.replyTo && !isEditingThisComment && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      scrollToComment(c.replyTo?.commentId);
                                    }}
                                    className={`mb-2 w-full rounded-xl border-l-4 px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                                      isMine
                                        ? "border-white/70 bg-white/15 text-white/90 hover:bg-white/25"
                                        : "border-violet-400 bg-white/85 text-slate-600 hover:bg-slate-50"
                                    }`}
                                    title="Jump to original comment"
                                    aria-label="Jump to original comment"
                                  >
                                    <p className="font-semibold truncate">
                                      {c.replyTo.authorName || "User"}
                                    </p>

                                    <p className="mt-0.5 line-clamp-2 break-words opacity-90">
                                      {c.replyTo.text || "Attachment"}
                                    </p>

                                    {c.replyTo.attachmentName && (
                                      <p className="mt-1 truncate opacity-75">
                                        📎 {c.replyTo.attachmentName}
                                      </p>
                                    )}
                                  </button>
                                )}



                                {isEditingThisComment ? (
                                  <div className="w-[280px] max-w-[calc(100vw-132px)]">
                                    <textarea
                                      value={editCommentText}
                                      onChange={(e) =>
                                        setEditCommentText(e.target.value)
                                      }
                                      onKeyDown={(e) => {
                                        if (
                                          (e.ctrlKey || e.metaKey) &&
                                          e.key === "Enter"
                                        ) {
                                          e.preventDefault();
                                          handleSaveEditedComment(c);
                                        }

                                        if (e.key === "Escape") {
                                          e.preventDefault();
                                          setEditingCommentId(null);
                                          setEditCommentText("");
                                        }
                                      }}
                                      rows={3}
                                      autoFocus
                                      className="w-full rounded-xl border border-violet-300 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-100 resize-none"
                                    />

                                    <div className="mt-2 flex justify-end gap-2">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingCommentId(null);
                                          setEditCommentText("");
                                        }}
                                        className="rounded-lg px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-100"
                                      >
                                        Cancel
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => handleSaveEditedComment(c)}
                                        className="rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-700"
                                      >
                                        Save
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    {displayText && (
                                      <div
                                        className={`break-words ${hasAttachments ? "mb-2" : ""}`}
                                      >
                                        {renderFormattedCommentText(
                                          displayText,
                                          isMine,
                                        )}
                                      </div>
                                    )}

                                    {hasAttachments && (
                                      <div className="space-y-2">
                                        {c.attachments!.map((file) => (
                                          <React.Fragment
                                            key={file.id || file.url}
                                          >
                                            <OptimizedAttachmentCard
                                              file={file}
                                              isMine={isMine}
                                            />
                                          </React.Fragment>
                                        ))}
                                      </div>
                                    )}
                                  </>
                                )}

                              </div>

                              {!isMine && messageActions}
                            </div>

                            {/* Timestamp — WhatsApp-style local user time */}
{!sameAuthorAsNext && timeLabel && (
  <span
    title={fullTimeLabel}
    className={`text-[10px] mt-1 px-1 ${
      isMine ? "text-slate-400 text-right" : "text-slate-400 text-left"
    }`}
  >
    {timeLabel}
    {wasEdited ? " · edited" : ""}
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
                                      onClick={() => {
                                        if (canReactToComments) {
                                          toggleReaction(c, emoji);
                                        }
                                      }}
                                      disabled={!canReactToComments}
                                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs transition-colors ${
                                        mine
                                          ? "bg-violet-50 border-violet-300 text-violet-700"
                                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                      } ${
                                        !canReactToComments
                                          ? "opacity-70 cursor-default"
                                          : ""
                                      }`}
                                      title={
                                        !canReactToComments
                                          ? "You do not have permission to react"
                                          : mine
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

          {showScrollToBottomButton && (
            <button
              type="button"
              onClick={() => scrollToLatestComment("smooth")}
              className="absolute right-6 bottom-24 z-[55] flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-xl transition-all hover:bg-violet-50 hover:text-violet-600 hover:border-violet-200 active:scale-95"
              title="Scroll to latest comment"
              aria-label="Scroll to latest comment"
            >
              <ChevronDown size={22} strokeWidth={2.5} />
            </button>
          )}

          {/* Sticky composer — Asana-style progressive disclosure */}
          <div
            ref={composerRef}

            className="flex-shrink-0 border-t border-slate-200 bg-white px-5 py-3"
          >
                        {!canUseCommentComposer ? (
              <div className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 text-left">
                <ModernAvatar
                  name={user?.displayName || user?.email || "You"}
                  email={user?.email || ""}
                  photoURL={currentUserRealPhotoURL}
                  size={32}
                  className="mt-1"
                />

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-500">
                    Viewer access
                  </p>
                  <p className="text-xs text-slate-400">
                    You can view this task, but you cannot comment or edit.
                  </p>
                </div>
              </div>
            ) : !composerExpanded ? (
              // ── COLLAPSED STATE — slim one-line bar ────────────────────────────
              <button
                type="button"
                onClick={() => {
                  setComposerExpanded(true);
                  requestAnimationFrame(() => inputRef.current?.focus());
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl border border-slate-200 bg-slate-50 hover:border-violet-300 hover:bg-white transition-colors text-left group"
              >
                <ModernAvatar
                  name={user?.displayName || user?.email || "You"}
                  email={user?.email || ""}
                  photoURL={currentUserRealPhotoURL}
                  size={32}
                  className="mt-1"
                />

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
                <ModernAvatar
                  name={user?.displayName || "You"}
                  email={user?.email || ""}
                  photoURL={currentUserRealPhotoURL}
                  size={32}
                  className="mt-1"
                />

                              <div className="flex-1 relative border border-violet-300 rounded-2xl bg-white focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-100 transition-shadow">
                  {replyingTo && (
                    <div className="mx-3 mt-3 mb-1 rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 flex items-start gap-2">
                      <Reply size={14} className="text-violet-500 mt-0.5" />

                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-violet-700 truncate">
                          Replying to {replyingTo.authorName || "User"}
                        </p>
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {replyingTo.text}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setReplyingTo(null)}
                        className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-white"
                        title="Cancel reply"
                        aria-label="Cancel reply"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  )}

                  <textarea
                    ref={inputRef}
                    value={commentText}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message... use @ to mention a teammate or # to mention a task/project"
                    rows={3}
                    className="w-full bg-transparent rounded-t-2xl px-4 pt-3 pb-2 text-sm text-slate-700 focus:outline-none resize-none max-h-48"
                    style={{ minHeight: "72px" }}
                    autoFocus
                  />

                  {/* Toolbar — Comment actions */}

                  <div className="flex items-center gap-0.5 px-2 py-1.5 border-t border-slate-100">
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
                            onClick={() =>
                              applyInlineFormat("**", "**", "bold text")
                            }
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:bg-violet-50 hover:text-violet-600"
                            title="Bold"
                          >
                            <Bold size={15} />
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              applyInlineFormat("_", "_", "italic text")
                            }
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:bg-violet-50 hover:text-violet-600"
                            title="Italic"
                          >
                            <Italic size={15} />
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              applyInlineFormat("<u>", "</u>", "underlined text")
                            }
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 hover:bg-violet-50 hover:text-violet-600"
                            title="Underline"
                          >
                            <Underline size={15} />
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              applyInlineFormat("~~", "~~", "strikethrough text")
                            }
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
                      onClick={() => {
                        setShowComposerEmojiPicker((v) => !v);
                        setShowFormattingToolbar(false);
                      }}
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

                                      {/* 4. @ Mention user */}
                    <button
                      type="button"
                      onClick={() => {
                        const ta = inputRef.current;
                        const start = ta?.selectionStart ?? commentText.length;
                        const end = ta?.selectionEnd ?? commentText.length;
                        const next =
                          commentText.slice(0, start) +
                          "@" +
                          commentText.slice(end);
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

                    {/* 6. Attachment — upload file */}
                                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept={ACCEPTED_COMMENT_ATTACHMENT_TYPES}
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

                    {/* Right side — hint + cancel + send */}
                    <div className="ml-auto flex items-center gap-2">
                                        <button
                        type="button"
                        onClick={() => {
                          setCommentText("");
                          setReplyingTo(null);
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
                        disabled={
                          !commentText.trim() || sending || uploadingAttachment
                        }
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
                              <span className="font-mono text-xs text-violet-600">
                                {it.code}
                              </span>
                              <span className="text-sm text-slate-700 truncate">
                                · {it.label}
                              </span>
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
                              <span className="font-mono text-xs text-violet-700">
                                {it.code}
                              </span>
                              <span className="text-sm text-slate-700 truncate">
                                · {it.label}
                              </span>
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
                              ? "No mentionable task or workspace members found."
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
                            <ModernAvatar
                              name={u.name}
                              email={(u as any).email || ""}
                              photoURL={getFirstRealPhotoURL(
                                (u as any).photoURL,
                                (u as any).googlePhotoURL,
                                (u as any).providerPhotoURL,
                              )}
                              size={24}
                            />

                            <span className="text-sm text-slate-700 truncate">
                              {u.name}
                            </span>
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

          {/* Share Task Modal */}
          {showShareModal && (
            <div
              className="fixed inset-0 z-[80] bg-black/35 backdrop-blur-[2px] flex items-center justify-center p-4"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) {
                  resetShareModal();
                }
              }}
              role="dialog"
              aria-modal="true"
              aria-label="Share task"
            >
              <div className="w-full max-w-md max-h-[88vh] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
                {/* Header */}
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-shrink-0">
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-semibold text-slate-900 leading-tight">
                      Share task
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                      Invite people or copy the task link.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={resetShareModal}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors flex-shrink-0"
                    title="Close"
                    aria-label="Close share modal"
                  >
                    <X size={15} />
                  </button>
                </div>

                {/* Scrollable content */}
                <div className="px-4 py-3 overflow-y-auto flex-1">
                  {/* Compact task preview */}
                  <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center flex-shrink-0">
                        <Share2 size={15} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900 truncate leading-tight">
                          {taskView.title || task.title}
                        </p>

                        <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-500 min-w-0">
                          {(taskView.taskCode || task.taskCode) && (
                            <>
                              <span className="font-mono truncate max-w-[80px]">
                                {taskView.taskCode || task.taskCode}
                              </span>
                              <span className="text-slate-300">·</span>
                            </>
                          )}

                          <span className="truncate">
                            {taskView.status || task.status || "To Do"}
                          </span>

                          <span className="text-slate-300">·</span>

                          <span className="flex items-center gap-1 flex-shrink-0">
                            <span
                              className={
                                "w-1.5 h-1.5 rounded-full " +
                                (PRIORITY_DOT[
                                  taskView.priority || task.priority
                                ] || "bg-gray-400")
                              }
                            />
                            {taskView.priority || task.priority || "Low"}
                          </span>

                          {project && (
                            <>
                              <span className="text-slate-300">·</span>
                              <span className="truncate">{project.name}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Invite with email */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-700">
                        Invite with email
                      </label>

                      {shareSent && (
                        <span className="text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5">
                          Invite sent · Pending
                        </span>
                      )}
                    </div>

                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <input
                          type="email"
                          value={shareEmail}
                          onChange={(e) => {
                            setShareEmail(e.target.value);
                            setShareError("");
                            setShareSent(false);
                          }}
                          onKeyDown={(e) => {
                            if (
                              e.key === "Enter" &&
                              shareEmail.trim() &&
                              !sharingTask
                            ) {
                              e.preventDefault();
                              handleSendTaskShare();
                            }
                          }}
                          placeholder="Add member by email..."
                          className={
                            "w-full h-9 border rounded-lg px-3 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-100 transition-all " +
                            (shareError
                              ? "border-red-300 bg-red-50"
                              : "border-slate-200 focus:border-violet-400")
                          }
                        />

                        {shareError && (
                          <p className="text-[11px] text-red-500 mt-1.5">
                            {shareError}
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={handleSendTaskShare}
                        disabled={sharingTask || !shareEmail.trim()}
                        className="h-9 px-3 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 transition-colors disabled:opacity-45 disabled:cursor-not-allowed flex items-center gap-1.5 flex-shrink-0"
                      >
                        {sharingTask ? (
                          <>
                            <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            Sending
                          </>
                        ) : (
                          <>
                            <Send size={13} />
                            Invite
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Optional message - collapsed by default */}
                  <div className="mb-4">
                    {!showShareMessage ? (
                      <button
                        type="button"
                        onClick={() => setShowShareMessage(true)}
                        className="text-xs font-medium text-violet-600 hover:text-violet-700 hover:bg-violet-50 rounded-md px-1.5 py-1 -ml-1.5 transition-colors"
                      >
                        + Add message
                      </button>
                    ) : (
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-semibold text-slate-700">
                            Message{" "}
                            <span className="font-normal text-slate-400">
                              optional
                            </span>
                          </label>

                          <button
                            type="button"
                            onClick={() => {
                              setShowShareMessage(false);
                              setShareMessage("");
                            }}
                            className="text-[11px] text-slate-400 hover:text-slate-600"
                          >
                            Remove
                          </button>
                        </div>

                        <textarea
                          value={shareMessage}
                          onChange={(e) =>
                            setShareMessage(e.target.value.slice(0, 300))
                          }
                          placeholder="Add a short note..."
                          rows={2}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 resize-none"
                        />

                        <p className="text-[10px] text-slate-400 text-right mt-0.5">
                          {shareMessage.length}/300
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Access settings */}
                  <div className="pt-3 border-t border-slate-100 mb-4">
                    <p className="text-xs font-semibold text-slate-700 mb-2">
                      Access settings
                    </p>

                    <div className="relative">
                                            <button
                        type="button"
                        onClick={() => {
                          if (canManageTaskSharing) {
                            setTaskAccessOpen((open) => !open);
                          }
                        }}
                        disabled={savingTaskAccess || !canManageTaskSharing}
                        className="w-full min-h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 flex items-center justify-between gap-3 hover:border-violet-200 hover:bg-violet-50/40 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      >

                        <div className="flex items-center gap-2 min-w-0 text-left">
                          <UserIcon
                            size={14}
                            className="text-slate-400 flex-shrink-0"
                          />

                          <div className="min-w-0">
                            <p className="text-xs font-medium text-slate-700 truncate">
                              {activeTaskAccessOption.label}
                            </p>

                            <p className="text-[11px] text-slate-400 truncate">
                              {activeTaskAccessOption.description}
                            </p>
                          </div>
                        </div>

                        {savingTaskAccess ? (
                          <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 border-t-violet-500 animate-spin flex-shrink-0" />
                        ) : (
                          <svg
                            className={`w-3.5 h-3.5 text-slate-400 flex-shrink-0 transition-transform ${
                              taskAccessOpen ? "rotate-180" : ""
                            }`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        )}
                      </button>

                      {taskAccessOpen && (
                        <div className="absolute left-0 right-0 top-full mt-2 z-[90] rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
                          {TASK_ACCESS_OPTIONS.map((option) => {
                            const selected = option.value === taskAccessMode;

                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() =>
                                  handleChangeTaskAccessMode(option.value)
                                }
                                className={`w-full px-3 py-2.5 flex items-start justify-between gap-3 text-left transition-colors ${
                                  selected
                                    ? "bg-violet-50 text-violet-700"
                                    : "bg-white text-slate-700 hover:bg-slate-50"
                                }`}
                              >
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold truncate">
                                    {option.label}
                                  </p>

                                  <p
                                    className={`text-[11px] mt-0.5 leading-snug ${
                                      selected
                                        ? "text-violet-500"
                                        : "text-slate-400"
                                    }`}
                                  >
                                    {option.description}
                                  </p>
                                </div>

                                {selected && (
                                  <Check
                                    size={14}
                                    className="text-violet-600 flex-shrink-0 mt-0.5"
                                  />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Who has access */}
                  <div>
                    <p className="text-xs font-semibold text-slate-700 mb-2">
                      Who has access
                    </p>

                    <div className="space-y-1">
                      {/* Connected project */}
                      {project && (
                        <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-slate-50 transition-colors">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-white flex-shrink-0"
                            style={{
                              backgroundColor: project.color ?? "#8b5cf6",
                            }}
                          >
                            <FolderKanban size={14} />
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-800 truncate leading-tight">
                              {project.name}
                            </p>
                            <p className="text-[11px] text-slate-400 truncate">
                              Connected project
                            </p>
                          </div>

                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 flex-shrink-0">
                            Project
                          </span>
                        </div>
                      )}

                      {/* Current user */}
                      <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-slate-50 transition-colors">
                        <ModernAvatar
                          name={safeCurrentUserDisplayName}
                          email={safeCurrentUserEmail}
                          photoURL={currentUserRealPhotoURL}
                          size={32}
                        />

                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-800 truncate leading-tight">
                            {safeCurrentUserDisplayName}
                          </p>
                          <p className="text-[11px] text-slate-400 truncate">
                            {safeCurrentUserEmail || "Current user"}
                          </p>
                        </div>

                                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-violet-50 text-violet-600 border border-violet-100 flex-shrink-0 capitalize">
                          {isWorkspaceOwner
                            ? "Owner"
                            : currentWorkspaceRole || "Member"}
                        </span>

                      </div>

                      {/* Assignee */}
                                            {(taskView.assignee || task.assignee) &&
                        (taskView.assignee || task.assignee) !== safeCurrentUserDisplayName && (
                          <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-slate-50 transition-colors">
                            <ModernAvatar
                                                            name={taskView.assignee || task.assignee}
                              email=""
                              photoURL=""
                              size={32}
                            />

                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-slate-800 truncate leading-tight">
                                                                {taskView.assignee || task.assignee}
                              </p>
                              <p className="text-[11px] text-slate-400 truncate">
                                Assigned to this task
                              </p>
                            </div>

                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-600 border border-amber-100 flex-shrink-0">
                              Assignee
                            </span>
                          </div>
                        )}

                      {/* Email shares */}
                      {taskShares.map((share) => {
                        const shareStatus = share.status || "pending";

                        const shareEmail =
                          share.sharedWithEmail ||
                          share.invitedEmail ||
                          share.invitedEmailLower ||
                          "";

                        const shareSenderName =
                          share.sharedByName ||
                          share.invitedByName ||
                          "a workspace member";

                        const acceptedEmail = share.acceptedByEmail || "";

                        const shareProfile = getResolvedUserProfile({
                          uid: share.acceptedByUid || share.acceptedBy || "",
                          email: acceptedEmail || shareEmail,
                          name: acceptedEmail || shareEmail || "Shared user",
                          photoURL: "",
                        });

                        const statusClass =
                          shareStatus === "active" || shareStatus === "accepted"
                            ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                            : shareStatus === "pending"
                              ? "bg-amber-50 text-amber-600 border-amber-100"
                              : "bg-slate-50 text-slate-500 border-slate-100";

                        return (
                          <div
                            key={share.id}
                            className="group flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-slate-50 transition-colors"
                          >
                            <ModernAvatar
                              name={shareProfile.name}
                              email={shareProfile.email}
                              photoURL={shareProfile.photoURL}
                              size={32}
                            />

                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-slate-800 truncate leading-tight">
                                {shareEmail || "Unknown email"}
                              </p>

                              <p className="text-[11px] text-slate-400 truncate">
                                {shareStatus === "active" ||
                                shareStatus === "accepted"
                                  ? `Accepted${acceptedEmail ? ` by ${acceptedEmail}` : ""}`
                                  : `Invited by ${shareSenderName}`}
                              </p>
                            </div>

                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-md border capitalize flex-shrink-0 ${statusClass}`}
                            >
                              {shareStatus === "accepted"
                                ? "active"
                                : shareStatus}
                            </span>

                                                        {canManageTaskSharing && (
                              <button
                                type="button"
                                onClick={() => handleRevokeTaskShare(share)}
                                className="w-7 h-7 rounded-md flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all flex-shrink-0"
                                title={`Remove access for ${shareEmail || "this user"}`}
                                aria-label={`Remove access for ${shareEmail || "this user"}`}
                              >
                                <Trash2 size={13} />
                              </button>
                            )}

                          </div>
                        );
                      })}

                      {!project && !task.assignee && taskShares.length === 0 && (
                        <div className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-center">
                          <p className="text-xs text-slate-500">
                            No additional people have access yet.
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-slate-400">
                      <span>
                        {taskAccessMode === "task_project"
                          ? project
                            ? "Project members and task members can access this task."
                            : "Task members can access this task."
                          : taskAccessMode === "invited_only"
                            ? "Only invited people can access this task."
                            : "Anyone with the task link can access this task."}
                      </span>

                                           {canManageTaskSharing && (
                        <button
                          type="button"
                          onClick={() => setTaskAccessOpen(true)}
                          className="text-violet-500 hover:text-violet-600 flex-shrink-0"
                        >
                          Manage access ›
                        </button>
                      )}

                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {toast && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-4 py-2 rounded-lg shadow-lg z-[60]">
              {toast}
            </div>
          )}
        </div>
      </>
    );
  }
