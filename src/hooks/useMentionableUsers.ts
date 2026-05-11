import { useMemo } from "react";

export interface MentionableUser {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
}

/**
 * Returns the list of users the current user can @-mention.
 *
 * PHASE 1 (current): returns [] until the Workspace / Shared Projects feature
 * is built. The composer will show a friendly empty state.
 *
 * PHASE 2 (next): will read from:
 *   - users/{uid}/workspaceMembers   (workspace members)
 *   - projects/{projectId}/members   (shared project collaborators)
 * and merge/dedupe them by user id.
 */
export function useMentionableUsers(_projectId?: string): MentionableUser[] {
  // TODO Phase 2: replace with real Firestore listener.
  // Example future implementation:
  //   const { user } = useAuth();
  //   const [members, setMembers] = useState<MentionableUser[]>([]);
  //   useEffect(() => onSnapshot(...), [user?.uid, projectId]);
  //   return members;
  return useMemo(() => [], []);
}
