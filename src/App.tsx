/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
} from "react-router-dom";

import { AuthProvider, useAuth } from "./context/AuthContext";
import { AppDataProvider } from "./context/AppDataContext";

import Sidebar from "./components/Sidebar";
import { usePresenceHeartbeat } from "./hooks/usePresenceHeartbeat";
import AppShell from "./components/AppShell";
import FloatingNoteButton from "./components/FloatingNoteButton";


import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import InsightsPage from "./pages/InsightsPage";
import MyTasksPage from "./pages/MyTasksPage";
import SettingsPage from "./pages/SettingsPage";
import ProjectPage from "./pages/ProjectPage";
import ProjectsOverviewPage from "./pages/ProjectsOverviewPage";
import CalendarPage from "./pages/CalendarPage";
import TeamPage from "./pages/TeamPage";
import WorkspacePage from "./pages/WorkspacePage";
import JoinWorkspacePage from "./pages/JoinWorkspacePage";
import AcceptTaskInvitePage from "./pages/AcceptTaskInvitePage";
import PendingTaskInviteGate from "./components/PendingTaskInviteGate";
import ConversationsPage from "./pages/ConversationsPage";
import AuthActionPage from "./pages/AuthActionPage";


function PresenceTracker() {
  const { user, workspaceId } = useAuth();
  usePresenceHeartbeat(workspaceId, user?.uid ?? null);
  return null;
}

function ProtectedRoute() {
  const { user, loading } = useAuth();

  // Only show the full-screen spinner on the very first auth check
  // (i.e. when we don't yet know if the user is signed in).
  // Once we have a user, never show the spinner again — keep the app
  // mounted so navigation feels like instant tab switching.
  if (loading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

    return (
    <AppDataProvider>
      <PresenceTracker />
      <div className="flex h-screen w-screen overflow-hidden bg-white">
        <Sidebar />
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <Outlet />
        </div>
      </div>
      {/* Global "Take a note" button — same position on every page,
          hidden on Settings (handled inside the component). */}
      <FloatingNoteButton />
    </AppDataProvider>
  );
}



function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (user) {
    const pendingTaskInviteUrl = localStorage.getItem("pendingTaskInviteUrl");

    if (pendingTaskInviteUrl) {
      localStorage.removeItem("pendingTaskInviteUrl");
      return <Navigate to={pendingTaskInviteUrl} replace />;
    }

    const pendingInviteCode = localStorage.getItem("pendingInviteCode");

    if (pendingInviteCode) {
      localStorage.removeItem("pendingInviteCode");
      return <Navigate to={`/join/${pendingInviteCode}`} replace />;
    }

    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public login route */}
          <Route
            path="/login"
            element={
              <PublicRoute>
                <LoginPage />
              </PublicRoute>
            }
          />

          {/* Public workspace invite route */}
          <Route path="/join/:inviteCode" element={<JoinWorkspacePage />} />

          {/* Public task invite route.
              Important: this is OUTSIDE AppDataProvider and ProtectedRoute. */}
          <Route path="/accept-task-invite" element={<AcceptTaskInvitePage />} />
                    {/* Public Firebase auth-action handler (password reset / email verify).
              Branded replacement for the default Firebase action page.
              Must stay OUTSIDE ProtectedRoute — users hit it while logged out. */}
          <Route path="/auth/action" element={<AuthActionPage />} />

          {/* Protected app routes */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/my-tasks" element={<MyTasksPage />} />
              <Route path="/conversations" element={<ConversationsPage />} />
              <Route path="/insights" element={<InsightsPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/team" element={<TeamPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/projects" element={<ProjectsOverviewPage />} />
              <Route path="/projects/:id" element={<ProjectPage />} />
              <Route path="/workspace" element={<WorkspacePage />} />
              <Route path="/workspace/:tab" element={<WorkspacePage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        {/* Universal pending-invite safety net.
            Inside AuthProvider + Router so it can use useAuth() and navigate,
            but OUTSIDE Routes so it surfaces on every page after sign-in. */}
        <PendingTaskInviteGate />
      </Router>
    </AuthProvider>
  );
}
