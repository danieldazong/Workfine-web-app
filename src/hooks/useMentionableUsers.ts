import { useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { useAppData } from "../context/AppDataContext";

export interface MentionableUser {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  photoURL?: string;
  googlePhotoURL?: string;
  providerPhotoURL?: string;
}

interface UseMentionableUsersOptions {
  task?: any;
  taskShares?: any[];
  members?: any[];
  includeCurrentUser?: boolean;
}

function normalizeEmail(email?: string | null): string {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function cleanString(value?: any): string {
  return String(value || "").trim();
}

function getMemberUid(member: any): string {
  return cleanString(
    member?.userId ||
      member?.uid ||
      member?.id ||
      member?.memberId ||
      member?.userUid,
  );
}

function getMemberEmail(member: any): string {
  return normalizeEmail(
    member?.email ||
      member?.emailLower ||
      member?.emailAddress ||
      member?.invitedEmail ||
      member?.sharedWithEmail,
  );
}

function getMemberName(member: any, fallbackEmail = ""): string {
  const email = fallbackEmail || getMemberEmail(member);

  return (
    cleanString(
      member?.displayName ||
        member?.name ||
        member?.fullName ||
        member?.username ||
        member?.acceptedByName ||
        member?.sharedByName ||
        member?.invitedByName,
    ) ||
    (email ? email.split("@")[0] : "") ||
    "User"
  );
}

function getMemberPhoto(member: any): string {
  return cleanString(
    member?.photoURL ||
      member?.avatarUrl ||
      member?.avatar ||
      member?.googlePhotoURL ||
      member?.providerPhotoURL ||
      member?.authPhotoURL,
  );
}

/**
 * Returns users the current user can @-mention.
 *
 * Includes:
 * - active workspace members
 * - project members
 * - task assignee / task participants
 * - accepted / active task share users
 */
export function useMentionableUsers(
  projectId?: string,
  options: UseMentionableUsersOptions = {},
): MentionableUser[] {
  const { user } = useAuth();
  const { members: contextMembers = [], projects = [] } = useAppData() as any;

  const optionMembers = options.members;
  const optionTask = options.task;
  const optionTaskShares = options.taskShares;
  const includeCurrentUser = options.includeCurrentUser === true;

  return useMemo(() => {
    const currentUid = cleanString(user?.uid);
    const currentEmail = normalizeEmail(user?.email);

    const sourceMembers = Array.isArray(optionMembers)
      ? optionMembers
      : Array.isArray(contextMembers)
        ? contextMembers
        : [];

    const taskShares = Array.isArray(optionTaskShares)
      ? optionTaskShares
      : [];

    const project = projectId
      ? projects.find((p: any) => p.id === projectId)
      : null;

    const projectUserIds = new Set<string>([
      ...(((project as any)?.memberIds as string[]) || []),
      ...(((project as any)?.collaboratorUids as string[]) || []),
      ...(((project as any)?.userIds as string[]) || []),
      ...(((project as any)?.members as string[]) || []),
    ].map((id) => cleanString(id)).filter(Boolean));

    const unique = new Map<
      string,
      MentionableUser & {
        rank: number;
      }
    >();

    function addCandidate(raw: any, rank = 10) {
      const uid = cleanString(
        raw?.uid ||
          raw?.userId ||
          raw?.id ||
          raw?.memberId ||
          raw?.acceptedByUid ||
          raw?.acceptedBy ||
          raw?.sharedByUid ||
          raw?.invitedBy,
      );

      const email = normalizeEmail(
        raw?.email ||
          raw?.emailLower ||
          raw?.emailAddress ||
          raw?.acceptedByEmail ||
          raw?.sharedWithEmail ||
          raw?.invitedEmail ||
          raw?.invitedEmailLower,
      );

      const name = getMemberName(raw, email);

      if (!uid && !email && !name) return;

      if (!includeCurrentUser) {
        if (uid && currentUid && uid === currentUid) return;
        if (email && currentEmail && email === currentEmail) return;
      }

      const key = uid ? `uid:${uid}` : email ? `email:${email}` : `name:${name}`;

      const existing = unique.get(key);

      const avatarUrl = getMemberPhoto(raw);

      const nextUser: MentionableUser & {
        rank: number;
      } = {
        id: uid || email || name,
        name,
        email,
        avatarUrl,
        photoURL: avatarUrl,
        googlePhotoURL: cleanString(raw?.googlePhotoURL),
        providerPhotoURL: cleanString(raw?.providerPhotoURL),
        rank,
      };

      if (!existing) {
        unique.set(key, nextUser);
        return;
      }

      unique.set(key, {
        ...existing,
        ...nextUser,
        id: existing.id || nextUser.id,
        name: existing.name || nextUser.name,
        email: existing.email || nextUser.email,
        avatarUrl: existing.avatarUrl || nextUser.avatarUrl,
        photoURL: existing.photoURL || nextUser.photoURL,
        googlePhotoURL: existing.googlePhotoURL || nextUser.googlePhotoURL,
        providerPhotoURL:
          existing.providerPhotoURL || nextUser.providerPhotoURL,
        rank: Math.min(existing.rank, nextUser.rank),
      });
    }

    // 1. Active workspace members.
    sourceMembers.forEach((member: any) => {
      const status = cleanString(member?.status).toLowerCase();

      if (
        status &&
        !["active", "accepted", "owner", "admin", "member"].includes(status)
      ) {
        return;
      }

      const uid = getMemberUid(member);

      const isProjectMember =
        uid && projectUserIds.size > 0 && projectUserIds.has(uid);

      addCandidate(member, isProjectMember ? 0 : 2);
    });

    // 2. Task assignee / task participants from task object.
    const task = optionTask || {};

    const taskAssigneeEmail = normalizeEmail(
      task?.assigneeEmail || task?.assignedToEmail,
    );

    const taskAssigneeUid = cleanString(
      task?.assigneeUid ||
        task?.assigneeId ||
        task?.assignedToUid ||
        task?.assignedToId,
    );

    const taskAssigneeName = cleanString(
      task?.assigneeName ||
        task?.assignedToName ||
        task?.assignee ||
        task?.assignedTo,
    );

    if (taskAssigneeUid || taskAssigneeEmail || taskAssigneeName) {
      addCandidate(
        {
          uid: taskAssigneeUid,
          email: taskAssigneeEmail,
          name: taskAssigneeName,
          displayName: taskAssigneeName,
          photoURL: task?.assigneePhotoURL || task?.assignedToPhotoURL,
        },
        0,
      );
    }

    const taskParticipantIds = [
      ...(((task as any)?.memberIds as string[]) || []),
      ...(((task as any)?.participantIds as string[]) || []),
      ...(((task as any)?.collaboratorUids as string[]) || []),
      ...(((task as any)?.sharedWithUids as string[]) || []),
    ]
      .map((id) => cleanString(id))
      .filter(Boolean);

    taskParticipantIds.forEach((participantUid) => {
      const matchingMember = sourceMembers.find((member: any) => {
        return getMemberUid(member) === participantUid;
      });

      addCandidate(
        matchingMember || {
          uid: participantUid,
          id: participantUid,
          name: participantUid,
        },
        0,
      );
    });

    // 3. Accepted / active task share users.
    taskShares.forEach((share: any) => {
      const status = cleanString(share?.status).toLowerCase();

      if (!["active", "accepted"].includes(status)) {
        return;
      }

      const acceptedUid = cleanString(
        share?.acceptedByUid || share?.acceptedBy,
      );

      const acceptedEmail = normalizeEmail(
        share?.acceptedByEmail ||
          share?.sharedWithEmail ||
          share?.invitedEmail ||
          share?.invitedEmailLower,
      );

      const acceptedName = cleanString(
        share?.acceptedByName ||
          share?.sharedWithName ||
          share?.invitedName ||
          acceptedEmail.split("@")[0],
      );

      addCandidate(
        {
          uid: acceptedUid,
          email: acceptedEmail,
          name: acceptedName,
          displayName: acceptedName,
          photoURL: share?.acceptedByPhotoURL || share?.photoURL,
        },
        1,
      );
    });

    return Array.from(unique.values())
      .sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        return a.name.localeCompare(b.name);
      })
      .map(({ rank, ...user }) => user);
  }, [
    user?.uid,
    user?.email,
    contextMembers,
    optionMembers,
    projects,
    projectId,
    optionTask,
    optionTaskShares,
    includeCurrentUser,
  ]);
}
