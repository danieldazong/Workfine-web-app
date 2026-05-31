/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Mail, Github, ArrowRight, AlertCircle, User as UserIcon } from 'lucide-react';
import { authService } from '../lib/firebase/auth';
import { cn } from '../lib/utils';
import { useNavigate } from 'react-router-dom';

type AuthMode = 'signin' | 'signup';

// Maps a raw Firebase Auth error code to a human-readable message.
// Returns null when we need to do async provider detection first.
function mapAuthError(code: string): string | null {
  switch (code) {
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please wait a moment and try again.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    // All of these need async provider detection to distinguish
    // "wrong password", "Google-only account", or "no account at all"
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/user-not-found':        // Google-only accounts hit this too
    case 'auth/operation-not-allowed':
      return null;
    case 'auth/email-already-in-use':
      return null; // needs async provider detection
    default:
      return 'An unexpected error occurred. Please try again.';
  }
}

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGoogleHint, setShowGoogleHint] = useState(false);
  const navigate = useNavigate();

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /** Checks whether the given email is registered exclusively via Google. */
  async function checkIfGoogleAccount(emailAddr: string): Promise<boolean> {
    const methods = await authService.getSignInMethods(emailAddr);
    return methods.includes('google.com');
  }

  function resetState() {
    setError(null);
    setShowGoogleHint(false);
  }

  /** Called when switching tabs — clears errors and hints. */
  const handleTabSwitch = (tab: AuthMode) => {
    setMode(tab);
    resetState();
  };

  // ─── Sign-in ────────────────────────────────────────────────────────────────

function redirectAfterAuth() {
  const pendingTaskInviteUrl = localStorage.getItem('pendingTaskInviteUrl');

  if (
    pendingTaskInviteUrl &&
    pendingTaskInviteUrl.startsWith('/accept-task-invite')
  ) {
    // Hard navigation so AcceptTaskInvitePage mounts fresh with the URL params.
    // (Do NOT remove the key here — AcceptTaskInvitePage clears it after it
    // auto-accepts. The PendingTaskInviteGate is the universal fallback if this
    // fast-path is interrupted by the Google popup/redirect round-trip.)
    window.location.replace(pendingTaskInviteUrl);
    return;
  }

  const pending = localStorage.getItem('pendingInviteCode');

  if (pending) {
    localStorage.removeItem('pendingInviteCode');
    navigate('/join/' + pending, { replace: true });
    return;
  }

  navigate('/', { replace: true });
}


