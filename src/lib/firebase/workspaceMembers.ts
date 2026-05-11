import {
  doc,
  updateDoc,
  deleteDoc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./config";

export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

/**
 * Update a member's role inside a workspace.
 * Also updates their permissions block to match the new role.
 */
export async function updateMemberRole(
  workspaceId: string,
  userId: string,
  newRole: WorkspaceRole
): Promise<void> {
  const memberRef = doc(db, "workspaces", workspaceId, "members", userId);

  await updateDoc(memberRef, {
    role: newRole,
    permissions: {
      canCreateProjects: newRole !== "viewer",
      canDeleteProjects: newRole === "admin" || newRole === "owner",
      canInviteMembers:  newRole === "admin" || newRole === "owner",
      canManageTasks:    newRole !== "viewer",
    },
    lastActive: serverTimestamp(),
  });
}

/**
 * Remove a member from a workspace.
 * Also resets that user's workspaceId so the eviction detector in
 * AppDataContext switches them to their personal workspace on next snapshot.
 */
export async function removeMember(
  workspaceId: string,
  userId: string
): Promise<void> {
  // 1) delete the member doc
  await deleteDoc(doc(db, "workspaces", workspaceId, "members", userId));

  // 2) bump the removed user back to their personal workspace
  //    (the eviction detector in AppDataContext will pick this up via onSnapshot)
  try {
    const userRef  = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const data = userSnap.data() as any;
      const personalWsId =
        data.personalWorkspaceId ?? `personal-${userId.slice(0, 8)}`;

      await setDoc(
        userRef,
        {
          workspaceId: personalWsId,
          personalWorkspaceId: personalWsId,
          lastRemovedFromWorkspaceId: workspaceId,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  } catch (e) {
    // Non-fatal — the member doc is already deleted; the eviction
    // detector in AppDataContext will still kick the user out.
    console.warn("[removeMember] could not reset user workspace:", e);
  }
}
