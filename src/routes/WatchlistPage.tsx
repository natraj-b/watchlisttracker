import { useCallback, useEffect, useState } from "react";
import type { Quote, Section, WatchItem } from "../types";
import { onStoreChange, store } from "../lib/storage";
import { getChart, getQuotes, getQuoteSummary } from "../lib/yahoo";
import { INDICES, guessSection } from "../lib/symbols";
import { useRefreshOnFocus } from "../lib/useRefreshOnFocus";
import { RefreshBar } from "../components/RefreshBar";
import { TickerRow } from "../components/TickerRow";
import { IndexCard } from "../components/IndexCard";
import { AddSymbolSheet } from "../components/AddSymbolSheet";
import { RecommendationLadder, type LadderRow } from "../components/RecommendationLadder";

type Tab = Section | "idx" | "picks";
type ViewMode = "flat" | "sector";
type SortKey = "name" | "cmp" | "chg" | "metric";

function sortValue(it: WatchItem, key: SortKey, tab: Tab, quotes: Record<string, Quote>) {
  const q = quotes[it.symbol];
  switch (key) {
    case "name":
      return (q?.name || it.name).toLowerCase();
    case "cmp":
      return q?.price ?? null;
    case "chg":
      return q?.changePct ?? null;
    case "metric":
      return tab === "fin" ? q?.priceToBook ?? null : q?.peTrailing ?? null;
  }
}

function sortItems(
  arr: WatchItem[],
  key: SortKey,
  tab: Tab,
  quotes: Record<string, Quote>
): WatchItem[] {
  return [...arr].sort((a, b) => {
    const va = sortValue(a, key, tab, quotes);
    const vb = sortValue(b, key, tab, quotes);
    if (typeof va === "string" || typeof vb === "string") {
      return String(va ?? "").localeCompare(String(vb ?? ""));
    }
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return va - vb;
  });
}

