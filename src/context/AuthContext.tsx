import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import {
  User,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
} from "firebase/auth";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

import { auth, db } from "../lib/firebase/config";
import { deriveWorkspaceDisplayId } from "../lib/firebase/users";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  signOut: () => Promise<void>;
  signOutUser: () => Promise<void>;
  workspaceId: string | null;
  personalWorkspaceId: string | null;
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
  personalWorkspaceId: null,
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
  // Avatar policy: default to the monogram gradient for every account.
  // Never auto-pull the Google/Gmail photo. We only keep a photo that the
  // user uploaded themselves (Firebase Storage URL written from Settings).
  // Anything coming straight from the Google provider is ignored here.
  const stored = String(firebaseUser.photoURL || "").trim();

  // Only treat a Storage-hosted photo (uploaded via Settings) as a real photo.
  // Google-hosted photos (lh3.googleusercontent.com, etc.) are ignored so new
  // accounts always start on the gradient monogram.
  if (stored && stored.includes("firebasestorage")) {
    return stored;
  }

  return "";
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

  // Build the base payload WITHOUT photo fields so a later merge never
  // overwrites a previously-saved photo with an empty string (which happens
  // during the auth-warmup race or for users whose auth photoURL is blank).
  const payload: Record<string, any> = {
    uid: firebaseUser.uid,
    userId: firebaseUser.uid,

    displayName,
    name: displayName,

    email,
    emailLower,
    email_lowercase: emailLower,

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

  // Only include photo fields when we actually have a non-empty URL.
  // This guarantees we NEVER wipe an existing good photo on re-auth.
  if (photoURL && photoURL.trim() !== "") {
    payload.photoURL = photoURL;
    payload.avatarUrl = photoURL;
    payload.avatarURL = photoURL;
    payload.googlePhotoURL = photoURL;
  }

  return payload;
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

    if (String(memberData.status || "").toLowerCase() !== "active") {
      return false;
    }

    const memberUid = String(memberData.uid || memberData.userId || "").trim();

    const memberEmail = normalizeEmail(
      memberData.email || memberData.emailLower || memberData.emailAddress
    );

    const currentEmail = normalizeEmail(firebaseUser.email);

    if (
      memberUid &&
      memberUid !== uid &&
      (!currentEmail || memberEmail !== currentEmail)
    ) {
      return false;
    }

    if (memberData.workspaceId && memberData.workspaceId !== workspaceId) {
      return false;
    }

    if (memberData.role === "owner") return true;
    if (memberData.role === "admin") return true;
    if (memberData.role === "member") return true;
    if (memberData.role === "viewer") return true;

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
    async function findExistingWorkspaceMemberByEmail(): Promise<{
    id: string;
    data: any;
  } | null> {
    const currentEmail = normalizeEmail(firebaseUser.email);

    if (!currentEmail) return null;

    try {
      const directEmailRef = doc(
        db,
        "workspaces",
        workspaceId,
        "members",
        currentEmail
      );

      const directEmailSnap = await getDoc(directEmailRef);

      if (directEmailSnap.exists()) {
        return {
          id: directEmailSnap.id,
          data: directEmailSnap.data(),
        };
      }
    } catch (error: any) {
      console.warn("[Auth] ⚠️ Direct email member doc lookup skipped:", {
        workspaceId,
        uid,
        email: currentEmail,
        code: error?.code,
        message: error?.message,
      });
    }

    const membersRef = collection(db, "workspaces", workspaceId, "members");

    const queries = [
      query(membersRef, where("emailLower", "==", currentEmail), limit(1)),
      query(membersRef, where("email_lowercase", "==", currentEmail), limit(1)),
      query(membersRef, where("email", "==", currentEmail), limit(1)),
      query(membersRef, where("emailAddress", "==", currentEmail), limit(1)),
    ];

    for (const memberQuery of queries) {
      try {
        const snap = await getDocs(memberQuery);

        if (!snap.empty) {
          const memberDoc = snap.docs[0];

          return {
            id: memberDoc.id,
            data: memberDoc.data(),
          };
        }
      } catch (error: any) {
        console.warn("[Auth] ⚠️ Member email lookup skipped:", {
          workspaceId,
          uid,
          code: error?.code,
          message: error?.message,
        });
      }
    }

    return null;
  }



    /**
   * IMPORTANT:
   * First check the current user's member document.
   * Firestore rules allow a user to read their own member doc even before
   * they can read the full workspace. This prevents the app from wrongly
   * resetting invited users back to their personal workspace after refresh.
   *
   * Retry note:
   * Right after sign-in, Firestore can briefly evaluate rules before the
   * auth token is fully attached to the request, returning permission-denied.
   * We retry a couple of times with a short backoff so we don't log a noisy
   * warning for what is just an auth-warmup race.
   */
  async function readOwnMemberSnapWithRetry() {
    const attempts = [0, 250, 600];

    let lastErr: any = null;

    for (let i = 0; i < attempts.length; i++) {
      const delayMs = attempts[i];

      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      try {
        const snap = await getDoc(memberRef);
        return { snap, error: null as any };
      } catch (err: any) {
        lastErr = err;

        const code = String(err?.code || "").toLowerCase();

        const isAuthWarmupRace =
          code === "permission-denied" ||
          code === "unauthenticated" ||
          code === "failed-precondition";

        if (!isAuthWarmupRace) {
          break;
        }
      }
    }

    return { snap: null as any, error: lastErr };
  }

  try {
    const { snap: memberSnap, error: memberReadError } =
      await readOwnMemberSnapWithRetry();

    if (memberReadError) {
      throw memberReadError;
    }

    if (memberSnap && memberSnap.exists()) {
      const memberData = memberSnap.data();

      if (isTrustedMemberData(memberData)) {
        const existingRole =
          memberData.role === "owner" ||
          memberData.role === "admin" ||
          memberData.role === "member" ||
          memberData.role === "viewer"
            ? memberData.role
            : "member";

        await setDoc(
          memberRef,
          {
            ...profilePayload,
            lastActive: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        console.log("[Auth] ✅ Verified workspace membership from member doc:", {
          workspaceId,
          uid,
          role: existingRole,
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

    const memberByEmail = await findExistingWorkspaceMemberByEmail();

    if (memberByEmail && isTrustedMemberData(memberByEmail.data)) {
      const existingRole =
        memberByEmail.data.role === "owner" ||
        memberByEmail.data.role === "admin" ||
        memberByEmail.data.role === "member" ||
        memberByEmail.data.role === "viewer"
          ? memberByEmail.data.role
          : "member";

      await setDoc(
        memberRef,
        {
          ...memberByEmail.data,
          ...profilePayload,
          uid,
          userId: uid,
          workspaceId,
          role: existingRole,
          status: "active",
          permissions:
            memberByEmail.data.permissions ||
            (existingRole === "viewer"
              ? {
                  canView: true,
                  canComment: false,
                  canEdit: false,
                  canDelete: false,
                  canInvite: false,
                  canCreateProjects: false,
                  canDeleteProjects: false,
                  canInviteMembers: false,
                  canManageTasks: false,
                  canViewOnly: true,
                }
              : existingRole === "member"
                ? {
                    canView: true,
                    canComment: true,
                    canEdit: false,
                    canDelete: false,
                    canInvite: false,
                    canCreateProjects: false,
                    canDeleteProjects: false,
                    canInviteMembers: false,
                    canManageTasks: false,
                    canViewOnly: false,
                  }
                : {
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
                  }),
          migratedFromMemberDocId: memberByEmail.id,
          lastActive: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      console.log("[Auth] ✅ Repaired workspace member doc from email match:", {
        workspaceId,
        uid,
        role: existingRole,
        oldMemberDocId: memberByEmail.id,
      });

      return true;
    }
  } catch (memberErr: any) {
    const code = String(memberErr?.code || "").toLowerCase();

    const isAuthWarmupRace =
      code === "permission-denied" ||
      code === "unauthenticated" ||
      code === "failed-precondition";

    if (isAuthWarmupRace) {
      console.info(
        "[Auth] ℹ️ Own member doc temporarily unreadable during auth warmup — listeners will resolve it:",
        {
          workspaceId,
          uid,
          code: memberErr?.code,
        }
      );
    } else {
      console.warn("[Auth] ⚠️ Could not read own member doc:", {
        workspaceId,
        uid,
        code: memberErr?.code,
        message: memberErr?.message,
      });
    }

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
          displayId: deriveWorkspaceDisplayId(uid),
          name: `${displayName}'s Workspace`,


                  ownerId: uid,
          ownerEmail: email,
          ownerEmailLower: normalizeEmail(email),
          ownerPhotoURL: profilePayload.photoURL || "",
          ownerAvatarUrl: profilePayload.avatarUrl || "",


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
      /**
       * This is the expected path for a normal invited member when their
       * own member doc could not be read in this verification pass
       * (typically the brief auth-warmup race right after sign-in).
       *
       * AppDataContext will still receive the member doc via its live
       * listener and the UI will compute permissions correctly from it,
       * so this is informational, not a real failure.
       */
      console.info(
        "[Auth] ℹ️ Skipping owner-repair for non-owner workspace user (normal for members):",
        {
          workspaceId,
          uid,
        }
      );

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

      },
      { merge: true }
    );

    await setDoc(
      wsRef,
            {
        ownerEmail: email,
        ownerEmailLower: normalizeEmail(email),
        ownerPhotoURL: profilePayload.photoURL || "",
        ownerAvatarUrl: profilePayload.avatarUrl || "",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    console.log("[Auth] ✅ Verified owner workspace membership:", workspaceId);

    return true;
  } catch (workspaceErr: any) {
  const code = String(workspaceErr?.code || "").toLowerCase();

  const isAuthWarmupRace =
    code === "permission-denied" ||
    code === "unauthenticated" ||
    code === "failed-precondition";

  if (isAuthWarmupRace) {
    console.info(
      "[Auth] ℹ️ Workspace verification deferred during auth warmup — live listeners will verify:",
      {
        workspaceId,
        uid,
        code: workspaceErr?.code,
      }
    );
  } else {
    console.warn("[Auth] ⚠️ Workspace verification failed:", {
      workspaceId,
      uid,
      code: workspaceErr?.code,
      message: workspaceErr?.message,
    });
  }

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
      displayId: deriveWorkspaceDisplayId(firebaseUser.uid),
      name: `${profilePayload.displayName}'s Workspace`,


         ownerId: firebaseUser.uid,
      ownerEmail: profilePayload.email,
      ownerEmailLower: profilePayload.emailLower,
      ownerPhotoURL: profilePayload.photoURL || "",
      ownerAvatarUrl: profilePayload.avatarUrl || "",


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
      workspaceDisplayId: deriveWorkspaceDisplayId(firebaseUser.uid),
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
            workspaceDisplayId:
              (snap.data().workspaceDisplayId as string | undefined) ??
              deriveWorkspaceDisplayId(firebaseUser.uid),
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
            console.info(
        "[Auth] ℹ️ Workspace verification not completed in AuthContext pass (live listeners will verify) — keeping workspaceId:",
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
  const [personalWorkspaceId, setPersonalWorkspaceIdState] = useState<
    string | null
  >(null);

  // GLOBAL REAL-TIME AVATAR SYNC:
  // Firebase Auth's user.photoURL does NOT change when we write photoURL to
  // Firestore (it only updates on token refresh / reload). We keep a live copy
  // of the Firestore users/{uid}.photoURL here and overlay it onto `user` below,
  // so EVERY surface that reads useAuth().user (Navbar, Sidebar, etc.) reflects
  // an uploaded/removed photo instantly — no per-component listener needed.
  const [livePhotoURL, setLivePhotoURL] = useState<string | null>(null);
  const [liveDisplayName, setLiveDisplayName] = useState<string | null>(null);


  const setWorkspaceId = (id: string | null) => {
    setWorkspaceIdState(id);
  };

    useEffect(() => {
    let hasResolvedOnce = false;

    // If the user just came back from a signInWithRedirect() round-trip,
    // complete it here. This is a no-op when there's no pending redirect,
    // so it's safe to call on every app load.
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          console.log(
            "[Auth] ✅ Completed redirect sign-in for:",
            result.user.uid
          );
          // onAuthStateChanged below will fire and finish the flow,
          // including restoring any pendingTaskInviteUrl / pendingInviteCode.
        }
      })
      .catch((redirectErr) => {
        const code = String(redirectErr?.code || "").toLowerCase();
        // These are normal (no pending redirect) — don't spam the console.
        if (
          code !== "auth/no-auth-event" &&
          code !== "auth/null-user"
        ) {
          console.warn("[Auth] getRedirectResult error:", redirectErr);
        }
      });

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {

      try {
        if (firebaseUser) {
          // 1) Immediately commit the user so the app renders without waiting
          //    on Firestore round-trips. This prevents the white-spinner flash
          //    on route changes / tab focus / token refresh.
          setUser(firebaseUser);

          if (!hasResolvedOnce) {
            // First-ever resolve: keep loading=true until we have a workspaceId,
            // so ProtectedRoute can render the correct shell.
            const wid = await ensureUserProfile(firebaseUser);

            const freshUserSnap = await getDoc(
              doc(db, "users", firebaseUser.uid)
            );
            const savedPersonalWorkspaceId =
              freshUserSnap.exists() &&
              typeof freshUserSnap.data().personalWorkspaceId === "string"
                ? freshUserSnap.data().personalWorkspaceId
                : `personal_${firebaseUser.uid}`;

                        // GLOBAL SELF-HEAL: a short display code (WF-XXXX) must never be the real
// workspaceId. Old accounts have this stored from a previous build. If we
// detect it, fall back to the personal workspace id AND write the corrected
// value back to Firestore so the bad data is fixed permanently.
// Use the user's real stored workspaceId as-is. Legacy accounts may have a
// "WF-XXX" workspace id that IS a real workspace document — never rewrite it.
setWorkspaceIdState(wid || null);
setPersonalWorkspaceIdState(savedPersonalWorkspaceId);



            console.log(
              "[Auth] ✅ Signed in:",
              firebaseUser.uid,
              "| workspace:",
              wid,
              "| personalWorkspace:",
              savedPersonalWorkspaceId
            );

            // ============================================================
            // PENDING TASK INVITE RESTORE
            //
            // If the user just signed up via a task invite link, we saved
            // the original URL to localStorage as "pendingTaskInviteUrl"
            // before kicking off Google OAuth. Now that sign-in is complete,
            // redirect them back to /accept-task-invite?... so the
            // AcceptTaskInvitePage can auto-fire the accept flow.
            //
            // Do NOT clear pendingTaskInviteUrl here — AcceptTaskInvitePage
            // reads it to detect "this user just signed up via an invite,
            // auto-accept now" and clears it itself after auto-accept fires.
            // ============================================================
            try {
              const pendingTaskInvite = localStorage.getItem(
                "pendingTaskInviteUrl"
              );

              if (
                pendingTaskInvite &&
                pendingTaskInvite.startsWith("/accept-task-invite") &&
                !window.location.pathname.startsWith("/accept-task-invite")
              ) {
                console.log(
                  "[Auth] 🔁 Restoring pending task invite after sign-in:",
                  pendingTaskInvite
                );

                hasResolvedOnce = true;
                setLoading(false);

                // Hard navigation so the AcceptTaskInvitePage mounts fresh
                // with the correct URL params.
                window.location.replace(pendingTaskInvite);
                return;
              }
            } catch (restoreErr) {
              console.warn(
                "[Auth] ⚠️ Failed to restore pending task invite:",
                restoreErr
              );
            }

            hasResolvedOnce = true;
            setLoading(false);
          } else {

            // Subsequent revalidations (token refresh, tab focus, etc.):
            // refresh profile in the background WITHOUT flipping loading.
            // The app stays mounted — no white spinner flash.
            (async () => {
              try {
                const wid = await ensureUserProfile(firebaseUser);

                const freshUserSnap = await getDoc(
                  doc(db, "users", firebaseUser.uid)
                );
                const savedPersonalWorkspaceId =
                  freshUserSnap.exists() &&
                  typeof freshUserSnap.data().personalWorkspaceId === "string"
                    ? freshUserSnap.data().personalWorkspaceId
                    : `personal_${firebaseUser.uid}`;

                if (wid) setWorkspaceIdState(wid);
setPersonalWorkspaceIdState(savedPersonalWorkspaceId);

              } catch (bgErr) {
                console.warn(
                  "[Auth] background profile refresh failed:",
                  bgErr
                );
              }
            })();
          }
        } else {
          setWorkspaceIdState(null);
          setPersonalWorkspaceIdState(null);
          setUser(null);

          hasResolvedOnce = true;
          setLoading(false);

          console.log("[Auth] User signed out");
        }
      } catch (error) {
        console.error("[Auth] auth state error:", error);
        setWorkspaceIdState(null);
        setPersonalWorkspaceIdState(
          firebaseUser ? `personal_${firebaseUser.uid}` : null
        );
        setUser(firebaseUser || null);
        hasResolvedOnce = true;
        setLoading(false);
      }
       });

    return () => unsub();
  }, []);

  // Subscribe to the master users/{uid} doc so photoURL / displayName changes
  // (written by Settings via propagateUserPhotoURL) propagate to the in-memory
  // `user` object in real time, across every surface.
  useEffect(() => {
    const uid = user?.uid;
    if (!uid) {
      setLivePhotoURL(null);
      setLiveDisplayName(null);
      return;
    }

    const userRef = doc(db, "users", uid);

    const unsubUserDoc = onSnapshot(
      userRef,
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as any;

        const nextPhoto = String(data?.photoURL ?? data?.avatarUrl ?? "").trim();
        setLivePhotoURL(nextPhoto);

        const nextName = String(data?.displayName ?? data?.name ?? "").trim();
        setLiveDisplayName(nextName || null);
      },
      (err) => {
        console.warn("[Auth] users/{uid} live listener error:", err);
      }
    );

    return () => unsubUserDoc();
  }, [user?.uid]);

  // Overlay the live Firestore photo/name onto the Firebase Auth user object.
  // Falls back to the Auth values when the listener hasn't resolved yet.
  const effectiveUser = useMemo(() => {
    if (!user) return null;
    return {
      ...user,
      photoURL: livePhotoURL !== null ? livePhotoURL : user.photoURL,
      displayName: liveDisplayName !== null ? liveDisplayName : user.displayName,
    } as User;
  }, [user, livePhotoURL, liveDisplayName]);

  async function signInWithGoogle(): Promise<void> {

    const provider = new GoogleAuthProvider();

    provider.addScope("profile");
    provider.addScope("email");

    provider.setCustomParameters({
      prompt: "select_account",
    });

    // Try popup first (better UX — keeps the current tab state intact).
    // If the popup is blocked (common in incognito, on freshly-navigated
    // pages, or when the browser hasn't seen enough user interaction),
    // fall back automatically to a full-page redirect.
    //
    // This is how Gmail / Notion / Linear handle Google sign-in: the user
    // never sees a "popup blocked" error — they just sign in.
    try {
      await signInWithPopup(auth, provider);
      return;
    } catch (popupErr: any) {
      const code = String(popupErr?.code || "").toLowerCase();

      const shouldFallbackToRedirect =
        code === "auth/popup-blocked" ||
        code === "auth/popup-closed-by-user" ||
        code === "auth/cancelled-popup-request" ||
        code === "auth/operation-not-supported-in-this-environment" ||
        code === "auth/web-storage-unsupported";

      if (!shouldFallbackToRedirect) {
        // Real error (network, invalid config, etc.) — surface it.
        console.error("[Auth] signInWithPopup failed:", popupErr);
        throw popupErr;
      }

      console.warn(
        "[Auth] Popup sign-in unavailable, falling back to redirect:",
        code
      );

      // Persist any pending invite URL so the user lands back on it
      // after the redirect completes.
      const pendingTaskInvite = localStorage.getItem("pendingTaskInviteUrl");
      const pendingWorkspaceInvite = localStorage.getItem("pendingInviteCode");

      if (pendingTaskInvite) {
        localStorage.setItem("pendingTaskInviteUrl", pendingTaskInvite);
      }
      if (pendingWorkspaceInvite) {
        localStorage.setItem("pendingInviteCode", pendingWorkspaceInvite);
      }

      // This navigates the current tab to Google's sign-in page.
      // On return, getRedirectResult() in the AuthProvider effect
      // (added below) completes the sign-in and onAuthStateChanged fires.
      await signInWithRedirect(auth, provider);
    }
  }


  async function logout(): Promise<void> {
    await firebaseSignOut(auth);
    console.log("[Auth] ✅ Signed out");
  }

    return (
    <AuthContext.Provider
      value={{
        user: effectiveUser,
        loading,
              workspaceId,
        personalWorkspaceId,
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
