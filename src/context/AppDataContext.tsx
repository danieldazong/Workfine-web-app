import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  ReactNode,
} from "react";
import {
  onSnapshot,
  collection,
  doc,
  writeBatch,
  getDocs,
} from "firebase/firestore";
import { db } from "../lib/firebase/config";
import { useAuth } from "./AuthContext";
import { subscribeToProjects } from "../lib/firebase/projects";
import { Project } from "../types";

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  projectId?: string;
  workspaceId?: string;
  [key: string]: unknown;
}

interface TeamMember {
  id: string;
  name: string;
  role: string;
  email?: string;
  [key: string]: unknown;
}

interface WorkspaceMember {
  userId: string;
  email: string;
  displayName: string;
  avatar: string;
  avatarColor: string;
  role: "owner" | "admin" | "member" | "viewer";
  status: "active" | "pending" | "invited" | "suspended";
  joinedAt: any;
  invitedBy: string;
  lastActive: any;
  permissions: {
    canCreateProjects: boolean;
    canDeleteProjects: boolean;
    canInviteMembers: boolean;
    canManageTasks: boolean;
    canEdit?: boolean;
    canDelete?: boolean;
    canInvite?: boolean;
  };
}

interface PendingInvite {
  code: string;
  email: string;
  role: "admin" | "member" | "viewer";
  status: "pending" | "accepted" | "declined" | "expired";
  invitedBy: string;
  invitedByName: string;
  workspaceId: string;
  workspaceName: string;
  inviteCode: string;
  createdAt: any;
  expiresAt: any;
  acceptedAt: any;
}

interface WorkspaceData {
  id: string;
  workspaceId: string;
  name: string;
  ownerId: string;
  ownerEmail: string;
  createdAt: any;
  memberCount: number;
  plan: "free" | "pro";
  description?: string;
}

interface Note {
  id: string;
  title?: string;
  content?: string;
  body?: string;
  createdAt?: any;
  updatedAt?: any;
  [key: string]: any;
}


interface AppDataContextType {
  tasks: Task[];
  teamMembers: TeamMember[];
  notes: Note[];
  projects: Project[];
  loading: boolean;
  files: any[];
  members: WorkspaceMember[];
  pendingInvites: PendingInvite[];
  memberCount: number;
  workspaceData: WorkspaceData | null;
  cancelInvite: (inviteCode: string) => Promise<void>;
}

const AppDataContext = createContext<AppDataContextType>({
  tasks: [],
  teamMembers: [],
  notes: [],
  projects: [],
  loading: true,
  files: [],
  members: [],
  pendingInvites: [],
  memberCount: 0,
  workspaceData: null,
  cancelInvite: async () => {},
});

async function fixLegacyInvites(wsId: string): Promise<void> {
  try {
    const snap = await getDocs(collection(db, "workspaces", wsId, "invites"));

    const batch = writeBatch(db);
    let fixCount = 0;

    snap.docs.forEach((document) => {
      const data = document.data();
      const storedCode = data.code as string;

      if (storedCode && document.id !== storedCode) {
        batch.delete(document.ref);

        const correctRef = doc(db, "workspaces", wsId, "invites", storedCode);
        batch.set(correctRef, data);

        fixCount++;

        console.log(
          `[fixLegacyInvites] 🔧 Fixing invite: ${document.id} → ${storedCode}`
        );
      }
    });

    if (fixCount > 0) {
      await batch.commit();
      console.log(
        `[fixLegacyInvites] ✅ Fixed ${fixCount} legacy invite(s)`
      );
    }
  } catch (err: any) {
    console.error("[fixLegacyInvites] ❌ Failed:", err?.message || err);
  }
}

