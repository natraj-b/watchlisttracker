import { initializeApp, type FirebaseApp } from "firebase/app";

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
export const cloudSyncConfigured = Boolean(cfg.apiKey && cfg.projectId);

export const firebaseApp: FirebaseApp | null = cloudSyncConfigured
  ? initializeApp(cfg)
  : null;
