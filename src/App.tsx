import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { WatchlistPage } from "./routes/WatchlistPage";
import { MutualFundsPage } from "./routes/MutualFundsPage";
import { AnalyseStockPage } from "./routes/AnalyseStockPage";
import { AnalyseFundPage } from "./routes/AnalyseFundPage";
import { getDataError, onDataError } from "./lib/status";
import { DataBackupSheet } from "./components/DataBackupSheet";

export default function App() {
  const [err, setErr] = useState<string | null>(getDataError());
  const [backupOpen, setBackupOpen] = useState(false);
  useEffect(() => onDataError(setErr), []);

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">📈 Watchlist</span>
        <span className="ver">build 5</span>
        <button
          className="header-backup"
          aria-label="Backup and restore"
          onClick={() => setBackupOpen(true)}
        >
          ⇅
        </button>
      </header>

      {err && <div className="databanner">{err}</div>}

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
