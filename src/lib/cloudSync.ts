import type { Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import { cloudSyncConfigured, firebaseApp } from "./firebase";
import { setCloudPushHandler, store, type CloudDoc } from "./storage";

const PENDING_EMAIL_KEY = "iw.pendingSignInEmail";

export type SyncStatus =
  | "off" // no Firebase project configured — local-only mode
  | "signed-out"
  | "link-sent"
  | "syncing"
  | "synced"
  | "error";

let status: SyncStatus = cloudSyncConfigured ? "signed-out" : "off";
let statusDetail = "";
const statusListeners = new Set<(s: SyncStatus, detail: string) => void>();

function setStatus(s: SyncStatus, detail = "") {
  status = s;
  statusDetail = detail;
  statusListeners.forEach((l) => l(status, statusDetail));
}

export function getSyncStatus(): { status: SyncStatus; detail: string } {
  return { status, detail: statusDetail };
}

export function onSyncStatus(l: (s: SyncStatus, detail: string) => void): () => void {
  statusListeners.add(l);
  return () => {
    statusListeners.delete(l);
  };
}

// Firebase auth/firestore are only pulled into the bundle (as a separate,
// lazily-loaded chunk) when a Firebase project is actually configured.
let auth: Auth | null = null;
let db: Firestore | null = null;
let unsubSnapshot: (() => void) | null = null;
let applyingRemote = false;
let started = false;

async function ready(): Promise<{ auth: Auth; db: Firestore } | null> {
  if (!cloudSyncConfigured || !firebaseApp) return null;
  if (auth && db) return { auth, db };
  const [{ getAuth }, { getFirestore }] = await Promise.all([
    import("firebase/auth"),
    import("firebase/firestore"),
  ]);
  auth = getAuth(firebaseApp);
  db = getFirestore(firebaseApp);
  return { auth, db };
}

/** Call once at app startup. No-ops if Firebase isn't configured. */
export async function initCloudSync(): Promise<void> {
  if (started || !cloudSyncConfigured) return;
  started = true;

  const r = await ready();
  if (!r) return;
  const { onAuthStateChanged } = await import("firebase/auth");
  const { doc, onSnapshot, setDoc } = await import("firebase/firestore");

  setCloudPushHandler((patch: CloudDoc) => {
    if (applyingRemote || !auth?.currentUser || !db) return;
    setDoc(doc(db, "users", auth.currentUser.uid), patch, { merge: true }).catch(
      (e) => setStatus("error", String(e))
    );
  });

  onAuthStateChanged(r.auth, (user) => {
    unsubSnapshot?.();
    unsubSnapshot = null;

    if (!user) {
      setStatus("signed-out");
      return;
    }
    if (!db) return;
    setStatus("syncing");
    const ref = doc(db, "users", user.uid);
    unsubSnapshot = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          // First time this identity has signed in: seed the cloud from
          // whatever is already on this device so nothing is lost.
          setDoc(ref, store.getAllForCloud()).catch((e) =>
            setStatus("error", String(e))
          );
          return;
        }
        applyingRemote = true;
        store.applyRemote(snap.data() as CloudDoc);
        applyingRemote = false;
        setStatus("synced", user.email ?? "");
      },
      (e) => setStatus("error", e.message)
    );
  });
}

export async function requestSignInLink(email: string): Promise<void> {
  const r = await ready();
  if (!r) throw new Error("Cloud sync not configured");
  const { sendSignInLinkToEmail } = await import("firebase/auth");
  const url = window.location.origin + window.location.pathname;
  await sendSignInLinkToEmail(r.auth, email, { url, handleCodeInApp: true });
  localStorage.setItem(PENDING_EMAIL_KEY, email);
  setStatus("link-sent");
}

/** Call once at app startup, before rendering. Handles the magic-link redirect. */
export async function completeSignInFromLink(): Promise<void> {
  if (!cloudSyncConfigured) return;
  const { isSignInWithEmailLink, signInWithEmailLink } = await import("firebase/auth");
  const r = await ready();
  if (!r) return;
  if (!isSignInWithEmailLink(r.auth, window.location.href)) return;

  let email = localStorage.getItem(PENDING_EMAIL_KEY);
  if (!email) {
    email = window.prompt(
      "Confirm the email address you used to request this sign-in link:"
    );
  }
  if (!email) return;

  try {
    await signInWithEmailLink(r.auth, email, window.location.href);
    localStorage.removeItem(PENDING_EMAIL_KEY);
    // Strip the sign-in params from the URL without a reload.
    window.history.replaceState({}, "", window.location.pathname);
  } catch (e) {
    setStatus("error", String(e));
  }
}

export async function signOutOfSync(): Promise<void> {
  if (!auth) return;
  const { signOut } = await import("firebase/auth");
  await signOut(auth);
}

export function currentUserEmail(): string | null {
  return auth?.currentUser?.email ?? null;
}
