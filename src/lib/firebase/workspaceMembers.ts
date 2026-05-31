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
import { deriveWorkspaceDisplayId } from "./users";


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

    const isOwnerOrAdmin = newRole === "owner" || newRole === "admin";
  const isMember = newRole === "member";
  const isViewer = newRole === "viewer";

  await updateDoc(memberRef, {
    role: newRole,
    permissions: {
      canView: true,
      canComment: isOwnerOrAdmin || isMember,
      canEdit: isOwnerOrAdmin,
      canDelete: isOwnerOrAdmin,
      canInvite: isOwnerOrAdmin,
      canCreateProjects: isOwnerOrAdmin,
      canDeleteProjects: isOwnerOrAdmin,
      canInviteMembers: isOwnerOrAdmin,
      canManageTasks: isOwnerOrAdmin,
      canViewOnly: isViewer,
    },
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

  try {
    const userSnapForEmail = await getDoc(doc(db, "users", userId));
    const emailLower = String(
      userSnapForEmail.exists()
        ? userSnapForEmail.data().emailLower ||
            userSnapForEmail.data().email_lowercase ||
            userSnapForEmail.data().email ||
            ""
        : ""
    )
      .trim()
      .toLowerCase();

    if (emailLower) {
      await deleteDoc(doc(db, "workspaces", workspaceId, "members", emailLower));
    }
  } catch (e) {
    console.warn("[removeMember] could not remove legacy email member doc:", e);
  }


  // 2. Reset user's workspaceId to a personal workspace ID
  try {
    const userRef  = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
            const personalId =
        (userSnap.data().personalWorkspaceId as string | undefined) ||
        `personal_${userId}`;

        await setDoc(
        userRef,
        {
          workspaceId: personalId,
          personalWorkspaceId: personalId,
          workspaceDisplayId: deriveWorkspaceDisplayId(userId),
          lastRemovedFromWorkspaceId: workspaceId,
          removedFromWorkspaceAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
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

    // Demote previous owner to admin
  batch.update(currentOwnerRef, {
    role: "admin",
    permissions: {
      canView: true,
      canComment: true,
      canEdit: true,
      canDelete: true,
      canInvite: true,
      canCreateProjects: true,
      canDeleteProjects: true,
      canInviteMembers: true,
      canManageTasks: true,
      canViewOnly: false,
    },

    lastActive: serverTimestamp(),
  });

  // Promote new owner
  batch.update(newOwnerRef, {
    role: "owner",
        permissions: {
      canView: true,
      canComment: true,
      canEdit: true,
      canDelete: true,
      canInvite: true,
      canCreateProjects: true,
      canDeleteProjects: true,
      canInviteMembers: true,
      canManageTasks: true,
      canViewOnly: false,
    },

    lastActive: serverTimestamp(),
  });

  // Update workspace document
  const wsUpdate: Record<string, any> = {
    ownerId: newOwnerId,
    updatedAt: serverTimestamp(),
  };
    if (newOwnerEmail) {
    wsUpdate.ownerEmail = newOwnerEmail;
    wsUpdate.ownerEmailLower = String(newOwnerEmail).trim().toLowerCase();
  }


  batch.update(workspaceRef, wsUpdate);

  await batch.commit();
}
