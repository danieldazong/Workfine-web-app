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

  /**
   * First self-heal the owner member doc.
   * This is critical because workspace reads depend on:
   * workspaces/{workspaceId}/members/{uid}
   */
  try {
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

    console.log(
      "[Auth] 🛠️ Created/healed owner member doc for workspace:",
      workspaceId
    );
  } catch (err: any) {
    console.warn(
      "[Auth] ⚠️ Owner member self-heal failed:",
      err?.code || err
    );
  }

  /**
   * Then ensure workspace doc exists.
   */
  try {
    const wsSnap = await getDoc(wsRef);

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

      console.log("[Auth] 🆕 Created missing workspace doc:", workspaceId);
    } else {
      const data = wsSnap.data();

      if (data?.ownerId === firebaseUser.uid) {
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

        console.log(
          "[Auth] ✅ Verified owner membership for workspace:",
          workspaceId
        );
      }
    }
  } catch (err: any) {
    console.warn(
      "[Auth] ⚠️ Workspace verification failed:",
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
