// Per-user external links CRUD + live subscription. Stored at
// users/{uid}/links/{linkId}. Proven-safe path: your app already reads/writes
// under users/{uid} (Settings, My Tasks), so existing rules cover it.
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./config";

export interface UserLink {
  id: string;
  title: string;
  url: string;
  createdAt?: any;
  updatedAt?: any;
}

function linksCol(uid: string) {
  return collection(db, "users", uid, "links");
}

// Real-time listener — returns an unsubscribe function.
export function subscribeUserLinks(
  uid: string,
  cb: (links: UserLink[]) => void
): () => void {
  if (!uid) {
    cb([]);
    return () => {};
  }
  const q = query(linksCol(uid), orderBy("createdAt", "asc"));
  return onSnapshot(
    q,
    (snap) => {
      const rows: UserLink[] = snap.docs.map((d) => ({
        id: d.id,
        title: String((d.data() as any).title || ""),
        url: String((d.data() as any).url || ""),
        createdAt: (d.data() as any).createdAt,
        updatedAt: (d.data() as any).updatedAt,
      }));
      cb(rows);
    },
    (err) => {
      console.warn("[links] subscribe error:", err?.message || err);
      cb([]);
    }
  );
}

export async function addUserLink(
  uid: string,
  title: string,
  url: string
): Promise<void> {
  if (!uid) throw new Error("No user");
  await addDoc(linksCol(uid), {
    title: String(title || "").trim(),
    url: String(url || "").trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateUserLink(
  uid: string,
  linkId: string,
  title: string,
  url: string
): Promise<void> {
  if (!uid || !linkId) throw new Error("Missing id");
  await updateDoc(doc(db, "users", uid, "links", linkId), {
    title: String(title || "").trim(),
    url: String(url || "").trim(),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteUserLink(uid: string, linkId: string): Promise<void> {
  if (!uid || !linkId) throw new Error("Missing id");
  await deleteDoc(doc(db, "users", uid, "links", linkId));
}
