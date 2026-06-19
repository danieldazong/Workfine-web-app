/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from "react";
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
  ChevronRight,
  MessageSquare,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../context/AuthContext";
import { cn } from "../lib/utils";
import {
  monogramGradient,
  monogramInitials,
  monogramSeed,
  resolveAvatarPhoto,
} from "../lib/monogram";
import { useAppData } from "../context/AppDataContext";
import { deleteProject } from "../lib/firebase/projects";
import CreateProjectModal from "./CreateProjectModal";



export default function Sidebar() {
    const { user, signOutUser, workspaceId, personalWorkspaceId } = useAuth();
  const { projects, members, workspaceData, isGuestView } = useAppData();


  const navigate = useNavigate();
  const location = useLocation();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);

  const safeMembers = Array.isArray(members) ? members : [];

  const myMembership = safeMembers.find((m: any) => {
    const memberUid = m.userId || m.uid || m.id;
    return !!user?.uid && memberUid === user.uid;
  });

  const isWorkspaceOwner = !!user?.uid && workspaceData?.ownerId === user.uid;

  const isActiveWorkspaceMember =
    isWorkspaceOwner ||
    myMembership?.status === "active" ||
    (!!user?.uid && !!workspaceId);

  const myRole = isWorkspaceOwner ? "owner" : myMembership?.role ?? "member";

  const canCreateProjects = !!user?.uid;

  const canDeleteSharedProjects =
    myRole === "owner" ||
    myRole === "admin" ||
    myMembership?.permissions?.canDeleteProjects === true;

  const effectivePersonalWorkspaceId =
    personalWorkspaceId || (user?.uid ? `personal_${user.uid}` : "");

  function isPrivateProject(project: any) {
    return (
      project.visibility === "private" ||
      project.projectScope === "private" ||
      project.isPrivateProject === true
    );
  }

  function isProjectOwner(project: any) {
    return (
      !!user?.uid &&
      (project.createdBy === user.uid ||
        project.ownerId === user.uid ||
        project.uid === user.uid ||
        (Array.isArray(project.memberIds) && project.memberIds.includes(user.uid)) ||
        (Array.isArray(project.collaboratorUids) &&
          project.collaboratorUids.includes(user.uid)))
    );
  }

  const { privateProjects, sharedProjects } = useMemo(() => {
    const privateList: any[] = [];
    const sharedList: any[] = [];

    const seen = new Set<string>();

    (Array.isArray(projects) ? projects : []).forEach((project: any) => {
      const projectWorkspaceId =
        project.workspaceId || project.projectWorkspaceId || project.sourceWorkspaceId || "";

      const key = `${projectWorkspaceId}:${project.id}`;

      if (seen.has(key)) return;
      seen.add(key);

      const belongsToPersonalWorkspace =
        !!effectivePersonalWorkspaceId &&
        projectWorkspaceId === effectivePersonalWorkspaceId;

      const belongsToActiveWorkspace =
        !!workspaceId && projectWorkspaceId === workspaceId;

      if (
        belongsToPersonalWorkspace ||
        (isPrivateProject(project) && isProjectOwner(project))
      ) {
        privateList.push(project);
        return;
      }

      if (belongsToActiveWorkspace && !isPrivateProject(project)) {
        sharedList.push(project);
      }
    });

    privateList.sort((a: any, b: any) => {
      const at = a.createdAt?.seconds || 0;
      const bt = b.createdAt?.seconds || 0;
      return bt - at;
    });

    sharedList.sort((a: any, b: any) => {
      const at = a.createdAt?.seconds || 0;
      const bt = b.createdAt?.seconds || 0;
      return bt - at;
    });

    return {
      privateProjects: privateList,
      sharedProjects: sharedList,
    };
  }, [projects, workspaceId, effectivePersonalWorkspaceId, user?.uid]);

  const handleDelete = async (e: React.MouseEvent, project: any) => {
    e.stopPropagation();

    const projectWorkspaceId =
      project.workspaceId ||
      project.projectWorkspaceId ||
      project.sourceWorkspaceId ||
      "";

    if (!projectWorkspaceId) {
      alert("No project workspace found.");
      return;
    }

    const privateProject = isPrivateProject(project);

    const canDeleteThisProject =
      privateProject ? isProjectOwner(project) : canDeleteSharedProjects;

    if (!canDeleteThisProject) {
      alert("You do not have permission to delete this project.");
      return;
    }

    if (!confirm("Delete this project? This action cannot be undone.")) {
      return;
    }

    await deleteProject(projectWorkspaceId, project.id);
  };

       const navItems = isGuestView
    ? [
        // Scoped guest navigation: only the tasks shared with them.
        { name: "My Tasks", icon: CheckSquare, path: "/my-tasks" },
        { name: "Conversations", icon: MessageSquare, path: "/conversations" },
        { name: "Settings", icon: Settings, path: "/settings" },
      ]
    : [
        { name: "Dashboard", icon: LayoutDashboard, path: "/" },
        { name: "Insights", icon: BarChart2, path: "/insights" },
        { name: "Calendar", icon: Calendar, path: "/calendar" },
        { name: "My Tasks", icon: CheckSquare, path: "/my-tasks" },
        { name: "Conversations", icon: MessageSquare, path: "/conversations" },
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
            privateProjects={privateProjects}
            sharedProjects={sharedProjects}
            navigate={navigate}
            location={location}
            navItems={navItems}
            handleDelete={handleDelete}
            setShowCreateProject={setShowCreateProject}
            canCreateProjects={canCreateProjects}
            canDeleteSharedProjects={canDeleteSharedProjects}
            isProjectOwner={isProjectOwner}
            isPrivateProject={isPrivateProject}
            isGuestView={isGuestView}
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
              privateProjects={privateProjects}
              sharedProjects={sharedProjects}
              navigate={navigate}
              location={location}
              navItems={navItems}
              handleDelete={handleDelete}
              setShowCreateProject={setShowCreateProject}
              canCreateProjects={canCreateProjects}
              canDeleteSharedProjects={canDeleteSharedProjects}
              isProjectOwner={isProjectOwner}
              isPrivateProject={isPrivateProject}
              isGuestView={isGuestView}

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
  privateProjects: any[];
  sharedProjects: any[];
  navigate: (path: string, options?: { state?: any; replace?: boolean }) => void;
  location: any;
  navItems: { name: string; icon: any; path: string }[];
  handleDelete: (e: React.MouseEvent, project: any) => void;
  setShowCreateProject: (v: boolean) => void;
  canCreateProjects: boolean;
  canDeleteSharedProjects: boolean;
  isProjectOwner: (project: any) => boolean;
  isPrivateProject: (project: any) => boolean;
  onClose: () => void;
  showCloseButton?: boolean;
  isGuestView?: boolean;
}



