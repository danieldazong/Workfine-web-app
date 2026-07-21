/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from "react";
import { NavLink, Link, useLocation, useNavigate } from "react-router-dom";
import {
  collectionGroup,
  query as fsQuery,
  where as fsWhere,
  onSnapshot as fsOnSnapshot,
  limit as fsLimit,
} from "firebase/firestore";
import { db } from "../lib/firebase/config";
import { subscribeToProjects } from "../lib/firebase/projects";
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
  MoreVertical,
  Pencil,
  Trash2,
  PanelLeftClose,
  PanelLeft,
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
import ConfirmDialog from "./ConfirmDialog";
import TrialStatusCard from "./TrialStatusCard";




export default function Sidebar() {
    const { user, signOutUser, workspaceId, personalWorkspaceId } = useAuth();
  const { projects, members, workspaceData, isGuestView } = useAppData();


  const navigate = useNavigate();
  const location = useLocation();
  // Desktop-only collapse state, persisted to localStorage so the choice is
  // global across sessions/pages. Mobile drawer is unaffected (it always
  // shows the full sidebar). Pure UI — touches no roles, data, or protected logic.
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("wf-sidebar-collapsed") === "1";
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("wf-sidebar-collapsed", next ? "1" : "0");
      } catch {
        // ignore storage failures (private mode, etc.)
      }
      return next;
    });
  };

    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  // When set, the modal opens in EDIT mode pre-filled with this project.
  const [editProject, setEditProject] = useState<any | null>(null);
  // When set, the reusable ConfirmDialog asks before deleting this project.
  const [pendingDeleteProject, setPendingDeleteProject] = useState<any | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);


  // Permission check used by the kebab "Edit" option (mirrors delete rules).
  const canEditProject = (project: any) => {
    return isPrivateProject(project)
      ? isProjectOwner(project)
      : canDeleteSharedProjects;
  };


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
    // ── Externally-shared workspaces' projects ──────────────────────────────
  // Self-contained: the sidebar loads these directly so it never depends on
  // the "Shared with me" tab. Reuses the SAME members collection-group query
  // and subscribeToProjects listener that the tab uses.
  const [externalWorkspaceIds, setExternalWorkspaceIds] = useState<string[]>([]);
  const [externalProjects, setExternalProjects] = useState<any[]>([]);

  const myOwnWorkspaceIds = useMemo(
    () =>
      new Set(
        [personalWorkspaceId, user?.uid ? `personal_${user.uid}` : ""].filter(
          Boolean
        ) as string[]
      ),
    [personalWorkspaceId, user?.uid]
  );

  // Find external workspaces where I'm an active member (not my own).
  useEffect(() => {
    if (!user?.uid) {
      setExternalWorkspaceIds([]);
      return;
    }

    const membersQuery = fsQuery(
      collectionGroup(db, "members"),
      fsWhere("userId", "==", user.uid),
      fsLimit(200)
    );

    const unsub = fsOnSnapshot(
      membersQuery,
      (snap) => {
        const ids = new Set<string>();
        snap.docs.forEach((d) => {
          const data = d.data() as any;
          const status = String(data.status || "active").toLowerCase();
          if (status !== "active") return;
          const wid = String(data.workspaceId || "").trim();
          if (!wid) return;
          if (myOwnWorkspaceIds.has(wid)) return;
          ids.add(wid);
        });
        setExternalWorkspaceIds(Array.from(ids));
      },
      (err) => {
        console.warn("[Sidebar] external members listener:", err.message);
      }
    );

    return () => unsub();
  }, [user?.uid, myOwnWorkspaceIds]);

  // Subscribe to each external workspace's projects and merge them.
  useEffect(() => {
    if (externalWorkspaceIds.length === 0) {
      setExternalProjects([]);
      return;
    }

    const byWorkspace: Record<string, any[]> = {};
    const unsubs = externalWorkspaceIds.map((wid) =>
      subscribeToProjects(wid, (list) => {
        byWorkspace[wid] = (Array.isArray(list) ? list : []).filter(
          (p: any) => p?.pinnedToWorkspace === true
        );
        const merged = Object.values(byWorkspace).flat();
        setExternalProjects(merged);
      })
    );

    return () => unsubs.forEach((u) => u && u());
  }, [externalWorkspaceIds]);


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

        // Append externally-shared (curated) projects from other workspaces,
    // de-duplicated against what's already in the shared list.
    const sharedSeen = new Set(
      sharedList.map(
        (p: any) =>
          `${p.workspaceId || p.projectWorkspaceId || p.sourceWorkspaceId || ""}:${p.id}`
      )
    );

        (Array.isArray(externalProjects) ? externalProjects : []).forEach((p: any) => {
      const wid =
        p.workspaceId || p.projectWorkspaceId || p.sourceWorkspaceId || "";
      const key = `${wid}:${p.id}`;
      if (sharedSeen.has(key)) return;
      sharedSeen.add(key);
      // Mark as read-only: these belong to another owner's workspace, so the
      // guest must never see Edit/Delete on them. Backend rules already block
      // the action; this hides the kebab for correct UX.
      sharedList.push({ ...p, __isExternalReadOnly: true });
    });


    return {
      privateProjects: privateList,
      sharedProjects: sharedList,
    };
  }, [projects, workspaceId, effectivePersonalWorkspaceId, user?.uid, externalProjects]);



    // Opens the reusable ConfirmDialog instead of the native browser confirm().
  const handleDelete = (e: React.MouseEvent, project: any) => {
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

    const canDeleteThisProject = privateProject
      ? isProjectOwner(project)
      : canDeleteSharedProjects;

    if (!canDeleteThisProject) {
      alert("You do not have permission to delete this project.");
      return;
    }

    setPendingDeleteProject(project);
  };

    // Runs the real deletion after the user confirms in the modal.
  const confirmDeleteProject = async () => {
    const project = pendingDeleteProject;
    if (!project) return;

    const projectWorkspaceId =
      project.workspaceId ||
      project.projectWorkspaceId ||
      project.sourceWorkspaceId ||
      "";

    setDeleteBusy(true);
    try {
      await deleteProject(projectWorkspaceId, project.id);
      setPendingDeleteProject(null);

      // If the user is currently viewing the project that was just deleted,
      // redirect them to the Projects overview so they don't land on a dead
      // "Project not found" page.
      if (location.pathname === `/projects/${project.id}`) {
        navigate("/projects", { replace: true });
      }
    } catch (err) {
      console.error("[Sidebar] deleteProject failed:", err);
    } finally {
      setDeleteBusy(false);
    }
  };



       const navItems = isGuestView
    ? [
        // Scoped guest navigation: only the tasks shared with them.
        { name: "My Tasks", icon: CheckSquare, path: "/my-tasks" },
        { name: "Conversations", icon: MessageSquare, path: "/conversations" },
        { name: "Settings", icon: Settings, path: "/settings" },
      ]
    : [
                { name: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
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
            <div
        className={cn(
          "relative hidden h-screen flex-shrink-0 transition-[width] duration-200 ease-in-out lg:block",
          isCollapsed ? "w-20" : "w-64"
        )}
      >
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
            setEditProject={setEditProject}
            canEditProject={canEditProject}
            canCreateProjects={canCreateProjects}
            canDeleteSharedProjects={canDeleteSharedProjects}
            isProjectOwner={isProjectOwner}
            isPrivateProject={isPrivateProject}
            isGuestView={isGuestView}
            isCollapsed={isCollapsed}
            onToggleCollapsed={toggleCollapsed}
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
            setEditProject={setEditProject}
            canEditProject={canEditProject}
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
        isOpen={showCreateProject || !!editProject}
        editProject={editProject}
        onClose={() => {
          setShowCreateProject(false);
          setEditProject(null);
        }}
      />

      <ConfirmDialog
        open={!!pendingDeleteProject}
        tone="danger"
        title="Delete project?"
        message="This permanently deletes the project and everything in it. This cannot be undone."
        confirmLabel="Delete"
        busy={deleteBusy}
        onConfirm={confirmDeleteProject}
        onCancel={() => {
          if (!deleteBusy) setPendingDeleteProject(null);
        }}
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
  setEditProject: (project: any | null) => void;
  canEditProject: (project: any) => boolean;
  canCreateProjects: boolean;
  canDeleteSharedProjects: boolean;
  isProjectOwner: (project: any) => boolean;
  isPrivateProject: (project: any) => boolean;
    onClose: () => void;
  showCloseButton?: boolean;
  isGuestView?: boolean;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
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
  setEditProject,
  canEditProject,
  canCreateProjects,
  canDeleteSharedProjects,
  isProjectOwner,
  isPrivateProject,
    onClose,
  showCloseButton = false,
  isGuestView = false,
  isCollapsed = false,
  onToggleCollapsed,
}: SidebarContentProps) {

  // Tracks which project's kebab menu is open (by composite key).
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);


    function renderProject(project: any) {
    const privateProject = isPrivateProject(project);

    // Projects shared from another owner's workspace are read-only for guests:
    // never show Edit/Delete (and the backend rules block it anyway).
    const isExternalReadOnly = project.__isExternalReadOnly === true;

    const canDeleteThisProject = isExternalReadOnly
      ? false
      : privateProject
        ? isProjectOwner(project)
        : canDeleteSharedProjects;

    const canEditThisProject = isExternalReadOnly ? false : canEditProject(project);


    const rowKey = `${project.workspaceId || project.projectWorkspaceId || ""}:${project.id}`;
    const menuOpen = openMenuKey === rowKey;

    return (
      <div
        key={rowKey}
        className="group relative flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-gray-300 transition-colors hover:bg-white/10"
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

        {(canEditThisProject || canDeleteThisProject) && (
          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenuKey(menuOpen ? null : rowKey);
              }}
              className={cn(
                "rounded p-0.5 text-gray-500 transition-all hover:bg-white/10 hover:text-white",
                menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              )}
              title="More options"
            >
              <MoreVertical size={14} />
            </button>

            {menuOpen && (
              <>
                {/* Invisible backdrop closes the menu on outside click. */}
                <div
                  className="fixed inset-0 z-[80]"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenuKey(null);
                  }}
                />

                <div
                  className="absolute right-0 top-7 z-[90] w-32 overflow-hidden rounded-lg border border-slate-700 bg-[#1E293B] py-1 shadow-xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  {canEditThisProject && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuKey(null);
                        setEditProject(project);
                        onClose();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-200 transition-colors hover:bg-white/10"
                    >
                      <Pencil size={13} />
                      Edit
                    </button>
                  )}

                  {canDeleteThisProject && (
                    <button
                      type="button"
                      onClick={(e) => {
                        setOpenMenuKey(null);
                        handleDelete(e, project);
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/10"
                    >
                      <Trash2 size={13} />
                      Delete
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    );
  }


  return (
    <>
                  <div
        className={cn(
          "flex flex-shrink-0",
          isCollapsed
            ? // COLLAPSED: stack logo + toggle vertically, centered on the
              // same axis as the nav icons below.
              "flex-col items-center gap-4 px-2 py-6"
            : // EXPANDED: original horizontal row, logo left / toggle right.
              "items-center justify-between p-6"
        )}
      >
        <Link
          to="/"
          onClick={onClose}
          className={cn(
            "flex items-center overflow-hidden",
            isCollapsed ? "justify-center" : "gap-3"
          )}
          title="WorkFine"
        >
          <img
            src="/logo.png?v=2"
            alt="Workfine Logo"
            className={cn(
              "flex-shrink-0 rounded-lg object-contain shadow-lg shadow-indigo-500/20",
              // Bigger logo when collapsed so it anchors the rail cleanly.
              isCollapsed ? "h-10 w-10" : "h-8 w-8"
            )}
          />
          {!isCollapsed && (
            <span className="text-2xl tracking-tight whitespace-nowrap">
              <span className="font-extrabold text-white">Work</span>
              <span className="font-light text-white">Fine</span>
            </span>
          )}
        </Link>

        {showCloseButton ? (
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white"
          >
            <X size={20} />
          </button>
        ) : (
          // Desktop-only collapse toggle. Hidden when the mobile drawer is
          // showing (showCloseButton === true) so it never overlaps the X.
          onToggleCollapsed && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              className={cn(
                "hidden text-slate-400 transition-colors hover:text-white lg:flex lg:items-center lg:justify-center",
                // When collapsed, give it a subtle hover surface so the
                // centered icon reads as a real tap target in the rail.
                isCollapsed ? "h-9 w-9 rounded-lg hover:bg-white/10" : ""
              )}
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? <PanelLeft size={20} /> : <PanelLeftClose size={18} />}
            </button>
          )
        )}
      </div>



            <nav className="flex-1 space-y-1 overflow-y-auto px-4">
        {!isCollapsed && (
          <div className="mb-2 mt-4 px-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
            Workspace
          </div>
        )}


                        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={onClose}
            title={isCollapsed ? item.name : undefined}
            className={({ isActive }) =>
              cn(
                "group flex items-center rounded-xl py-2 transition-all",
                // COLLAPSED: center the icon in a square hit-area so the active
                // blue chip reads as a clean square, matching the rail width.
                // EXPANDED: original full-width pill with label.
                isCollapsed ? "mx-auto h-10 w-10 justify-center px-0" : "gap-3 px-3",
                isActive
                  ? "bg-blue-600/20 text-blue-300"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              )
            }
          >
            <item.icon
              size={18}
              className={cn(
                "flex-shrink-0 transition-transform group-hover:scale-110",
                location.pathname === item.path ? "text-blue-300" : ""
              )}
            />
            {!isCollapsed && (
              <span className="text-sm font-medium">{item.name}</span>
            )}
          </NavLink>
        ))}



                                                                                          {!isGuestView && !isCollapsed && (
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
        <TrialStatusCard isCollapsed={isCollapsed} />

        <div
          className={cn(
            "flex items-center rounded-xl bg-slate-800/30 p-2",
            isCollapsed ? "justify-center" : "gap-3"
          )}
        >

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



                    {!isCollapsed && (
            <>
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
            </>
          )}

        </div>
      </div>
    </>
  );
}
