/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Outlet, useLocation, Navigate } from 'react-router-dom';
import Navbar from './Navbar';
import { useAppData } from '../context/AppDataContext';

// Routes that only make sense for full workspace members/owners.
// External task guests are redirected away from these to /my-tasks.
const MEMBER_ONLY_PATHS = ['/', '/dashboard', '/insights', '/team', '/workspace', '/calendar'];

export default function AppShell() {
  const { isGuestView } = useAppData();
  const location = useLocation();

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
    </div>
  );
}

