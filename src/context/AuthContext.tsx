import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  User,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import {
  doc,
  setDoc,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";
import { auth, db } from "../lib/firebase/config";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  signOut: () => Promise<void>;
  signOutUser: () => Promise<void>;
  workspaceId: string | null;
  setWorkspaceId: (id: string) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signInWithGoogle: async () => {},
  logout: async () => {},
  signOut: async () => {},
  signOutUser: async () => {},
  workspaceId: null,
  setWorkspaceId: () => {},
});

/**
 * Ensures the workspace document AND the owner's member doc exist
 * for the given workspaceId. Safe to call on every sign-in: it only
 * writes what is missing. This is what guarantees no user ever lands
 * in a workspace with a missing members subcollection.
 */
async function ensureWorkspaceAndMembership(
  firebaseUser: User,
  workspaceId: string
): Promise<void> {
  if (!firebaseUser?.uid || !workspaceId) return;

  const displayName =
    firebaseUser.displayName ??
    firebaseUser.email?.split("@")[0] ??
    "Owner";

  const wsRef = doc(db, "workspaces", workspaceId);
  const memberRef = doc(
    db,
    "workspaces",
    workspaceId,
    "members",
    firebaseUser.uid
  );

  try {
    const wsSnap = await getDoc(wsRef);

    /**
     * CASE 1:
     * Workspace does not exist.
     * This is a brand-new personal workspace, so this signed-in user
     * is allowed to become the owner.
     */
    if (!wsSnap.exists()) {
      await setDoc(wsRef, {
        id: workspaceId,
        workspaceId,
        name: `${displayName}'s Workspace`,
        ownerId: firebaseUser.uid,
        ownerEmail: firebaseUser.email ?? "",
        plan: "free",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        memberCount: 1,
        taskLimit: 50,
        projectLimit: 3,
        seatLimit: 1,
        usedSeats: 1,
        billingMode: "manual",
        subscriptionSource: "manual",
        subscriptionStatus: "free",
        externalGuestLimit: 0,
      });

      await setDoc(
        memberRef,
        {
          userId: firebaseUser.uid,
          displayName,
          email: firebaseUser.email ?? "",
          photoURL: firebaseUser.photoURL ?? "",
          avatar: displayName[0]?.toUpperCase() ?? "O",
          avatarColor: "#8b5cf6",
          role: "owner",
          status: "active",
          workspaceId,
          joinedAt: serverTimestamp(),
          lastActive: serverTimestamp(),
          permissions: {
            canEdit: true,
            canDelete: true,
            canInvite: true,
            canCreateProjects: true,
            canDeleteProjects: true,
            canInviteMembers: true,
            canManageTasks: true,
          },
        },
        { merge: true }
      );

      console.log("[Auth] 🆕 Created new workspace + owner member:", workspaceId);
      return;
    }

    const wsData = wsSnap.data();
    const isWorkspaceOwner = wsData?.ownerId === firebaseUser.uid;

    /**
     * CASE 2:
     * Workspace exists and this signed-in user is the real owner.
     * Safe to heal/create their owner member document.
     */
    if (isWorkspaceOwner) {
      await setDoc(
        memberRef,
        {
          userId: firebaseUser.uid,
          displayName,
          email: firebaseUser.email ?? "",
          photoURL: firebaseUser.photoURL ?? "",
          avatar: displayName[0]?.toUpperCase() ?? "O",
          avatarColor: "#8b5cf6",
          role: "owner",
          status: "active",
          workspaceId,
          lastActive: serverTimestamp(),
          permissions: {
            canEdit: true,
            canDelete: true,
            canInvite: true,
            canCreateProjects: true,
            canDeleteProjects: true,
            canInviteMembers: true,
            canManageTasks: true,
          },
        },
        { merge: true }
      );

      console.log("[Auth] ✅ Verified owner membership:", workspaceId);
      return;
    }

    /**
     * CASE 3:
     * Workspace exists but this signed-in user is NOT the owner.
     * Do NOT auto-create them as owner.
     * Invited users must be created by JoinWorkspacePage using the role from invite.
     */
    const memberSnap = await getDoc(memberRef);

    if (memberSnap.exists()) {
      await setDoc(
        memberRef,
        {
          userId: firebaseUser.uid,
          displayName,
          email: firebaseUser.email ?? "",
          photoURL: firebaseUser.photoURL ?? "",
          lastActive: serverTimestamp(),
        },
        { merge: true }
      );

      console.log("[Auth] ✅ Verified existing non-owner membership:", workspaceId);
    } else {
      console.warn(
        "[Auth] ⚠️ Non-owner has no member doc. Skipping auto-create. Invite acceptance must create it.",
        {
          workspaceId,
          ownerId: wsData?.ownerId,
          currentUid: firebaseUser.uid,
        }
      );
    }
  } catch (err: any) {
    console.warn(
      "[Auth] ⚠️ ensureWorkspaceAndMembership skipped/failed:",
      err?.code || err
    );
  }
}



