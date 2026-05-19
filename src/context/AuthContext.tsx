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
  setWorkspaceId: (id: string | null) => void;
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

function normalizeEmail(email?: string | null): string {
  return String(email || "").trim().toLowerCase();
}

function getAuthDisplayName(firebaseUser: User): string {
  return (
    firebaseUser.displayName ||
    firebaseUser.providerData.find((provider) => provider.displayName)
      ?.displayName ||
    firebaseUser.email?.split("@")[0] ||
    "User"
  );
}

function getAuthPhotoURL(firebaseUser: User): string {
  const googleProviderPhoto =
    firebaseUser.providerData.find(
      (provider) => provider.providerId === "google.com"
    )?.photoURL || "";

  return googleProviderPhoto || firebaseUser.photoURL || "";
}

function getAuthEmail(firebaseUser: User): string {
  return firebaseUser.email || "";
}

function getAvatarInitial(displayName: string, email: string): string {
  const source = displayName || email || "U";
  return source.trim()[0]?.toUpperCase() || "U";
}

function buildUserProfilePayload(firebaseUser: User) {
  const displayName = getAuthDisplayName(firebaseUser);
  const email = getAuthEmail(firebaseUser);
  const emailLower = normalizeEmail(email);
  const photoURL = getAuthPhotoURL(firebaseUser);

  return {
    uid: firebaseUser.uid,
    userId: firebaseUser.uid,

    displayName,
    name: displayName,

    email,
    emailLower,
    email_lowercase: emailLower,

    photoURL,
    avatarUrl: photoURL,
    avatarURL: photoURL,
    googlePhotoURL: photoURL,

    avatar: getAvatarInitial(displayName, email),
    avatarColor: "#8b5cf6",

    providerId:
      firebaseUser.providerData.find(
        (provider) => provider.providerId === "google.com"
      )?.providerId ||
      firebaseUser.providerId ||
      "firebase",

    updatedAt: serverTimestamp(),
    lastActive: serverTimestamp(),
  };
}

/**
 * Ensures the workspace document AND the owner's member doc exist
 * for the given workspaceId.
 *
 * Also refreshes the real Google avatar into the workspace member profile.
 */
async function ensureWorkspaceAndMembership(
  firebaseUser: User,
  workspaceId: string
): Promise<void> {
  if (!firebaseUser?.uid || !workspaceId) return;

  const profilePayload = buildUserProfilePayload(firebaseUser);
  const displayName = profilePayload.displayName;
  const email = profilePayload.email;

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
     * This is a brand-new personal workspace.
     */
    if (!wsSnap.exists()) {
      await setDoc(wsRef, {
        id: workspaceId,
        workspaceId,
        name: `${displayName}'s Workspace`,

        ownerId: firebaseUser.uid,
        ownerEmail: email,
        ownerEmailLower: normalizeEmail(email),
        ownerPhotoURL: profilePayload.photoURL,
        ownerAvatarUrl: profilePayload.avatarUrl,

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
          ...profilePayload,
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
     */
    if (isWorkspaceOwner) {
      await setDoc(
        memberRef,
        {
          ...profilePayload,
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

      await setDoc(
        wsRef,
        {
          ownerEmail: email,
          ownerEmailLower: normalizeEmail(email),
          ownerPhotoURL: profilePayload.photoURL,
          ownerAvatarUrl: profilePayload.avatarUrl,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      console.log("[Auth] ✅ Verified owner membership:", workspaceId);
      return;
    }

    /**
     * CASE 3:
     * Workspace exists but this signed-in user is NOT the owner.
     * Do not auto-create member docs here.
     * JoinWorkspacePage must create invited member docs.
     */
    const memberSnap = await getDoc(memberRef);

    if (memberSnap.exists()) {
      await setDoc(
        memberRef,
        {
          ...profilePayload,
          workspaceId,
          lastActive: serverTimestamp(),
        },
        { merge: true }
      );

      console.log("[Auth] ✅ Verified existing non-owner membership:", workspaceId);
    } else {
      console.warn(
        "[Auth] ⚠️ Non-owner has no member doc. Invite acceptance must create it.",
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

    const profilePayload = buildUserProfilePayload(firebaseUser);

    /**
     * RULE 1:
     * Existing user with a workspaceId: keep it.
     */
    if (snap.exists() && snap.data().workspaceId) {
      const existingWid = snap.data().workspaceId as string;

      await setDoc(
        userRef,
        {
          ...profilePayload,
          plan: snap.data().plan ?? "free",
          workspaceId: existingWid,
          personalWorkspaceId: snap.data().personalWorkspaceId ?? existingWid,
          updatedAt: serverTimestamp(),
          lastActive: serverTimestamp(),
        },
        { merge: true }
      );

      await ensureWorkspaceAndMembership(firebaseUser, existingWid);

      console.log("[Auth] ✅ Existing user — keeping workspaceId:", existingWid);

      return existingWid;
    }

    /**
     * RULE 2:
     * Pending invite: do not generate a workspace yet.
     * JoinWorkspacePage will set the real workspaceId.
     */
    const pendingCode = localStorage.getItem("pendingInviteCode");

    if (pendingCode) {
      console.log("[Auth] 🎫 Pending invite found:", pendingCode);

      await setDoc(
        userRef,
        {
          ...profilePayload,
          plan: "free",
          updatedAt: serverTimestamp(),
          lastActive: serverTimestamp(),
        },
        { merge: true }
      );

      return "";
    }

    /**
     * RULE 3:
     * Brand new user: generate personal workspace.
     */
    const workspaceId =
      "WF-" + String(Math.floor(Math.random() * 900) + 100);

    await setDoc(
      userRef,
      {
        ...profilePayload,
        plan: "free",
        workspaceId,
        personalWorkspaceId: workspaceId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastActive: serverTimestamp(),
      },
      { merge: true }
    );

    await ensureWorkspaceAndMembership(firebaseUser, workspaceId);

    console.log("[Auth] ✅ New user — generated workspaceId:", workspaceId);

    return workspaceId;
  } catch (err) {
    console.error("[Auth] ❌ ensureUserProfile failed:", err);
    return "";
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [workspaceId, setWorkspaceIdState] = useState<string | null>(null);

  const setWorkspaceId = (id: string | null) => {
    setWorkspaceIdState(id);
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          const wid = await ensureUserProfile(firebaseUser);

          setWorkspaceIdState(wid || null);
          setUser(firebaseUser);

          console.log(
            "[Auth] ✅ Signed in:",
            firebaseUser.uid,
            "| workspace:",
            wid
          );
        } else {
          setWorkspaceIdState(null);
          setUser(null);

          console.log("[Auth] User signed out");
        }
      } catch (error) {
        console.error("[Auth] auth state error:", error);
        setWorkspaceIdState(null);
        setUser(firebaseUser || null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  async function signInWithGoogle(): Promise<void> {
    const provider = new GoogleAuthProvider();

    provider.addScope("profile");
    provider.addScope("email");

    provider.setCustomParameters({
      prompt: "select_account",
    });

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
