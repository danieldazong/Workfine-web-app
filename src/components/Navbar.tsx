/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Search,
  Bell,
  HelpCircle,
  MessageCircle,
  AtSign,
  CheckCheck,
} from "lucide-react";
import { matchPath, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useAppData } from "../context/AppDataContext";
import { useNotifications } from "../hooks/useNotifications";
import { resolveWorkspaceDisplayId } from "../lib/utils";





interface NavbarProps {
  title?: string;
}

const PRIORITY_COLOR: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-orange-400",
  low: "bg-green-500",
};

function toTitleCase(value: string) {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function notificationTime(createdAtMs?: number) {
  const ms = Number(createdAtMs || 0);

  if (!ms) return "";

  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(ms));
}

function getWorkspaceTabTitle(pathname: string) {
  if (pathname === "/workspace" || pathname === "/workspace/overview") {
    return "Overview";
  }

  if (pathname === "/workspace/members") {
    return "Members";
  }

  if (pathname === "/workspace/settings") {
    return "Settings";
  }

  const lastSegment = pathname.split("/").filter(Boolean).pop();

  return lastSegment ? toTitleCase(lastSegment) : "Overview";
}
function looksLikeId(value?: string | null) {
  const clean = String(value || "").trim();

  if (!clean) return false;

  return (
    clean.length >= 12 ||
    /^[A-Za-z0-9_-]{10,}$/.test(clean) ||
    /^[0-9a-f]{20,}$/i.test(clean)
  );
}

function getPageMeta(pathname: string, projects: any[]) {
  /**
   * Workspace routes
   *
   * /workspace
   * /workspace/members
   * /workspace/settings
   */
  if (pathname === "/workspace" || pathname.startsWith("/workspace/")) {
    const tabTitle = getWorkspaceTabTitle(pathname);

    return {
      title: tabTitle,
      breadcrumbs: ["Workspace", tabTitle],
    };
  }

  /**
   * Dashboard
   */
  if (pathname === "/" || pathname === "/dashboard") {
    return {
      title: "Dashboard",
      breadcrumbs: ["Dashboard"],
    };
  }

  /**
   * Static routes
   */
  const staticRoutes: Record<string, string> = {
    "/calendar": "Calendar",
    "/insights": "Insights",
    "/my-tasks": "My Tasks",
    "/team": "Team",
    "/reports": "Reports",
    "/settings": "Settings",
    "/projects": "Projects",
    "/login": "Login",
  };

  if (staticRoutes[pathname]) {
    return {
      title: staticRoutes[pathname],
      breadcrumbs: [staticRoutes[pathname]],
    };
  }

  /**
   * Project details route
   *
   * /projects/:projectId
   */
  const projectMatch =
    matchPath("/projects/:projectId", pathname) ||
    matchPath("/project/:projectId", pathname);

  if (projectMatch?.params?.projectId) {
    const projectId = projectMatch.params.projectId;

      const project = projects.find(
      (x: any) => String(x?.id || "") === String(projectId || "")
    );

    const projectName = String(
      project?.name || project?.title || "Project"
    );

    const projectCode = String(project?.code || "");

    const projectTitle = project
      ? `${projectCode ? projectCode + " - " : ""}${projectName}`
      : "Project";


    return {
      title: projectTitle,
      breadcrumbs: ["Projects", projectTitle],
    };
  }

  /**
   * Join workspace route
   *
   * /join/:inviteCode
   * /invite/:inviteCode
   */
  if (
    matchPath("/join/:inviteCode", pathname) ||
    matchPath("/invite/:inviteCode", pathname)
  ) {
    return {
      title: "Join Workspace",
      breadcrumbs: ["Join Workspace"],
    };
  }

  /**
   * Future-proof fallback.
   *
   * Examples:
   * /billing-history => Billing History
   * /client-portal => Client Portal
   * /clients/abc123 => Clients
   */
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return {
      title: "Dashboard",
      breadcrumbs: ["Dashboard"],
    };
  }

  const lastSegment = segments[segments.length - 1];

  if (looksLikeId(lastSegment) && segments.length > 1) {
    const parentTitle = toTitleCase(segments[segments.length - 2]);

    return {
      title: parentTitle,
      breadcrumbs: [parentTitle],
    };
  }

  const fallbackTitle = toTitleCase(lastSegment);

  return {
    title: fallbackTitle,
    breadcrumbs: [fallbackTitle],
  };
}
function getAvatarInitial(
  displayName?: string | null,
  email?: string | null
): string {
  const name = String(displayName || "").trim();
  if (name) return name[0]!.toUpperCase();

  const mail = String(email || "").trim();
  if (mail) return mail[0]!.toUpperCase();

  return "U";
}

