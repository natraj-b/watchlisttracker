import { useEffect, useState } from "react";
import {
  currentUserEmail,
  getSyncStatus,
  onSyncStatus,
  requestSignInLink,
  signOutOfSync,
  type SyncStatus,
} from "../lib/cloudSync";
import { cloudSyncConfigured } from "../lib/firebase";

const LABEL: Record<SyncStatus, string> = {
  off: "Cloud sync isn't set up for this app yet.",
  "signed-out": "Not signed in — data stays on this device only.",
  "link-sent": "Check your email and open the link on this device.",
  syncing: "Connecting…",
  synced: "Synced",
  error: "Sync error",
};

export function SyncSection() {
  const [{ status, detail }, setState] = useState(getSyncStatus());
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => onSyncStatus((s, d) => setState({ status: s, detail: d })), []);

  if (!cloudSyncConfigured) {
    return (
      <div className="sync-section">
        <p className="sync-status">{LABEL.off}</p>
      </div>
    );
  }

  async function sendLink() {
    if (!email.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      await requestSignInLink(email.trim());
    } catch (e) {
      setSendError(String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="sync-section">
      {status === "synced" ? (
        <>
          <p className="sync-status ok">
            ✓ Synced as {detail || currentUserEmail()}
          </p>
          <button className="sync-signout" onClick={() => signOutOfSync()}>
            Sign out on this device
          </button>
        </>
      ) : (
        <>
          <p className="sync-status">{LABEL[status]}{status === "error" && detail ? `: ${detail}` : ""}</p>
          <div className="sync-form">
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button disabled={sending || !email.trim()} onClick={sendLink}>
              {sending ? "Sending…" : "Send sign-in link"}
            </button>
          </div>
          {sendError && <p className="backup-error">{sendError}</p>}
          <p className="sync-hint">
            No password — click the link we email you, on this device, to turn
            sync on here. Repeat on your other device with the same email to
            link it too.
          </p>
        </>
      )}
    </div>
  );
}