async function ensureUserProfile(firebaseUser: User): Promise<string> {
  try {
    const userRef = doc(db, "users", firebaseUser.uid);
    const snap = await getDoc(userRef);

    // RULE 1 — Existing user with a workspaceId: keep it.
    if (snap.exists() && snap.data().workspaceId) {
      const existingWid = snap.data().workspaceId as string;

      await setDoc(
        userRef,
        {
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName ?? "",
          email: firebaseUser.email ?? "",
          photoURL: firebaseUser.photoURL ?? "",
          plan: snap.data().plan ?? "free",
          updatedAt: serverTimestamp(),
          workspaceId: existingWid,
        },
        { merge: true }
      );

      // Self-heal: make sure the workspace doc and owner member doc exist.
      await ensureWorkspaceAndMembership(firebaseUser, existingWid);

      console.log(
        "[Auth] ✅ Existing user — keeping workspaceId:",
        existingWid
      );
      return existingWid;
    }

    // RULE 2 — Pending invite: don't generate a workspace yet.
    const pendingCode = localStorage.getItem("pendingInviteCode");
    if (pendingCode) {
      console.log(
        "[Auth] 🎫 Pending invite found in localStorage:",
        pendingCode
      );
      await setDoc(
        userRef,
        {
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName ?? "",
          email: firebaseUser.email ?? "",
          photoURL: firebaseUser.photoURL ?? "",
          plan: "free",
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      return ""; // JoinWorkspacePage will set the real workspaceId
    }

    // RULE 3 — Brand new user: generate workspace + member doc.
    const workspaceId =
      "WF-" + String(Math.floor(Math.random() * 900) + 100);

    await setDoc(
      userRef,
      {
        uid: firebaseUser.uid,
        displayName: firebaseUser.displayName ?? "",
        email: firebaseUser.email ?? "",
        photoURL: firebaseUser.photoURL ?? "",
        plan: "free",
        updatedAt: serverTimestamp(),
        workspaceId,
      },
      { merge: true }
    );

    await ensureWorkspaceAndMembership(firebaseUser, workspaceId);

    console.log(
      "[Auth] ✅ New user — generated workspaceId:",
      workspaceId
    );
    return workspaceId;
  } catch (err) {
    console.error("[Auth] ❌ ensureUserProfile failed:", err);
    return "";
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const wid = await ensureUserProfile(firebaseUser);
        setWorkspaceId(wid || null);
        setUser(firebaseUser);
        setLoading(false);
        console.log(
          "[Auth] ✅ Signed in:",
          firebaseUser.uid,
          "| workspace:",
          wid
        );
      } else {
        setWorkspaceId(null);
        setUser(null);
        setLoading(false);
        console.log("[Auth] User signed out");
      }
    });

    return () => unsub();
  }, []);

  async function signInWithGoogle(): Promise<void> {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await signInWithPopup(auth, provider);
  }

  async function logout(): Promise<void> {
    await firebaseSignOut(auth);
    console.log("[Auth] ✅ Signed out");
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        workspaceId,
        setWorkspaceId,
        signInWithGoogle,
        logout,
        signOut: logout,
        signOutUser: logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  return useContext(AuthContext);
}
