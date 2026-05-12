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
import AppShell from "./components/AppShell";

import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import InsightsPage from "./pages/InsightsPage";
import MyTasksPage from "./pages/MyTasksPage";
import SettingsPage from "./pages/SettingsPage";
import ProjectPage from "./pages/ProjectPage";
import CalendarPage from "./pages/CalendarPage";
import WorkspacePage from "./pages/WorkspacePage";
import JoinWorkspacePage from "./pages/JoinWorkspacePage";

function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" />;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (user) {
    const pendingInviteCode = localStorage.getItem("pendingInviteCode");

    if (pendingInviteCode) {
      return <Navigate to={`/join/${pendingInviteCode}`} replace />;
    }

    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <AppDataProvider>
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

            {/* Public invite route.
                Important: this must NOT be inside ProtectedRoute.
                It must open for both signed-in and signed-out users. */}
            <Route path="/join/:inviteCode" element={<JoinWorkspacePage />} />

            {/* Protected app routes */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/my-tasks" element={<MyTasksPage />} />
                <Route path="/insights" element={<InsightsPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/projects/:id" element={<ProjectPage />} />
                <Route path="/workspace" element={<WorkspacePage />} />
                <Route path="/workspace/:tab" element={<WorkspacePage />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </AppDataProvider>
    </AuthProvider>
  );
}
