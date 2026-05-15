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
const myMembership = Array.isArray(members)
  ? members.find((m: any) => m.userId === user?.uid)
  : undefined;

const isWorkspaceOwner =
  !!user?.uid && workspaceData?.ownerId === user.uid;

const myRole = isWorkspaceOwner
  ? "owner"
  : myMembership?.role ?? "member";

const canCreateProjects =
  myRole === "owner" ||
  myRole === "admin" ||
  myMembership?.permissions?.canCreateProjects === true;

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
      <div className="relative flex-shrink-0 w-64 h-screen hidden lg:block">
        <aside className="absolute inset-0 flex flex-col bg-[#0F172A] border-r border-slate-800">
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
        onClick={() => setIsMobileMenuOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-slate-900 text-white rounded-lg"
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
            className="fixed inset-0 bg-black/60 z-[60] lg:hidden backdrop-blur-sm"
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
            className="lg:hidden fixed inset-y-0 left-0 z-[70] w-64 flex flex-col bg-[#0F172A] border-r border-slate-800"
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
      <div className="p-6 flex items-center justify-between flex-shrink-0">
        <Link to="/" className="flex items-center gap-3">
          <img
            src="/logo.png?v=2"
            alt="Workfine Logo"
            className="w-8 h-8 object-contain rounded-lg shadow-lg shadow-indigo-500/20"
          />
          <span className="text-2xl tracking-tight">
            <span className="font-extrabold text-white">Wurk</span>
            <span className="font-light text-white">fine</span>
          </span>
        </Link>

        {showCloseButton && (
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        )}
      </div>

      <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest px-2 mb-2 mt-4">
          Workspace
        </div>

        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2 rounded-xl transition-all group",
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
            <span className="font-medium text-sm">{item.name}</span>
          </NavLink>
        ))}

        <div className="px-3 mt-6">
          <div className="flex items-center justify-between mb-2 px-2">
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

            {canCreateProjects && (
              <button
                type="button"
                onClick={() => setShowCreateProject(true)}
                className="w-5 h-5 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-blue-600 transition-colors text-lg leading-none"
                title="New Project"
              >
                +
              </button>
            )}
          </div>

          {projects.length === 0 ? (
            <p className="text-xs text-gray-500 px-2 py-2 italic">
              No projects yet
            </p>
          ) : (
            projects.map((p) => (
              <div
                key={p.id}
                className="group flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-300 hover:bg-white/10 transition-colors cursor-pointer"
                onClick={() => {
                  navigate(`/projects/${p.id}`);
                  onClose();
                }}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: p.color ?? "#3b82f6" }}
                />

                <span className="truncate flex-1">{p.name}</span>

                {canDeleteProjects && (
                  <button
                    onClick={(e) => handleDelete(e, p.id)}
                    className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all text-xs px-1"
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

      <div className="p-4 border-t border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-3 p-2 bg-slate-800/30 rounded-xl">
          <div className="relative flex-shrink-0">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName ?? user.email ?? "User"}
                referrerPolicy="no-referrer"
                className="w-10 h-10 rounded-full object-cover border border-indigo-400/30"
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
                "w-10 h-10 rounded-full items-center justify-center",
                "text-white text-xs font-bold border border-indigo-400/30 flex-shrink-0",
                getAvatarColor(user?.email ?? user?.displayName ?? "user"),
                user?.photoURL ? "hidden" : "flex"
              )}
            >
              {getInitials(user?.displayName ?? user?.email ?? "User")}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {user?.displayName ??
                (user?.email
                  ? user.email.split("@")[0].replace(/[._-]/g, " ")
                  : "User")}
            </p>
            <p className="text-[10px] text-slate-500 truncate font-medium">
              {user?.email ?? ""}
            </p>
          </div>

          <button
            onClick={signOutUser}
            className="text-slate-500 hover:text-white transition-colors flex-shrink-0"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </>
  );
}
