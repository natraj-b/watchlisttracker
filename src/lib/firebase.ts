import type { FirebaseApp } from "firebase/app";

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Cloud sync is entirely optional: if no Firebase project is configured, the
// app just runs in local-only mode (same as before this feature existed).
// This flag is a plain env check — importing it pulls in none of the SDK.
export const cloudSyncConfigured = Boolean(cfg.apiKey && cfg.projectId);

// The Firebase SDK (~200 kB just for `firebase/app`) is loaded lazily on first
// use, so a visitor who never touches sync never downloads it.
let appPromise: Promise<FirebaseApp> | null = null;

export function getFirebaseApp(): Promise<FirebaseApp> | null {
  if (!cloudSyncConfigured) return null;
  if (!appPromise) {
    appPromise = import("firebase/app").then(({ initializeApp }) =>
      initializeApp(cfg)
    );
  }
  return appPromise;
}
