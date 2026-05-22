/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { NavLink, Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  BarChart2,
  CheckSquare,
  Calendar,
  Menu,
  X,
  LogOut,
  Users,
  Settings,
  Building2,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../context/AuthContext";
import { cn, getInitials, getAvatarColor } from "../lib/utils";
import { useAppData } from "../context/AppDataContext";
import { deleteProject } from "../lib/firebase/projects";
import CreateProjectModal from "./CreateProjectModal";

export default function Sidebar() {
  const { user, signOutUser, workspaceId } = useAuth();
  const { projects, members, workspaceData } = useAppData();

  const navigate = useNavigate();
  const location = useLocation();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);

  const safeMembers = Array.isArray(members) ? members : [];

  const myMembership = safeMembers.find((m: any) => m.userId === user?.uid);

  const isWorkspaceOwner = !!user?.uid && workspaceData?.ownerId === user.uid;

  const isActiveWorkspaceMember =
    isWorkspaceOwner ||
    myMembership?.status === "active" ||
    (!!user?.uid && !!workspaceId);

  const myRole = isWorkspaceOwner ? "owner" : myMembership?.role ?? "member";

  const canCreateProjects =
    !!user?.uid && !!workspaceId && isActiveWorkspaceMember;

  const canDeleteProjects =
    myRole === "owner" ||
    myRole === "admin" ||
    myMembership?.permissions?.canDeleteProjects === true;

  const handleDelete = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();

    if (!workspaceId) {
      alert("No active workspace found.");
      return;
    }

    if (!canDeleteProjects) {
      alert("You do not have permission to delete projects.");
      return;
    }

    if (!confirm("Delete this project? This action cannot be undone.")) {
      return;
    }

    await deleteProject(workspaceId, projectId);
  };

  const navItems = [
    { name: "Dashboard", icon: LayoutDashboard, path: "/" },
    { name: "Insights", icon: BarChart2, path: "/insights" },
    { name: "Calendar", icon: Calendar, path: "/calendar" },
    { name: "My Tasks", icon: CheckSquare, path: "/my-tasks" },
    { name: "Team", icon: Users, path: "/team" },
    { name: "Workspace", icon: Building2, path: "/workspace" },
    { name: "Settings", icon: Settings, path: "/settings" },
  ];

  return (
    <>
      <div className="relative hidden h-screen w-64 flex-shrink-0 lg:block">
        <aside className="absolute inset-0 flex flex-col border-r border-slate-800 bg-[#0F172A]">
          <SidebarContent
            user={user}
            signOutUser={signOutUser}
            projects={projects}
            navigate={navigate}
            location={location}
            navItems={navItems}
            handleDelete={handleDelete}
            setShowCreateProject={setShowCreateProject}
            canCreateProjects={canCreateProjects}
            canDeleteProjects={canDeleteProjects}
            onClose={() => {}}
          />
        </aside>
      </div>

      <button
        type="button"
        onClick={() => setIsMobileMenuOpen(true)}
        className="fixed left-4 top-4 z-50 rounded-lg bg-slate-900 p-2 text-white lg:hidden"
      >
        <Menu size={20} />
      </button>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm lg:hidden"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.aside
            initial={{ x: -256 }}
            animate={{ x: 0 }}
            exit={{ x: -256 }}
            transition={{ type: "tween", duration: 0.25 }}
            className="fixed inset-y-0 left-0 z-[70] flex w-64 flex-col border-r border-slate-800 bg-[#0F172A] lg:hidden"
          >
            <SidebarContent
              user={user}
              signOutUser={signOutUser}
              projects={projects}
              navigate={navigate}
              location={location}
              navItems={navItems}
              handleDelete={handleDelete}
              setShowCreateProject={setShowCreateProject}
              canCreateProjects={canCreateProjects}
              canDeleteProjects={canDeleteProjects}
              onClose={() => setIsMobileMenuOpen(false)}
              showCloseButton
            />
          </motion.aside>
        )}
      </AnimatePresence>

      <CreateProjectModal
        isOpen={showCreateProject}
        onClose={() => setShowCreateProject(false)}
      />
    </>
  );
}

interface SidebarContentProps {
  user: any;
  signOutUser: () => void | Promise<void>;
  projects: any[];
  navigate: (path: string) => void;
  location: any;
  navItems: { name: string; icon: any; path: string }[];
  handleDelete: (e: React.MouseEvent, id: string) => void;
  setShowCreateProject: (v: boolean) => void;
  canCreateProjects: boolean;
  canDeleteProjects: boolean;
  onClose: () => void;
  showCloseButton?: boolean;
}

