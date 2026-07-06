/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
    fetchSignInMethodsForEmail,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { auth } from './config';

const googleProvider = new GoogleAuthProvider();

export const authService = {
  async signInWithGoogle() {
    // Throws raw FirebaseError so the caller can inspect error.code
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
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