function getSeconds(v: any): number {
  if (!v) return 0;
  if (typeof v?.toMillis === "function") return Math.floor(v.toMillis() / 1000);
  if (typeof v?.seconds === "number") return v.seconds;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { user, workspaceId, setWorkspaceId } = useAuth();
  const uid = user?.uid ?? "";

  const [tasks, setTasks] = useState<Task[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [workspaceData, setWorkspaceData] = useState<WorkspaceData | null>(null);

  const resolvedRef = useRef(false);

  const cancelInvite = async (inviteCode: string): Promise<void> => {
    if (!workspaceId) throw new Error("No workspace found");

    console.log("[cancelInvite] 🗑️ Deleting invite:", inviteCode);

    const batch = writeBatch(db);

    batch.delete(doc(db, "workspaces", workspaceId, "invites", inviteCode));
    batch.delete(doc(db, "invites", inviteCode));

    await batch.commit();

    console.log("[cancelInvite] ✅ Invite deleted");
  };

  // User personal listeners: notes and legacy teamMembers only.
  useEffect(() => {
    if (!uid) {
      setTeamMembers([]);
      setNotes([]);
      return;
    }

    const unsubMembers = onSnapshot(
      collection(db, "users", uid, "teamMembers"),
      (snap) => {
        const data: TeamMember[] = snap.docs.map(
          (d) =>
            ({
              id: d.id,
              ...(d.data() as Omit<TeamMember, "id">),
            } as TeamMember)
        );
        setTeamMembers(data);
      },
      (err) => console.warn("[AppData] user teamMembers error:", err.code)
    );

    const unsubNotes = onSnapshot(
      collection(db, "users", uid, "notes"),
      (snap) => {
        const data: Note[] = snap.docs.map(
          (d) =>
            ({
              id: d.id,
              ...(d.data() as Omit<Note, "id">),
            } as Note)
        );
        setNotes(data);
      },
      (err) => console.warn("[AppData] user notes error:", err.code)
    );

    return () => {
      unsubMembers();
      unsubNotes();
    };
  }, [uid]);

  // Real-time listener for users/{uid}.workspaceId
  useEffect(() => {
    if (!uid) return;

    const unsubUserDoc = onSnapshot(
      doc(db, "users", uid),
      (snap) => {
        if (!snap.exists()) return;

        const firestoreWsId = snap.data().workspaceId as string | undefined;

        if (firestoreWsId && firestoreWsId !== workspaceId) {
          console.log(
            "[AppData] 🔄 workspaceId changed:",
            workspaceId,
            "→",
            firestoreWsId
          );

          setWorkspaceId(firestoreWsId);
        }
      },
      (err) => console.warn("[AppData] user doc listener error:", err.code)
    );

    return () => unsubUserDoc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // Workspace shared listeners: workspace, members, invites, projects, tasks.
  useEffect(() => {
    if (!uid || !workspaceId) {
      setTasks([]);
      setProjects([]);
      setMembers([]);
      setPendingInvites([]);
      setWorkspaceData(null);
      setLoading(false);
      return;
    }

    console.log("[AppData] 🔄 Attaching workspace listeners:", workspaceId);

    resolvedRef.current = false;
    setLoading(true);

       let wsReady = false;
    let membersReady = false;
    let invitesReady = false;
    let projectsReady = false;
    let tasksReady = false;

        let latestMembers: WorkspaceMember[] = [];
    let latestProjects: Project[] = [];
    let latestTasks: Task[] = [];
    let latestWorkspaceData: WorkspaceData | null = null;
    function isTrustedActiveMember(member: WorkspaceMember | undefined) {
      if (!member) return false;

      const memberUid = (member as any).userId || (member as any).uid || (member as any).id;

      if (latestWorkspaceData?.ownerId === memberUid) {
        return member.status === "active";
      }

      return member.status === "active";
    }


           function getMyWorkspaceRole() {
      const mine = latestMembers.find((m: any) => {
        const memberUid = m.userId || m.uid || m.id;
        return memberUid === uid;
      });

      if (latestWorkspaceData?.ownerId === uid) {
        return "owner";
      }

      return isTrustedActiveMember(mine) ? mine?.role ?? "member" : null;
    }


       function isActiveMemberOrOwner() {
      const mine = latestMembers.find((m: any) => {
        const memberUid = m.userId || m.uid || m.id;
        return memberUid === uid;
      });

      return latestWorkspaceData?.ownerId === uid || isTrustedActiveMember(mine);
    }



    function canAccessProject(project: Project) {
      if (!uid) return false;

      const myRole = getMyWorkspaceRole();

      if (myRole === "owner" || myRole === "admin") {
        return true;
      }

      if (project.visibility === "private") {
        return (
          project.createdBy === uid ||
          project.ownerId === uid ||
          project.uid === uid ||
          (Array.isArray(project.memberIds) && project.memberIds.includes(uid)) ||
          (Array.isArray(project.collaboratorUids) &&
            project.collaboratorUids.includes(uid))
        );
      }

      return isActiveMemberOrOwner();
    }

    function getAccessibleProjects() {
      return latestProjects.filter((project) => canAccessProject(project));
    }


    function publishAccessibleData() {
      const accessibleProjects = getAccessibleProjects();
      const accessibleProjectIds = new Set(accessibleProjects.map((p) => p.id));

      const myEmail = user?.email?.toLowerCase().trim() ?? "";

      const accessibleTasks = latestTasks.filter((task: any) => {
        const taskProjectId = String(task.projectId || "").trim();

        /**
         * Show every task attached to projects the current user can access.
         */
        if (taskProjectId && accessibleProjectIds.has(taskProjectId)) {
          return true;
        }

        /**
         * Show personal/unprojected tasks created or owned by the user.
         */
        if (task.createdBy === uid || task.ownerId === uid || task.uid === uid) {
          return true;
        }

        /**
         * Show tasks assigned to the user by uid.
         */
        if (task.assigneeId === uid || task.assignedToUid === uid) {
          return true;
        }

        if (Array.isArray(task.assigneeIds) && task.assigneeIds.includes(uid)) {
          return true;
        }

        if (Array.isArray(task.assignedTo) && task.assignedTo.includes(uid)) {
          return true;
        }

        if (Array.isArray(task.memberIds) && task.memberIds.includes(uid)) {
          return true;
        }

        if (
          Array.isArray(task.collaboratorUids) &&
          task.collaboratorUids.includes(uid)
        ) {
          return true;
        }

        /**
         * Show tasks assigned to the user's email.
         */
        if (
          myEmail &&
          typeof task.assignee === "string" &&
          task.assignee.toLowerCase().trim() === myEmail
        ) {
          return true;
        }

        if (
          myEmail &&
          typeof task.assigneeEmail === "string" &&
          task.assigneeEmail.toLowerCase().trim() === myEmail
        ) {
          return true;
        }

        if (
          myEmail &&
          Array.isArray(task.assigneeEmails) &&
          task.assigneeEmails
            .map((email: any) => String(email).toLowerCase().trim())
            .includes(myEmail)
        ) {
          return true;
        }

        return false;
      });


      setProjects(accessibleProjects);
      setTasks(accessibleTasks);
    }

    function tryResolve() {
      if (
        !resolvedRef.current &&
        wsReady &&
        membersReady &&
        invitesReady &&
        projectsReady &&
        tasksReady
      ) {
        resolvedRef.current = true;
        setLoading(false);
        console.log("[AppData] ✅ Workspace data ready");
      }
    }


    const timeout = setTimeout(() => {
      if (!resolvedRef.current) {
        resolvedRef.current = true;
        setLoading(false);
        console.warn("[AppData] ⚠️ Workspace safety timeout");
      }
    }, 6000);

    fixLegacyInvites(workspaceId);

    const unsubWorkspace = onSnapshot(
           doc(db, "workspaces", workspaceId),
      (snap) => {
        if (snap.exists()) {
          latestWorkspaceData = {
            id: snap.id,
            ...snap.data(),
          } as WorkspaceData;

          setWorkspaceData(latestWorkspaceData);
        } else {
          latestWorkspaceData = null;
          setWorkspaceData(null);
        }

        publishAccessibleData();

        wsReady = true;
        tryResolve();
      },

      (err) => {
        console.warn("[AppData] workspace doc error:", err.code);
        wsReady = true;
        tryResolve();
      }
    );

    const unsubWsMembers = onSnapshot(
      collection(db, "workspaces", workspaceId, "members"),
      (snap) => {
        const data = snap.docs.map((d) => {
          const raw = d.data() as any;

          return {
            userId: raw.userId ?? d.id,
            ...raw,
          } as WorkspaceMember;
        });

                latestMembers = data;
        setMembers(data);
        publishAccessibleData();

        console.log("[AppData] workspace members:", data.length);


              const iStillMember =
          latestWorkspaceData?.ownerId === uid || snap.docs.some((d) => d.id === uid);

        if (snap.docs.length > 0 && !iStillMember) {
          console.warn(
            "[AppData] ⚠️ Current user is not a member of workspace:",
            workspaceId
          );
        }

        membersReady = true;
        tryResolve();
      },
      (err) => {
        console.warn("[AppData] members error:", err.code);
        membersReady = true;
        tryResolve();
      }
    );

    const unsubInvites = onSnapshot(
      collection(db, "workspaces", workspaceId, "invites"),
      (snap) => {
        const data = snap.docs
          .filter((d) => d.data().status !== "accepted")
          .map(
            (d) =>
              ({
                code: d.id,
                ...d.data(),
              } as unknown as PendingInvite)
          );

        setPendingInvites(data);

        console.log("[AppData] pending invites:", data.length);

        invitesReady = true;
        tryResolve();
      },
      (err) => {
        console.warn("[AppData] invites error:", err.code);
        invitesReady = true;
        tryResolve();
      }
    );

       const unsubProjects = subscribeToProjects(workspaceId, (data) => {
      latestProjects = data;
      publishAccessibleData();

      projectsReady = true;
      tryResolve();
    });


    const unsubTasks = onSnapshot(
      collection(db, "workspaces", workspaceId, "tasks"),
      (snap) => {
        const data: Task[] = snap.docs.map(
          (d) =>
            ({
              id: d.id,
              ...(d.data() as Omit<Task, "id">),
            } as Task)
        );

        data.sort((a, b) => getSeconds(b.createdAt) - getSeconds(a.createdAt));

                latestTasks = data;
        publishAccessibleData();

        console.log("[AppData] workspace tasks:", data.length);


        tasksReady = true;
        tryResolve();
      },
      (err) => {
        console.warn("[AppData] tasks error:", err.code);
        tasksReady = true;
        tryResolve();
      }
    );

    return () => {
      console.log("[AppData] 🧹 Cleaning workspace listeners:", workspaceId);
      clearTimeout(timeout);
      unsubWorkspace();
      unsubWsMembers();
      unsubInvites();
      unsubProjects();
      unsubTasks();
    };
    }, [uid, workspaceId, user?.email]);

  return (
    <AppDataContext.Provider
      value={{
        tasks,
        teamMembers,
        notes,
        projects,
        loading,
        files: [],
        members,
        pendingInvites,
        memberCount: members.filter((m) => m.status === "active").length,
        workspaceData,
        cancelInvite,
      }}
    >
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData(): AppDataContextType {
  return useContext(AppDataContext);
}