function SidebarContent({
  user,
  signOutUser,
  projects,
  navigate,
  location,
  navItems,
  handleDelete,
  setShowCreateProject,
  canCreateProjects,
  canDeleteProjects,
  onClose,
  showCloseButton = false,
}: SidebarContentProps) {
  return (
    <>
      <div className="flex flex-shrink-0 items-center justify-between p-6">
        <Link to="/" onClick={onClose} className="flex items-center gap-3">
          <img
            src="/logo.png?v=2"
            alt="Workfine Logo"
            className="h-8 w-8 rounded-lg object-contain shadow-lg shadow-indigo-500/20"
          />
          <span className="text-2xl tracking-tight">
            <span className="font-extrabold text-white">Wurk</span>
            <span className="font-light text-white">fine</span>
          </span>
        </Link>

        {showCloseButton && (
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white"
          >
            <X size={20} />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-4">
        <div className="mb-2 mt-4 px-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
          Workspace
        </div>

        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2 transition-all",
                isActive
                  ? "bg-blue-600/20 text-blue-300"
                  : "text-slate-400 hover:text-white"
              )
            }
          >
            <item.icon
              size={18}
              className={cn(
                "transition-transform group-hover:scale-110",
                location.pathname === item.path ? "text-blue-300" : ""
              )}
            />
            <span className="text-sm font-medium">{item.name}</span>
          </NavLink>
        ))}

        <div className="mt-6 px-3">
          <div className="mb-2 flex items-center justify-between px-2">
            <NavLink
              to="/projects"
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  "text-[10px] font-semibold uppercase tracking-widest transition-colors hover:text-blue-300",
                  isActive ? "text-blue-300" : "text-gray-500"
                )
              }
            >
              PROJECTS
            </NavLink>

            <button
              type="button"
              onClick={() => {
                if (!canCreateProjects) {
                  alert("Workspace is still loading. Please refresh and try again.");
                  return;
                }

                setShowCreateProject(true);
                onClose();
              }}
              className="flex h-5 w-5 items-center justify-center rounded text-lg leading-none text-gray-400 transition-colors hover:bg-blue-600 hover:text-white"
              title="New Project"
            >
              +
            </button>
          </div>

          {projects.length === 0 ? (
            <p className="px-2 py-2 text-xs italic text-gray-500">
              No projects yet
            </p>
          ) : (
            projects.map((p) => (
              <div
                key={p.id}
                className="group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-300 transition-colors hover:bg-white/10"
                onClick={() => {
                  navigate(`/projects/${p.id}`);
                  onClose();
                }}
              >
                <span
                  className="h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: p.color ?? "#3b82f6" }}
                />

                <span className="flex-1 truncate">
                  {p.name || "Untitled Project"}
                </span>

                {canDeleteProjects && (
                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, p.id)}
                    className="px-1 text-xs text-gray-500 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
                    title="Delete project"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </nav>

      <div className="flex-shrink-0 border-t border-slate-800 p-4">
        <div className="flex items-center gap-3 rounded-xl bg-slate-800/30 p-2">
          <div className="relative flex-shrink-0">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName ?? user.email ?? "User"}
                referrerPolicy="no-referrer"
                className="h-10 w-10 rounded-full border border-indigo-400/30 object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  const fallback = e.currentTarget
                    .nextElementSibling as HTMLElement | null;
                  if (fallback) fallback.style.display = "flex";
                }}
              />
            ) : null}

            <div
              className={cn(
                "h-10 w-10 flex-shrink-0 items-center justify-center rounded-full",
                "border border-indigo-400/30 text-xs font-bold text-white",
                getAvatarColor(user?.email ?? user?.displayName ?? "user"),
                user?.photoURL ? "hidden" : "flex"
              )}
            >
              {getInitials(user?.displayName ?? user?.email ?? "User")}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">
              {user?.displayName ??
                (user?.email
                  ? user.email.split("@")[0].replace(/[._-]/g, " ")
                  : "User")}
            </p>
            <p className="truncate text-[10px] font-medium text-slate-500">
              {user?.email ?? ""}
            </p>
          </div>

          <button
            type="button"
            onClick={signOutUser}
            className="flex-shrink-0 text-slate-500 transition-colors hover:text-white"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </>
  );
}