function groupBySector(arr: WatchItem[]): [string, WatchItem[]][] {
  const groups = new Map<string, WatchItem[]>();
  for (const it of arr) {
    const key = it.sector || "Uncategorized";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }
  return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

export function WatchlistPage() {
  const [items, setItems] = useState<WatchItem[]>(() => store.getStocks());
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("nonfin");
  const [sheet, setSheet] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("flat");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [hidden, setHidden] = useState<string[]>(() => store.getHiddenIndices());

  const persist = (next: WatchItem[]) => {
    setItems(next);
    store.setStocks(next);
  };

  const load = useCallback(async () => {
    const stockSyms = store.getStocks().map((i) => i.symbol);
    const idxSyms = INDICES.map((i) => i.symbol);
    const all = Array.from(new Set([...stockSyms, ...idxSyms]));
    const { quotes: q, oldestAt } = await getQuotes(all, () => {
      getQuotes(all).then(({ quotes: q2, oldestAt: o2 }) => {
        setQuotes((prev) => ({ ...prev, ...q2 }));
        setFetchedAt(o2);
      });
    });
    setQuotes((prev) => ({ ...prev, ...q }));
    setFetchedAt(oldestAt);

    // Refine classification for unclassified stocks (or ones missing a sector
    // label from before that feature existed) using the company profile — the
    // plain quote endpoint doesn't return sector/industry.
    const cur = store.getStocks();
    const pending = cur.filter((it) => !it.classified || !it.sector);
    if (pending.length) {
      const profiles = await Promise.all(
        pending.map((it) => getQuoteSummary(it.symbol).catch(() => null))
      );
      const byName = (s: string) => guessSection(null, s);
      let changed = false;
      const updated = cur.map((it) => {
        const idx = pending.findIndex((p) => p.symbol === it.symbol);
        if (idx === -1) return it;
        changed = true;
        const prof = profiles[idx]?.summaryProfile;
        const bySector =
          prof && (prof.sector || prof.industry)
            ? guessSection(prof.sector ?? null, prof.industry ?? null)
            : null;
        const section = it.classified
          ? it.section
          : bySector === "fin"
            ? "fin"
            : byName(q[it.symbol]?.name || it.name) === "fin"
              ? "fin"
              : bySector ?? "nonfin";
        return {
          ...it,
          section,
          classified: true,
          sector: prof?.sector ?? it.sector ?? null,
        } as WatchItem;
      });
      if (changed) persist(updated);
    }
  }, []);

  const { busy, refresh } = useRefreshOnFocus(load);

  // Reflect data that changed elsewhere: a Firestore sync from another device,
  // or an Excel import. Also fetch quotes/classify anything newly added.
  useEffect(
    () =>
      onStoreChange(() => {
        setItems(store.getStocks());
        setHidden(store.getHiddenIndices());
        refresh();
      }),
    [refresh]
  );

  function addStock(symbol: string, name: string) {
    if (items.some((i) => i.symbol === symbol)) {
      setTab("nonfin");
      return;
    }
    persist([
      ...items,
      { symbol, name, section: "nonfin", addedAt: Date.now() },
    ]);
    refresh();
  }

  function removeStock(symbol: string) {
    persist(items.filter((i) => i.symbol !== symbol));
  }

  function moveSection(symbol: string, section: Section) {
    persist(
      items.map((i) =>
        i.symbol === symbol
          ? ({ ...i, section, classified: true } as WatchItem)
          : i
      )
    );
  }

  function toggleIndex(sym: string) {
    const next = hidden.includes(sym)
      ? hidden.filter((s) => s !== sym)
      : [...hidden, sym];
    setHidden(next);
    store.setHiddenIndices(next);
  }

  const list = items.filter((i) => i.section === tab);

  function renderRow(it: WatchItem) {
    return (
      <div key={it.symbol} className="row-wrap">
        <TickerRow
          symbol={it.symbol}
          name={it.name}
          section={it.section}
          quote={quotes[it.symbol]}
          onRemove={() => removeStock(it.symbol)}
        />
        <button
          className="row-move"
          onClick={() =>
            moveSection(it.symbol, it.section === "fin" ? "nonfin" : "fin")
          }
        >
          → {it.section === "fin" ? "Non-fin" : "Financial"}
        </button>
      </div>
    );
  }

  return (
    <div className="page">
      <RefreshBar fetchedAt={fetchedAt} busy={busy} onRefresh={refresh} />

      <div className="tabs">
        <button className={tab === "picks" ? "on" : ""} onClick={() => setTab("picks")}>
          Today's Pick
        </button>
        <button className={tab === "nonfin" ? "on" : ""} onClick={() => setTab("nonfin")}>
          Non-financial
        </button>
        <button className={tab === "fin" ? "on" : ""} onClick={() => setTab("fin")}>
          Financial
        </button>
        <button className={tab === "idx" ? "on" : ""} onClick={() => setTab("idx")}>
          Indices
        </button>
      </div>

      {tab === "picks" ? (
        <TodaysPickView items={items} quotes={quotes} />
      ) : tab === "idx" ? (
        <IndicesView hidden={hidden} quotes={quotes} onToggle={toggleIndex} />
      ) : (
        <>
          <div className="listbar">
            <div className="listbar-views">
              <button
                className={viewMode === "flat" ? "on" : ""}
                onClick={() => setViewMode("flat")}
              >
                Normal
              </button>
              <button
                className={viewMode === "sector" ? "on" : ""}
                onClick={() => setViewMode("sector")}
              >
                By sector
              </button>
            </div>
            <select
              className="listbar-sort"
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              aria-label="Sort by"
            >
              <option value="name">Sort: Name</option>
              <option value="cmp">Sort: CMP</option>
              <option value="chg">Sort: Day change</option>
              <option value="metric">Sort: {tab === "fin" ? "P/B" : "P/E"}</option>
            </select>
          </div>

          <div className="list">
            {list.length === 0 && (
              <div className="empty">
                No {tab === "fin" ? "financial" : "non-financial"} stocks yet.
              </div>
            )}
            {list.length > 0 &&
              (viewMode === "sector" ? (
                groupBySector(list).map(([sectorName, sectorItems]) => (
                  <div key={sectorName} className="sector-group">
                    <h4 className="sector-heading">{sectorName}</h4>
                    {sortItems(sectorItems, sortKey, tab, quotes).map((it) =>
                      renderRow(it)
                    )}
                  </div>
                ))
              ) : (
                sortItems(list, sortKey, tab, quotes).map((it) => renderRow(it))
              ))}
          </div>
          <button className="fab" onClick={() => setSheet(true)}>
            + Add stock
          </button>
        </>
      )}

      <AddSymbolSheet open={sheet} onClose={() => setSheet(false)} onAdd={addStock} />
    </div>
  );
}

function TodaysPickView({
  items,
  quotes,
}: {
  items: WatchItem[];
  quotes: Record<string, Quote>;
}) {
  const peRows: LadderRow[] = items
    .filter((it) => it.section === "nonfin")
    .map((it) => ({ it, pe: quotes[it.symbol]?.peTrailing ?? null }))
    .filter((x): x is { it: WatchItem; pe: number } => x.pe != null && x.pe > 0 && x.pe <= 25)
    .sort((a, b) => a.pe - b.pe)
    .map((x) => ({ symbol: x.it.symbol, name: quotes[x.it.symbol]?.name || x.it.name, value: x.pe }));

  const pbRows: LadderRow[] = items
    .filter((it) => it.section === "fin")
    .map((it) => ({ it, pb: quotes[it.symbol]?.priceToBook ?? null }))
    .filter((x): x is { it: WatchItem; pb: number } => x.pb != null && x.pb > 0 && x.pb <= 2)
    .sort((a, b) => a.pb - b.pb)
    .map((x) => ({ symbol: x.it.symbol, name: quotes[x.it.symbol]?.name || x.it.name, value: x.pb }));

  return (
    <div className="picks-view">
      <p className="picks-note">
        Ranked from your own watchlist only — cheapest valuation first. Not a
        buy recommendation; low P/E or P/B can also mean the market sees real
        risk. Always check why before acting.
      </p>
      <RecommendationLadder
        title="Non-financial · P/E ≤ 25"
        metricLabel="P/E"
        rows={peRows}
        greenMax={20}
        orangeMax={25}
        emptyText="No non-financial stock in your watchlist has a P/E of 25 or below right now."
      />
      <RecommendationLadder
        title="Financial · P/B ≤ 2"
        metricLabel="P/B"
        rows={pbRows}
        greenMax={1}
        orangeMax={2}
        emptyText="No financial stock in your watchlist has a P/B of 2 or below right now."
      />
    </div>
  );
}

function IndicesView({
  hidden,
  quotes,
  onToggle,
}: {
  hidden: string[];
  quotes: Record<string, Quote>;
  onToggle: (s: string) => void;
}) {
  const [sparks, setSparks] = useState<Record<string, number[]>>({});
  const visible = INDICES.filter((i) => !hidden.includes(i.symbol));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const idx of visible) {
        if (sparks[idx.symbol]) continue;
        const { candles } = await getChart(idx.symbol, "1mo");
        if (cancelled) return;
        setSparks((p) => ({ ...p, [idx.symbol]: candles.map((c) => c.c) }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden]);

  const groups: Array<"Broad" | "Sector" | "Other"> = ["Broad", "Sector", "Other"];

  return (
    <div className="idx-view">
      {groups.map((g) => (
        <div key={g}>
          <h3 className="idx-group">{g}</h3>
          <div className="idx-grid">
            {visible
              .filter((i) => i.group === g)
              .map((i) => (
                <IndexCard
                  key={i.symbol}
                  name={i.name}
                  quote={quotes[i.symbol]}
                  spark={sparks[i.symbol] || []}
                />
              ))}
          </div>
        </div>
      ))}
      <details className="idx-manage">
        <summary>Show / hide indices</summary>
        <div className="idx-toggles">
          {INDICES.map((i) => (
            <label key={i.symbol}>
              <input
                type="checkbox"
                checked={!hidden.includes(i.symbol)}
                onChange={() => onToggle(i.symbol)}
              />
              {i.name}
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}