interface NavbarAvatarProps {
  photoURL?: string | null;
  displayName?: string | null;
  email?: string | null;
}

/**
 * Global avatar for every account.
 * - Shows the photo if present AND it loads successfully.
 * - Falls back to the colored letter avatar when there is no photo
 *   OR when the photo URL fails to load (broken/blocked/blank).
 * This guarantees a new account always shows its initial instead of
 * an empty circle.
 */
function NavbarAvatar({ photoURL, displayName, email }: NavbarAvatarProps) {
  const cleanPhoto = String(photoURL || "").trim();
  const [imgFailed, setImgFailed] = useState(false);

  // Reset the failure flag whenever the photo URL changes (e.g. after the
  // profile listener updates the user with a real photo).
  useEffect(() => {
    setImgFailed(false);
  }, [cleanPhoto]);

  const showImage = cleanPhoto !== "" && !imgFailed;
  const initial = getAvatarInitial(displayName, email);

  return (
    <div className="w-8 h-8 rounded-full bg-violet-100 border border-violet-200 flex items-center justify-center flex-none overflow-hidden">
      {showImage ? (
        <img
          src={cleanPhoto}
          alt={displayName || email || "User"}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span className="text-xs text-violet-600 font-bold">{initial}</span>
      )}
    </div>
  );
}

