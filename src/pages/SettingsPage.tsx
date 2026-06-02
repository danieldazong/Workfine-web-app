import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  User, Shield, Building2, Bell, Camera, Check,
  Copy, LogOut, Trash2, AlertTriangle, Loader2,
  ChevronRight, Upload,
} from "lucide-react";
import {
  doc, updateDoc, serverTimestamp, getDoc, setDoc,
} from "firebase/firestore";
import {
  updateProfile, deleteUser,
  reauthenticateWithPopup, GoogleAuthProvider,
} from "firebase/auth";
import {
  ref, uploadBytesResumable, getDownloadURL, deleteObject,
} from "firebase/storage";
import { db, auth, storage } from "../lib/firebase/config";
import { useAuth } from "../context/AuthContext";
import { useAppData } from "../context/AppDataContext";
import { propagateUserPhotoURL } from "../lib/firebase/users";



// ─── Monogram Gradient (shared) ───────────────────────────────────────────────
// IMPORTANT: This MUST stay byte-for-byte identical to monogramGradient() in
// src/components/TaskDetailPanel.tsx, src/pages/TeamPage.tsx and
// src/components/Navbar.tsx so the SAME email renders the SAME gradient
// everywhere (Settings, Task modal, External Guests, Sidebar, Navbar).
function monogramGradient(seed: string): string {
  const s = String(seed || "?").trim().toLowerCase();

  let h1 = 0;
  let h2 = 0;
  let h3 = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = (c + ((h1 << 5) - h1)) | 0;
    h2 = (c * 31 + ((h2 << 7) - h2)) | 0;
    h3 = (c * 17 + ((h3 << 3) - h3)) | 0;
  }

  const hue1 = Math.abs(h1) % 360;
  const hueGap = 25 + (Math.abs(h2) % 90);
  const hue2 = (hue1 + hueGap) % 360;

  const sat1 = 58 + (Math.abs(h2) % 28);
  const sat2 = 58 + (Math.abs(h3) % 28);
  const light1 = 48 + (Math.abs(h3) % 16);
  const light2 = 38 + (Math.abs(h1) % 14);
  const angle = Math.abs(h2 ^ h3) % 360;

  return `linear-gradient(${angle}deg, hsl(${hue1} ${sat1}% ${light1}%), hsl(${hue2} ${sat2}% ${light2}%))`;
}

function monogramInitials(name?: string | null, email?: string | null): string {
  const label = String(name || email || "?").trim();
  if (!label || label === "?") return "?";
  const initials = label
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return initials || label[0]?.toUpperCase() || "?";
}

