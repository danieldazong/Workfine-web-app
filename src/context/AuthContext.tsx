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
): Promise<boolean> {
  if (!firebaseUser?.uid || !workspaceId) return false;

  const profilePayload = buildUserProfilePayload(firebaseUser);
  const displayName = profilePayload.displayName;
  const email = profilePayload.email;
  const uid = firebaseUser.uid;

  const wsRef = doc(db, "workspaces", workspaceId);
  const memberRef = doc(db, "workspaces", workspaceId, "members", uid);

  const isPersonalWorkspace = workspaceId === `personal_${uid}`;

  function isTrustedMemberData(memberData: any): boolean {
    if (!memberData) return false;

    if (memberData.status !== "active") return false;

    const memberUid = memberData.uid || memberData.userId;

    if (memberUid && memberUid !== uid) return false;

    if (memberData.workspaceId && memberData.workspaceId !== workspaceId) {
      return false;
    }

    /**
     * Owner member docs are always trusted.
     */
    if (memberData.role === "owner") return true;

    /**
     * Invited workspace members are trusted if they have any invite proof.
     */
    return (
      typeof memberData.invitedBy === "string" ||
      typeof memberData.invitedByUid === "string" ||
      typeof memberData.inviteCode === "string" ||
      typeof memberData.acceptedInviteCode === "string" ||
      typeof memberData.code === "string" ||
      typeof memberData.createdBy === "string" ||
      typeof memberData.addedBy === "string"
    );
  }

  /**
   * IMPORTANT:
   * First check the current user's member document.
   * Firestore rules allow a user to read their own member doc even before
   * they can read the full workspace. This prevents the app from wrongly
   * resetting invited users back to their personal workspace after refresh.
   */
  try {
    const memberSnap = await getDoc(memberRef);

    if (memberSnap.exists()) {
      const memberData = memberSnap.data();

      if (isTrustedMemberData(memberData)) {
        await setDoc(
          memberRef,
          {
            ...profilePayload,
            uid,
            userId: uid,
            workspaceId,
            status: "active",
            lastActive: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        console.log("[Auth] ✅ Verified workspace membership from member doc:", {
          workspaceId,
          uid,
        });

        return true;
      }

      console.warn("[Auth] ⛔ Member doc exists but is not trusted:", {
        workspaceId,
        uid,
        status: memberData?.status,
        role: memberData?.role,
      });

      return false;
    }
  } catch (memberErr: any) {
    console.warn("[Auth] ⚠️ Could not read own member doc:", {
      workspaceId,
      uid,
      code: memberErr?.code,
      message: memberErr?.message,
    });

    /**
     * Do not immediately reset the user here.
     * We still try the workspace owner path below.
     */
  }

  /**
   * If this is the user's personal workspace, create/repair it.
   */
  if (isPersonalWorkspace) {
    try {
      await setDoc(
        wsRef,
        {
          id: workspaceId,
          workspaceId,
          name: `${displayName}'s Workspace`,

          ownerId: uid,
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
        },
        { merge: true }
      );

      await setDoc(
        memberRef,
        {
          ...profilePayload,
          uid,
          userId: uid,
          role: "owner",
          status: "active",
          workspaceId,

          invitedBy: uid,
          invitedByUid: uid,
          createdBy: uid,

          joinedAt: serverTimestamp(),
          lastActive: serverTimestamp(),
          updatedAt: serverTimestamp(),

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

      console.log("[Auth] ✅ Created/repaired personal workspace:", workspaceId);

      return true;
    } catch (personalErr: any) {
      console.warn("[Auth] ❌ Failed to create/repair personal workspace:", {
        workspaceId,
        uid,
        code: personalErr?.code,
        message: personalErr?.message,
      });

      return false;
    }
  }

  /**
   * For non-personal/team workspaces, only the owner can repair missing
   * owner membership. Normal invited members must already have a member doc.
   */
  try {
    const wsSnap = await getDoc(wsRef);

    if (!wsSnap.exists()) {
      console.warn("[Auth] ⛔ Workspace does not exist:", workspaceId);
      return false;
    }

    const wsData = wsSnap.data();
    const isWorkspaceOwner = wsData?.ownerId === uid;

    if (!isWorkspaceOwner) {
      console.warn("[Auth] ⛔ No valid member doc for non-owner workspace user:", {
        workspaceId,
        uid,
      });

      return false;
    }

    await setDoc(
      memberRef,
      {
        ...profilePayload,
        uid,
        userId: uid,
        role: "owner",
        status: "active",
        workspaceId,

        invitedBy: uid,
        invitedByUid: uid,
        createdBy: uid,

        joinedAt: serverTimestamp(),
        lastActive: serverTimestamp(),
        updatedAt: serverTimestamp(),

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

    console.log("[Auth] ✅ Verified owner workspace membership:", workspaceId);

    return true;
  } catch (workspaceErr: any) {
    console.warn("[Auth] ⚠️ Workspace verification failed:", {
      workspaceId,
      uid,
      code: workspaceErr?.code,
      message: workspaceErr?.message,
    });

    return false;
  }
}

async function ensurePersonalWorkspace(firebaseUser: User): Promise<string> {
  const profilePayload = buildUserProfilePayload(firebaseUser);

  /**
   * IMPORTANT:
   * This must be globally unique per user.
   * Do NOT use random WF-123 IDs because they collide and cause permission bugs.
   */
  const personalWorkspaceId = `personal_${firebaseUser.uid}`;

  const wsRef = doc(db, "workspaces", personalWorkspaceId);
  const memberRef = doc(
    db,
    "workspaces",
    personalWorkspaceId,
    "members",
    firebaseUser.uid
  );
  const userRef = doc(db, "users", firebaseUser.uid);

  await setDoc(
    wsRef,
    {
      id: personalWorkspaceId,
      workspaceId: personalWorkspaceId,
      name: `${profilePayload.displayName}'s Workspace`,

      ownerId: firebaseUser.uid,
      ownerEmail: profilePayload.email,
      ownerEmailLower: profilePayload.emailLower,
      ownerPhotoURL: profilePayload.photoURL,
      ownerAvatarUrl: profilePayload.avatarUrl,

      plan: "free",
      billingMode: "manual",
      subscriptionSource: "manual",
      subscriptionStatus: "free",

      memberCount: 1,
      taskLimit: 50,
      projectLimit: 3,
      seatLimit: 1,
      usedSeats: 1,
      externalGuestLimit: 0,

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await setDoc(
    memberRef,
    {
      ...profilePayload,

      uid: firebaseUser.uid,
      userId: firebaseUser.uid,
      workspaceId: personalWorkspaceId,

      role: "owner",
      status: "active",

      /**
       * This keeps the member doc trusted by the Firestore rules.
       */
      invitedBy: firebaseUser.uid,
      invitedByUid: firebaseUser.uid,
      createdBy: firebaseUser.uid,

      joinedAt: serverTimestamp(),
      lastActive: serverTimestamp(),
      updatedAt: serverTimestamp(),

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
    userRef,
    {
      ...profilePayload,
      plan: "free",
      workspaceId: personalWorkspaceId,
      personalWorkspaceId,
      updatedAt: serverTimestamp(),
      lastActive: serverTimestamp(),
    },
    { merge: true }
  );

  console.log("[Auth] ✅ Ensured personal workspace:", personalWorkspaceId);

  return personalWorkspaceId;
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
      const personalWid = snap.data().personalWorkspaceId as string | undefined;

      const hasValidWorkspaceAccess = await ensureWorkspaceAndMembership(
        firebaseUser,
        existingWid
      );

      if (hasValidWorkspaceAccess) {
        await setDoc(
          userRef,
          {
            ...profilePayload,
            plan: snap.data().plan ?? "free",
            workspaceId: existingWid,
            personalWorkspaceId: personalWid ?? existingWid,
            updatedAt: serverTimestamp(),
            lastActive: serverTimestamp(),
          },
          { merge: true }
        );

              console.log("[Auth] ✅ Existing user — keeping workspaceId:", existingWid);

        return existingWid;
      }

      /**
       * IMPORTANT:
       * Do NOT reset invited/team users back to personal workspace here.
       *
       * On refresh, Firestore can briefly deny reads while auth/rules/listeners
       * are warming up. Resetting here destroys the user's selected workspace
       * and makes shared workspace projects disappear from the sidebar.
       *
       * Keep the existing workspaceId. If access is truly invalid, AppDataContext
       * will fail safely without exposing data.
       */
      console.warn(
        "[Auth] ⚠️ Workspace verification failed, but keeping existing workspaceId to avoid destructive reset:",
        existingWid
      );

      await setDoc(
        userRef,
        {
          ...profilePayload,
          plan: snap.data().plan ?? "free",
          workspaceId: existingWid,
          personalWorkspaceId: personalWid ?? `personal_${firebaseUser.uid}`,
          updatedAt: serverTimestamp(),
          lastActive: serverTimestamp(),
        },
        { merge: true }
      );

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
     * Brand new user: create a guaranteed unique personal workspace.
     */
    const personalWorkspaceId = await ensurePersonalWorkspace(firebaseUser);

    await setDoc(
      userRef,
      {
        ...profilePayload,
        plan: "free",
        workspaceId: personalWorkspaceId,
        personalWorkspaceId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastActive: serverTimestamp(),
      },
      { merge: true }
    );

    console.log("[Auth] ✅ New user — created personal workspace:", personalWorkspaceId);

    return personalWorkspaceId;

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