export default function Navbar({ title }: NavbarProps) {
    const { user, workspaceId } = useAuth();
    const appData = useAppData() as any;
  const workspaceData = appData?.workspaceData ?? null;
  const tasks = Array.isArray(appData?.tasks) ? appData.tasks : [];
  const projects = Array.isArray(appData?.projects) ? appData.projects : [];
  const isGuestView = Boolean(appData?.isGuestView);
  const navigate = useNavigate();
  const location = useLocation();

    const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);

  const {
    notifications,
    unreadCount,
    loading: notificationsLoading,
    markAsRead,
    markAllAsRead,
  } = useNotifications(user?.uid);


  const pageMeta = useMemo(() => {
    return getPageMeta(location.pathname, projects);
  }, [location.pathname, projects]);

  const navbarTitle = title || pageMeta.title;

    // Close dropdowns on click outside or Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
        setNotificationsOpen(false);
      }
    }

    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;

      if (containerRef.current && !containerRef.current.contains(target)) {
        setIsOpen(false);
      }

      if (
        notificationRef.current &&
        !notificationRef.current.contains(target)
      ) {
        setNotificationsOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);


  useEffect(() => {
    document.title = `${navbarTitle} | Wurkfine`;
  }, [navbarTitle]);

  const filteredTasks = useMemo(() => {
    if (query.length < 2) return [];

    const q = query.toLowerCase();

    return tasks.filter(
      (t: any) =>
        t.title?.toLowerCase().includes(q) ||
        t.status?.toLowerCase().includes(q) ||
        t.priority?.toLowerCase().includes(q)
    );
  }, [query, tasks]);

  const filteredProjects = useMemo(() => {
    if (query.length < 2) return [];

    const q = query.toLowerCase();

    return projects.filter(
      (p: any) =>
        p.name?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
    );
  }, [query, projects]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setIsOpen(val.length >= 2);
  };
  const handleNotificationClick = async (notification: any) => {
    if (!user?.uid) return;

    try {
      if (!notification.read) {
        await markAsRead(notification.id);
      }
    } catch (error) {
      console.warn("[Navbar] mark notification read failed:", error);
    }

    setNotificationsOpen(false);

    const taskId = String(
      notification.sourceTaskId || notification.taskId || ""
    ).trim();

    const commentId = String(notification.commentId || "").trim();
    const notificationWorkspaceId = String(notification.workspaceId || "").trim();
    const notificationProjectId = String(notification.projectId || "").trim();

    const params = new URLSearchParams();

    if (taskId) {
      params.set("taskId", taskId);
      params.set("highlight", taskId);
    }

    if (commentId) {
      params.set("commentId", commentId);
    }

    if (notificationWorkspaceId) {
      params.set("workspaceId", notificationWorkspaceId);
    }

    if (notificationProjectId) {
      params.set("projectId", notificationProjectId);
    }

    /**
     * IMPORTANT:
     * Always open notification task comments through /my-tasks.
     * Do NOT navigate to /projects/:projectId because shared/invited users
     * may not have access to the project page, even though they can access the task.
     */
    navigate(`/my-tasks?${params.toString()}`);
  };


    return (
    <header className="h-16 flex-shrink-0 flex items-center justify-between px-8 bg-white border-b border-slate-200 sticky top-0 z-40">
      <div className="flex items-center gap-6 min-w-0">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-800 leading-tight truncate">
            {navbarTitle}
          </h1>

          <div className="flex items-center gap-2 text-xs text-slate-400 whitespace-nowrap overflow-hidden">
                        <span className="font-mono truncate max-w-[160px]">
              {resolveWorkspaceDisplayId(workspaceId, workspaceData, user?.uid)}
            </span>

            {pageMeta.breadcrumbs.map((part, i) => (
              <React.Fragment key={`${part}-${i}`}>
                <span className="text-slate-300 flex-shrink-0">/</span>
                <span className="truncate">{part}</span>
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>


      <div className="flex items-center gap-6">
        <div ref={containerRef} className="hidden md:flex relative group w-64">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-violet-500 transition-colors"
            size={18}
          />

          <input
            type="text"
            value={query}
            onChange={handleSearchChange}
            onFocus={() => {
              if (query.length >= 2) setIsOpen(true);
            }}
            placeholder="Search tasks, projects..."
            className="w-full bg-slate-100 border border-slate-200 rounded-full pl-10 pr-4 py-2 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400/30 focus:border-violet-400 transition-all"
          />

          {isOpen && query.length >= 2 && (
            <div className="absolute top-[calc(100%+8px)] left-0 right-0 bg-white rounded-xl shadow-lg border border-slate-200 max-h-[400px] overflow-y-auto z-50 py-2">
              {filteredTasks.length === 0 && filteredProjects.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                  <Search size={24} className="mb-2 opacity-50" />
                  <p className="text-sm">No results found for "{query}"</p>
                </div>
              ) : (
                <>
                  {filteredTasks.length > 0 && (
                    <div className="mb-2">
                      <div className="flex items-center gap-3 px-4 py-1.5 mb-1">
                        <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider flex-none">
                          Tasks ({filteredTasks.length})
                        </span>
                        <div className="h-px bg-slate-100 flex-1" />
                      </div>

                      {filteredTasks.map((task: any) => (
                        <div
                          key={task.id}
                          onClick={() => {
                            setIsOpen(false);
                            setQuery("");
                            navigate("/my-tasks");
                          }}
                          className="flex items-start gap-2.5 px-4 py-2 hover:bg-slate-50 cursor-pointer transition-colors"
                        >
                          <span
                            className={`w-2 h-2 rounded-full mt-1.5 flex-none ${
                              PRIORITY_COLOR[
                                task.priority?.toLowerCase()
                              ] || "bg-slate-400"
                            }`}
                          />

                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-700 truncate">
                              {task.title}
                            </p>
                            <p className="text-xs text-slate-400 truncate mt-0.5">
                              {task.status || "To Do"}
                              {task.dueDate
                                ? ` · Due: ${new Date(
                                    task.dueDate
                                  ).toLocaleDateString()}`
                                : ""}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {filteredProjects.length > 0 && (
                    <div>
                      <div className="flex items-center gap-3 px-4 py-1.5 mb-1">
                        <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider flex-none">
                          Projects ({filteredProjects.length})
                        </span>
                        <div className="h-px bg-slate-100 flex-1" />
                      </div>

                      {filteredProjects.map((project: any) => (
                        <div
                          key={project.id}
                          onClick={() => {
                            setIsOpen(false);
                            setQuery("");
                            navigate(`/projects/${project.id}`);
                          }}
                          className="flex items-start gap-2.5 px-4 py-2 hover:bg-slate-50 cursor-pointer transition-colors"
                        >
                          <span
                            className="w-2 h-2 rounded-full mt-1.5 flex-none"
                            style={{
                              backgroundColor: project.color || "#8b5cf6",
                            }}
                          />

                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-700 truncate">
                                                            {String(project.name || project.title || "Untitled Project")}
                            </p>
                            <p className="text-xs text-slate-400 truncate mt-0.5">
                                                            {String(
                                project.description ||
                                  project.status ||
                                  "Active"
                              )}

                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
                    <div ref={notificationRef} className="relative">
            <button
              type="button"
              onClick={() => setNotificationsOpen((open) => !open)}
              className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors relative"
              title="Notifications"
              aria-label="Notifications"
            >
              <Bell size={20} />

              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white px-1">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {notificationsOpen && (
              <div className="absolute right-0 top-[calc(100%+10px)] w-[360px] max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl z-[80]">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">
                      Notifications
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Real-time task activity
                    </p>
                  </div>

                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={() => markAllAsRead()}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-violet-600 hover:bg-violet-50"
                    >
                      <CheckCheck size={13} />
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="max-h-[420px] overflow-y-auto py-1">
                  {notificationsLoading ? (
                    <div className="px-4 py-8 text-center text-sm text-slate-400">
                      Loading notifications...
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="px-4 py-10 text-center">
                      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                        <Bell size={18} />
                      </div>
                      <p className="text-sm font-medium text-slate-600">
                        No notifications yet
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Mentions and task comments will appear here.
                      </p>
                    </div>
                  ) : (
                    notifications.map((notification: any) => {
                      const isMention = notification.type === "mention";

                      return (
                        <button
                          key={notification.id}
                          type="button"
                          onClick={() => handleNotificationClick(notification)}
                          className={`w-full px-4 py-3 text-left transition-colors hover:bg-slate-50 ${
                            notification.read ? "bg-white" : "bg-violet-50/60"
                          }`}
                        >
                          <div className="flex gap-3">
                            <div
                              className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${
                                isMention
                                  ? "bg-violet-100 text-violet-600"
                                  : "bg-blue-100 text-blue-600"
                              }`}
                            >
                              {isMention ? (
                                <AtSign size={17} />
                              ) : (
                                <MessageCircle size={17} />
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-start gap-2">
                                <p className="min-w-0 flex-1 text-sm font-semibold text-slate-800 line-clamp-2">
                                  {notification.title}
                                </p>

                                <span className="flex-shrink-0 text-[10px] text-slate-400">
                                  {notificationTime(notification.createdAtMs)}
                                </span>
                              </div>

                              {notification.message && (
                                <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                                  {notification.message}
                                </p>
                              )}

                              {notification.commentPreview && (
                                <p className="mt-1 line-clamp-2 rounded-lg bg-white/80 px-2 py-1 text-xs text-slate-500">
                                  {notification.commentPreview}
                                </p>
                              )}

                              <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-400">
                                {notification.projectName && (
                                  <span className="truncate">
                                    {notification.projectName}
                                  </span>
                                )}

                                {notification.taskTitle && (
                                  <>
                                    <span>·</span>
                                    <span className="truncate">
                                      {notification.taskTitle}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>

                            {!notification.read && (
                              <span className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-violet-500" />
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          <button className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
            <HelpCircle size={20} />
          </button>
        </div>

                {user && (
          <NavbarAvatar
            photoURL={user.photoURL}
            displayName={user.displayName}
            email={user.email}
          />
        )}

      </div>
    </header>
  );
}
