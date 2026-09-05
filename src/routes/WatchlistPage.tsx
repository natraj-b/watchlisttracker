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

type Tab = Section | "idx";

export function WatchlistPage() {
  const [items, setItems] = useState<WatchItem[]>(() => store.getStocks());
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("nonfin");
  const [sheet, setSheet] = useState(false);
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

    // Refine classification for unclassified stocks using the company profile
    // (the plain quote endpoint doesn't return sector/industry).
    const cur = store.getStocks();
    const pending = cur.filter((it) => !it.classified);
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
        const section =
          bySector === "fin"
            ? "fin"
            : byName(q[it.symbol]?.name || it.name) === "fin"
              ? "fin"
              : bySector ?? "nonfin";
        return { ...it, section, classified: true } as WatchItem;
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

  return (
    <div className="page">
      <RefreshBar fetchedAt={fetchedAt} busy={busy} onRefresh={refresh} />

      <div className="tabs">
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

      {tab === "idx" ? (
        <IndicesView hidden={hidden} quotes={quotes} onToggle={toggleIndex} />
      ) : (
        <>
          <div className="list">
            {list.length === 0 && (
              <div className="empty">
                No {tab === "fin" ? "financial" : "non-financial"} stocks yet.
              </div>
            )}
            {list.map((it) => (
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