// Only Firebase Storage uploads are real user photos. Any other URL
// (e.g. Google lh3.googleusercontent.com) is ignored so every account
// shows its monogram gradient instead of the Gmail photo.
function resolveAvatarPhoto(photoURL?: string | null): string {
  const url = String(photoURL || "").trim();
  return url.includes("firebasestorage") ? url : "";
}
// Produces a clean, human-friendly workspace ID label.
// Personal workspaces are stored as "personal_<uid>" or "WF-###";
// this shows a tidy value instead of the raw internal ID.
function resolveWorkspaceDisplayId(
  workspaceId?: string | null,
  workspaceData?: { displayId?: string; code?: string; name?: string } | null,
  uid?: string | null
): string {
  // Prefer an explicit display code if the workspace doc carries one
  if (workspaceData?.displayId) return workspaceData.displayId;
  if (workspaceData?.code) return workspaceData.code;

  const id = String(workspaceId || "").trim();
  if (!id) return "—";

  // Personal workspaces look like "personal_<uid>" — show a clean label
  if (id.startsWith("personal_")) {
    return uid && id === `personal_${uid}` ? "Personal" : "Personal";
  }

  // Otherwise return the ID as-is (e.g. "WF-138773")
  return id;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Section = "profile" | "account" | "workspace" | "notifications";

interface ProfileForm {
  displayName: string;
  fullName:    string;
  jobTitle:    string;
  bio:         string;
}

interface WorkspaceForm {
  workspaceName: string;
}

interface NotifPrefs {
  inviteEmails:     boolean;
  roleChangeEmails: boolean;
  taskEmails:       boolean;
  weeklyDigest:     boolean;
}

// ─── Sub-nav items ────────────────────────────────────────────────────────────

const NAV_ITEMS: { key: Section; label: string; icon: React.FC<any> }[] = [
  { key: "profile",       label: "Profile",            icon: User      },
  { key: "account",       label: "Account & Security", icon: Shield    },
  { key: "workspace",     label: "Workspace",          icon: Building2 },
  { key: "notifications", label: "Notifications",      icon: Bell      },
];

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({
  msg, type, onDone,
}: {
  msg: string; type: "success" | "error"; onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3
        rounded-xl shadow-lg text-sm font-medium ${
        type === "success" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
      }`}
      style={{ animation: "slideUp 0.25s ease" }}
    >
      {type === "success" ? <Check size={15} /> : <AlertTriangle size={15} />}
      {msg}
    </div>
  );
}

// ─── Avatar Display ───────────────────────────────────────────────────────────

function AvatarDisplay({
  photoURL, displayName, email, size = 96, uploadProgress, onClick,
}: {
  photoURL?: string | null;
  displayName?: string | null;
  email?: string | null;
  size?: number;
  uploadProgress?: number | null;
  onClick?: () => void;
}) {
   // Same seed used everywhere: normalized lowercase email, then display name.
  const seed =
    String(email || "").trim().toLowerCase() ||
    String(displayName || "?").trim().toLowerCase();
  const initials = monogramInitials(displayName, email);
  const circumference = 2 * Math.PI * (size / 2 - 3);
  // Ignore Google/Gmail photos; only honour Firebase Storage uploads.
  const safePhoto = resolveAvatarPhoto(photoURL);



  return (
    <div
      className="relative cursor-pointer group flex-shrink-0"
      style={{ width: size, height: size }}
      onClick={onClick}
    >
                 <div
        className="w-full h-full rounded-full flex items-center justify-center
          text-white font-semibold overflow-hidden ring-4 ring-white shadow-md select-none"
        style={{
          background: safePhoto ? "transparent" : monogramGradient(seed),
          fontSize: size * 0.35,
          letterSpacing: "0.02em",
        }}
      >
        {safePhoto ? (
          <img
            src={safePhoto}
            alt="avatar"
            className="w-full h-full object-cover"
            key={safePhoto}
          />
        ) : (
          initials
        )}
      </div>



      {uploadProgress !== null && uploadProgress !== undefined && (
        <svg
          className="absolute inset-0 -rotate-90 pointer-events-none"
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
        >
          <circle
            cx={size / 2} cy={size / 2} r={size / 2 - 3}
            fill="none" stroke="#e2e8f0" strokeWidth="4"
          />
          <circle
            cx={size / 2} cy={size / 2} r={size / 2 - 3}
            fill="none" stroke="#8b5cf6" strokeWidth="4"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={`${circumference * (1 - uploadProgress / 100)}`}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.3s ease" }}
          />
        </svg>
      )}

      {(uploadProgress === null || uploadProgress === undefined) && (
        <div className="absolute inset-0 rounded-full bg-black/40 opacity-0
          group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <Camera size={size * 0.25} className="text-white" />
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user, workspaceId, setWorkspaceId, logout } = useAuth();
  const { members, workspaceData }                    = useAppData();

  const [section,        setSection]        = useState<Section>("profile");
  const [toast,          setToast]          = useState<{
    msg: string; type: "success" | "error";
  } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [unsaved,        setUnsaved]        = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ✅ Local photoURL state — updates instantly after upload without waiting
  // for Firebase Auth onAuthStateChanged to re-fire (which it won't on profile update)
  const [localPhotoURL, setLocalPhotoURL] = useState<string | null>(
    user?.photoURL ?? null
  );

  // ── Profile form ──────────────────────────────────────────────────────────
  const [profileForm,     setProfileForm]     = useState<ProfileForm>({
    displayName: user?.displayName || "",
    fullName:    "",
    jobTitle:    "",
    bio:         "",
  });
  const [profileSaving,   setProfileSaving]   = useState(false);
  const [originalProfile, setOriginalProfile] = useState<ProfileForm | null>(null);

  // ── Workspace form ────────────────────────────────────────────────────────
  const [wsForm,    setWsForm]    = useState<WorkspaceForm>({ workspaceName: "" });
  const [wsSaving,  setWsSaving]  = useState(false);
  const [copiedWid, setCopiedWid] = useState(false);

  // ── Notification prefs ────────────────────────────────────────────────────
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>({
    inviteEmails:     true,
    roleChangeEmails: true,
    taskEmails:       false,
    weeklyDigest:     false,
  });

  // ── Danger zone ───────────────────────────────────────────────────────────
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [showLeaveConfirm,  setShowLeaveConfirm]  = useState(false);
  const [dangerLoading,     setDangerLoading]     = useState(false);

  // ─────────────────────────────────────────────────────────────────────────
  const showToast = useCallback(
    (msg: string, type: "success" | "error" = "success") =>
      setToast({ msg, type }),
    []
  );

  // ── Sync localPhotoURL when user object changes ───────────────────────────
  useEffect(() => {
    if (user?.photoURL) setLocalPhotoURL(user.photoURL);
  }, [user?.photoURL]);

  // ── Load user data from Firestore on mount ────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          const d = snap.data();
          const loaded: ProfileForm = {
            displayName: d.displayName || user.displayName || "",
            fullName:    d.fullName    || "",
            jobTitle:    d.jobTitle    || "",
            bio:         d.bio         || "",
          };
          setProfileForm(loaded);
          setOriginalProfile(loaded);
          if (d.photoURL)    setLocalPhotoURL(d.photoURL);
          if (d.notifPrefs)  setNotifPrefs(d.notifPrefs);
        }
      } catch (err) {
        console.error("[Settings] load error:", err);
      }
    };
    load();
  }, [user]);

  // ── Sync workspace name ───────────────────────────────────────────────────
  useEffect(() => {
    if (workspaceData?.name) setWsForm({ workspaceName: workspaceData.name });
  }, [workspaceData]);

  // ── Track unsaved changes ─────────────────────────────────────────────────
  useEffect(() => {
    if (!originalProfile) return;
    setUnsaved(
      profileForm.displayName !== originalProfile.displayName ||
      profileForm.fullName    !== originalProfile.fullName    ||
      profileForm.jobTitle    !== originalProfile.jobTitle    ||
      profileForm.bio         !== originalProfile.bio
    );
  }, [profileForm, originalProfile]);

  // ── Avatar upload ─────────────────────────────────────────────────────────
  const handleAvatarClick = () => fileInputRef.current?.click();

  // ── Remove avatar (reset to default monogram gradient) ──────────────────────
  const handleRemoveAvatar = async () => {
    if (!user) return;
    if (uploadProgress !== null) return; // don't allow during an active upload

    const currentUser = auth.currentUser;
    if (!currentUser) {
      showToast("No authenticated user.", "error");
      return;
    }

    const previousPhoto = localPhotoURL;
    setLocalPhotoURL(null); // optimistic: show gradient immediately

    try {
      // 1. Clear Firebase Auth profile photo
      await updateProfile(currentUser, { photoURL: "" });

      // 2. Clear Firestore users doc
      await updateDoc(doc(db, "users", currentUser.uid), {
        photoURL: "",
        avatarUrl: "",
        updatedAt: serverTimestamp(),
      });

            // 3. Clear workspace member doc (non-critical)
      if (workspaceId) {
        await updateDoc(
          doc(db, "workspaces", workspaceId, "members", currentUser.uid),
          { photoURL: "", avatarUrl: "", updatedAt: serverTimestamp() }
        ).catch((err) =>
          console.warn("[Settings] member doc photo clear skipped:", err.code)
        );
      }

      // 3b. GLOBAL: propagate the cleared photo everywhere so every account
      // and every section (comments, task modal, grids, invites) reverts to
      // the monogram gradient in real time.
      await propagateUserPhotoURL(currentUser.uid, currentUser.email, "");


      // 4. Delete the stored avatar file (ignore if missing)
      await deleteObject(ref(storage, `avatars/${currentUser.uid}/profile.jpg`))
        .catch((err) =>
          console.warn("[Settings] avatar file delete skipped:", err.code)
        );

      showToast("Profile photo removed. Showing default avatar.");
    } catch (err: any) {
      console.error("[Settings] handleRemoveAvatar error:", err);
      setLocalPhotoURL(previousPhoto ?? null); // revert on failure
      showToast("Failed to remove photo. Please try again.", "error");
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Reset input immediately so same file can be picked again later
    e.target.value = "";

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      showToast("Only JPG, PNG or WebP images are allowed.", "error");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showToast("Image must be under 2MB.", "error");
      return;
    }

    // ✅ Show local preview instantly — user sees change before upload completes
    const localPreviewURL = URL.createObjectURL(file);
    setLocalPhotoURL(localPreviewURL);
    setUploadProgress(0);

    try {
      // ✅ Use auth.currentUser directly — never trust the stale `user` from context
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("No authenticated user");

      const storagePath = `avatars/${currentUser.uid}/profile.jpg`;
      const storageRef  = ref(storage, storagePath);
      const uploadTask  = uploadBytesResumable(storageRef, file, {
        contentType: file.type,
      });

      uploadTask.on(
        "state_changed",

        // Progress handler
        (snapshot) => {
          const pct = Math.round(
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100
          );
          setUploadProgress(pct);
          console.log(`[Settings] Upload progress: ${pct}%`);
        },

        // ✅ Error handler — always resets spinner
        (error) => {
          console.error("[Settings] Upload error:", error.code, error.message);
          setUploadProgress(null);
          // Revert preview on failure
          setLocalPhotoURL(user.photoURL ?? null);

          const messages: Record<string, string> = {
            "storage/unauthorized":   "Permission denied. Check Firebase Storage rules.",
            "storage/canceled":       "Upload was cancelled.",
            "storage/unknown":        "Unknown error. Check your connection.",
            "storage/quota-exceeded": "Storage quota exceeded.",
          };
          showToast(
            messages[error.code] ?? `Upload failed: ${error.message}`,
            "error"
          );
        },

        // ✅ Success handler
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            console.log("[Settings] Upload complete. URL:", downloadURL);

            // 1. Update Firebase Auth profile
            await updateProfile(currentUser, { photoURL: downloadURL });

            // 2. Update Firestore users doc
            await updateDoc(doc(db, "users", currentUser.uid), {
              photoURL:  downloadURL,
              updatedAt: serverTimestamp(),
            });

                        // 3. Update workspace member doc (non-critical)
            if (workspaceId) {
              await updateDoc(
                doc(db, "workspaces", workspaceId, "members", currentUser.uid),
                { photoURL: downloadURL, updatedAt: serverTimestamp() }
              ).catch((err) =>
                console.warn("[Settings] member doc photoURL update skipped:", err.code)
              );
            }

            // 3b. GLOBAL: propagate the new photo to EVERY doc that stores a copy
            // (all member docs, people/guest docs, task shares, owned workspaces)
            // so Task comments, Task modal, member grids and sent invites update
            // in real time for every account.
            await propagateUserPhotoURL(
              currentUser.uid,
              currentUser.email,
              downloadURL
            );

            // 4. ✅ Update local state — UI updates instantly everywhere
            setLocalPhotoURL(downloadURL);

            setUploadProgress(null);
            showToast("Profile photo updated successfully!");
          } catch (err: any) {
            console.error("[Settings] Post-upload error:", err);
            setUploadProgress(null);
            showToast("Photo uploaded but failed to save. Please retry.", "error");
          }
        }
      );
    } catch (err: any) {
      console.error("[Settings] Avatar change error:", err);
      setUploadProgress(null);
      setLocalPhotoURL(user.photoURL ?? null);
      showToast("Failed to start upload. Please try again.", "error");
    }
  };

  // ── Save profile ──────────────────────────────────────────────────────────
  const saveProfile = async () => {
    if (!user) return;
    const trimmed = profileForm.displayName.trim();
    if (!trimmed) {
      showToast("Display name cannot be empty.", "error");
      return;
    }
    if (trimmed.length < 2) {
      showToast("Display name must be at least 2 characters.", "error");
      return;
    }

    setProfileSaving(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("No authenticated user");

      await updateProfile(currentUser, { displayName: trimmed });

      await updateDoc(doc(db, "users", user.uid), {
        displayName: trimmed,
        fullName:    profileForm.fullName.trim(),
        jobTitle:    profileForm.jobTitle.trim(),
        bio:         profileForm.bio.trim(),
        updatedAt:   serverTimestamp(),
      });

      if (workspaceId) {
        await updateDoc(
          doc(db, "workspaces", workspaceId, "members", user.uid),
          { displayName: trimmed, updatedAt: serverTimestamp() }
        ).catch(() => {});
      }

      setOriginalProfile({ ...profileForm });
      setUnsaved(false);
      showToast("Profile updated successfully!");
    } catch (err) {
      console.error("[Settings] saveProfile error:", err);
      showToast("Failed to save profile. Please try again.", "error");
    } finally {
      setProfileSaving(false);
    }
  };

  // ── Save workspace name ───────────────────────────────────────────────────
  const saveWorkspaceName = async () => {
    if (!workspaceId) return;
    if (!wsForm.workspaceName.trim()) {
      showToast("Workspace name cannot be empty.", "error");
      return;
    }
    setWsSaving(true);
    try {
      await updateDoc(doc(db, "workspaces", workspaceId), {
        name:      wsForm.workspaceName.trim(),
        updatedAt: serverTimestamp(),
      });
      showToast("Workspace name updated!");
    } catch (err) {
      console.error("[Settings] saveWorkspace error:", err);
      showToast("Failed to update workspace name.", "error");
    } finally {
      setWsSaving(false);
    }
  };

  // ── Save notification prefs ───────────────────────────────────────────────
  const saveNotifPref = async (key: keyof NotifPrefs, value: boolean) => {
    if (!user) return;
    const updated = { ...notifPrefs, [key]: value };
    setNotifPrefs(updated);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        notifPrefs: updated,
        updatedAt:  serverTimestamp(),
      });
    } catch (err) {
      console.error("[Settings] notif pref error:", err);
    }
  };

  // ── Copy workspace ID ─────────────────────────────────────────────────────
  const copyWorkspaceId = () => {
    navigator.clipboard.writeText(workspaceId ?? "").then(() => {
      setCopiedWid(true);
      setTimeout(() => setCopiedWid(false), 2000);
      showToast("Workspace ID copied!");
    });
  };

  // ── Leave workspace ───────────────────────────────────────────────────────
  const leaveWorkspace = async () => {
    if (!user || !workspaceId) return;
    setDangerLoading(true);
    try {
      const myMember = members.find((m) => m.userId === user.uid);
      if (myMember?.role === "owner") {
        showToast("Workspace owners cannot leave. Transfer ownership first.", "error");
        setShowLeaveConfirm(false);
        return;
      }

      const personalWsId = `WF-${Math.floor(Math.random() * 900) + 100}`;
      const { deleteDoc } = await import("firebase/firestore");

      await deleteDoc(doc(db, "workspaces", workspaceId, "members", user.uid));

      await updateDoc(doc(db, "users", user.uid), {
        workspaceId: personalWsId,
        updatedAt:   serverTimestamp(),
      });

      await setDoc(doc(db, "workspaces", personalWsId), {
        id:          personalWsId,
        workspaceId: personalWsId,
        name:        `${user.displayName ?? "My"}'s Workspace`,
        ownerId:     user.uid,
        ownerEmail:  user.email ?? "",
        plan:        "free",
        createdAt:   serverTimestamp(),
        updatedAt:   serverTimestamp(),
        memberCount: 1,
      });

      await setDoc(
        doc(db, "workspaces", personalWsId, "members", user.uid),
        {
          userId:      user.uid,
          displayName: user.displayName ?? "User",
          email:       user.email       ?? "",
          role:        "owner",
          status:      "active",
          joinedAt:    serverTimestamp(),
          lastActive:  serverTimestamp(),
        }
      );

      setWorkspaceId(personalWsId);
      setShowLeaveConfirm(false);
      showToast("You have left the workspace.");
    } catch (err) {
      console.error("[Settings] leaveWorkspace error:", err);
      showToast("Failed to leave workspace.", "error");
    } finally {
      setDangerLoading(false);
    }
  };

  // ── Delete account ────────────────────────────────────────────────────────
  const deleteAccount = async () => {
    if (!user || deleteConfirmText !== "DELETE") return;
    setDangerLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await reauthenticateWithPopup(auth.currentUser!, provider);

      const { deleteDoc } = await import("firebase/firestore");
      await deleteDoc(doc(db, "users", user.uid));

      if (user.photoURL?.includes("firebasestorage")) {
        const avatarRef = ref(storage, `avatars/${user.uid}/profile.jpg`);
        await deleteObject(avatarRef).catch(() => {});
      }

      await deleteUser(auth.currentUser!);
      await logout();
    } catch (err: any) {
      console.error("[Settings] deleteAccount error:", err);
      showToast(
        err.code === "auth/popup-closed-by-user"
          ? "Re-authentication cancelled."
          : "Failed to delete account. Please try again.",
        "error"
      );
      setDangerLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  const myRole  = members.find((m) => m.userId === user?.uid)?.role ?? "member";
  const isOwner = myRole === "owner";

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="ml-0 bg-[#f4f5f7] min-h-screen overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 pt-10 pb-10">

        {/* Page header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            Settings
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Manage your profile, workspace, and preferences
          </p>
        </div>

        {/* Unsaved changes banner */}
        {unsaved && section === "profile" && (
          <div className="mb-6 flex items-center justify-between bg-amber-50
            border border-amber-200 rounded-2xl px-5 py-3">
            <div className="flex items-center gap-2 text-amber-700 text-sm">
              <AlertTriangle size={16} />
              You have unsaved changes
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (originalProfile) setProfileForm(originalProfile);
                  setUnsaved(false);
                }}
                className="text-xs text-slate-500 hover:text-slate-800 px-3 py-1.5
                  rounded-lg border border-slate-200 bg-white transition-colors"
              >
                Discard
              </button>
              <button
                onClick={saveProfile}
                className="text-xs text-white bg-violet-600 hover:bg-violet-700
                  px-3 py-1.5 rounded-lg transition-colors"
              >
                Save Now
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-6 items-start">

          {/* ── Left sub-nav ──────────────────────────────────────────────── */}
          <div className="w-full lg:w-56 flex-none">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setSection(key)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm
                    transition-colors border-l-2 ${
                    section === key
                      ? "bg-violet-50 text-violet-700 font-semibold border-violet-500"
                      : "text-slate-500 hover:text-slate-800 hover:bg-slate-50 border-transparent"
                  }`}
                >
                  <Icon size={16} className="flex-shrink-0" />
                  <span className="flex-1 text-left">{label}</span>
                  {section === key && <ChevronRight size={14} />}
                </button>
              ))}
            </div>

            {/* Quick info card */}
            <div className="mt-4 bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center gap-3">
                                <AvatarDisplay
                  photoURL={localPhotoURL}
                  displayName={user?.displayName}
                  email={user?.email}
                  size={40}
                />

                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {user?.displayName || "User"}
                  </p>
                  <p className="text-xs text-slate-400 truncate">{user?.email}</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide font-medium mb-1">
                  Workspace
                </p>
                                                                <p className="text-xs font-mono font-bold text-violet-600">{resolveWorkspaceDisplayId(workspaceId, workspaceData, user?.uid)}</p>
              </div>
            </div>
          </div>

          {/* ── Right content panel ───────────────────────────────────────── */}
          <div className="flex-1 min-w-0 space-y-6">

            {/* ════════════════════════════════════════════════════════════
                PROFILE SECTION
            ════════════════════════════════════════════════════════════ */}
            {section === "profile" && (
              <>
                {/* Avatar card */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                  <h2 className="text-sm font-semibold text-slate-800 mb-5">
                    Profile Photo
                  </h2>
                  <div className="flex items-center gap-6">
                                        <AvatarDisplay
                      photoURL={localPhotoURL}
                      displayName={user?.displayName}
                      email={user?.email}
                      size={96}
                      uploadProgress={uploadProgress}
                      onClick={handleAvatarClick}
                    />
                                        <div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleAvatarClick}
                          disabled={uploadProgress !== null}
                          className="flex items-center gap-2 px-4 py-2 bg-violet-600
                            hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed
                            text-white text-sm font-medium rounded-xl transition-colors"
                        >
                          {uploadProgress !== null ? (
                            <>
                              <Loader2 size={14} className="animate-spin" />
                              Uploading {uploadProgress}%
                            </>
                          ) : (
                            <>
                              <Upload size={14} />
                              Upload Photo
                            </>
                          )}
                        </button>

                        {localPhotoURL && uploadProgress === null && (
                          <button
                            onClick={handleRemoveAvatar}
                            className="flex items-center gap-2 px-4 py-2 bg-white
                              border border-slate-200 hover:border-red-300 hover:bg-red-50
                              text-slate-600 hover:text-red-600 text-sm font-medium
                              rounded-xl transition-colors"
                            title="Remove photo and use the default monogram avatar"
                          >
                            <Trash2 size={14} />
                            Remove
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-2">
                        JPG, PNG or WebP · Max 2MB · Removing resets to your default avatar
                      </p>
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                </div>

                {/* Profile form card */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                  <h2 className="text-sm font-semibold text-slate-800 mb-5">
                    Personal Information
                  </h2>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">
                        Display Name <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={profileForm.displayName}
                        onChange={(e) =>
                          setProfileForm((p) => ({ ...p, displayName: e.target.value }))
                        }
                        maxLength={50}
                        placeholder="How your name appears across the app"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl
                          px-4 py-2.5 text-sm text-slate-700 focus:outline-none
                          focus:border-violet-400 focus:bg-white transition-colors"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">
                        {profileForm.displayName.length}/50 characters
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">
                        Full Name
                      </label>
                      <input
                        type="text"
                        value={profileForm.fullName}
                        onChange={(e) =>
                          setProfileForm((p) => ({ ...p, fullName: e.target.value }))
                        }
                        maxLength={100}
                        placeholder="Your legal full name (optional)"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl
                          px-4 py-2.5 text-sm text-slate-700 focus:outline-none
                          focus:border-violet-400 focus:bg-white transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">
                        Job Title
                      </label>
                      <input
                        type="text"
                        value={profileForm.jobTitle}
                        onChange={(e) =>
                          setProfileForm((p) => ({ ...p, jobTitle: e.target.value }))
                        }
                        maxLength={100}
                        placeholder="e.g. Product Designer, Frontend Engineer"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl
                          px-4 py-2.5 text-sm text-slate-700 focus:outline-none
                          focus:border-violet-400 focus:bg-white transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">
                        Bio
                      </label>
                      <textarea
                        value={profileForm.bio}
                        onChange={(e) =>
                          setProfileForm((p) => ({ ...p, bio: e.target.value }))
                        }
                        maxLength={300}
                        rows={3}
                        placeholder="Tell your team a little about yourself (optional)"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl
                          px-4 py-2.5 text-sm text-slate-700 focus:outline-none
                          focus:border-violet-400 focus:bg-white transition-colors resize-none"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">
                        {profileForm.bio.length}/300 characters
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-6 pt-5 border-t border-slate-100">
                    <p className="text-xs text-slate-400">
                      Changes sync across the entire app in real time
                    </p>
                    <button
                      onClick={saveProfile}
                      disabled={profileSaving || !unsaved}
                      className="flex items-center gap-2 px-5 py-2.5 bg-violet-600
                        hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed
                        text-white text-sm font-semibold rounded-xl transition-colors"
                    >
                      {profileSaving ? (
                        <><Loader2 size={14} className="animate-spin" /> Saving...</>
                      ) : (
                        <><Check size={14} /> Save Changes</>
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* ════════════════════════════════════════════════════════════
                ACCOUNT & SECURITY SECTION
            ════════════════════════════════════════════════════════════ */}
            {section === "account" && (
              <>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                  <h2 className="text-sm font-semibold text-slate-800 mb-5">
                    Account Information
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">
                        Email Address
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="email"
                          value={user?.email ?? ""}
                          readOnly
                          className="flex-1 bg-slate-100 border border-slate-200 rounded-xl
                            px-4 py-2.5 text-sm text-slate-500 cursor-not-allowed"
                        />
                        <div className="px-3 py-2.5 bg-slate-100 border border-slate-200 rounded-xl">
                          <Shield size={14} className="text-slate-400" />
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Email is managed by your Google account and cannot be changed here
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">
                        Sign-in Method
                      </label>
                      <div className="flex items-center gap-3 p-3 bg-slate-50
                        border border-slate-200 rounded-xl">
                        <div className="w-8 h-8 bg-white rounded-lg border border-slate-200
                          flex items-center justify-center shadow-sm">
                          <svg width="16" height="16" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-700">Google</p>
                          <p className="text-xs text-slate-400">Connected account</p>
                        </div>
                        <span className="ml-auto text-[10px] bg-emerald-100 text-emerald-700
                          px-2 py-0.5 rounded-full font-medium">
                          Active
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Danger zone */}
                <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-6">
                  <h2 className="text-sm font-semibold text-red-600 mb-1 flex items-center gap-2">
                    <AlertTriangle size={16} />
                    Danger Zone
                  </h2>
                  <p className="text-xs text-slate-400 mb-5">
                    These actions are permanent and cannot be undone
                  </p>

                  <div className="space-y-3">
                    {!isOwner && (
                      <div className="flex items-center justify-between p-4
                        border border-slate-200 rounded-xl">
                        <div>
                          <p className="text-sm font-medium text-slate-700">
                            Leave Workspace
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            You will lose access to all workspace data
                          </p>
                        </div>
                        <button
                          onClick={() => setShowLeaveConfirm(true)}
                          className="text-xs text-orange-600 hover:text-orange-700
                            border border-orange-200 hover:border-orange-400
                            px-3 py-1.5 rounded-lg transition-colors font-medium"
                        >
                          Leave
                        </button>
                      </div>
                    )}

                    <div className="flex items-center justify-between p-4
                      border border-red-100 bg-red-50/50 rounded-xl">
                      <div>
                        <p className="text-sm font-medium text-red-700">Delete Account</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Permanently delete your account and all data
                        </p>
                      </div>
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="text-xs text-red-600 hover:text-red-700
                          border border-red-200 hover:border-red-400
                          px-3 py-1.5 rounded-lg transition-colors font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ════════════════════════════════════════════════════════════
                WORKSPACE SECTION
            ════════════════════════════════════════════════════════════ */}
            {section === "workspace" && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <h2 className="text-sm font-semibold text-slate-800 mb-5">
                  Workspace Settings
                </h2>

                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">
                      Workspace ID
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                                                                                                <span className="text-sm font-mono font-bold text-violet-700">
                          {resolveWorkspaceDisplayId(workspaceId, workspaceData, user?.uid)}
                        </span>
                      </div>
                      <button
                        onClick={copyWorkspaceId}
                        className="p-2.5 bg-slate-50 border border-slate-200 hover:border-violet-400
                          rounded-xl text-slate-400 hover:text-violet-600 transition-colors"
                      >
                        {copiedWid
                          ? <Check size={15} className="text-emerald-500" />
                          : <Copy  size={15} />
                        }
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Share this ID so others can find your workspace
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">
                      Workspace Name
                      {!isOwner && (
                        <span className="ml-2 text-[10px] text-slate-400">(Owner only)</span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={wsForm.workspaceName}
                      onChange={(e) => setWsForm({ workspaceName: e.target.value })}
                      disabled={!isOwner}
                      maxLength={80}
                      placeholder="Your workspace name"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl
                        px-4 py-2.5 text-sm text-slate-700 focus:outline-none
                        focus:border-violet-400 focus:bg-white transition-colors
                        disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">
                      Current Plan
                    </label>
                    <div className="flex items-center justify-between p-4 bg-slate-50
                      border border-slate-200 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center">
                          <span className="text-base">⭐</span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-700 capitalize">
                            {workspaceData?.plan ?? "Free"} Plan
                          </p>
                          <p className="text-xs text-slate-400">
                            {workspaceData?.plan === "pro"
                              ? "Unlimited members and features"
                              : "Up to 10 members"}
                          </p>
                        </div>
                      </div>
                      {workspaceData?.plan !== "pro" && (
                        <button
                          className="text-xs font-semibold text-white px-4 py-2
                            rounded-xl transition-all"
                          style={{ background: "linear-gradient(135deg,#8b5cf6,#6d28d9)" }}
                        >
                          ✨ Upgrade
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {isOwner && (
                  <div className="flex justify-end mt-6 pt-5 border-t border-slate-100">
                    <button
                      onClick={saveWorkspaceName}
                      disabled={wsSaving}
                      className="flex items-center gap-2 px-5 py-2.5 bg-violet-600
                        hover:bg-violet-700 disabled:opacity-50 text-white text-sm
                        font-semibold rounded-xl transition-colors"
                    >
                      {wsSaving ? (
                        <><Loader2 size={14} className="animate-spin" /> Saving...</>
                      ) : (
                        <><Check size={14} /> Save Workspace</>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ════════════════════════════════════════════════════════════
                NOTIFICATIONS SECTION
            ════════════════════════════════════════════════════════════ */}
            {section === "notifications" && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <h2 className="text-sm font-semibold text-slate-800 mb-1">
                  Notification Preferences
                </h2>
                <p className="text-xs text-slate-400 mb-6">Changes save automatically</p>

                <div className="space-y-4">
                  {(
                    [
                      {
                        key:   "inviteEmails" as const,
                        label: "Workspace Invitations",
                        desc:  "Get notified when someone invites you to a workspace",
                      },
                      {
                        key:   "roleChangeEmails" as const,
                        label: "Role Changes",
                        desc:  "Get notified when your role in a workspace changes",
                      },
                      {
                        key:   "taskEmails" as const,
                        label: "Task Assignments",
                        desc:  "Get notified when a task is assigned to you",
                      },
                      {
                        key:   "weeklyDigest" as const,
                        label: "Weekly Digest",
                        desc:  "Receive a weekly summary of workspace activity",
                      },
                    ] as { key: keyof NotifPrefs; label: string; desc: string }[]
                  ).map(({ key, label, desc }) => (
                    <div
                      key={key}
                      className="flex items-center justify-between p-4 border
                        border-slate-100 rounded-xl hover:bg-slate-50 transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-700">{label}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                      </div>
                      <button
                        onClick={() => saveNotifPref(key, !notifPrefs[key])}
                        className={`relative w-11 h-6 rounded-full transition-colors
                          flex-shrink-0 ${
                          notifPrefs[key] ? "bg-violet-600" : "bg-slate-200"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white
                            rounded-full shadow transition-transform ${
                            notifPrefs[key] ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* ── Leave workspace modal ──────────────────────────────────────────── */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center
          justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center
                justify-center flex-shrink-0">
                <LogOut size={18} className="text-orange-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-800">
                  Leave Workspace?
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  You will immediately lose access to all workspace projects,
                  tasks, and team data. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowLeaveConfirm(false)}
                disabled={dangerLoading}
                className="flex-1 py-2.5 text-sm border border-slate-200 text-slate-600
                  hover:bg-slate-50 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={leaveWorkspace}
                disabled={dangerLoading}
                className="flex-1 py-2.5 text-sm bg-orange-500 hover:bg-orange-600
                  text-white font-semibold rounded-xl transition-colors flex
                  items-center justify-center gap-2"
              >
                {dangerLoading
                  ? <><Loader2 size={14} className="animate-spin" /> Leaving...</>
                  : "Leave Workspace"
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete account modal ───────────────────────────────────────────── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center
          justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center
                justify-center flex-shrink-0">
                <Trash2 size={18} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-800">
                  Delete Account?
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  This will permanently delete your account, profile, and all
                  associated data. This action{" "}
                  <strong>cannot be undone</strong>.
                </p>
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-600 mb-2">
                Type <strong className="text-red-600">DELETE</strong> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Type DELETE here"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5
                  text-sm focus:outline-none focus:border-red-400 transition-colors"
              />
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmText("");
                }}
                disabled={dangerLoading}
                className="flex-1 py-2.5 text-sm border border-slate-200 text-slate-600
                  hover:bg-slate-50 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={deleteAccount}
                disabled={dangerLoading || deleteConfirmText !== "DELETE"}
                className="flex-1 py-2.5 text-sm bg-red-500 hover:bg-red-600
                  disabled:opacity-50 disabled:cursor-not-allowed text-white
                  font-semibold rounded-xl transition-colors flex items-center
                  justify-center gap-2"
              >
                {dangerLoading
                  ? <><Loader2 size={14} className="animate-spin" /> Deleting...</>
                  : <><Trash2 size={14} /> Delete Account</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />
      )}

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
      `}</style>
    </div>
  );
}
