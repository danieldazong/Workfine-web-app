import { readFileSync } from "fs";
import { resolve } from "path";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { beforeAll, afterAll, beforeEach, describe, it } from "vitest";

const PROJECT_ID = "workfine-rules-test";
const WS = "ws_demo";
const TASK = "task_demo";
const SHARE = "share_demo";

const OWNER = "uid_owner";
const VIEWER = "uid_viewer";
const GUEST = "uid_guest";
const GUEST_EMAIL = "guest@example.com";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8"),
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();

  // Seed baseline data with rules DISABLED (admin context).
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    // Workspace owned by OWNER.
    await setDoc(doc(db, "workspaces", WS), {
      id: WS,
      workspaceId: WS,
      ownerId: OWNER,
    });

    // OWNER membership.
    await setDoc(doc(db, "workspaces", WS, "members", OWNER), {
      uid: OWNER,
      userId: OWNER,
      role: "owner",
      status: "active",
      workspaceId: WS,
    });

    // VIEWER membership (read-only).
    await setDoc(doc(db, "workspaces", WS, "members", VIEWER), {
      uid: VIEWER,
      userId: VIEWER,
      role: "viewer",
      status: "active",
      workspaceId: WS,
    });

    // Canonical workspace task.
    await setDoc(doc(db, "workspaces", WS, "tasks", TASK), {
      title: "Demo task",
      workspaceId: WS,
      status: "To Do",
    });

    // Guest share doc for a NON-member (GUEST).
    await setDoc(
      doc(db, "workspaces", WS, "tasks", TASK, "shares", SHARE),
      {
        guestRole: "viewer",
        status: "active",
        invitedEmail: GUEST_EMAIL,
        invitedEmailLower: GUEST_EMAIL,
        acceptedByUid: GUEST,
        acceptedByEmail: GUEST_EMAIL,
        acceptedByEmailLower: GUEST_EMAIL,
        sharedByUid: OWNER,
        invitedBy: OWNER,
        workspaceId: WS,
      }
    );
  });
});

describe("workspace task delete boundary", () => {
  it("OWNER can delete the canonical workspace task", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(deleteDoc(doc(db, "workspaces", WS, "tasks", TASK)));
  });

  it("VIEWER member CANNOT delete the canonical workspace task", async () => {
    const db = env.authenticatedContext(VIEWER).firestore();
    await assertFails(deleteDoc(doc(db, "workspaces", WS, "tasks", TASK)));
  });

  it("GUEST CANNOT delete the canonical workspace task", async () => {
    const db = env
      .authenticatedContext(GUEST, { email: GUEST_EMAIL })
      .firestore();
    await assertFails(deleteDoc(doc(db, "workspaces", WS, "tasks", TASK)));
  });

  it("GUEST CAN mark their own share as removed (the legit ''leave'' path)", async () => {
    const db = env
      .authenticatedContext(GUEST, { email: GUEST_EMAIL })
      .firestore();
    await assertSucceeds(
      updateDoc(doc(db, "workspaces", WS, "tasks", TASK, "shares", SHARE), {
        status: "removed",
        removedByUid: GUEST,
        removedByEmail: GUEST_EMAIL,
        removedByEmailLower: GUEST_EMAIL,
        removedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  });
});
