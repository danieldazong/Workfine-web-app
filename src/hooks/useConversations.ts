/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  collectionGroup,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase/config";
import { useAuth } from "../context/AuthContext";
import { useAppData } from "../context/AppDataContext";
import { useNotifications } from "./useNotifications";
import { createCommentNotifications } from "../lib/firebase/notifications";

/** What the composer can tag a message to: exactly one task OR one project. */
export type ConversationTargetType = "task" | "project";

export interface PostConversationMessageInput {
  targetType: ConversationTargetType;
  /** taskId when targetType="task", projectId when targetType="project". */
  targetId: string;
  text: string;
}

/** Strip undefined values so Firestore never rejects the write. */
function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  Object.entries(obj).forEach(([k, v]) => {
    if (v !== undefined) out[k] = v;
  });
  return out as T;
}



/**
 * A single, flattened conversation entry. Each entry is ONE comment that lives
 * under workspaces/{workspaceId}/tasks/{taskId}/comments/{commentId}, enriched
 * with the task + project it belongs to so the feed can render and link to it.
 */
export interface ConversationItem {
  id: string;
  workspaceId: string;
  taskId: string;
  commentId: string;

  text: string;
  authorId: string;
  authorName: string;
  authorEmail: string;
  authorPhotoURL: string;
  authorMonogramSeed: string;

  // Raw mention UIDs stored on the comment, used by the "Mentions me" filter.
  mentionedUids: string[];


  createdAtMs: number;

  // Resolved from the tasks/projects already in AppDataContext.
  taskTitle: string;
  projectId: string;
  projectName: string;

  // True when this comment's taskId has an UNREAD comment/mention notification
  // for the current user (resolved against useNotifications). Used by the
  // "Unread" filter. This is a per-task signal, not strictly per-comment,
  // because notifications reference the task, not the individual comment.
  isUnread: boolean;

  // True when the current user is in this comment's mentionedUids.
  mentionsMe: boolean;
}

/** The set of filters the Conversations feed supports. */
export interface ConversationFilters {
  /** "" = all projects, otherwise a projectId. */
  projectId: string;
  /** "" = all tasks, otherwise a taskId. */
  taskId: string;
  /** Only show comments that @mention the current user. */
  mentionsMe: boolean;
  /** Only show comments belonging to tasks with unread notifications. */
  unreadOnly: boolean;
}

export const DEFAULT_CONVERSATION_FILTERS: ConversationFilters = {
  projectId: "",
  taskId: "",
  mentionsMe: false,
  unreadOnly: false,
};

