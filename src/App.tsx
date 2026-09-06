import { lazy, Suspense, useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { WatchlistPage } from "./routes/WatchlistPage";
import { getDataError, onDataError } from "./lib/status";
import { getSyncStatus, onSyncStatus } from "./lib/cloudSync";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PageFallback } from "./components/Skeleton";

// Split the screens you don't land on into their own chunks — the Analyse and
// Funds views (and the backup sheet, which pulls in the xlsx library) then load
// on demand instead of bloating first paint.
const MutualFundsPage = lazy(() =>
  import("./routes/MutualFundsPage").then((m) => ({ default: m.MutualFundsPage }))
);
const AnalyseStockPage = lazy(() =>
  import("./routes/AnalyseStockPage").then((m) => ({ default: m.AnalyseStockPage }))
);
const AnalyseFundPage = lazy(() =>
  import("./routes/AnalyseFundPage").then((m) => ({ default: m.AnalyseFundPage }))
);
const StockReportPage = lazy(() =>
  import("./routes/StockReportPage").then((m) => ({ default: m.StockReportPage }))
);
const DataBackupSheet = lazy(() =>
  import("./components/DataBackupSheet").then((m) => ({ default: m.DataBackupSheet }))
);
const SyncSheet = lazy(() =>
  import("./components/SyncSheet").then((m) => ({ default: m.SyncSheet }))
);

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
        <span className="ver" title={`commit ${__COMMIT__}`}>
          build {__BUILD__}
        </span>
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

      <Suspense fallback={null}>
        {syncOpen && <SyncSheet open={syncOpen} onClose={() => setSyncOpen(false)} />}
        {backupOpen && (
          <DataBackupSheet
            open={backupOpen}
            onClose={() => setBackupOpen(false)}
            onImported={() => {}}
          />
        )}
      </Suspense>

      <main className="content">
        <ErrorBoundary>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<WatchlistPage />} />
              <Route path="/funds" element={<MutualFundsPage />} />
              <Route path="/analyse/stock/:symbol" element={<AnalyseStockPage />} />
              <Route path="/analyse/stock/:symbol/report" element={<StockReportPage />} />
              <Route path="/analyse/fund/:code" element={<AnalyseFundPage />} />
              <Route path="*" element={<WatchlistPage />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
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
