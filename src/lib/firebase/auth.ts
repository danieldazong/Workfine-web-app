/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { auth } from './config';

const googleProvider = new GoogleAuthProvider();

// Force account chooser + request the basic scopes, matching AuthContext.
googleProvider.setCustomParameters({ prompt: 'select_account' });
googleProvider.addScope('profile');
googleProvider.addScope('email');

export const authService = {
  async signInWithGoogle() {
    // Try popup first (best UX — keeps the current tab state intact).
    // If the browser blocks the popup (common in incognito, on freshly
    // navigated pages, or without enough user interaction), fall back
    // automatically to a full-page redirect so the user never sees a
    // "popup blocked" hang. getRedirectResult() in AuthContext completes
    // the round-trip on return. This mirrors the AuthContext fallback.
    try {
      const result = await signInWithPopup(auth, googleProvider);
      return result.user;
    } catch (popupErr: any) {
      const code = String(popupErr?.code || '').toLowerCase();

      const shouldFallbackToRedirect =
        code === 'auth/popup-blocked' ||
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request' ||
        code === 'auth/operation-not-supported-in-this-environment' ||
        code === 'auth/web-storage-unsupported';

      if (!shouldFallbackToRedirect) {
        // Real error (network, invalid config, etc.) — surface it.
        throw popupErr;
      }

      // Navigates the current tab to Google's sign-in page.
      // On return, AuthContext's getRedirectResult() finishes sign-in
      // and onAuthStateChanged fires. This call does not resolve here
      // (the page unloads), so the caller's spinner ends with the redirect.
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
  },

  async signUpWithEmail(email: string, pass: string) {
    // Throws raw FirebaseError — let the UI layer map codes to messages
    const result = await createUserWithEmailAndPassword(auth, email, pass);
    return result.user;
  },

  async signInWithEmail(email: string, pass: string) {
    // Throws raw FirebaseError — let the UI layer map codes to messages
    const result = await signInWithEmailAndPassword(auth, email, pass);
    return result.user;
  },

  /** Returns the sign-in providers registered for a given email. */
  async getSignInMethods(email: string): Promise<string[]> {
    try {
      return await fetchSignInMethodsForEmail(auth, email);
    } catch {
      return [];
    }
  },

  /** Sends a password-reset email to the given address. Throws raw FirebaseError. */
  async sendPasswordReset(email: string) {
    await sendPasswordResetEmail(auth, email);
  },

  async signOut() {
    await auth.signOut();
  },
};
