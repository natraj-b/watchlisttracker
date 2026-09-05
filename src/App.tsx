import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { WatchlistPage } from "./routes/WatchlistPage";
import { MutualFundsPage } from "./routes/MutualFundsPage";
import { AnalyseStockPage } from "./routes/AnalyseStockPage";
import { AnalyseFundPage } from "./routes/AnalyseFundPage";
import { getDataError, onDataError } from "./lib/status";
import { DataBackupSheet } from "./components/DataBackupSheet";
import { SyncSheet } from "./components/SyncSheet";
import { getSyncStatus, onSyncStatus } from "./lib/cloudSync";

export default function App() {
  const [err, setErr] = useState<string | null>(getDataError());
  const [backupOpen, setBackupOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState(getSyncStatus().status);
  useEffect(() => onDataError(setErr), []);
  useEffect(() => onSyncStatus((s) => setSyncStatus(s)), []);

  const synced = syncStatus === "synced";

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">📈 Watchlist</span>
        <span className="ver">build 7</span>
        <button
          className={"header-icon" + (synced ? " synced" : "")}
          aria-label={synced ? "Synced — tap for details" : "Sync across devices"}
          title={synced ? "Synced" : "Sync"}
          onClick={() => setSyncOpen(true)}
        >
          {synced ? "☁✓" : "☁"}
        </button>
        <button
          className="header-icon"
          aria-label="Backup and restore"
          title="Backup & restore"
          onClick={() => setBackupOpen(true)}
        >
          ⇅
        </button>
      </header>

      {err && <div className="databanner">{err}</div>}

      <SyncSheet open={syncOpen} onClose={() => setSyncOpen(false)} />
      <DataBackupSheet
        open={backupOpen}
        onClose={() => setBackupOpen(false)}
        onImported={() => {}}
      />

      <main className="content">
        <Routes>
          <Route path="/" element={<WatchlistPage />} />
          <Route path="/funds" element={<MutualFundsPage />} />
          <Route path="/analyse/stock/:symbol" element={<AnalyseStockPage />} />
          <Route path="/analyse/fund/:code" element={<AnalyseFundPage />} />
          <Route path="*" element={<WatchlistPage />} />
        </Routes>
      </main>

      <nav className="tabbar">
        <NavLink to="/" end>
          <span>Stocks</span>
        </NavLink>
        <NavLink to="/funds">
          <span>Funds</span>
        </NavLink>
      </nav>
    </div>
  );
}
