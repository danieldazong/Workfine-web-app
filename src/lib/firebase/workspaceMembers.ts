import {
  doc,
  updateDoc,
  deleteDoc,
  getDoc,
  setDoc,
  serverTimestamp,
  collection,
  getDocs,
} from "firebase/firestore";
import { db } from "./config";

export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

/**
 * Update a member's role inside a workspace.
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
 * Remove a member from a workspace and bump them to their personal workspace.
 */
export async function removeMember(
  workspaceId: string,
  userId: string
): Promise<void> {
  await deleteDoc(doc(db, "workspaces", workspaceId, "members", userId));

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
    console.warn("[removeMember] could not reset user workspace:", e);
  }
}

/**
 * Current user leaves a workspace.
 * Owners cannot leave — they must delete the workspace instead.
 */
export async function leaveWorkspace(
  workspaceId: string,
  userId: string
): Promise<void> {
  await removeMember(workspaceId, userId);
}

/**
 * Permanently delete a workspace (owner only).
 * Wipes members, workspace invites, matching global invites, and the workspace doc.
 * Does NOT delete projects or tasks (those belong to users individually).
 */
export async function deleteWorkspace(workspaceId: string): Promise<void> {
  const membersSnap = await getDocs(collection(db, "workspaces", workspaceId, "members"));
  const memberUids  = membersSnap.docs.map((d) => d.id);

  const invitesSnap = await getDocs(collection(db, "workspaces", workspaceId, "invites"));
  const inviteCodes = invitesSnap.docs.map((d) => d.id);

  // reset each member to their personal workspace
  for (const uid of memberUids) {
    try {
      const userRef  = doc(db, "users", uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) continue;
      const data = userSnap.data() as any;
      const personalWsId = data.personalWorkspaceId ?? `personal-${uid.slice(0, 8)}`;
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
    } catch (e) {
      console.warn("[deleteWorkspace] could not reset user", uid, e);
    }
  }

  // delete members
  await Promise.all(
    memberUids.map((uid) =>
      deleteDoc(doc(db, "workspaces", workspaceId, "members", uid))
    )
  );

  // delete both invite paths
  await Promise.all(
    inviteCodes.flatMap((code) => [
      deleteDoc(doc(db, "workspaces", workspaceId, "invites", code)),
      deleteDoc(doc(db, "invites", code)),
    ])
  );

  // finally, the workspace itself
  await deleteDoc(doc(db, "workspaces", workspaceId));
}
