import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { MfDetail, MfScheme, MfWatchItem } from "../types";
import { onStoreChange, store } from "../lib/storage";
import { computeReturns, getFund, searchFunds } from "../lib/mfapi";
import { useRefreshOnFocus } from "../lib/useRefreshOnFocus";
import { RefreshBar } from "../components/RefreshBar";
import { num, pct, signClass } from "../lib/format";

const PERIODS = ["1M", "6M", "1Y", "3Y", "5Y"] as const;
type Period = (typeof PERIODS)[number];

export function MutualFundsPage() {
  const [funds, setFunds] = useState<MfWatchItem[]>(() => store.getFunds());
  const [details, setDetails] = useState<Record<number, MfDetail>>({});
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<Period>("1Y");
  const [sheet, setSheet] = useState(false);

  const persist = (n: MfWatchItem[]) => {
    setFunds(n);
    store.setFunds(n);
  };

  const load = useCallback(async () => {
    const codes = store.getFunds().map((f) => f.schemeCode);
    let oldest: number | null = null;
    const next: Record<number, MfDetail> = {};
    await Promise.all(
      codes.map(async (c) => {
        const { detail, fetchedAt } = await getFund(c, () => {
          getFund(c).then(({ detail: d }) => {
            if (d) setDetails((p) => ({ ...p, [c]: d }));
          });
        });
        if (detail) next[c] = detail;
        if (fetchedAt) oldest = oldest ? Math.min(oldest, fetchedAt) : fetchedAt;
      })
    );
    setDetails((p) => ({ ...p, ...next }));
    setFetchedAt(oldest);
  }, []);

  const { busy, refresh } = useRefreshOnFocus(load);

  useEffect(
    () =>
      onStoreChange(() => {
        setFunds(store.getFunds());
        refresh();
      }),
    [refresh]
  );

  function addFund(s: MfScheme) {
    if (funds.some((f) => f.schemeCode === s.schemeCode)) return;
    persist([
      ...funds,
      { schemeCode: s.schemeCode, schemeName: s.schemeName, addedAt: Date.now() },
    ]);
    refresh();
  }

  const rows = funds
    .map((f) => {
      const d = details[f.schemeCode];
      return { f, d, r: d ? computeReturns(d) : null };
    })
    .sort((a, b) => (b.r?.[sortBy] ?? -1e9) - (a.r?.[sortBy] ?? -1e9));

  return (
    <div className="page">
      <RefreshBar fetchedAt={fetchedAt} busy={busy} onRefresh={refresh} />

      <div className="mf-sortbar" role="group" aria-label="Sort by return period">
        <span>Sort by return:</span>
        {PERIODS.map((p) => (
          <button
            key={p}
            aria-pressed={sortBy === p}
            className={"chip " + (sortBy === p ? "on" : "")}
            onClick={() => setSortBy(p)}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="mf-table">
        <div className="mf-head">
          <span>Scheme</span>
          <span>NAV</span>
          {PERIODS.map((p) => (
            <span key={p}>{p}</span>
          ))}
        </div>
        {rows.length === 0 && <div className="empty">No funds yet. Add one below.</div>}
        {rows.map(({ f, d, r }) => (
          <Link
            key={f.schemeCode}
            className="mf-row"
            to={`/analyse/fund/${f.schemeCode}`}
          >
            <span className="mf-name">
              <b>{d?.schemeName || f.schemeName}</b>
              <small>{d?.schemeCategory || ""}</small>
            </span>
            <span>{num(d?.nav ?? null)}</span>
            {PERIODS.map((p) => (
              <span key={p} className={signClass(r?.[p])}>
                {pct(r?.[p] ?? null, 1)}
              </span>
            ))}
          </Link>
        ))}
      </div>

      <button className="fab" onClick={() => setSheet(true)}>
        + Add fund
      </button>
      <FundSearchSheet open={sheet} onClose={() => setSheet(false)} onAdd={addFund} />
    </div>
  );
}

function FundSearchSheet({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (s: MfScheme) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MfScheme[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!open) {
      setQ("");
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (q.trim().length < 3) {
      setResults([]);
      return;
    }
    timer.current = window.setTimeout(async () => {
      setLoading(true);
      setResults((await searchFunds(q)).slice(0, 40));
      setLoading(false);
    }, 300);
  }, [q]);

  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <h3>Add mutual fund</h3>
        <input
          autoFocus
          className="sheet-input"
          placeholder="Search scheme (e.g. Parag Parikh Flexi Cap)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="sheet-list">
          {loading && <div className="sheet-hint">Searching…</div>}
          {!loading && q.trim().length < 3 && (
            <div className="sheet-hint">Type at least 3 characters.</div>
          )}
          {results.map((r) => (
            <button
              key={r.schemeCode}
              className="sheet-item"
              onClick={() => {
                onAdd(r);
                onClose();
              }}
            >
              <span className="sheet-item-name">{r.schemeName}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
