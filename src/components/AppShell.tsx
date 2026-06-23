/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, Navigate } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase/config';
import { useAuth } from '../context/AuthContext';
import Navbar from './Navbar';
import { useAppData } from '../context/AppDataContext';



// Routes that only make sense for full workspace members/owners.
// External task guests are redirected away from these to /my-tasks.
const MEMBER_ONLY_PATHS = ['/', '/dashboard', '/insights', '/team', '/workspace', '/calendar'];

export default function AppShell() {
  const { isGuestView, workspaceData } = useAppData();
  const { user } = useAuth();
  const location = useLocation();

  // ============================================================
  // GLOBAL REAL-TIME "you were removed" detection.
  //
  // Listens to the user's OWN users/{uid} doc — which they ALWAYS have
  // permission to read (firestore.rules: users/{userId} allow read if
  // isSignedIn()). When User 2 removes User 1, removeMember() bumps
  // `removalSignal` on User 1's user doc, so this fires INSTANTLY and shows
  // the modal — no dependency on the workspace they just lost, so it never
  // hits permission-denied. Close → reload → self-heal lands them on their
  // own workspace. No sign-out, no manual refresh.
  // ============================================================
   const [removedFromName, setRemovedFromName] = useState<string | null>(null);

  // Track which removal-notification ids we've already reacted to, and a flag
  // for the very first snapshot so OLD removal notifications (already sitting in
  // the user's history) don't pop the modal on page load — only NEW ones do.
  const seenRemovalIdsRef = useRef<Set<string>>(new Set());
  const hadFirstSnapshotRef = useRef(false);

  const uid = user?.uid ?? '';

  useEffect(() => {
    if (!uid) return;

    // Watch the SAME notifications collection the bell uses (proven real-time),
    // filtered to workspace_removed. The user always has read access to their
    // OWN notifications, so this never hits permission-denied.
    const removalQuery = query(
      collection(db, 'users', uid, 'notifications'),
      where('type', '==', 'workspace_removed')
    );

    const unsub = onSnapshot(
      removalQuery,
      (snap) => {
        // First snapshot: record existing removal notifications as "seen" so
        // we don't fire the modal for historical ones on load.
        if (!hadFirstSnapshotRef.current) {
          hadFirstSnapshotRef.current = true;
          snap.docs.forEach((d) => seenRemovalIdsRef.current.add(d.id));
          return;
        }

        // Any newly-added removal notification → pop the modal.
        snap.docChanges().forEach((change) => {
          if (change.type !== 'added') return;
          const id = change.doc.id;
          if (seenRemovalIdsRef.current.has(id)) return;
          seenRemovalIdsRef.current.add(id);

          const data = change.doc.data() as any;
          const name =
            String(data?.projectName || '').trim() ||
            String(data?.workspaceName || '').trim() ||
            workspaceData?.name ||
            'the workspace';
          setRemovedFromName(name);
        });
      },
      (err) => console.warn('[AppShell] removal-notification listener error:', err)
    );

    return () => unsub();
  }, [uid, workspaceData?.name]);


  const isMemberOnlyPath =
    MEMBER_ONLY_PATHS.includes(location.pathname) ||
    location.pathname.startsWith('/workspace/');


    if (isGuestView && isMemberOnlyPath) {
    return <Navigate to="/my-tasks" replace />;
  }

    return (
    <div className="flex flex-col flex-1 h-full w-full overflow-hidden">
      <Navbar />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      {/* GLOBAL: real-time "you were removed" modal. Close reloads the app,
          which remounts on this user's own workspace via the AuthContext
          self-heal — reliable, no manual refresh. */}
      {removedFromName && (
        <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-auto overflow-hidden"
            style={{ animation: 'fadeInUp 0.2s ease' }}
          >
            <div className="px-6 pt-6 pb-2 text-center">
              <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-slate-900 mb-1">
                Removed from workspace
              </h2>
              <p className="text-sm text-slate-500">
                You no longer have access to{' '}
                <span className="font-medium text-slate-700">
                  {removedFromName}
                </span>
                . You'll be returned to your own workspace.
              </p>
            </div>

            <div className="px-6 pb-6 pt-4">
              <button
                onClick={() => window.location.reload()}
                className="w-full py-3 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>

          <style>{`
            @keyframes fadeInUp {
              from { opacity: 0; transform: translateY(14px); }
              to   { opacity: 1; transform: translateY(0);    }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}


