import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./config";
/**
 * Deterministically derives a short, stable, unique workspace display code
 * from a Firebase uid, e.g. "WF-354821".
 *
 * GLOBAL + PERMANENT:
 *  - Same uid always produces the same code (never changes across logins).
 *  - Different uids almost never collide.
 *  - The Firestore document id stays personal_<uid>, so all existing
 *    permission rules keep working. This is purely a display id.
 */
export function deriveWorkspaceDisplayId(uid: string): string {
  const clean = String(uid || "").trim();
  if (!clean) return "WF-000000";

  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (clean.charCodeAt(i) + ((hash << 5) - hash)) | 0;
  }

  const code = Math.abs(hash) % 1000000;
  return `WF-${String(code).padStart(6, "0")}`;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string | null;
  plan: string;
  createdAt: any;
  updatedAt: any;
}

/**
 * Avatar policy: every account defaults to its own deterministic monogram
 * gradient (rendered client-side from the email). We deliberately DO NOT
 * import the Google/Gmail profile photo at sign-in. A real photo is only
 * ever stored when the user explicitly uploads one in Settings.
 *
 * Returning "" here guarantees no photoURL is auto-stamped from the provider,
 * so the gradient monogram shows everywhere by default.
 */
function resolveSignInPhotoURL(_user: {
  photoURL?: string | null;
  providerData?: Array<{ providerId?: string; photoURL?: string | null }>;
}): string {
  return "";
}

// Called on every login and signup — creates or updates user doc
export const createOrUpdateUserProfile = async (
  user: {
    uid: string;
    displayName: string | null;
    email: string | null;
    photoURL: string | null;
    providerData?: Array<{ providerId?: string; photoURL?: string | null }>;
  }
): Promise<void> => {
  try {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    const resolvedPhotoURL = resolveSignInPhotoURL(user);
    const emailLower = (user.email || "").toLowerCase();

    if (!userSnap.exists()) {
      // First time — create full profile.
      await setDoc(userRef, {
        uid: user.uid,
        userId: user.uid,
        displayName:
          user.displayName ||
          user.email?.split("@")[0] ||
          "User",
        email: user.email || "",
        emailLower,
        // Only stamp photo fields if we actually have a real photo.
        ...(resolvedPhotoURL
          ? { photoURL: resolvedPhotoURL, avatarUrl: resolvedPhotoURL }
          : {}),
        plan: "free",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      console.log("[Firebase] User profile created:", user.uid);
    } else {
      // Returning user — never overwrite a saved photo with an empty value.
      const existing = userSnap.data() as any;
      const existingPhoto = String(existing?.photoURL || "").trim();

      const payload: Record<string, any> = {
        displayName:
          user.displayName ||
          user.email?.split("@")[0] ||
          existing?.displayName ||
          "User",
        email: user.email || existing?.email || "",
        emailLower: emailLower || existing?.emailLower || "",
        userId: user.uid,
        updatedAt: serverTimestamp(),
      };

      // Write the photo ONLY when we have a real one and none is stored yet,
      // or to refresh an existing one. Empty values are intentionally skipped
      // so an uploaded avatar is never wiped on the next login.
      if (resolvedPhotoURL) {
        payload.photoURL = resolvedPhotoURL;
        payload.avatarUrl = resolvedPhotoURL;
      } else if (!existingPhoto) {
        // No new photo and none stored — leave field untouched.
      }

      await setDoc(userRef, payload, { merge: true });
      console.log("[Firebase] User profile updated:", user.uid);
    }
  } catch (error: any) {
    console.error("[Firebase] createOrUpdateUserProfile error:",
      error.message);
    throw new Error(error.message);
  }
};

// Get user profile from Firestore
export const getUserProfile = async (
  uid: string
): Promise<UserProfile | null> => {
  try {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      return userSnap.data() as UserProfile;
    }
    return null;
  } catch (error: any) {
    console.error("[Firebase] getUserProfile error:", error.message);
    return null;
  }
};
// ─── GLOBAL AVATAR PROPAGATION ────────────────────────────────────────────────
// When a user uploads or removes their profile photo, the new URL (or "") must
// be written to EVERY document that stores a copy of their photoURL, so all
// components that read those copies (Task comments, Task modal "Who has access",
// member grids, invites sent to / received by other accounts) update in real
// time. Fully global and account-agnostic.
import {
  collection,
  collectionGroup,
  getDocs,
  query,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

export async function propagateUserPhotoURL(
  uid: string,
  email: string | null,
  newPhotoURL: string
): Promise<void> {
  const cleanUid = String(uid || "").trim();
  if (!cleanUid) return;

  const emailLower = String(email || "").trim().toLowerCase();
  const photo = String(newPhotoURL || "");

  try {
    const batch = writeBatch(db);
    let writes = 0;

    // 1. Master users/{uid} doc.
    await updateDoc(doc(db, "users", cleanUid), {
      photoURL: photo,
      avatarUrl: photo,
      updatedAt: serverTimestamp(),
    }).catch(() => {});

    // 2. Every workspace member doc for this uid (any workspace).
    const memberDocs = await getDocs(
      query(collectionGroup(db, "members"), where("userId", "==", cleanUid))
    ).catch(() => null);

    memberDocs?.forEach((d) => {
      batch.set(
        d.ref,
        { photoURL: photo, avatarUrl: photo, updatedAt: serverTimestamp() },
        { merge: true }
      );
      writes++;
    });

    // 3. Every workspace people/guest doc for this uid.
    const peopleDocs = await getDocs(
      query(collectionGroup(db, "people"), where("userId", "==", cleanUid))
    ).catch(() => null);

    peopleDocs?.forEach((d) => {
      batch.set(
        d.ref,
        { photoURL: photo, avatarUrl: photo, updatedAt: serverTimestamp() },
        { merge: true }
      );
      writes++;
    });

    // 4. Share docs where THIS user is the RECEIVER (they accepted the invite).
    const shareDocsAsReceiver = await getDocs(
      query(collectionGroup(db, "shares"), where("acceptedByUid", "==", cleanUid))
    ).catch(() => null);

    shareDocsAsReceiver?.forEach((d) => {
      batch.set(
        d.ref,
        { acceptedByPhotoURL: photo, updatedAt: serverTimestamp() },
        { merge: true }
      );
      writes++;
    });

    // 5. Share docs where THIS user is the SENDER/OWNER.
    const shareDocsAsOwner = await getDocs(
      query(collectionGroup(db, "shares"), where("ownerId", "==", cleanUid))
    ).catch(() => null);

    shareDocsAsOwner?.forEach((d) => {
      batch.set(
        d.ref,
        { ownerPhotoURL: photo, updatedAt: serverTimestamp() },
        { merge: true }
      );
      writes++;
    });

    // 6. Workspace owner-photo fields for any workspace this user owns.
    const ownedWorkspaces = await getDocs(
      query(collection(db, "workspaces"), where("ownerId", "==", cleanUid))
    ).catch(() => null);

    ownedWorkspaces?.forEach((d) => {
      batch.set(
        d.ref,
        { ownerPhotoURL: photo, ownerAvatarUrl: photo, updatedAt: serverTimestamp() },
        { merge: true }
      );
      writes++;
    });

    if (writes > 0) {
      await batch.commit();
    }

    console.log(`[propagateUserPhotoURL] ✅ Synced photo to ${writes} doc(s)`);
  } catch (err) {
    console.warn("[propagateUserPhotoURL] partial failure (non-fatal):", err);
  }
}
