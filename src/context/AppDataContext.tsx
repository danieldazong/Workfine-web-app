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
    collectionGroup,
    doc,
    query,
    where,
    limit,
    writeBatch,
    getDocs,
    getDoc,
  } from "firebase/firestore";
  import { db } from "../lib/firebase/config";
  import { useAuth } from "./AuthContext";
  import { subscribeToProjects } from "../lib/firebase/projects";
  import { Project } from "../types";
  import { isTaskVisibleToUser } from "../lib/taskVisibility";

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
      role?: "owner" | "admin" | "member" | "viewer";
    status: "active" | "pending" | "invited" | "suspended";
    joinedAt: any;
    invitedBy: string;
    lastActive: any;
      permissions: {
      canView?: boolean;
      canComment?: boolean;
      canEdit?: boolean;
      canDelete?: boolean;
      canInvite?: boolean;
      canCreateProjects: boolean;
      canDeleteProjects: boolean;
      canInviteMembers: boolean;
      canManageTasks: boolean;
      canViewOnly?: boolean;
    };

  }

  interface PendingInvite {
    code: string;
    email: string;
    role: "admin" | "member" | "viewer" | "task_guest";
    status: "pending" | "accepted" | "declined" | "expired";
    invitedBy: string;
    invitedByName: string;
    workspaceId: string;
    workspaceName: string;
    inviteCode: string;
    createdAt: any;
    expiresAt: any;
    acceptedAt: any;
    /** "workspace" for normal workspace invites, "task" for per-task share invites. */
    inviteType?: "workspace" | "task";
    taskId?: string;
    taskTitle?: string;
    taskCode?: string;
    projectId?: string;
    projectName?: string;
  }


  interface WorkspaceData {
    id: string;
    workspaceId: string;
    name: string;
    ownerId: string;
    ownerEmail: string;
    ownerEmailLower?: string;
    createdBy?: string;
    uid?: string;
    userId?: string;
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


  interface WorkspacePerson {
    userId?: string;
    uid?: string;
    email?: string;
    emailLower?: string;
    displayName?: string;
    photoURL?: string;
    avatarColor?: string;
    type?: "guest" | "member";
    status?: "active" | "inactive" | "pending";
    invitedVia?: "task" | "project" | "workspace";
    lastActive?: any;
    projects?: Record<string, { projectName?: string; role?: string; status?: string }>;
    tasks?: Record<string, {
      taskId?: string;
      taskTitle?: string;
      taskCode?: string;
      projectId?: string;
      projectName?: string;
      shareId?: string;
      status?: string;
    }>;
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
    workspacePeople: WorkspacePerson[];
    cancelInvite: (inviteCode: string) => Promise<void>;
    /**
     * True when the signed-in user is operating as an external task guest:
     * their active workspace is their OWN personal workspace, but they have
     * one or more tasks shared with them. The UI renders a scoped guest shell
     * (no Team / Workspace / Insights / Dashboard) in this mode.
     */
    isGuestView: boolean;
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
    workspacePeople: [],
    cancelInvite: async () => {},
    isGuestView: false,
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
      const { user, workspaceId, personalWorkspaceId, setWorkspaceId } = useAuth();
    const uid = user?.uid ?? "";
    const [tasks, setTasks] = useState<Task[]>([]);
    // GLOBAL: per-user task copies from users/{uid}/tasks — the SAME source the
    // My Tasks page reads. Shared/guest tasks live here (written at invite-accept),
    // NOT in workspaces/{workspaceId}/tasks, so without this they never reach the
    // app-wide task list (and the Conversations composer dropdown).
    const [userTasks, setUserTasks] = useState<Task[]>([]);
    const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

    
    const [notes, setNotes] = useState<Note[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
      const [members, setMembers] = useState<WorkspaceMember[]>([]);
    const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
    const [workspaceData, setWorkspaceData] = useState<WorkspaceData | null>(null);
      const [workspacePeople, setWorkspacePeople] = useState<WorkspacePerson[]>([]);

    // GLOBAL: externally-shared (other owners') workspace projects + their tasks,
    // so Navbar search (and anything reading projects/tasks) can find them.
    // Reuses the SAME members collection-group query + subscribeToProjects the
    // Sidebar uses. Read-only: we never write here.
    const [sharedExternalProjects, setSharedExternalProjects] = useState<Project[]>([]);
    const [sharedExternalTasks, setSharedExternalTasks] = useState<Task[]>([]);



          const resolvedRef = useRef(false);
    const hasEverResolvedRef = useRef(false);
    // GLOBAL: keep the latest per-user tasks in a ref so publishAccessibleData()
    // (defined inside the workspace effect) can always merge the freshest copy
    // without needing to be in that effect's dependency array.
    const userTasksRef = useRef<Task[]>([]);
      // GLOBAL: holds the CURRENT workspace effect's publishAccessibleData() so the
    // per-user-tasks effect can re-publish WITHOUT forcing the whole workspace
    // listener set to tear down and re-subscribe (that re-subscribe storm was
    // flooding Firestore's channel → QUIC_TOO_MANY_RTOS → all real-time died).
    const publishAccessibleDataRef = useRef<() => void>(() => {});



    const cancelInvite = async (inviteCode: string): Promise<void> => {
      if (!workspaceId) throw new Error("No workspace found");

      console.log("[cancelInvite] 🗑️ Deleting invite:", inviteCode);

      const batch = writeBatch(db);

      batch.delete(doc(db, "workspaces", workspaceId, "invites", inviteCode));
      batch.delete(doc(db, "invites", inviteCode));

      await batch.commit();

      console.log("[cancelInvite] ✅ Invite deleted");
    };
      // Keep the ref in sync and re-publish the accessible task list whenever the
    // per-user task copies change, so shared/guest tasks appear app-wide in
    // real time (Conversations composer, etc.) without restructuring the
    // workspace listener effect.
    // GLOBAL: keep userTasksRef fresh AND nudge a republish when the per-user
    // task copies change, so shared/guest tasks surface in real time. We do NOT
    // call setTasks here — publishAccessibleData() is the single writer. Bumping
    // a state value forces the workspace listeners' publish path to re-run with
    // the latest userTasksRef. (Cheap: only fires when userTasks actually change.)
      useEffect(() => {
      userTasksRef.current = Array.isArray(userTasks) ? userTasks : [];
      // Re-publish the merged task list using the LIVE workspace publisher,
      // without changing any dependency that would re-subscribe the listeners.
      publishAccessibleDataRef.current();
    }, [userTasks]);


      // User personal listeners: notes, legacy teamMembers, and per-user task copies.
    useEffect(() => {
      if (!uid) {
        setTeamMembers([]);
        setNotes([]);
        setUserTasks([]);
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
          // GLOBAL: subscribe to users/{uid}/tasks — the canonical source the My Tasks
      // page reads. Shared/guest tasks are written here at invite-accept, so this
      // is what makes shared tasks visible app-wide (and in the Conversations
      // composer dropdown). Same flat shape My Tasks uses: { id, ...data }.
      const unsubUserTasks = onSnapshot(
        collection(db, "users", uid, "tasks"),
        (snap) => {
          const data: Task[] = snap.docs.map(
            (d) =>
              ({
                id: d.id,
                ...(d.data() as Omit<Task, "id">),
              } as Task)
          );
          setUserTasks(data);
          console.log("[AppData] user tasks (users/{uid}/tasks):", data.length);
        },
        (err) => {
          console.warn("[AppData] user tasks error:", (err as any)?.code || err);
          setUserTasks([]);
        }
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
        unsubUserTasks();
      };
    }, [uid]);
      // ── External shared workspaces: projects + tasks ────────────────────────────
    // Find workspaces where I'm an active member but that are NOT my own, then
    // live-subscribe to their projects and tasks. Merged into the global
    // projects/tasks arrays below so Navbar search includes shared items.
    useEffect(() => {
      if (!uid) {
        setSharedExternalProjects([]);
        setSharedExternalTasks([]);
        return;
      }

          const myOwnIds = new Set(
        [personalWorkspaceId, `personal_${uid}`].filter(Boolean) as string[]
      );

      const membersQuery = query(
        collectionGroup(db, "members"),
        where("userId", "==", uid),
        limit(200)
      );

      let projectUnsubs: Array<() => void> = [];
      let taskUnsubs: Array<() => void> = [];

      // GLOBAL: remember which external workspace ids we are CURRENTLY subscribed
      // to. The members collection-group snapshot re-fires constantly (reconnects,
      // ripple state writes). Re-subscribing every time tore down and re-created
      // every external project/task listener on each fire → a 👂 Listening storm
      // that flooded Firestore's channel. We now re-subscribe ONLY when the set of
      // external ids actually changes.
      let subscribedExternalKey = "";

      const projectsByWs: Record<string, Project[]> = {};
      const tasksByWs: Record<string, Task[]> = {};


      const republishProjects = () =>
        setSharedExternalProjects(Object.values(projectsByWs).flat());
      const republishTasks = () =>
        setSharedExternalTasks(Object.values(tasksByWs).flat());

      const unsubMembers = onSnapshot(
        membersQuery,
        (snap) => {
              const externalIds = new Set<string>();
          snap.docs.forEach((d) => {
            const data = d.data() as any;
            const status = String(data.status || "active").toLowerCase();
            if (status !== "active") return;
            const wid = String(data.workspaceId || "").trim();
            if (!wid || myOwnIds.has(wid)) return;
            externalIds.add(wid);
          });

          // GLOBAL: only re-subscribe when the external id SET truly changed.
          // Sorted, joined key makes the comparison order-independent. If the same
          // workspaces come back (the common case on every reconnect), bail out so
          // we never tear down / re-create the external listeners again.
          const nextExternalKey = Array.from(externalIds).sort().join("|");
          if (nextExternalKey === subscribedExternalKey) {
            return;
          }
          subscribedExternalKey = nextExternalKey;

          // The id set changed — tear down old per-workspace listeners and rebuild.
          projectUnsubs.forEach((u) => u && u());
          taskUnsubs.forEach((u) => u && u());
          projectUnsubs = [];
          taskUnsubs = [];
          Object.keys(projectsByWs).forEach((k) => delete projectsByWs[k]);
          Object.keys(tasksByWs).forEach((k) => delete tasksByWs[k]);


          externalIds.forEach((wid) => {
            // Projects (reuse the shared helper — same shape as everywhere).
            projectUnsubs.push(
              subscribeToProjects(wid, (list) => {
                projectsByWs[wid] = Array.isArray(list) ? list : [];
                republishProjects();
              })
            );

            // Tasks of that external workspace.
            taskUnsubs.push(
              onSnapshot(
                collection(db, "workspaces", wid, "tasks"),
                (tsnap) => {
                  tasksByWs[wid] = tsnap.docs.map(
                    (d) => ({ id: d.id, ...(d.data() as Omit<Task, "id">) } as Task)
                  );
                  republishTasks();
                },
                (err) =>
                  console.warn(
                    "[AppData] external tasks listener:",
                    wid,
                    (err as any)?.code || err
                  )
              )
            );
          });

          republishProjects();
          republishTasks();
        },
        (err) =>
          console.warn(
            "[AppData] external members listener:",
            (err as any)?.code || err
          )
      );

      return () => {
        unsubMembers();
        projectUnsubs.forEach((u) => u && u());
        taskUnsubs.forEach((u) => u && u());
      };
    }, [uid, personalWorkspaceId]);



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
        setWorkspacePeople([]);
        setLoading(false);
        return;
      }


          console.log("[AppData] 🔄 Attaching workspace listeners:", workspaceId);

      resolvedRef.current = false;
      // Only show loading spinner on the very first load.
      // Subsequent re-subscribes keep cached data visible (tab-like switching).
      if (!hasEverResolvedRef.current) {
        setLoading(true);
      }


        let wsReady = false;
      let membersReady = false;
      let invitesReady = false;
      let projectsReady = false;
      let tasksReady = false;

          let latestMembers: WorkspaceMember[] = [];
      let latestWorkspaceProjects: Project[] = [];
      let latestPersonalProjects: Project[] = [];
      let latestTasks: Task[] = [];
      let latestWorkspaceData: WorkspaceData | null = null;
          function isTrustedActiveMember(member: WorkspaceMember | undefined) {
        if (!member) return false;

        const memberUid = String(
          (member as any).userId || (member as any).uid || (member as any).id || ""
        ).trim();

          const memberEmail = String(
          (member as any).emailLower ||
            (member as any).email_lowercase ||
            (member as any).email ||
            (member as any).emailAddress ||
            ""
        )
          .trim()
          .toLowerCase();


        const currentEmail = String(user?.email || "")
          .trim()
          .toLowerCase();

        const status = String((member as any).status || "").trim().toLowerCase();

        if (status !== "active") return false;

        if (latestWorkspaceData?.ownerId === memberUid) return true;

        return memberUid === uid || Boolean(currentEmail && memberEmail === currentEmail);
      }


            function getMyWorkspaceRole() {
              const mine = latestMembers.find((m: any) => {
          const memberUid = String(m.userId || m.uid || m.id || "").trim();
                const memberEmail = String(
            m.emailLower || m.email_lowercase || m.email || m.emailAddress || ""
          )
            .trim()
            .toLowerCase();
          const currentEmail = String(user?.email || "")
            .trim()
            .toLowerCase();

          return (
            memberUid === uid ||
            Boolean(currentEmail && memberEmail === currentEmail)
          );
        });

        if (latestWorkspaceData?.ownerId === uid) {
          return "owner";
        }

        return isTrustedActiveMember(mine) ? mine?.role ?? "member" : null;
      }


        function isActiveMemberOrOwner() {
              const mine = latestMembers.find((m: any) => {
          const memberUid = String(m.userId || m.uid || m.id || "").trim();
                  const memberEmail = String(
            m.emailLower || m.email_lowercase || m.email || m.emailAddress || ""
          )
            .trim()
            .toLowerCase();
          const currentEmail = String(user?.email || "")
            .trim()
            .toLowerCase();

          return (
            memberUid === uid ||
            Boolean(currentEmail && memberEmail === currentEmail)
          );
        });

        return latestWorkspaceData?.ownerId === uid || isTrustedActiveMember(mine);
      }



      function isPrivateProject(project: any) {
        return (
          project.visibility === "private" ||
          project.projectScope === "private" ||
          project.isPrivateProject === true
        );
      }

      function isProjectOwner(project: any) {
        return (
          project.createdBy === uid ||
          project.ownerId === uid ||
          project.uid === uid ||
          (Array.isArray(project.memberIds) && project.memberIds.includes(uid)) ||
          (Array.isArray(project.collaboratorUids) &&
            project.collaboratorUids.includes(uid))
        );
      }

      function canAccessWorkspaceProject(project: Project) {
        if (!uid) return false;

        const myRole = getMyWorkspaceRole();

        if (isPrivateProject(project)) {
          return isProjectOwner(project);
        }

        if (myRole === "owner" || myRole === "admin") {
          return true;
        }

        return isActiveMemberOrOwner();
      }

      function getAccessibleProjects() {
        const workspaceList = latestWorkspaceProjects.filter((project) =>
          canAccessWorkspaceProject(project)
        );

        const personalList = latestPersonalProjects.filter((project: any) => {
          return isPrivateProject(project) && isProjectOwner(project);
        });

        const map = new Map<string, Project>();

        [...personalList, ...workspaceList].forEach((project: any) => {
          const key = `${project.workspaceId || ""}:${project.id}`;
          map.set(key, project);
        });

        return Array.from(map.values()).sort(
          (a: any, b: any) => getSeconds(b.createdAt) - getSeconds(a.createdAt)
        );
      }



          function publishAccessibleData() {
        const accessibleProjects = getAccessibleProjects();
        const accessibleProjectIds = new Set(accessibleProjects.map((p) => p.id));

        const myEmail = user?.email?.toLowerCase().trim() ?? "";

        // GLOBAL: merge per-user task copies (users/{uid}/tasks) with the workspace
        // tasks BEFORE filtering. Shared/guest tasks live ONLY in users/{uid}/tasks
        // (written at invite-accept), never in workspaces/{ws}/tasks — so without
        // this merge they can never reach the app-wide list or the Conversations
        // composer dropdown. Deduped by id; the workspace doc wins on collision
        // because it is the canonical task document. This keeps ONE writer
        // (setTasks below) and avoids the multi-writer race entirely.
        const mergedById = new Map<string, any>();
        (Array.isArray(userTasksRef.current) ? userTasksRef.current : []).forEach(
          (t: any) => {
            const id = String(t?.id || "").trim();
            if (id) mergedById.set(id, t);
          }
        );
        (Array.isArray(latestTasks) ? latestTasks : []).forEach((t: any) => {
          const id = String(t?.id || "").trim();
          if (id) mergedById.set(id, t); // canonical workspace task overrides copy
        });
        const tasksToConsider = Array.from(mergedById.values());

        const accessibleTasks = tasksToConsider.filter((task: any) => {

          const taskProjectId = String(task.projectId || "").trim();

          /**
           * Show every task attached to projects the current user can access.
           */
          if (taskProjectId && accessibleProjectIds.has(taskProjectId)) {
            return true;
          }
                  /**
           * GLOBAL: Show tasks SHARED with the current user. A shared/guest task's
           * per-user copy (from users/{uid}/tasks) is NOT owned or assigned to the
           * viewer — the owner created it — so every ownership/assignee check below
           * would reject it. We accept it here using the EXACT SAME detection the
           * My Tasks page uses (its isSharedTask() helper), so a task is "shared"
           * in the Conversations composer if and only if it is "shared" in My Tasks:
           *   isSharedTask || sharedWithMe || accessType==="email_invite" || shareId
           * This is what makes shared tasks appear in the composer dropdown.
           */
          if (
            task.isSharedTask ||
            task.sharedWithMe ||
            task.accessType === "email_invite" ||
            task.shareId
          ) {
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
          // Expose this run's publisher so the per-user-tasks effect can re-publish
      // the merged list without re-subscribing the workspace listeners.
      publishAccessibleDataRef.current = publishAccessibleData;


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
          hasEverResolvedRef.current = true;
          setLoading(false);
          console.log("[AppData] ✅ Workspace data ready");
        }
      }



          const timeout = setTimeout(() => {
        if (!resolvedRef.current) {
          resolvedRef.current = true;
          hasEverResolvedRef.current = true;
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
              const rawMembers = snap.docs.map((d) => {
            const raw = d.data() as any;

            return {
              id: d.id,
              ...raw,
              userId: raw.userId ?? raw.uid ?? d.id,
            } as WorkspaceMember;
          });

          const seenMembers = new Set<string>();

          const data = rawMembers.filter((member: any) => {
            const memberUid = String(
              member.userId || member.uid || member.id || ""
            ).trim();

            const memberEmail = String(
              member.emailLower ||
                member.email_lowercase ||
                member.email ||
                member.emailAddress ||
                ""
            )
              .trim()
              .toLowerCase();

            const key = memberUid
              ? `uid:${memberUid}`
              : memberEmail
                ? `email:${memberEmail}`
                : `doc:${member.id}`;

            if (seenMembers.has(key)) return false;

            seenMembers.add(key);
            return true;
          });

          latestMembers = data;
          setMembers(data);

          publishAccessibleData();

          console.log("[AppData] workspace members:", data.length);


                              const iStillMember =
            latestWorkspaceData?.ownerId === uid ||
            data.some((member: any) => {
              const memberUid = String(
                member.userId || member.uid || member.id || ""
              ).trim();

                        const memberEmail = String(
                member.emailLower ||
                  member.email_lowercase ||
                  member.email ||
                  member.emailAddress ||
                  ""
              )
                .trim()
              .toLowerCase();

              const currentEmail = String(user?.email || "")
                .trim()
                .toLowerCase();

              return (
                memberUid === uid ||
                Boolean(currentEmail && memberEmail === currentEmail)
              );
            });

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

          // Holds the two streams of pending invites so we can publish them together.
      let latestWorkspaceInvites: PendingInvite[] = [];
      let latestTaskShareInvites: PendingInvite[] = [];

      const publishPendingInvites = () => {
        const merged = [...latestWorkspaceInvites, ...latestTaskShareInvites];

        // Newest first
        merged.sort(
          (a, b) => getSeconds(b.createdAt) - getSeconds(a.createdAt)
        );

        setPendingInvites(merged);

        console.log(
          "[AppData] pending invites:",
          merged.length,
          "| workspace:",
          latestWorkspaceInvites.length,
          "| task shares:",
          latestTaskShareInvites.length
        );
      };

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
                  inviteType: "workspace",
                } as unknown as PendingInvite)
            );

          latestWorkspaceInvites = data;
          publishPendingInvites();

          invitesReady = true;
          tryResolve();
        },
        (err) => {
          console.warn("[AppData] invites error:", err.code);
          latestWorkspaceInvites = [];
          publishPendingInvites();
          invitesReady = true;
          tryResolve();
        }
      );

      // Task-share invites (workspaces/{wsId}/tasks/{taskId}/shares/{shareId}).
      // Discovered via collectionGroup so we don't need to know each taskId.
      const taskSharesQuery = query(
        collectionGroup(db, "shares"),
        where("workspaceId", "==", workspaceId),
        where("status", "==", "pending")
      );

      const unsubTaskShareInvites = onSnapshot(
        taskSharesQuery,
        (snap) => {
          const data: PendingInvite[] = snap.docs.map((d) => {
            const raw = d.data() as any;

            const email = String(
              raw.invitedEmail ||
                raw.invitedEmailLower ||
                raw.sharedWithEmail ||
                ""
            );

            return {
              code: d.id,
              inviteCode: d.id,
              email,
              role: "task_guest",
              status: "pending",
              invitedBy: String(raw.invitedBy || raw.sharedByUid || ""),
              invitedByName: String(raw.invitedByName || raw.sharedByName || ""),
              workspaceId: String(raw.workspaceId || workspaceId),
              workspaceName: "",
              createdAt: raw.createdAt,
              expiresAt: raw.expiresAt ?? null,
              acceptedAt: raw.acceptedAt ?? null,
              inviteType: "task",
              taskId: String(raw.taskId || ""),
              taskTitle: String(raw.taskTitle || ""),
              taskCode: String(raw.taskCode || ""),
              projectId: String(raw.projectId || ""),
              projectName: String(raw.projectName || ""),
            } as PendingInvite;
          });

          latestTaskShareInvites = data;
          publishPendingInvites();
        },
        (err) => {
          console.warn("[AppData] task share invites error:", err.code);
          latestTaskShareInvites = [];
          publishPendingInvites();
        }
      );


            const unsubWorkspaceProjects = subscribeToProjects(workspaceId, (data) => {
        latestWorkspaceProjects = data.map((project: any) => ({
          ...project,
          workspaceId: project.workspaceId || workspaceId,
          sourceWorkspaceId: project.sourceWorkspaceId || workspaceId,
          projectWorkspaceId: project.projectWorkspaceId || workspaceId,
        }));

        publishAccessibleData();

        projectsReady = true;
        tryResolve();
      });

      const effectivePersonalWorkspaceId =
        personalWorkspaceId || (uid ? `personal_${uid}` : "");

      const unsubPersonalProjects =
        effectivePersonalWorkspaceId &&
        effectivePersonalWorkspaceId !== workspaceId
          ? subscribeToProjects(effectivePersonalWorkspaceId, (data) => {
              latestPersonalProjects = data.map((project: any) => ({
                ...project,
                workspaceId: project.workspaceId || effectivePersonalWorkspaceId,
                sourceWorkspaceId:
                  project.sourceWorkspaceId || effectivePersonalWorkspaceId,
                projectWorkspaceId:
                  project.projectWorkspaceId || effectivePersonalWorkspaceId,
              }));

              publishAccessibleData();
            })
          : (() => {
              latestPersonalProjects = [];
              return () => {};
            })();


          // External guests / project collaborators listener
          // External guests / project collaborators listener
      const unsubPeople = onSnapshot(
        collection(db, "workspaces", workspaceId, "people"),
        (snap) => {
          const data: WorkspacePerson[] = snap.docs
            .map((d) => {
              const raw = d.data() as any;
              return {
                id: d.id,
                userId: raw.userId ?? raw.uid ?? d.id,
                ...raw,
              };
            })
            // FAANG-grade: hide revoked guests immediately, in real time.
            .filter((p) => {
              const status = String(p.status ?? "").toLowerCase();
              if (status === "revoked" || status === "removed") return false;

              // Hide guests whose every nested task entry is revoked/empty.
              const tasksMap = (p.tasks ?? {}) as Record<string, any>;
              const projectsMap = (p.projects ?? {}) as Record<string, any>;

              const activeTaskCount = Object.values(tasksMap).filter((t: any) => {
                const ts = String(t?.status ?? "").toLowerCase();
                return ts !== "revoked" && ts !== "removed";
              }).length;

              const activeProjectCount = Object.values(projectsMap).filter(
                (pr: any) => {
                  const ps = String(pr?.status ?? "").toLowerCase();
                  return ps !== "revoked" && ps !== "removed";
                },
              ).length;

              // If this is a guest with no remaining task/project access, hide it.
              if (
                (p.type ?? "guest") === "guest" &&
                activeTaskCount === 0 &&
                activeProjectCount === 0
              ) {
                return false;
              }

              return true;
            });

          setWorkspacePeople(data);

          const guestCount = data.filter(
            (p) => (p.type ?? "guest") === "guest",
          ).length;

          console.log(
            "[AppData] workspace people:",
            data.length,
            "| guests:",
            guestCount,
            data.map((p) => ({
              id: (p as any).id,
              email: p.email,
              type: p.type,
              status: p.status,
              tasks: p.tasks ? Object.keys(p.tasks).length : 0,
              projects: p.projects ? Object.keys(p.projects).length : 0,
            })),
          );
        },
        (err) => {
          console.warn("[AppData] people listener error:", err.code, err.message);
          setWorkspacePeople([]);
        },
      );



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
        unsubTaskShareInvites();
        unsubWorkspaceProjects();
        unsubPersonalProjects();
        unsubTasks();
        unsubPeople();
      };


                }, [uid, workspaceId, personalWorkspaceId, user?.email]);

        const effectivePersonalWorkspaceId =
      personalWorkspaceId || (uid ? `personal_${uid}` : "");

    /**
     * GUEST-VIEW DETECTION (global, account-agnostic).
     *
     * The user is in guest view when:
     *   1. They are signed in, AND
     *   2. Their ACTIVE workspace is their OWN personal workspace, AND
     *   3. They have at least one task that was shared with them
     *      (isSharedTask / sharedWithMe), i.e. they only arrived here via a
     *      task invite and are not a real member of any team workspace.
     *
     * In that situation the personal-workspace shell (Team, Workspace, Insights,
     * Dashboard) is meaningless to them, so the app renders a scoped guest UI.
     */
    const isOnOwnPersonalWorkspace =
      !!uid &&
      !!workspaceId &&
      (workspaceId === effectivePersonalWorkspaceId ||
        workspaceId === `personal_${uid}`);
          // GLOBAL: guest view must be decided by WORKSPACE MEMBERSHIP, not by tasks.
    // The earlier task-based heuristic broke because a real owner/member can have
    // zero workspace tasks and only a shared task merged in from users/{uid}/tasks
    // — which falsely looked like "only shared tasks => guest". Membership is the
    // correct signal: a TRUE external guest is signed into their own personal
    // workspace AND is NOT a member/owner of any real (non-personal) workspace.
    const isSharedTaskEntry = (t: any) =>
      Boolean(
        t?.isSharedTask ||
          t?.sharedWithMe ||
          t?.accessType === "email_invite" ||
          t?.shareId
      );

    const hasSharedTasks = tasks.some((t: any) => isSharedTaskEntry(t));

    // Am I a real member/owner of the CURRENT workspace? If yes, I am never a guest.
    const myEmailLowerForGuest = String(user?.email || "").trim().toLowerCase();
    const isWorkspaceMember =
      workspaceData?.ownerId === uid ||
      workspaceData?.createdBy === uid ||
      members.some((m: any) => {
        const memberUid = String(m?.userId || m?.uid || m?.id || "").trim();
        const memberEmail = String(
          m?.emailLower || m?.email_lowercase || m?.email || m?.emailAddress || ""
        )
          .trim()
          .toLowerCase();
        return (
          (memberUid && memberUid === uid) ||
          (myEmailLowerForGuest && memberEmail === myEmailLowerForGuest)
        );
      });

    // True guest = on own personal workspace, has shared tasks, and is NOT a
    // recognized member/owner of this workspace. (FIX)
      const isGuestView =
      isOnOwnPersonalWorkspace && hasSharedTasks && !isWorkspaceMember;

      // GLOBAL: merge externally-shared projects/tasks into the app-wide arrays so
    // Navbar search (and any consumer) finds them. De-duped by composite id; the
    // existing (canonical) entry wins on collision. Read-only merge — does NOT
    // change guest-view logic, membership logic, or any write path.
    const mergedProjects = React.useMemo(() => {
      const map = new Map<string, Project>();

      // READ-PATH SCOPING (global): only merge external projects this user can
      // actually access. Private projects must belong to the user; workspace
      // projects are allowed (they were already gated by membership to even be
      // subscribed). Mirrors the existing canAccessWorkspaceProject intent
      // WITHOUT changing any role/permission write logic.
      const isExternalAccessible = (p: any): boolean => {
        const isPrivate =
          p?.visibility === "private" ||
          p?.projectScope === "private" ||
          p?.isPrivateProject === true;

        if (!isPrivate) return true; // shared workspace project

        // Private external project: only if the user owns / collaborates on it.
        return (
          p?.createdBy === uid ||
          p?.ownerId === uid ||
          p?.uid === uid ||
          (Array.isArray(p?.memberIds) && p.memberIds.includes(uid)) ||
          (Array.isArray(p?.collaboratorUids) && p.collaboratorUids.includes(uid))
        );
      };

      (Array.isArray(sharedExternalProjects) ? sharedExternalProjects : []).forEach(
        (p: any) => {
          if (p?.id && isExternalAccessible(p)) {
            const key = `${p.workspaceId || ""}:${p.id}`;
            map.set(key, p);
          }
        }
      );

      (Array.isArray(projects) ? projects : []).forEach((p: any) => {
        const key = `${p.workspaceId || ""}:${p.id}`;
        if (p?.id) map.set(key, p); // canonical wins
      });

      return Array.from(map.values());
    }, [projects, sharedExternalProjects, uid]);


    const mergedTasks = React.useMemo(() => {
      const map = new Map<string, Task>();

      // READ-PATH SCOPING (global): externally-merged workspace tasks must be
      // filtered by what THIS user is allowed to see, exactly like the canonical
      // `tasks` array already is. Without this, every member sees the whole
      // external workspace's tasks (the leak). We DO NOT touch role/invite logic.
      const myEmailLower = String(user?.email || "").trim().toLowerCase();
      const accessibleProjectIds = new Set(
        (Array.isArray(projects) ? projects : [])
          .map((p: any) => String(p?.id || "").trim())
          .filter(Boolean)
      );
      const ctx = { uid, email: myEmailLower, accessibleProjectIds };

      (Array.isArray(sharedExternalTasks) ? sharedExternalTasks : []).forEach(
        (t: any) => {
          if (t?.id && isTaskVisibleToUser(t, ctx)) {
            map.set(String(t.id), t);
          }
        }
      );

      // `tasks` is already permission-filtered by publishAccessibleData(); keep it
      // canonical so it always wins on id collision.
      (Array.isArray(tasks) ? tasks : []).forEach((t: any) => {
        if (t?.id) map.set(String(t.id), t);
      });

      return Array.from(map.values());
    }, [tasks, sharedExternalTasks, projects, uid, user?.email]);







    return (
      <AppDataContext.Provider
              value={{
          tasks: mergedTasks,
          teamMembers,
          notes,
          projects: mergedProjects,
          loading,
          files: [],
          members,
          pendingInvites,
          memberCount: members.filter((m) => m.status === "active").length,
          workspaceData,
          workspacePeople,
          cancelInvite,
          isGuestView,
        }}
      >
        {children}
      </AppDataContext.Provider>
    );
  }



  export function useAppData(): AppDataContextType {
    return useContext(AppDataContext);
  }
