/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo, useState } from "react";
import {
  useConversations,
  DEFAULT_CONVERSATION_FILTERS,
} from "../hooks/useConversations";
import type {
  ConversationFilters,
  ConversationTargetType,
} from "../hooks/useConversations";
import {
  monogramGradient,
  monogramInitials,
  monogramSeed,
  resolveAvatarPhoto,
} from "../lib/monogram";


/** Format a millisecond timestamp into a short, human "when" label. */
function formatWhen(ms: number): string {
  if (!ms) return "";
  const then = new Date(ms);
  const now = new Date();
  const diff = now.getTime() - then.getTime();

  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "just now";
  if (diff < hour) {
    const m = Math.floor(diff / minute);
    return `${m}m ago`;
  }
  if (diff < day) {
    const h = Math.floor(diff / hour);
    return `${h}h ago`;
  }
  if (diff < 7 * day) {
    const d = Math.floor(diff / day);
    return `${d}d ago`;
  }
  return then.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
/* Avatar monogram + photo logic now imported from ../lib/monogram
   (single source of truth) so Conversations matches the Sidebar,
   Navbar, TeamPage and TaskDetailPanel byte-for-byte. */



export function ConversationsPage() {
  const [filters, setFilters] = useState<ConversationFilters>(
    DEFAULT_CONVERSATION_FILTERS,
  );

  const {
    items,
    loading,
    projectOptions,
    taskOptions,
    counts,
    postConversationMessage,
  } = useConversations(filters);

  // Composer state. Comments always attach to a concrete task — a project has
  // no single comment thread, so "project" mode was removed to avoid posting
  // to a random task inside the project.
  const targetType: ConversationTargetType = "task";
  const [targetId, setTargetId] = useState("");
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");

    // Options for the composer's target picker — tasks only.
  const composerOptions = useMemo(
    () => taskOptions.map((t) => ({ id: t.id, label: t.title })),
    [taskOptions],
  );


  const handlePost = async () => {
    setError("");
    if (!text.trim()) {
      setError("Message cannot be empty.");
      return;
    }
    if (!targetId) {
      setError("Select a task or project to tag.");
      return;
    }
    setPosting(true);
    try {
      await postConversationMessage({ targetType, targetId, text });
      setText("");
    } catch (e: any) {
      setError(e?.message || "Failed to post message.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-50">
      {/* Header */}
      <header className="px-6 py-5 border-b border-slate-200 bg-white">
        <h1 className="text-xl font-semibold text-slate-900">Conversations</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every comment across your workspace, newest first.
        </p>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto">
                     <div className="max-w-6xl mx-auto px-6 pt-14 pb-8 space-y-6">
          {/* Composer */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
                                    <div className="flex items-center gap-2 mb-3">
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="flex-1 min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select a task…</option>
                {composerOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>


            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write a message…"
              rows={3}
              className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />

            {error ? (
              <p className="mt-2 text-sm text-red-600">{error}</p>
            ) : null}

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={handlePost}
                disabled={posting}
                className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {posting ? "Posting…" : "Post"}
              </button>
            </div>
          </div>

          {/* Filter chips */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setFilters((f) => ({ ...f, mentionsMe: false, unreadOnly: false }))
              }
              className={`px-3 py-1.5 text-sm font-medium rounded-full border transition ${
                !filters.mentionsMe && !filters.unreadOnly
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              All ({counts.all})
            </button>
            <button
              type="button"
              onClick={() =>
                setFilters((f) => ({
                  ...f,
                  mentionsMe: !f.mentionsMe,
                  unreadOnly: false,
                }))
              }
              className={`px-3 py-1.5 text-sm font-medium rounded-full border transition ${
                filters.mentionsMe
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              Mentions me ({counts.mentionsMe})
            </button>
            <button
              type="button"
              onClick={() =>
                setFilters((f) => ({
                  ...f,
                  unreadOnly: !f.unreadOnly,
                  mentionsMe: false,
                }))
              }
              className={`px-3 py-1.5 text-sm font-medium rounded-full border transition ${
                filters.unreadOnly
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              Unread ({counts.unread})
            </button>
          </div>

          {/* Feed */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <span className="ml-3 text-sm text-slate-500">
                Loading conversations…
              </span>
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
              <p className="text-sm text-slate-500">No conversations yet.</p>
              <p className="mt-1 text-xs text-slate-400">
                Post a message above to start the feed.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {items.map((item: any) => (
                                <li
                  key={item.id || item.commentId}
                  className="rounded-xl border border-slate-200 bg-white shadow-sm p-4"
                >
                  <div className="flex items-start gap-3">

                                        <div className="relative h-9 w-9 flex-shrink-0">
                      <div
                        className="absolute inset-0 h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold text-white select-none"
                        style={{
                          background: monogramGradient(
                            monogramSeed(item.authorEmail, item.authorName),
                          ),
                          letterSpacing: "0.02em",
                        }}
                      >
                        {monogramInitials(item.authorName, item.authorEmail)}
                      </div>
                      {resolveAvatarPhoto(item.authorPhotoURL) ? (
                        <img
                          src={resolveAvatarPhoto(item.authorPhotoURL)}
                          alt={item.authorName}
                          referrerPolicy="no-referrer"
                          className="absolute inset-0 h-9 w-9 rounded-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display =
                              "none";
                          }}
                        />
                      ) : null}
                    </div>


                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-900">
                          {item.authorName}
                        </span>
                        {item.mentionsMe ? (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-100 text-amber-700">
                            Mentions you
                          </span>
                        ) : null}
                        {item.isUnread ? (
                          <span className="h-2 w-2 rounded-full bg-indigo-500" />
                        ) : null}
                        <span className="text-xs text-slate-400">
                          {formatWhen(item.createdAtMs)}
                        </span>
                      </div>

                      <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap break-words">
                        {item.text}
                      </p>

                      <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                        {item.projectName ? (
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                            {item.projectName}
                          </span>
                        ) : null}
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                          {item.taskTitle}
                        </span>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default ConversationsPage;
