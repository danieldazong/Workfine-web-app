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
 * Resolves the best available photo for a user at sign-in/sign-up.
 * Reads the Firebase Auth photoURL first, then falls back to the
 * Google provider's photoURL. Global for every account/provider.
 */
function resolveSignInPhotoURL(user: {
  photoURL?: string | null;
  providerData?: Array<{ providerId?: string; photoURL?: string | null }>;
}): string {
  const direct = String(user?.photoURL || "").trim();
  if (direct) return direct;

  const providers = Array.isArray(user?.providerData) ? user.providerData : [];

  const googlePhoto = providers.find(
    (p) => p?.providerId === "google.com" && String(p?.photoURL || "").trim()
  )?.photoURL;
  if (googlePhoto) return String(googlePhoto).trim();

  const anyProviderPhoto = providers.find((p) =>
    String(p?.photoURL || "").trim()
  )?.photoURL;
  return String(anyProviderPhoto || "").trim();
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
