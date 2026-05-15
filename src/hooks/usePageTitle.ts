import { useMemo } from "react";
import { matchPath, useLocation } from "react-router-dom";

function toTitleCase(value: string) {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const routeTitles: Record<string, string> = {
  "/": "Dashboard",
  "/dashboard": "Dashboard",

  "/workspace": "Overview",
  "/workspace/overview": "Overview",
  "/workspace/members": "Members",
  "/workspace/settings": "Settings",

  "/insights": "Insights",
  "/calendar": "Calendar",
  "/my-tasks": "My Tasks",
  "/team": "Team",
  "/reports": "Reports",
  "/settings": "Settings",
  "/login": "Login",
};

export function getPageTitleFromPath(pathname: string) {
  /**
   * 1. Exact routes first
   */
  if (routeTitles[pathname]) {
    return routeTitles[pathname];
  }

  /**
   * 2. Dynamic project pages
   */
  if (
    matchPath("/projects/:projectId", pathname) ||
    matchPath("/project/:projectId", pathname)
  ) {
    return "Project";
  }

  /**
   * 3. Dynamic invite/join pages
   */
  if (
    matchPath("/join/:inviteCode", pathname) ||
    matchPath("/invite/:inviteCode", pathname)
  ) {
    return "Join Workspace";
  }

  /**
   * 4. Future-proof fallback.
   *
   * Example:
   * /billing-history => Billing History
   * /client-portal => Client Portal
   */
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return "Dashboard";
  }

  const lastSegment = segments[segments.length - 1];

  /**
   * If the last segment looks like an ID, use the previous segment.
   *
   * Example:
   * /projects/abc123xyz => Projects
   */
  const looksLikeId =
    lastSegment.length >= 10 || /^[A-Za-z0-9_-]{8,}$/.test(lastSegment);

  if (looksLikeId && segments.length > 1) {
    return toTitleCase(segments[segments.length - 2]);
  }

  return toTitleCase(lastSegment);
}

export function usePageTitle() {
  const location = useLocation();

  return useMemo(() => {
    return getPageTitleFromPath(location.pathname);
  }, [location.pathname]);
}