function getMs(value: any): number {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function cleanStr(value: any): string {
  return String(value ?? "").trim();
}

/**
 * Phase 1 (read-only): subscribes to every comment in the current workspace via
 * a collectionGroup query and returns them as a flat, newest-first feed.
 *
 * It reuses the EXACT comment document shape written by TaskDetailPanel and the
 * canonical path workspaces/{workspaceId}/tasks/{taskId}/comments. No new data
 * model is introduced; this is purely an aggregating read.
 */
export function useConversations(
  filters: ConversationFilters = DEFAULT_CONVERSATION_FILTERS,
) {
  const { user, workspaceId } = useAuth();
  const { tasks, projects, members } = useAppData();


  // Reuse the SAME notifications stream the bell uses. Each unread
  // comment/mention notification references a taskId, which we turn into a
  // per-task "unread" signal for the feed. No new reads/writes are added.
  const { notifications } = useNotifications(user?.uid);

  const [rawComments, setRawComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const hasResolvedRef = useRef(false);
    // True ONLY after a successful server snapshot has landed (NOT after the
  // spinner grace period). Used to decide whether the warmup safety-net kick
  // is still needed, so the feed always populates without a user write.
  const rawCommentsResolvedRef = useRef(false);


        useEffect(() => {
    if (!user?.uid || !user?.email) {
      setRawComments([]);
      setLoading(false);
      return;
    }


      hasResolvedRef.current = false;
    rawCommentsResolvedRef.current = false;
    // Only show the spinner on the very first attach. Re-subscribes keep the
    // last-known feed on screen so the user never sees comments → empty flash.
    setLoading(true);


    let cancelled = false;
    let activeUnsub: (() => void) | null = null;
    let retryTimer: number | null = null;
    let attempt = 0;

        // Same transient-error backoff schedule as MyTasksPage's resilient listener.
    const RETRY_DELAYS_MS = [250, 500, 1000, 2000, 4000, 8000];

    // GLOBAL FIX (guest spinner): for a guest, the FIRST collectionGroup read can
    // keep throwing permission-denied during the auth/workspace warmup race. The
    // old handler retried forever WITHOUT ever resolving `loading`, so the page
    // span infinitely until the guest posted a comment (which finally produced a
    // successful read). We now keep retrying in the BACKGROUND, but after a short
    // grace period we stop the spinner and show the (empty) feed. The moment a
    // read succeeds, the feed fills in. This works for every account globally.
    const STOP_SPINNER_AFTER_TRANSIENT_ATTEMPTS = 3;


      const subscribe = () => {
      if (cancelled || !user?.uid) return;

      // GLOBAL FIX: a shared task's comments live in the OWNER's workspace, so a
      // guest viewing Conversations under their OWN (different) workspaceId would
      // never see them if we filtered by workspaceId. Instead we query by the
      // self-authorizing `sharedEmailsLower` field — the SAME field stamped on
      // every comment write AND authorized by the collectionGroup rule in
      // firestore.rules. This is path-agnostic and workspace-independent, so the
      // owner and every guest see the exact same thread regardless of which
      // workspace the comment physically lives in.
      const myEmailLower = String(user?.email || "").trim().toLowerCase();
      if (!myEmailLower) {
        // No email on the auth user — nothing we can authorize. Resolve empty.
        setRawComments([]);
        if (!hasResolvedRef.current) {
          hasResolvedRef.current = true;
          setLoading(false);
        }
        return;
      }

      const commentsQuery = query(
        collectionGroup(db, "comments"),
        where("sharedEmailsLower", "array-contains", myEmailLower),
      );


      activeUnsub = onSnapshot(
        commentsQuery,
        (snap) => {
          if (cancelled) return;

          // Successful read — reset the retry counter.
          attempt = 0;

          const data = snap.docs.map((d) => {
            const raw = d.data() as any;

            // The parent of a comment doc is the "comments" collection, whose
            // parent is the task doc. taskId is also stored on the comment in
            // most writes, but we derive it from the path as a safe fallback.
            const taskIdFromPath = d.ref.parent.parent?.id || "";

            return {
              id: d.id,
              commentId: d.id,
              taskIdFromPath,
              ...raw,
            };
          });

                    setRawComments(data);

          // A real server read landed — cancel any pending warmup safety net.
          rawCommentsResolvedRef.current = true;

          if (!hasResolvedRef.current) {
            hasResolvedRef.current = true;
            setLoading(false);
          }

        },
        (err) => {
          if (cancelled) return;

          const code = String((err as any)?.code || "").toLowerCase();

          // Transient errors happen during the auth/workspace warmup race
          // (workspaceId flips null → personal_... and rules briefly reject the
          // read). We must NOT clear the feed or resolve loading on these — we
          // re-subscribe with backoff so we recover onto the populated feed.
                    // failed-precondition = the collectionGroup index is still building
          // (or briefly unavailable during deploy). It MUST be treated as
          // transient so we keep retrying onto a successful read instead of
          // permanently clearing the feed. resource-exhausted/aborted are also
          // warmup-class errors. This is what made history only appear after a
          // local write (which served from cache and bypassed the server read).
          const isTransient =
            code === "permission-denied" ||
            code === "unauthenticated" ||
            code === "unavailable" ||
            code === "deadline-exceeded" ||
            code === "internal" ||
            code === "cancelled" ||
            code === "failed-precondition" ||
            code === "resource-exhausted" ||
            code === "aborted";


          console.warn(
            `[useConversations] comments listener error (transient=${isTransient}):`,
            code || err,
          );

          // Tear down the failed subscription before retrying.
          if (activeUnsub) {
            try {
              activeUnsub();
            } catch {}
            activeUnsub = null;
          }

          if (!isTransient) {
            // Genuinely fatal — clear the feed and stop loading.
            setRawComments([]);
            if (!hasResolvedRef.current) {
              hasResolvedRef.current = true;
              setLoading(false);
            }
            return;
          }

                    // Transient: keep existing rawComments untouched and re-subscribe with
          // backoff. BUT once we've retried past the grace period without a
          // successful read, stop the spinner so the guest sees the (empty) feed
          // instead of spinning forever. Retries continue in the background, so
          // the feed will fill in the instant the read finally succeeds.
          if (
            !hasResolvedRef.current &&
            attempt >= STOP_SPINNER_AFTER_TRANSIENT_ATTEMPTS
          ) {
            hasResolvedRef.current = true;
            setLoading(false);
          }

          const delay =
            RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
          attempt += 1;

          retryTimer = window.setTimeout(subscribe, delay);

        },
      );
    };

     subscribe();

    // SAFETY NET (global): if the very first attach resolved the spinner on a
    // transient error (empty feed shown) but a successful server read has not
    // yet landed, force one clean re-subscribe shortly after mount. This
    // guarantees the populated feed appears WITHOUT requiring the user to post.
    const warmupKick = window.setTimeout(() => {
      if (cancelled) return;
      if (rawCommentsResolvedRef.current) return; // a real read already landed
      attempt = 0;
      if (activeUnsub) {
        try { activeUnsub(); } catch {}
        activeUnsub = null;
      }
      subscribe();
    }, 1500);

    return () => {

      cancelled = true;
      window.clearTimeout(warmupKick);
      if (retryTimer) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
      if (activeUnsub) {
        try {
          activeUnsub();
        } catch {}
        activeUnsub = null;
      }
    };

    }, [user?.uid, user?.email]);


    // GLOBAL: The guest's REAL uploaded photo lives in users/{uid} — the SAME
  // document TeamPage's GuestAvatar subscribes to. The people doc does NOT
  // hold the live photoURL, so reading from it (or from the comment) is always
  // stale. Here we collect every author uid we can resolve from the feed
  // (via the comment authorId AND via the people-doc uid/email match) and
  // subscribe live to each users/{uid}. When a guest changes their avatar,
  // users/{uid}.photoURL changes, this map updates, and the feed re-renders
  // in real time — byte-for-byte identical to the Team page.
  const [userPhotoMap, setUserPhotoMap] = useState<Record<string, string>>({});

  // Resolve which uids we need to watch. Members are keyed by uid already;
  // guests must be matched from people docs (uid first, else by email).
    // Declared before authorUids/userPhotoMap because both memos read it.
  const [workspacePeople, setWorkspacePeople] = useState<any[]>([]);


  const authorUids = useMemo(() => {
    const set = new Set<string>();

    const isRealUid = (v: any) => {
      const s = cleanStr(v);
      return s.length > 0 && !s.startsWith("guest_");
    };

    const safePeople = Array.isArray(workspacePeople) ? workspacePeople : [];

    // people indexed by email so a comment with only an email still maps to uid
    const peopleUidByEmail = new Map<string, string>();
    safePeople.forEach((p: any) => {
      const uid = [p?.userId, p?.uid, p?.acceptedByUid].find((k) =>
        isRealUid(k),
      );
      if (!uid) return;
      [p?.email, p?.emailLower, p?.invitedEmail, p?.acceptedByEmail].forEach(
        (e) => {
          const key = cleanStr(e).toLowerCase();
          if (key) peopleUidByEmail.set(key, cleanStr(uid));
        },
      );
    });

    (Array.isArray(rawComments) ? rawComments : []).forEach((c: any) => {
      // 1) Direct uid on the comment.
      const direct = cleanStr(c.authorId || c.userId || c.createdBy);
      if (isRealUid(direct)) {
        set.add(direct);
        return;
      }
      // 2) Otherwise resolve uid via the people-doc email match.
      const email = cleanStr(
        c.authorEmail || c.email || c.authorEmailLower,
      ).toLowerCase();
      const viaEmail = email ? peopleUidByEmail.get(email) : "";
      if (isRealUid(viaEmail)) set.add(viaEmail as string);
    });

    return Array.from(set);
  }, [rawComments, workspacePeople]);

  // Subscribe live to each users/{uid}. Resolve ONLY Firebase Storage uploads
  // as real photos — identical policy to TeamPage's resolveAvatarPhoto() — so
  // Conversations shows exactly what the Team page shows.
  useEffect(() => {
    if (!user?.uid || authorUids.length === 0) {
      setUserPhotoMap({});
      return;
    }

    const unsubs: Array<() => void> = [];

    authorUids.forEach((uid) => {
      const unsub = onSnapshot(
        doc(db, "users", uid),
        (snap) => {
          const u = (snap.exists() ? snap.data() : {}) as any;
          const raw = cleanStr(
            u.photoURL ||
              u.avatarUrl ||
              u.googlePhotoURL ||
              u.providerPhotoURL ||
              u.authPhotoURL,
          );
          // GLOBAL POLICY: only Firebase Storage uploads count as a real photo.
          const real = raw.includes("firebasestorage") ? raw : "";
          setUserPhotoMap((prev) => {
            if (prev[uid] === real) return prev;
            return { ...prev, [uid]: real };
          });
        },
        (err) => {
          console.warn(
            "[useConversations] users/{uid} photo listener error:",
            uid,
            String((err as any)?.code || err),
          );
        },
      );
      unsubs.push(unsub);
    });

    return () => {
      unsubs.forEach((u) => {
        try {
          u();
        } catch {}
      });
    };
  }, [user?.uid, authorUids]);

  // GLOBAL: External Guests are NOT in `members` — they live in
  // workspaces/{workspaceId}/people (the SAME source TeamPage's GuestAvatar
  // subscribes to). Subscribe live here so a guest changing their avatar
  // propagates to the Conversations feed in real time, exactly like the
  // Team page. Keyed later by uid AND email.
  

  useEffect(() => {
    if (!user?.uid || !workspaceId) {
      setWorkspacePeople([]);
      return;
    }

    const peopleRef = collection(db, "workspaces", workspaceId, "people");

    const unsub = onSnapshot(
      peopleRef,
      (snap) => {
        setWorkspacePeople(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })),
        );
      },
      (err) => {
        console.warn(
          "[useConversations] workspace people listener error:",
          String((err as any)?.code || err),
        );
      },
    );

    return () => {
      try {
        unsub();
      } catch {}
    };
  }, [user?.uid, workspaceId]);

    // Set of commentIds that currently have an UNREAD comment/mention
  // notification for the current user. This is PER-COMMENT (not per-task), so
  // opening one comment clears exactly one unread, and each NEW comment adds
  // exactly one. We also keep a per-task fallback set for legacy notifications
  // that were written WITHOUT a commentId, so those still show as unread.
  const { unreadCommentIds, unreadTaskIdsNoComment } = useMemo(() => {
    const commentSet = new Set<string>();
    const taskNoCommentSet = new Set<string>();
    const safeNotifications = Array.isArray(notifications) ? notifications : [];

    safeNotifications.forEach((n: any) => {
      if (n?.read) return;

      const type = String(n?.type || "");
      if (type !== "task_comment" && type !== "mention") return;

      const commentId = cleanStr(n?.commentId);
      if (commentId) {
        commentSet.add(commentId);
        return;
      }

      // Legacy notification with no commentId — fall back to per-task so the
      // task's comments still surface as unread instead of silently vanishing.
      const taskId = cleanStr(n?.taskId || n?.sourceTaskId);
      if (taskId) taskNoCommentSet.add(taskId);
    });

    return {
      unreadCommentIds: commentSet,
      unreadTaskIdsNoComment: taskNoCommentSet,
    };
  }, [notifications]);


  const currentUid = cleanStr(user?.uid);

  // The full, unfiltered feed (used for building filter dropdowns + counts).
  const allItems = useMemo<ConversationItem[]>(() => {
    const safeTasks = Array.isArray(tasks) ? tasks : [];
    const safeProjects = Array.isArray(projects) ? projects : [];

    const taskById = new Map<string, any>();
    safeTasks.forEach((t: any) => {
      if (t?.id) taskById.set(String(t.id), t);
    });

     const projectById = new Map<string, any>();
    safeProjects.forEach((p: any) => {
      if (p?.id) projectById.set(String(p.id), p);
    });

    // GLOBAL: build a live lookup of workspace members by every id field they
    // might be keyed on, so a comment's authorId resolves to the SAME person
    // (and the SAME photo/identity) shown on the Team page. This guarantees the
    // Conversations avatar synchronizes with the member's canonical avatar
    // instead of relying on the photoURL frozen into the comment doc.
     const safeMembers = Array.isArray(members) ? members : [];
    const memberByKey = new Map<string, any>();
    safeMembers.forEach((m: any) => {
      [m?.uid, m?.userId, m?.id, m?.memberId, m?.acceptedByUid].forEach((k) => {
        const key = cleanStr(k);
        if (key) memberByKey.set(key, m);
      });
    });

    // GLOBAL: also index live External Guests from workspaces/{ws}/people so a
    // guest's avatar/name/email resolves to their CURRENT profile (real-time),
    // not the value frozen into the comment. Keyed by every uid field AND by
    // email, because guest comments are often only matchable by email.
    const peopleByEmail = new Map<string, any>();
    const safePeople = Array.isArray(workspacePeople) ? workspacePeople : [];
    safePeople.forEach((p: any) => {
      [
        p?.uid,
        p?.userId,
        p?.id,
        p?.acceptedByUid,
        p?.invitedBy,
      ].forEach((k) => {
        const key = cleanStr(k);
        // Don't let a guest entry override a real member with the same key.
        if (key && !memberByKey.has(key)) memberByKey.set(key, p);
      });

      [
        p?.email,
        p?.emailLower,
        p?.invitedEmail,
        p?.invitedEmailLower,
        p?.acceptedByEmail,
      ].forEach((e) => {
        const key = cleanStr(e).toLowerCase();
        if (key) peopleByEmail.set(key, p);
      });
    });

        const isRealUidStr = (v: any) => {
      const s = cleanStr(v);
      return s.length > 0 && !s.startsWith("guest_");
    };

    // Resolve a person (member first, then guest-by-email) for a comment.
    const resolvePerson = (c: any) => {
      const authorKey = cleanStr(c.authorId || c.userId || c.createdBy);
      const byKey = memberByKey.get(authorKey);
      if (byKey) return byKey;

      const email = cleanStr(
        c.authorEmail || c.email || c.authorEmailLower,
      ).toLowerCase();
      if (email && peopleByEmail.has(email)) return peopleByEmail.get(email);

      return null;
    };

    // Resolve the REAL Firebase Auth uid for a comment so we can read the
    // guest's LIVE photo from users/{uid} (the same source TeamPage uses).
    const resolveAuthorUid = (c: any): string => {
      const direct = cleanStr(c.authorId || c.userId || c.createdBy);
      if (isRealUidStr(direct)) return direct;

      const person = resolvePerson(c);
      const fromPerson = cleanStr(
        person?.userId || person?.uid || person?.acceptedByUid,
      );
      if (isRealUidStr(fromPerson)) return fromPerson;

      return "";
    };

    // The live photo from users/{uid} ALWAYS wins (matches the Team page).
    const livePhotoFor = (c: any): string => {
      const uid = resolveAuthorUid(c);
      if (!uid) return "";
      return cleanStr(userPhotoMap[uid]);
    };



    return rawComments
      .map((c: any) => {

        const taskId = cleanStr(c.taskId || c.sourceTaskId || c.taskIdFromPath);
        const task = taskById.get(taskId);

        const projectId = cleanStr(c.projectId || task?.projectId);
        const project = projectById.get(projectId);

        const text = cleanStr(c.text || c.message || c.body || c.content);

        const mentionedUids = (
          Array.isArray(c.mentionedUids) ? c.mentionedUids : []
        )
          .map((uid: any) => cleanStr(uid))
          .filter(Boolean);

        const mentionsMe = Boolean(currentUid) && mentionedUids.includes(currentUid);

        return {
          id: cleanStr(c.id),
          workspaceId: cleanStr(c.workspaceId),
          taskId,
          commentId: cleanStr(c.commentId || c.id),

          text,
                                  authorId: cleanStr(c.authorId || c.userId || c.createdBy),
          authorName: (() => {
            // Live member OR live External Guest (real-time), else comment value.
            const person = resolvePerson(c);
            return cleanStr(
              person?.displayName ||
                person?.name ||
                person?.invitedName ||
                c.authorName ||
                c.userName ||
                c.displayName ||
                person?.email ||
                person?.invitedEmail ||
                "User",
            );
          })(),
                    authorPhotoURL: (() => {
            // 1) LIVE users/{uid}.photoURL — the SAME source TeamPage's
            //    GuestAvatar subscribes to. This is what makes the avatar
            //    update in real time when a guest changes their photo.
            const live = livePhotoFor(c);
            if (live) return live;

            // 2) Fall back to the people/member profile, then the frozen comment.
            //    NOTE: only a Firebase Storage URL counts as a real photo, to
            //    match the global policy used everywhere else.
            const person = resolvePerson(c);
            const fallback = cleanStr(
              person?.photoURL ||
                person?.avatarUrl ||
                person?.avatarURL ||
                person?.googlePhotoURL ||
                c.authorPhotoURL ||
                c.photoURL ||
                c.avatarUrl,
            );
            return fallback.includes("firebasestorage") ? fallback : "";
          })(),

          // Canonical email — live member/guest first, then comment.
          authorEmail: (() => {
            const person = resolvePerson(c);
            return cleanStr(
              person?.email ||
                person?.emailLower ||
                person?.invitedEmail ||
                person?.invitedEmailLower ||
                c.authorEmail ||
                c.email,
            ).toLowerCase();
          })(),

          // Stable monogram seed: email-local first, then name — same rule as
          // every other surface — resolved from the live member/guest profile.
          authorMonogramSeed: (() => {
            const person = resolvePerson(c);
            const email = cleanStr(
              person?.email ||
                person?.emailLower ||
                person?.invitedEmail ||
                person?.invitedEmailLower ||
                c.authorEmail ||
                c.email,
            ).toLowerCase();
            const emailLocal = email.split("@")[0];
            const name = cleanStr(
              person?.displayName || person?.name || c.authorName,
            ).toLowerCase();
            return (
              emailLocal ||
              name ||
              cleanStr(c.authorId || c.userId || c.createdBy) ||
              "u"
            );
          })(),


          mentionedUids,

          createdAtMs: c.createdAtMs ? Number(c.createdAtMs) : getMs(c.createdAt),

          taskTitle: cleanStr(task?.title || c.taskTitle || "Untitled task"),
          projectId,
          projectName: cleanStr(project?.name || c.projectName || ""),

                isUnread:
            unreadCommentIds.has(cleanStr(c.commentId || c.id)) ||
            unreadTaskIdsNoComment.has(taskId),

          mentionsMe,
        } as ConversationItem;
      })
      // Only keep entries that resolved to a real task the user can see
      // (AppDataContext already scopes tasks to what the user may access).
      .filter((item) => Boolean(item.taskId) && Boolean(item.text))
      .sort((a, b) => b.createdAtMs - a.createdAtMs);
             }, [rawComments, tasks, projects, members, workspacePeople, userPhotoMap, unreadCommentIds, unreadTaskIdsNoComment, currentUid]);


  // The feed AFTER applying the active filters.
  const items = useMemo<ConversationItem[]>(() => {
    return allItems.filter((item) => {
      if (filters.projectId && item.projectId !== filters.projectId) {
        return false;
      }
      if (filters.taskId && item.taskId !== filters.taskId) {
        return false;
      }
      if (filters.mentionsMe && !item.mentionsMe) {
        return false;
      }
      if (filters.unreadOnly && !item.isUnread) {
        return false;
      }
      return true;
    });
  }, [
    allItems,
    filters.projectId,
    filters.taskId,
    filters.mentionsMe,
    filters.unreadOnly,
  ]);

    // GLOBAL FIX: the composer must be able to tag ANY task/project the user can
  // access — not only ones that already have a comment. The previous version
  // derived these from `allItems` (the comment feed), so a brand-new task with
  // no comments yet never appeared and could never receive its first comment.
  //
  // We now build the dropdowns from the user's full accessible list, which
  // AppDataContext already scopes per-user (so this stays a correct, global,
  // account-agnostic fix that exposes nothing the user can't already see).
  // The returned shapes ({ id, name } / { id, title }) are unchanged, so
  // ConversationsPage renders byte-for-byte identically.
  const projectOptions = useMemo(() => {
    const safeProjects = Array.isArray(projects) ? projects : [];
    const map = new Map<string, string>();
    safeProjects.forEach((p: any) => {
      const id = cleanStr(p?.id);
      if (!id) return;
      map.set(id, cleanStr(p?.name) || "Untitled project");
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projects]);

  const taskOptions = useMemo(() => {
    const safeTasks = Array.isArray(tasks) ? tasks : [];
    const map = new Map<string, string>();
    safeTasks.forEach((t: any) => {
      const id = cleanStr(t?.id);
      if (!id) return;
      // When a project is selected as a FILTER, scope the task list to it —
      // preserves the existing behavior of the task picker narrowing by project.
      if (filters.projectId && cleanStr(t?.projectId) !== filters.projectId) {
        return;
      }
      map.set(id, cleanStr(t?.title) || "Untitled task");
    });
    return Array.from(map.entries())
      .map(([id, title]) => ({ id, title }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [tasks, filters.projectId]);


        // Counts for the filter chips.
  // "Mentions me" counts UNREAD mentions only, so it decrements once the user
  // views the comment they were mentioned in (the same way Unread does). A
  // mention is a permanent property of a comment, so without the isUnread
  // gate the count could never go down.
  const counts = useMemo(() => {
    return {
      all: allItems.length,
      mentionsMe: allItems.filter((i) => i.mentionsMe && i.isUnread).length,
      unread: allItems.filter((i) => i.isUnread).length,
    };
  }, [allItems]);


   const allTasks = tasks;
  const allProjects = projects;

  /**
   * Post a new message from the Conversations page, tagged to EXACTLY one

   * Task or one Project.
   *
   * - For a Task target: writes a comment to
   *   workspaces/{workspaceId}/tasks/{taskId}/comments using the SAME document
   *   shape as TaskDetailPanel.handleSend, then fires createCommentNotifications
   *   so every task member is notified — identical to commenting inside the
   *   task panel. This is global: it works for any task on any account.
   *
   * - For a Project target: there is no project-level comment collection in the
   *   current data model, so we tag the message to the project by routing it to
   *   a representative task in that project. If the project has at least one
   *   task the user can see, the comment is posted to the most recently created
   *   one. If the project has no tasks yet, posting is rejected with a clear
   *   error (Phase 3 does not create new tasks — that would be a larger change).
   */
  const postConversationMessage = useCallback(
    async ({ targetType, targetId, text }: PostConversationMessageInput) => {
      const safeText = String(text || "").trim();
      const uid = cleanStr(user?.uid);
      const wsId = cleanStr(workspaceId);

      if (!uid) throw new Error("You must be signed in to post.");
      if (!wsId) throw new Error("No active workspace.");
      if (!safeText) throw new Error("Message cannot be empty.");
      if (!targetId) throw new Error("Select a task or project to tag.");

      const safeTasks = Array.isArray(allTasks) ? allTasks : [];
      const safeProjects = Array.isArray(allProjects) ? allProjects : [];

      // Resolve the actual task to comment on.
      let task: any = null;
      let projectId = "";

      if (targetType === "task") {
        task = safeTasks.find((t: any) => String(t?.id) === String(targetId));
        if (!task) {
          throw new Error("That task is no longer available.");
        }
        projectId = cleanStr(task.projectId);
      } else {
        projectId = String(targetId);
        // Pick the newest task in this project that the user can see.
        const tasksInProject = safeTasks
          .filter((t: any) => String(t?.projectId) === projectId)
          .sort(
            (a: any, b: any) =>
              getMs(b?.createdAt) - getMs(a?.createdAt),
          );
        task = tasksInProject[0] || null;
        if (!task) {
          throw new Error(
            "This project has no tasks yet, so there's nowhere to post the message. Tag a task instead.",
          );
        }
      }

            // GLOBAL FIX (visibility mismatch): TaskDetailPanel reads comments from
      //   workspaces/{wsId}/tasks/{sourceTaskId}/comments
      // where sourceTaskId = originalTaskId || sharedTaskId || id.
      // The Conversations write MUST target that SAME canonical id, otherwise
      // for shared/duplicated tasks the comment is written under the local id
      // and the panel (reading the original id) never sees it. Mirror the
      // panel's exact resolution order here.
      const taskId = cleanStr(
        (task as any).originalTaskId ||
          (task as any).sharedTaskId ||
          task.id,
      );

      // The workspace the canonical task actually lives in. Prefer the task's
      // own workspaceId (set on shared tasks) and fall back to the active one,
      // matching TaskDetailPanel.taskWorkspaceId.
      const canonicalWsId = cleanStr((task as any).workspaceId) || wsId;

            // GLOBAL: stamp the parent task's shared emails (lowercased) onto the
      // comment so collectionGroup reads can authorize guests without a parent
      // get(). Pull from every shared-email field the task model may use.
           // GLOBAL: stamp EVERY participant email (lowercased) onto the comment so
      // the collectionGroup `array-contains` query authorizes and returns this
      // comment for the owner AND every guest. This MUST include the author's
      // own email + the task owner/creator email, otherwise that person's own
      // `array-contains <myEmail>` query would never match their own comment.
          // GLOBAL FIX (visibility): the comment is only visible to a participant
      // whose lowercased email is in sharedEmailsLower (that's how the
      // collectionGroup array-contains read authorizes/returns it). The old
      // version pulled from task field names that don't reliably exist, so the
      // array often collapsed to just the author's own email — making the
      // comment invisible to everyone else (including the task owner).
      //
      // Source of truth here is the SAME live data the feed already resolves:
      // workspace members + workspace people (External Guests). We collect every
      // email those carry, then add the task's own email-ish fields and the
      // author, so every real participant ends up in the array. This is global
      // and account-agnostic, exposes nothing new, and changes no UI.
      const safePeopleForShare = Array.isArray(workspacePeople)
        ? workspacePeople
        : [];
      const safeMembersForShare = Array.isArray(members) ? members : [];

      const sharedEmailsLower = Array.from(
        new Set(
          [
            // Task-level email fields (kept for backward compatibility).
            ...(Array.isArray((task as any).sharedWithEmails)
              ? (task as any).sharedWithEmails
              : []),
            ...(Array.isArray((task as any).sharedEmails)
              ? (task as any).sharedEmails
              : []),
            ...(Array.isArray((task as any).guestEmails)
              ? (task as any).guestEmails
              : []),
            (task as any).ownerEmail,
            (task as any).createdByEmail,

            // Every workspace member's email (covers the owner + teammates).
            ...safeMembersForShare.flatMap((m: any) => [
              m?.email,
              m?.emailLower,
              m?.invitedEmail,
              m?.acceptedByEmail,
            ]),

            // Every External Guest's email (covers shared-task guests).
            ...safePeopleForShare.flatMap((p: any) => [
              p?.email,
              p?.emailLower,
              p?.invitedEmail,
              p?.invitedEmailLower,
              p?.acceptedByEmail,
            ]),

            // The current author — guarantees they always see their own comment.
            user?.email,
          ]
            .map((e: any) => cleanStr(e).toLowerCase())
            .filter(Boolean),
        ),
      );


      const project = safeProjects.find(
        (p: any) => String(p?.id) === projectId,
      );

      const authorName = cleanStr(user?.displayName || user?.email || "User");
      const nowMs = Date.now();

            const commentsRef = collection(
        db,
        "workspaces",
        canonicalWsId,
        "tasks",
        taskId,
        "comments",
      );


      // Same comment shape as TaskDetailPanel.handleSend.
      const commentPayload = stripUndefined({
        text: safeText,
        authorId: uid,
        authorName,
        authorEmail: cleanStr(user?.email),
        authorPhotoURL: "",
                workspaceId: canonicalWsId,
        taskId,
        // Self-authorizing field for guest collectionGroup reads.
        sharedEmailsLower,

        createdAt: serverTimestamp(),
        createdAtMs: nowMs,
        clientCreatedAt: new Date(nowMs).toISOString(),

        editedAt: null,
        editedBy: "",
        mentions: [],
        mentionedUids: [],
        attachments: [],

        // Flag where this message originated, for future Phase 4 use.
        source: "conversations",

        pinned: false,
        pinnedAt: null,
        pinnedBy: "",
      });

      const commentDocRef = await addDoc(commentsRef, commentPayload);

      // Resolve task notification recipients the same way the panel does:
      // task owner/creator, assignee ids, member/participant arrays, plus
      // every active workspace member.
      const recipientUids = new Set<string>();

      const addUid = (value?: unknown) => {
        const clean = cleanStr(value);
        if (!clean || clean.includes("/")) return;
        if (clean === uid) return;
        recipientUids.add(clean);
      };
      const addUidArray = (value?: unknown) => {
        if (!Array.isArray(value)) return;
        value.forEach(addUid);
      };

      addUid(task.ownerId);
      addUid(task.createdBy);
      addUid(task.uid);
      addUid(task.userId);
      addUid(task.assigneeId);
      addUid(task.assigneeUid);
      addUid(task.assignedToId);
      addUid(task.assignedToUid);
      addUidArray(task.assigneeIds);
      addUidArray(task.memberIds);
      addUidArray(task.participantIds);
      addUidArray(task.collaboratorUids);
      addUidArray(task.sharedWithUids);

      if (project) {
        addUid((project as any).ownerId);
        addUid((project as any).createdBy);
        addUid((project as any).uid);
        addUidArray((project as any).memberIds);
        addUidArray((project as any).collaboratorUids);
      }

      // Every active workspace member is a participant of the workspace.
      const safeMembers = Array.isArray(members) ? members : [];
      safeMembers.forEach((m: any) => {
        const status = String(m?.status || "").toLowerCase();
        if (
          status &&
          !["active", "accepted", "owner", "admin", "member"].includes(status)
        ) {
          return;
        }
        addUid(m?.uid);
        addUid(m?.userId);
        addUid(m?.id);
        addUid(m?.memberId);
        addUid(m?.acceptedByUid);
      });

      const taskMemberUids = Array.from(recipientUids);

      try {
            await createCommentNotifications({
          workspaceId: canonicalWsId,
          projectId,
          taskId,
          sourceTaskId: taskId,
          commentId: commentDocRef.id,
          taskTitle: cleanStr(task.title) || "Untitled task",
          projectName: cleanStr((project as any)?.name),
          commentText: safeText,
          authorId: uid,
          authorName,
          authorPhotoURL: "",
          mentionedUids: [],
          taskMemberUids,
        });
      } catch (notifyErr) {
        // The comment is already written; a notification failure must not
        // surface as a posting failure to the user.
        console.warn(
          "[useConversations] notification fan-out failed:",
          (notifyErr as any)?.message || notifyErr,
        );
      }

      return { taskId, commentId: commentDocRef.id };
    },
    [user?.uid, user?.email, user?.displayName, workspaceId, allTasks, allProjects, members],
  );

  return {
    items,
    loading,
    projectOptions,
    taskOptions,
    counts,
    postConversationMessage,
  };
}


