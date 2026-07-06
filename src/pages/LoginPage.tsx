/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Mail, ArrowRight, AlertCircle, User as UserIcon, Eye, EyeOff } from 'lucide-react';
import { authService } from '../lib/firebase/auth';
import { cn } from '../lib/utils';
import { useNavigate, Link } from 'react-router-dom';

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
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
    const [showGoogleHint, setShowGoogleHint] = useState(false);
  const [resetNotice, setResetNotice] = useState<string | null>(null);
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
    setResetNotice(null);
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
  // ─── Forgot password ─────────────────────────────────────────────────────────

  const handleForgotPassword = async () => {
    resetState();
    setResetNotice(null);

    if (!email.trim()) {
      setError('Enter your email address above, then click "Forgot password?" again.');
      return;
    }

    setLoading(true);
    try {
      await authService.sendPasswordReset(email.trim());
      // Neutral confirmation — do NOT reveal whether the account exists.
      setResetNotice(
        "If an account exists for that email, we've sent a password-reset link. Check your inbox."
      );
    } catch (err: any) {
      const code: string = err?.code ?? '';
      if (code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else if (code === 'auth/too-many-requests') {
        setError('Too many requests. Please wait a moment and try again.');
      } else {
        // Neutral message even on user-not-found, to avoid account enumeration.
        setResetNotice(
          "If an account exists for that email, we've sent a password-reset link. Check your inbox."
        );
      }
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
    <div id="login-page" className="min-h-screen flex bg-white font-sans">
      {/* ─── LEFT: branded trust panel (dark #0F172A — matches the app sidebar) ─── */}
            <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-[#0F172A]">
        {/* Subtle geometric grid pattern (decorative only) */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.04]"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <defs>
            <pattern id="wf-login-grid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M48 0H0V48" fill="none" stroke="#FFFFFF" strokeWidth="1" />
            </pattern>
            <linearGradient id="wf-login-fade" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </linearGradient>
            <mask id="wf-login-mask">
              <rect width="100%" height="100%" fill="url(#wf-login-fade)" />
            </mask>
          </defs>
          <rect width="100%" height="100%" fill="url(#wf-login-grid)" mask="url(#wf-login-mask)" />
        </svg>

        {/* Diagonal facet accents (decorative only) */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-24 -left-16 w-[380px] h-[380px] rotate-45 bg-gradient-to-br from-white/[0.03] to-transparent" />
          <div className="absolute top-1/3 -right-24 w-[320px] h-[320px] rotate-12 bg-gradient-to-tl from-indigo-400/[0.05] to-transparent" />
        </div>

        <div className="absolute top-[-10%] left-[-10%] w-[420px] h-[420px] rounded-full bg-indigo-500/20 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-15%] right-[-5%] w-[420px] h-[420px] rounded-full bg-[#A78BFA]/15 blur-[120px] pointer-events-none" />


        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <Link to="/" className="flex items-center gap-3">
            <img
              src="/logo.png?v=2"
              alt="WorkFine Logo"
              className="h-8 w-8 rounded-lg object-contain shadow-lg shadow-indigo-500/20"
            />
            <span className="text-2xl tracking-tight">
              <span className="font-extrabold text-white">Work</span>
              <span className="font-light text-white">Fine</span>
            </span>
          </Link>

                   <div className="max-w-md">
            {/* PRIMARY: dominant headline */}
            <h1 className="text-5xl font-extrabold text-white leading-[1.1] tracking-tight">
              Welcome to your<br />workspace.
            </h1>
            {/* SECONDARY: supporting sub-copy */}
            <p className="mt-5 text-slate-400 text-lg leading-relaxed">
              Plan projects, track tasks, and keep your team aligned — all in one place.
            </p>

            {/* TERTIARY: testimonial, set apart as its own quoted block */}
            <div className="mt-14 border-l-2 border-indigo-500/40 pl-5">
              <div className="flex items-center gap-1 text-[#A78BFA]">
                {'★★★★★'.split('').map((s, i) => (
                  <span key={i} className="text-sm">{s}</span>
                ))}
              </div>
              <p className="mt-3 text-slate-300 text-sm leading-relaxed italic">
                "WorkFine keeps our whole team on the same page. We ship faster and nothing slips through the cracks."
              </p>
              <p className="mt-3 text-slate-500 text-xs font-semibold uppercase tracking-wider">
                A WorkFine team lead
              </p>
            </div>
          </div>


          <p className="text-[10px] text-slate-600 font-semibold uppercase tracking-[0.25em]">
            &copy; {new Date().getFullYear()} WorkFine
          </p>
        </div>
      </div>

      {/* ─── RIGHT: clean white sign-in / sign-up form ─── */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-10 bg-white">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          <div className="flex flex-col items-center">
            {/* Mobile-only logo (left panel hidden below lg) */}
            <Link to="/" className="lg:hidden flex items-center gap-2 mb-6">
              <img
                src="/logo.png?v=2"
                alt="WorkFine Logo"
                className="h-8 w-8 rounded-lg object-contain"
              />
              <span className="text-xl tracking-tight">
                <span className="font-extrabold text-slate-900">Work</span>
                <span className="font-light text-slate-900">Fine</span>
              </span>
            </Link>

            <h2 className="text-2xl font-semibold text-slate-900 tracking-tight mb-2">
              {mode === 'signin' ? 'Welcome Back' : 'Create Account'}
            </h2>
            <p className="text-slate-500 text-sm mb-6 text-center">
              {mode === 'signin'
                ? 'Enter your credentials to access your workspace.'
                : 'Start your journey with WorkFine today.'}
            </p>

            {/* Tab switcher */}
            <div className="w-full flex border-b border-slate-200 mb-5">
              <button
                onClick={() => handleTabSwitch('signin')}
                className={cn(
                  'flex-1 py-2 text-sm font-medium transition-all relative',
                  mode === 'signin' ? 'text-indigo-600' : 'text-slate-400'
                )}
              >
                Sign In
                {mode === 'signin' && (
                  <motion.div layoutId="tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />
                )}
              </button>
              <button
                onClick={() => handleTabSwitch('signup')}
                className={cn(
                  'flex-1 py-2 text-sm font-medium transition-all relative',
                  mode === 'signup' ? 'text-indigo-600' : 'text-slate-400'
                )}
              >
                Sign Up
                {mode === 'signup' && (
                  <motion.div layoutId="tab-indicator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />
                )}
              </button>
            </div>

                        {/* Single primary SSO button — Google (business-audience friendly) */}
            <div className="w-full mb-4">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className={cn(
                  'w-full flex items-center justify-center gap-2.5 px-4 py-2 h-11 rounded-xl border text-sm font-medium transition-all duration-300',
                  showGoogleHint
                    ? 'border-indigo-500 bg-indigo-50 text-slate-900 ring-2 ring-indigo-500/40 animate-pulse'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                )}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94L5.84 14.1z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span className="text-slate-700">Continue with Google</span>
              </button>
            </div>


            {/* Google nudge */}
            <AnimatePresence>
              {showGoogleHint && (
                <motion.p
                  key="google-hint"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-indigo-600 text-xs text-center mb-3 animate-pulse w-full"
                >
                  ↑ Click here to sign in with your Google account
                </motion.p>
              )}
            </AnimatePresence>

            {/* Divider */}
            <div className="w-full relative py-2 mb-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase font-normal tracking-widest text-slate-400">
                <span className="bg-white px-4">Or continue with email</span>
              </div>
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
                                        <label className="text-xs font-medium text-slate-500 uppercase tracking-widest pl-1">Full Name</label>
                    <div className="relative group">
                      <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" size={16} />
                      <input
                        type="text"
                        placeholder="John Doe"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-slate-900 placeholder:text-slate-400"
                      />
                    </div>

                  </motion.div>
                )}
              </AnimatePresence>

              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-500 uppercase tracking-widest pl-1">Email Address</label>
                <div className="relative group">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" size={16} />
                  <input
                    required
                    type="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); resetState(); }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-slate-900 placeholder:text-slate-400"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center px-1">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-widest">Password</label>
                                    {mode === 'signin' && (
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={loading}
                      className="text-[10px] font-medium text-indigo-600 hover:underline disabled:opacity-50"
                    >
                      Forgot password?
                    </button>
                  )}

                </div>
                                <div className="relative group">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" size={16} />
                  <input
                    required
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-10 py-2.5 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all text-slate-900 placeholder:text-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
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
                    className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5"
                  >
                    <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                    <p className="text-red-600 text-xs font-normal leading-snug">{error}</p>
                  </motion.div>
                )}
              </AnimatePresence>
                            {/* Password-reset confirmation (neutral, non-enumerating) */}
              <AnimatePresence>
                {resetNotice && (
                  <motion.div
                    key="reset-notice"
                    initial={{ opacity: 0, scale: 0.95, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="flex items-start gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2.5"
                  >
                    <Mail size={16} className="text-indigo-500 mt-0.5 flex-shrink-0" />
                    <p className="text-indigo-700 text-xs font-normal leading-snug">{resetNotice}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-indigo-500/20 disabled:opacity-50"
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

            <p className="mt-5 text-[10px] text-center text-slate-400 leading-relaxed max-w-[280px]">
              By continuing, you agree to WorkFine's <span className="text-indigo-600 hover:underline cursor-pointer">Terms of Service</span> and <span className="text-indigo-600 hover:underline cursor-pointer">Privacy Policy</span>.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
