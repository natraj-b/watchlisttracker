import { useCallback, useEffect, useState } from "react";
import type { Candle, CustomIndex, Quote, Section, WatchItem } from "../types";
import { onStoreChange, store } from "../lib/storage";
import { getChart, getQuotes, getQuoteSummary } from "../lib/yahoo";
import { getIndexRatios, type IndexRatioMap } from "../lib/nse";
import { INDICES, guessSection, type IndexDef } from "../lib/symbols";
import { useRefreshOnFocus } from "../lib/useRefreshOnFocus";
import { num, pct, signClass } from "../lib/format";
import { RefreshBar } from "../components/RefreshBar";
import { TickerRow } from "../components/TickerRow";
import { Sparkline } from "../components/Sparkline";
import { MetricGrid } from "../components/MetricGrid";
import { AddSymbolSheet } from "../components/AddSymbolSheet";
import { RecommendationLadder, type LadderRow } from "../components/RecommendationLadder";
import { SkeletonRows } from "../components/Skeleton";

type Tab = Section | "idx" | "picks";
type ViewMode = "flat" | "sector";
type SortKey = "name" | "cmp" | "chg" | "metric";

const TABS: { key: Tab; label: string }[] = [
  { key: "picks", label: "Today's Pick" },
  { key: "nonfin", label: "Non-financial" },
  { key: "fin", label: "Financial" },
  { key: "idx", label: "Indices" },
];

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
  const [sortKey, setSortKey] = useState<SortKey>("metric");
  const [hidden, setHidden] = useState<string[]>(() => store.getHiddenIndices());
  const [customIndices, setCustomIndices] = useState<CustomIndex[]>(() =>
    store.getCustomIndices()
  );
  const [idxSheet, setIdxSheet] = useState(false);

  const allIndices: IndexDef[] = [
    ...INDICES,
    ...customIndices.map((c) => ({ symbol: c.symbol, name: c.name, group: "Custom" as const })),
  ];

  const persist = (next: WatchItem[]) => {
    setItems(next);
    store.setStocks(next);
  };

  const load = useCallback(async () => {
    const stockSyms = store.getStocks().map((i) => i.symbol);
    const idxSyms = INDICES.map((i) => i.symbol);
    const customSyms = store.getCustomIndices().map((i) => i.symbol);
    const all = Array.from(new Set([...stockSyms, ...idxSyms, ...customSyms]));
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
      const profileBySymbol = new Map(pending.map((it, i) => [it.symbol, profiles[i]]));
      const byName = (s: string) => guessSection(null, s);

      // Re-read live state before writing back — the watchlist may have
      // changed (e.g. a manual move between tabs) while the profile fetches
      // above were in flight. Always defer to the CURRENT classified/section
      // values, never the pre-fetch snapshot, so a fresh manual edit can't
      // be clobbered by a slow background classification pass.
      const fresh = store.getStocks();
      let changed = false;
      const updated = fresh.map((it) => {
        const profResult = profileBySymbol.get(it.symbol);
        if (!profResult) return it;
        const prof = profResult?.summaryProfile;
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
        const sector = prof?.sector ?? it.sector ?? null;
        if (it.classified && it.section === section && it.sector === sector) {
          return it;
        }
        changed = true;
        return { ...it, section, classified: true, sector } as WatchItem;
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
        setCustomIndices(store.getCustomIndices());
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

  function addCustomIndex(symbol: string, name: string) {
    if (INDICES.some((i) => i.symbol === symbol) || customIndices.some((i) => i.symbol === symbol)) {
      setIdxSheet(false);
      return;
    }
    const next = [...customIndices, { symbol, name, addedAt: Date.now() }];
    setCustomIndices(next);
    store.setCustomIndices(next);
    refresh();
  }

  function removeCustomIndex(symbol: string) {
    const next = customIndices.filter((i) => i.symbol !== symbol);
    setCustomIndices(next);
    store.setCustomIndices(next);
  }

  const list = items.filter((i) => i.section === tab);
  // First paint after a cold load: watchlist items are known (from localStorage)
  // but no quote has arrived yet. Show skeletons rather than "nothing here".
  const firstLoad = fetchedAt == null && Object.keys(quotes).length === 0;

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

      <div
        className="tabs"
        role="tablist"
        aria-label="Watchlist sections"
        onKeyDown={(e) => {
          const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
          if (!dir) return;
          e.preventDefault();
          const i = TABS.findIndex((t) => t.key === tab);
          setTab(TABS[(i + dir + TABS.length) % TABS.length].key);
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls="tabpanel"
            tabIndex={tab === t.key ? 0 : -1}
            className={tab === t.key ? "on" : ""}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div id="tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
      {tab === "picks" ? (
        <TodaysPickView items={items} quotes={quotes} loading={firstLoad} />
      ) : tab === "idx" ? (
        <IndicesView
          indices={allIndices}
          hidden={hidden}
          quotes={quotes}
          onToggle={toggleIndex}
          onRemoveCustom={removeCustomIndex}
          onAddClick={() => setIdxSheet(true)}
        />
      ) : (
        <>
          <div className="listbar">
            <div className="listbar-views" role="group" aria-label="Layout">
              <button
                aria-pressed={viewMode === "flat"}
                className={viewMode === "flat" ? "on" : ""}
                onClick={() => setViewMode("flat")}
              >
                Normal
              </button>
              <button
                aria-pressed={viewMode === "sector"}
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

          {list.length > 0 && firstLoad ? (
            <SkeletonRows count={Math.min(list.length, 6)} />
          ) : (
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
          )}
          <button className="fab" onClick={() => setSheet(true)}>
            + Add stock
          </button>
        </>
      )}
      </div>

      <AddSymbolSheet open={sheet} onClose={() => setSheet(false)} onAdd={addStock} />
      <AddSymbolSheet
        open={idxSheet}
        onClose={() => setIdxSheet(false)}
        onAdd={addCustomIndex}
        title="Add an index"
        placeholder="Search index or ticker (e.g. Dow Jones, ^DJI, ^GSPC)"
      />
    </div>
  );
}

function TodaysPickView({
  items,
  quotes,
  loading,
}: {
  items: WatchItem[];
  quotes: Record<string, Quote>;
  loading?: boolean;
}) {
  const peRows: LadderRow[] = items
    .filter((it) => it.section === "nonfin")
    .map((it) => ({ it, pe: quotes[it.symbol]?.peTrailing ?? null }))
    .filter((x): x is { it: WatchItem; pe: number } => x.pe != null && x.pe > 0 && x.pe <= 25)
    .sort((a, b) => a.pe - b.pe)
    .map((x) => ({
      symbol: x.it.symbol,
      name: quotes[x.it.symbol]?.name || x.it.name,
      value: x.pe,
      price: quotes[x.it.symbol]?.price ?? null,
    }));

  const pbRows: LadderRow[] = items
    .filter((it) => it.section === "fin")
    .map((it) => ({ it, pb: quotes[it.symbol]?.priceToBook ?? null }))
    .filter((x): x is { it: WatchItem; pb: number } => x.pb != null && x.pb > 0 && x.pb <= 2)
    .sort((a, b) => a.pb - b.pb)
    .map((x) => ({
      symbol: x.it.symbol,
      name: quotes[x.it.symbol]?.name || x.it.name,
      value: x.pb,
      price: quotes[x.it.symbol]?.price ?? null,
    }));

  return (
    <div className="picks-view">
      <p className="picks-note">
        Ranked from your own watchlist only — cheapest valuation first. Not a
        buy recommendation; low P/E or P/B can also mean the market sees real
        risk. Always check why before acting.
      </p>
      {loading ? (
        <SkeletonRows count={5} />
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}

interface IdxStats {
  cmp: number | null;
  ath: number | null;
  p1y: number | null;
  p5y: number | null;
  p10y: number | null;
  ret1y: number | null;
  ret5y: number | null;
  ret10y: number | null;
  dropFromAth: number | null;
  trend1y: number[];
}

function nearestOnOrBefore(candles: Candle[], targetSec: number): number | null {
  let result: number | null = null;
  for (const c of candles) {
    if (c.t <= targetSec) result = c.c;
    else break;
  }
  return result;
}

function deriveIdxStats(candles: Candle[], livePrice: number | null): IdxStats {
  // Yahoo has essentially no history for some symbols (a single data point) —
  // treat that as "no history" rather than reporting a misleading 0% drop.
  if (candles.length < 4) {
    return {
      cmp: livePrice ?? candles[0]?.c ?? null,
      ath: null,
      p1y: null,
      p5y: null,
      p10y: null,
      ret1y: null,
      ret5y: null,
      ret10y: null,
      dropFromAth: null,
      trend1y: candles.map((c) => c.c),
    };
  }
  const nowSec = Date.now() / 1000;
  const day = 86400;
  const latestClose = candles[candles.length - 1].c;
  const cmp = livePrice ?? latestClose;
  const ath = Math.max(...candles.map((c) => c.c), cmp);
  const p1y = nearestOnOrBefore(candles, nowSec - 365 * day);
  const p5y = nearestOnOrBefore(candles, nowSec - 5 * 365 * day);
  const p10y = nearestOnOrBefore(candles, nowSec - 10 * 365 * day);
  const ret = (past: number | null) => (past ? ((cmp - past) / past) * 100 : null);
  const recent = candles.filter((c) => c.t >= nowSec - 365 * day).map((c) => c.c);
  return {
    cmp,
    ath,
    p1y,
    p5y,
    p10y,
    ret1y: ret(p1y),
    ret5y: ret(p5y),
    ret10y: ret(p10y),
    dropFromAth: ath ? ((cmp - ath) / ath) * 100 : null,
    trend1y: recent.length >= 2 ? recent : candles.slice(-6).map((c) => c.c),
  };
}

type IdxSortKey = "name" | "cmp" | "drop" | "ret1y" | "ret5y" | "ret10y" | "pe" | "pb";

function idxSortValue(
  i: IndexDef,
  key: IdxSortKey,
  stats: IdxStats,
  ratios: IndexRatioMap
): number | string | null {
  switch (key) {
    case "name":
      return i.name.toLowerCase();
    case "cmp":
      return stats.cmp;
    case "drop":
      return stats.dropFromAth;
    case "ret1y":
      return stats.ret1y;
    case "ret5y":
      return stats.ret5y;
    case "ret10y":
      return stats.ret10y;
    case "pe":
      return i.nseKey ? ratios[i.nseKey]?.pe ?? null : null;
    case "pb":
      return i.nseKey ? ratios[i.nseKey]?.pb ?? null : null;
  }
}

function sortIndexRows(
  rows: IndexDef[],
  key: IdxSortKey,
  histories: Record<string, Candle[]>,
  quotes: Record<string, Quote>,
  ratios: IndexRatioMap
): IndexDef[] {
  const withStats = rows.map((i) => ({
    i,
    stats: deriveIdxStats(histories[i.symbol] || [], quotes[i.symbol]?.price ?? null),
  }));
  withStats.sort((a, b) => {
    const va = idxSortValue(a.i, key, a.stats, ratios);
    const vb = idxSortValue(b.i, key, b.stats, ratios);
    if (typeof va === "string" || typeof vb === "string") {
      return String(va ?? "").localeCompare(String(vb ?? ""));
    }
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return va - vb;
  });
  return withStats.map((x) => x.i);
}

function IndicesView({
  indices,
  hidden,
  quotes,
  onToggle,
  onRemoveCustom,
  onAddClick,
}: {
  indices: IndexDef[];
  hidden: string[];
  quotes: Record<string, Quote>;
  onToggle: (s: string) => void;
  onRemoveCustom: (s: string) => void;
  onAddClick: () => void;
}) {
  const [histories, setHistories] = useState<Record<string, Candle[]>>({});
  const [ratios, setRatios] = useState<IndexRatioMap>({});
  const [idxSort, setIdxSort] = useState<IdxSortKey>("name");
  const visible = indices.filter((i) => !hidden.includes(i.symbol));

  useEffect(() => {
    let cancelled = false;
    getIndexRatios(() => {
      getIndexRatios().then((r) => !cancelled && setRatios(r));
    }).then((r) => !cancelled && setRatios(r));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const idx of visible) {
        if (histories[idx.symbol]) continue;
        let { candles } = await getChart(idx.symbol, "max");
        // Yahoo silently returns almost nothing for "max" range on several
        // sector indices even though they do have real daily history over a
        // shorter window — fall back to that when "max" comes back too thin.
        if (candles.length < 10) {
          const fallback = await getChart(idx.symbol, "5y");
          if (fallback.candles.length > candles.length) candles = fallback.candles;
        }
        if (cancelled) return;
        setHistories((p) => ({ ...p, [idx.symbol]: candles }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden]);

  const KNOWN_GROUPS = ["Broad", "Sector", "Other", "Custom"];
  const [groupOrder, setGroupOrder] = useState<string[]>(() => {
    const stored = store.getIndexGroupOrder();
    const known = stored.filter((g) => KNOWN_GROUPS.includes(g));
    const missing = KNOWN_GROUPS.filter((g) => !known.includes(g));
    return [...known, ...missing];
  });

  function moveGroup(group: string, dir: -1 | 1) {
    const idx = groupOrder.indexOf(group);
    const swapWith = idx + dir;
    if (swapWith < 0 || swapWith >= groupOrder.length) return;
    const next = [...groupOrder];
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
    setGroupOrder(next);
    store.setIndexGroupOrder(next);
  }

  const groups = groupOrder as Array<"Broad" | "Sector" | "Other" | "Custom">;

  return (
    <div className="idx-view">
      <div className="listbar">
        <span className="listbar-hint">Sort applies within each group</span>
        <select
          className="listbar-sort"
          value={idxSort}
          onChange={(e) => setIdxSort(e.target.value as IdxSortKey)}
          aria-label="Sort indices by"
        >
          <option value="name">Sort: Name</option>
          <option value="cmp">Sort: CMP</option>
          <option value="drop">Sort: Drop from ATH</option>
          <option value="ret1y">Sort: 1Y return</option>
          <option value="ret5y">Sort: 5Y return</option>
          <option value="ret10y">Sort: 10Y return</option>
          <option value="pe">Sort: P/E</option>
          <option value="pb">Sort: P/B</option>
        </select>
      </div>

      {groups.map((g) => {
        const rows = sortIndexRows(
          visible.filter((i) => i.group === g),
          idxSort,
          histories,
          quotes,
          ratios
        );
        if (!rows.length) return null;
        const orderIdx = groupOrder.indexOf(g);
        return (
          <div key={g}>
            <div className="idx-group-head">
              <h3 className="idx-group">{g}</h3>
              <div className="idx-group-move">
                <button
                  disabled={orderIdx === 0}
                  aria-label={`Move ${g} up`}
                  onClick={() => moveGroup(g, -1)}
                >
                  ▲
                </button>
                <button
                  disabled={orderIdx === groupOrder.length - 1}
                  aria-label={`Move ${g} down`}
                  onClick={() => moveGroup(g, 1)}
                >
                  ▼
                </button>
              </div>
            </div>
            <div className="idx-cards">
              {rows.map((i) => {
                const stats = deriveIdxStats(
                  histories[i.symbol] || [],
                  quotes[i.symbol]?.price ?? null
                );
                const bare = i.symbol.replace(/^\^/, "").replace(/\.NS$/i, "");
                const dp = (v: number | null) => num(v, v != null && v >= 1000 ? 0 : 2);
                const drop = stats.dropFromAth;
                const dropTier =
                  drop == null ? "" : drop >= -5 ? "near-high" : drop >= -15 ? "mid" : "deep";
                return (
                  <div key={i.symbol} className="idxrow">
                    <div className="idxrow-top">
                      <div className="idxrow-id">
                        <span className="idxrow-name">{i.name}</span>
                        <span className="idxrow-sym">{bare}</span>
                      </div>
                      <div className="idxrow-top-right">
                        <Sparkline data={stats.trend1y} width={44} height={22} />
                        <button
                          className="idxrow-x"
                          aria-label={`Remove ${i.name}`}
                          onClick={() =>
                            g === "Custom" ? onRemoveCustom(i.symbol) : onToggle(i.symbol)
                          }
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    <div className="idxrow-main">
                      <span className="idxrow-cmp">{dp(stats.cmp)}</span>
                      {drop != null ? (
                        <span
                          className={"idxrow-drop " + dropTier}
                          title="Drop from all-time high"
                        >
                          {pct(drop, 1)}
                        </span>
                      ) : (
                        <span className="idxrow-drop na" title="No history available">
                          N/A
                        </span>
                      )}
                    </div>

                    {i.nseKey && ratios[i.nseKey] && (
                      <div className="idxrow-ratios">
                        <span>
                          P/E <b>{ratios[i.nseKey].pe != null ? num(ratios[i.nseKey].pe, 1) : "—"}</b>
                        </span>
                        <span>
                          P/B <b>{ratios[i.nseKey].pb != null ? num(ratios[i.nseKey].pb, 2) : "—"}</b>
                        </span>
                      </div>
                    )}

                    <div className="idxrow-rets">
                      <div className="idxrow-ret">
                        <span className="idxrow-ret-l">1Y</span>
                        <span className={"idxrow-ret-v " + signClass(stats.ret1y)}>
                          {pct(stats.ret1y, 1)}
                        </span>
                      </div>
                      <div className="idxrow-ret">
                        <span className="idxrow-ret-l">5Y</span>
                        <span className={"idxrow-ret-v " + signClass(stats.ret5y)}>
                          {pct(stats.ret5y, 1)}
                        </span>
                      </div>
                      <div className="idxrow-ret">
                        <span className="idxrow-ret-l">10Y</span>
                        <span className={"idxrow-ret-v " + signClass(stats.ret10y)}>
                          {pct(stats.ret10y, 1)}
                        </span>
                      </div>
                    </div>

                    <details className="idxrow-more">
                      <summary>Price history</summary>
                      <MetricGrid
                        items={[
                          { label: "1Y ago", value: dp(stats.p1y) },
                          { label: "5Y ago", value: dp(stats.p5y) },
                          { label: "10Y ago", value: dp(stats.p10y) },
                          { label: "All-time high", value: dp(stats.ath) },
                        ]}
                      />
                    </details>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <button className="fab" onClick={onAddClick}>
        + Add index
      </button>

      <details className="idx-manage">
        <summary>Show / hide indices</summary>
        <div className="idx-toggles">
          {indices.map((i) => (
            <label key={i.symbol}>
              <input
                type="checkbox"
                checked={!hidden.includes(i.symbol)}
                onChange={() => onToggle(i.symbol)}
              />
              {i.name}
              {i.group === "Custom" && (
                <button
                  className="idx-toggle-remove"
                  onClick={(e) => {
                    e.preventDefault();
                    onRemoveCustom(i.symbol);
                  }}
                >
                  delete
                </button>
              )}
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}