const handleSignIn = async () => {

    resetState();

    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      await authService.signInWithEmail(email.trim(), password);
      redirectAfterAuth();
    } catch (err: any) {
      const code: string = err?.code ?? '';
      const mapped = mapAuthError(code);

      if (mapped !== null) {
        // Simple static message — no async lookup needed
        setError(mapped);
      } else {
        // Could be: wrong password, Google-only account, or no account at all.
        // fetchSignInMethodsForEmail tells us which provider (if any) owns the email.
        try {
          const methods = await authService.getSignInMethods(email.trim());
          if (methods.includes('google.com')) {
            setShowGoogleHint(true);
            setError(
              "This email is registered with Google Sign-In. " +
              "Please use the 'Sign in with Google' button below."
            );
          } else if (methods.length === 0) {
            // No account at all exists for this email
            setError('No account found with this email. Please sign up first.');
          } else {
            // Has email/password provider but wrong password
            setShowGoogleHint(false);
            setError('Email or password is incorrect.');
          }
        } catch {
          setError('Email or password is incorrect.');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── Sign-up ────────────────────────────────────────────────────────────────

  const handleSignUp = async () => {
    resetState();

    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      await authService.signUpWithEmail(email.trim(), password);
      redirectAfterAuth();
    } catch (err: any) {
      const code: string = err?.code ?? '';
      const mapped = mapAuthError(code);

      if (mapped !== null) {
        setError(mapped);
      } else if (code === 'auth/email-already-in-use') {
        // Check whether the existing account is Google-only
        const isGoogle = await checkIfGoogleAccount(email.trim());
        if (isGoogle) {
          setShowGoogleHint(true);
          setError(
            "This email is already registered with Google. " +
            "Please use the 'Sign in with Google' button below."
          );
        } else {
          setError('An account with this email already exists. Please sign in.');
        }
      } else {
        setError('Could not create account. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── Google sign-in ─────────────────────────────────────────────────────────

  const handleGoogleSignIn = async () => {
  resetState();
  setLoading(true);

  try {
    await authService.signInWithGoogle();
    redirectAfterAuth();
  } catch (err: any) {
    setError(err?.message ?? 'Failed to sign in with Google.');
  } finally {
    setLoading(false);
  }
};



  // ─── Unified form submit ─────────────────────────────────────────────────────

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'signin') {
      await handleSignIn();
    } else {
      await handleSignUp();
    }
  };

  // ─── JSX ────────────────────────────────────────────────────────────────────

  return (
    <div id="login-page" className="min-h-screen bg-gradient-to-br from-white via-slate-100 to-blue-100 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background glassmorphism blobs */}
      <div
        className="absolute top-[-15%] left-[-10%] w-[500px] h-[500px] rounded-full bg-blue-200/40 blur-[100px] pointer-events-none select-none"
      />
      <div
        className="absolute bottom-[-15%] right-[-10%] w-[500px] h-[500px] rounded-full bg-indigo-200/40 blur-[100px] pointer-events-none select-none"
      />
      <div
        className="absolute top-[40%] left-[20%] w-[300px] h-[300px] rounded-full bg-slate-200/30 blur-[80px] pointer-events-none select-none"
      />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm relative z-10"
      >
        <div className="card border border-white/10 bg-[#0d1b2e] p-6 shadow-2xl relative overflow-hidden flex flex-col items-center">
          <div className="absolute top-0 left-0 w-full h-1 primary-gradient" />
          
          <button className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors">
            <span className="text-xl">×</span>
          </button>

          <div className="w-12 h-12 rounded-xl bg-success/10 border border-success/20 flex items-center justify-center mb-3 shadow-lg shadow-success/5">
            <Lock className="text-success" size={24} />
          </div>

          <h2 className="text-2xl font-semibold text-white tracking-tight mb-2">
            {mode === 'signin' ? 'Welcome Back' : 'Create Account'}
          </h2>
          <p className="text-slate-400 text-sm mb-3 text-center px-4">
            {mode === 'signin' 
              ? 'Enter your credentials to access your vault.' 
              : 'Start your secure journey with Workfine today.'}
          </p>

          {/* Tab switcher */}
          <div className="w-full flex border-b border-slate-700/50 mb-4">
            <button 
              onClick={() => handleTabSwitch('signin')}
              className={cn(
                'flex-1 py-2 text-sm font-medium transition-all relative',
                mode === 'signin' ? 'text-success' : 'text-slate-500'
              )}
            >
              Sign In
              {mode === 'signin' && (
                <motion.div layoutId="tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-success" />
              )}
            </button>
            <button 
              onClick={() => handleTabSwitch('signup')}
              className={cn(
                'flex-1 py-2 text-sm font-medium transition-all relative',
                mode === 'signup' ? 'text-success' : 'text-slate-500'
              )}
            >
              Sign Up
              {mode === 'signup' && (
                <motion.div layoutId="tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-success" />
              )}
            </button>
          </div>

          <form onSubmit={handleAuth} className="w-full space-y-3">
            <AnimatePresence mode="wait">
              {mode === 'signup' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2 overflow-hidden"
                >
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-widest pl-1">Full Name</label>
                  <div className="relative group">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-success transition-colors" size={16} />
                    <input 
                      type="text" 
                      placeholder="John Doe" 
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full bg-slate-900/50 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm focus:border-success focus:ring-1 focus:ring-success outline-none transition-all text-white placeholder:text-slate-600"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-widest pl-1">Email Address</label>
              <div className="relative group">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-success transition-colors" size={16} />
                <input 
                  required
                  type="email" 
                  placeholder="name@company.com" 
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); resetState(); }}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm focus:border-success focus:ring-1 focus:ring-success outline-none transition-all text-white placeholder:text-slate-600"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center px-1">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-widest">Password</label>
                {mode === 'signin' && (
                  <button type="button" className="text-[10px] font-medium text-success hover:underline">Forgot password?</button>
                )}
              </div>
              <div className="relative group">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-success transition-colors" size={16} />
                <input 
                  required
                  type="password" 
                  placeholder="••••••••" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm focus:border-success focus:ring-1 focus:ring-success outline-none transition-all text-white placeholder:text-slate-600"
                />
              </div>
            </div>

            {/* Error message */}
            <AnimatePresence>
              {error && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, scale: 0.95, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2.5"
                >
                  <AlertCircle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
                  <p className="text-red-400 text-xs font-normal leading-snug">{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 bg-success hover:bg-success-dark text-white font-semibold text-sm rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {mode === 'signin' ? 'Sign In' : 'Create Account'}
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="w-full relative py-3">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-700/50"></div>
            </div>
            <div className="relative flex justify-center text-[10px] uppercase font-normal tracking-widest text-slate-500">
              <span className="bg-slate-800/80 px-4">Or continue with</span>
            </div>
          </div>

          {/* Social buttons */}
          <div className="w-full grid grid-cols-2 gap-2">
            {/* GitHub (placeholder) */}
            <button className="flex items-center justify-center gap-2 px-4 py-2 h-9 bg-slate-900/50 border border-slate-700 rounded-xl hover:bg-slate-800 transition-colors">
              <Github size={18} className="text-white" />
              <span className="text-xs font-medium text-slate-300">GitHub</span>
            </button>

            {/* Google — highlighted when showGoogleHint is true */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className={cn(
                'flex items-center justify-center gap-2 px-4 py-2 h-9 rounded-xl border text-xs font-medium transition-all duration-300',
                showGoogleHint
                  ? 'border-blue-500 bg-blue-500/10 text-white ring-2 ring-blue-500/50 animate-pulse'
                  : 'bg-slate-900/50 border-slate-700 text-slate-300 hover:bg-slate-800'
              )}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94L5.84 14.1z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              Google
            </button>
          </div>

          {/* Animated nudge message below Google button */}
          <AnimatePresence>
            {showGoogleHint && (
              <motion.p
                key="google-hint"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-blue-400 text-xs text-center mt-2 animate-pulse"
              >
                ↑ Click here to sign in with your Google account
              </motion.p>
            )}
          </AnimatePresence>

          <p className="mt-3 text-[10px] text-center text-slate-500 leading-relaxed max-w-[280px]">
            By continuing, you agree to Workfine's <span className="text-success hover:underline cursor-pointer">Terms of Service</span> and <span className="text-success hover:underline cursor-pointer">Privacy Policy</span>.
          </p>
        </div>

        <p className="mt-4 text-center text-[10px] text-slate-600 font-black uppercase tracking-[0.3em]">
          Secure Terminal &copy; {new Date().getFullYear()} Workfine
        </p>
      </motion.div>
    </div>
  );
}
