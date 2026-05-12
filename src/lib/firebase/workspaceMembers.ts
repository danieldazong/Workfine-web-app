import {
  doc,
  updateDoc,
  deleteDoc,
  getDoc,
  setDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "./config";

export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

/**
 * Update a member's role and permissions in a workspace.
 */
export async function updateMemberRole(
  workspaceId: string,
  userId: string,
  newRole: WorkspaceRole
): Promise<void> {
  const memberRef = doc(db, "workspaces", workspaceId, "members", userId);

  const canEdit   = newRole === "owner" || newRole === "admin" || newRole === "member";
  const canDelete = newRole === "owner" || newRole === "admin";
  const canInvite = newRole === "owner" || newRole === "admin";

  await updateDoc(memberRef, {
    role: newRole,
    permissions: { canEdit, canDelete, canInvite },
    lastActive: serverTimestamp(),
  });
}

/**
 * Remove a member from a workspace and reset their workspaceId to a personal one.
 */
export async function removeMember(
  workspaceId: string,
  userId: string
): Promise<void> {
  // 1. Delete member document
  await deleteDoc(doc(db, "workspaces", workspaceId, "members", userId));

  // 2. Reset user's workspaceId to a personal workspace ID
  try {
    const userRef  = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const personalId = `WF-${userId.slice(0, 6)}`;
      await setDoc(
        userRef,
        { workspaceId: personalId, updatedAt: serverTimestamp() },
        { merge: true }
      );
    }
  } catch (e) {
    console.warn("[removeMember] could not reset user workspaceId:", e);
  }
}

/**
 * Convenience wrapper for the current user leaving a workspace.
 */
export async function leaveWorkspace(
  workspaceId: string,
  userId: string
): Promise<void> {
  return removeMember(workspaceId, userId);
}

/**
 * Transfer ownership of a workspace to another active member.
 *  - The new owner is promoted to role: "owner" with full permissions.
 *  - The previous owner is demoted to role: "admin".
 *  - The workspace document's ownerId / ownerEmail are updated.
 */
export async function transferOwnership(
  workspaceId: string,
  currentOwnerId: string,
  newOwnerId: string,
  newOwnerEmail?: string
): Promise<void> {
  if (currentOwnerId === newOwnerId) {
    throw new Error("You're already the owner of this workspace.");
  }

  const workspaceRef   = doc(db, "workspaces", workspaceId);
  const currentOwnerRef = doc(db, "workspaces", workspaceId, "members", currentOwnerId);
  const newOwnerRef    = doc(db, "workspaces", workspaceId, "members", newOwnerId);

  // Verify the new owner is actually a member
  const newOwnerSnap = await getDoc(newOwnerRef);
  if (!newOwnerSnap.exists()) {
    throw new Error("That user is no longer a member of this workspace.");
  }

  const batch = writeBatch(db);

  // Promote new owner
  batch.update(newOwnerRef, {
    role: "owner",
    permissions: { canEdit: true, canDelete: true, canInvite: true },
    lastActive: serverTimestamp(),
  });

  // Demote previous owner to admin
  batch.update(currentOwnerRef, {
    role: "admin",
    permissions: { canEdit: true, canDelete: true, canInvite: true },
    lastActive: serverTimestamp(),
  });

  // Update workspace document
  const wsUpdate: Record<string, any> = {
    ownerId: newOwnerId,
    updatedAt: serverTimestamp(),
  };
  if (newOwnerEmail) wsUpdate.ownerEmail = newOwnerEmail;

  batch.update(workspaceRef, wsUpdate);

  await batch.commit();
}