function SidebarContent({
  user,
  signOutUser,
  privateProjects,
  sharedProjects,
  navigate,
  location,
  navItems,
  handleDelete,
  setShowCreateProject,
  canCreateProjects,
  canDeleteSharedProjects,
  isProjectOwner,
  isPrivateProject,
  onClose,
  showCloseButton = false,
  isGuestView = false,
}: SidebarContentProps) {

  function renderProject(project: any) {
    const privateProject = isPrivateProject(project);

    const canDeleteThisProject = privateProject
      ? isProjectOwner(project)
      : canDeleteSharedProjects;

    return (
                 <div
        key={`${project.workspaceId || project.projectWorkspaceId || ""}:${project.id}`}
        className="group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-300 transition-colors hover:bg-white/10"
        onClick={(e) => {
          e.preventDefault();
          const targetPath = `/projects/${project.id}`;
          if (location.pathname !== targetPath) {
            navigate(targetPath, {
              state: { prefetchedProject: project },
            });
          }
          onClose();
        }}
      >
        <span
          className="h-2 w-2 flex-shrink-0 rounded-full"
          style={{ backgroundColor: project.color ?? "#3b82f6" }}
        />

        <span className="flex-1 truncate">
          {project.name || "Untitled Project"}
        </span>

        {canDeleteThisProject && (
          <button
            type="button"
            onClick={(e) => handleDelete(e, project)}
            className="px-1 text-xs text-gray-500 opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
            title="Delete project"
          >
            ✕
          </button>
        )}
      </div>
    );
  }

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

                                             {!isGuestView && (
          <div className="mt-6 px-3">
            {/* Section divider — separates Workspace nav from My Projects */}
            <div className="mx-2 mb-4 h-px bg-slate-700/60" />

                                   <div
              className={cn(
                "mb-2 flex items-center justify-between rounded-xl px-3 py-2 transition-all",
                location.pathname === "/projects" ? "bg-blue-600/20" : ""
              )}
            >


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
                MY PROJECTS
              </NavLink>

              <button
                type="button"
                onClick={() => {
                  if (!canCreateProjects) {
                    alert("Account is still loading. Please refresh and try again.");
                    return;
                  }

                  setShowCreateProject(true);
                  onClose();
                }}
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded text-lg leading-none transition-colors hover:bg-blue-600 hover:text-white",
                  location.pathname === "/projects" ? "text-blue-300" : "text-gray-400"
                )}
                title="New Project"
              >
                +
              </button>
            </div>

                        {privateProjects.length === 0 ? (
              <p className="px-2 py-2 text-xs italic text-gray-500">
                No private projects yet
              </p>
            ) : (
              <>
                {privateProjects.slice(0, 5).map((project) => renderProject(project))}
                {privateProjects.length > 5 && (
                  <button
                    type="button"
                    onClick={() => {
                      navigate("/projects");
                      onClose();
                    }}
                    className="group mt-0.5 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-blue-400 transition-colors hover:bg-white/5 hover:text-blue-300"
                  >
                    View more
                    <ChevronRight
                      size={13}
                      className="transition-transform group-hover:translate-x-0.5"
                    />
                  </button>
                )}
              </>
            )}


                        {/* Section divider — separates My Projects from Shared Projects */}
            <div className="mx-2 mb-4 mt-5 h-px bg-slate-700/60" />

            <div className="mb-2 px-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                SHARE PROJECT
              </span>
            </div>


                        {sharedProjects.length === 0 ? (
              <p className="px-2 py-2 text-xs italic text-gray-500">
                No shared projects yet
              </p>
            ) : (
              <>
                {sharedProjects.slice(0, 5).map((project) => renderProject(project))}
                {sharedProjects.length > 5 && (
                  <button
                    type="button"
                    onClick={() => {
                      navigate("/projects");
                      onClose();
                    }}
                    className="group mt-0.5 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-blue-400 transition-colors hover:bg-white/5 hover:text-blue-300"
                  >
                    View more
                    <ChevronRight
                      size={13}
                      className="transition-transform group-hover:translate-x-0.5"
                    />
                  </button>
                )}
              </>
            )}

          </div>
        )}

      </nav>

      <div className="flex-shrink-0 border-t border-slate-800 p-4">
        <div className="flex items-center gap-3 rounded-xl bg-slate-800/30 p-2">
                             <div className="relative flex-shrink-0">
            {resolveAvatarPhoto(user?.photoURL) ? (
              <img
                src={resolveAvatarPhoto(user?.photoURL)}
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
                "border border-indigo-400/30 text-xs font-semibold text-white select-none",
                resolveAvatarPhoto(user?.photoURL) ? "hidden" : "flex"
              )}
                                                                                    style={{
                background: monogramGradient(
                  monogramSeed(user?.email, user?.displayName)
                ),
                letterSpacing: "0.02em",
              }}


            >
              {monogramInitials(user?.displayName, user?.email)}
              {/* Both the gradient and the initials now derive from the same
                  canonical monogramSeed(email, name), so this avatar matches
                  the Conversations / TaskDetailPanel / TeamPage avatars
                  byte-for-byte for the same account. */}
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
