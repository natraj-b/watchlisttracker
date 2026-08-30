import { NavLink, Route, Routes } from "react-router-dom";
import { WatchlistPage } from "./routes/WatchlistPage";
import { MutualFundsPage } from "./routes/MutualFundsPage";
import { AnalyseStockPage } from "./routes/AnalyseStockPage";
import { AnalyseFundPage } from "./routes/AnalyseFundPage";

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">📈 Watchlist</span>
      </header>

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
