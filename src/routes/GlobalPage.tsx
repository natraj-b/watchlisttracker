import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Quote } from "../types";
import { getAth, getChart, getQuotes, type AthInfo } from "../lib/yahoo";
import { getIndexRatios, type IndexRatioMap } from "../lib/nse";
import {
  GLOBAL,
  GLOBAL_GROUPS,
  INDIA_SIGNALS,
  QUOTE_SYMBOLS,
  globalDef,
  type GlobalDef,
} from "../lib/global";
import { useRefreshOnFocus } from "../lib/useRefreshOnFocus";
import { num, pct, signClass } from "../lib/format";
import { RefreshBar } from "../components/RefreshBar";
import { Sparkline } from "../components/Sparkline";
import { SkeletonRows } from "../components/Skeleton";

const ALL_SYMBOLS = GLOBAL.map((g) => g.symbol);

function stateLabel(q: Quote | undefined): { text: string; cls: string } | null {
  const s = q?.marketState;
  if (!s) return null;
  if (s === "REGULAR") return { text: "live", cls: "open" };
  if (s.startsWith("PRE")) return { text: "pre-mkt", cls: "pre" };
  if (s.startsWith("POST")) return { text: "after-hrs", cls: "pre" };
  return { text: "closed", cls: "closed" };
}

function fmt(d: GlobalDef, q: Quote | undefined): string {
  const v = q?.price ?? null;
  if (v == null) return "—";
  const digits = d.digits ?? (v >= 1000 ? 0 : 2);
  return num(v, digits) + (d.suffix ?? "");
}

export function GlobalPage() {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [trends, setTrends] = useState<Record<string, number[]>>({});
  const [ratios, setRatios] = useState<IndexRatioMap>({});
  const [aths, setAths] = useState<Record<string, AthInfo>>({});
  const [athTried, setAthTried] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const apply = (m: IndexRatioMap) => !cancelled && setRatios(m);
    getIndexRatios(() => {
      getIndexRatios().then(apply);
    })
      .then(apply)
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // P/E and P/B for an index. NSE publishes them for its own indices (exact).
  // Everything else falls back to the P/E of an ETF that tracks the index or a
  // close cousin (approximate) — Yahoo has no P/E for the indices themselves.
  function valOf(d: GlobalDef): { pe: number | null; pb: number | null; approx: boolean; via?: string } | null {
    if (d.nseKey && ratios[d.nseKey]) {
      const r = ratios[d.nseKey];
      return { pe: r.pe, pb: r.pb, approx: false };
    }
    if (d.etf) {
      const q = quotes[d.etf];
      if (q && (q.peTrailing != null || q.priceToBook != null)) {
        return { pe: q.peTrailing ?? null, pb: q.priceToBook ?? null, approx: true, via: d.etf };
      }
    }
    return null;
  }
  const peOf = (d: GlobalDef) => valOf(d)?.pe ?? null;

  // Equity indices only (skip VIX, commodities, FX, crypto), furthest below the
  // all-time high first.
  const highRows = GLOBAL.filter(
    (d) => ["India", "US", "Europe", "Asia-Pacific"].includes(d.group) && !d.neutral
  )
    .map((d) => {
      const q = quotes[d.symbol];
      const a = aths[d.symbol];
      const px = q?.price ?? null;
      // If today's price is above the stored peak (history is cached for hours), it IS the new high.
      const peak = a && px != null ? Math.max(a.ath, px) : a?.ath ?? null;
      const drop = peak && px != null ? ((px - peak) / peak) * 100 : null;
      return { d, drop, a, y1: q?.fiftyTwoWeekChangePct ?? null };
    })
    .filter((r) => r.drop != null)
    .map((r) => r as { d: GlobalDef; drop: number; a: AthInfo | undefined; y1: number | null })
    .sort((a, b) => a.drop - b.drop);
  const maxDrop = Math.max(10, ...highRows.map((r) => Math.abs(r.drop)));
  const equityIdx = GLOBAL.filter(
    (d) => ["India", "US", "Europe", "Asia-Pacific"].includes(d.group) && !d.neutral
  );
  const equityTotal = equityIdx.length;
  const missingHist = equityIdx
    .filter((d) => athTried.includes(d.symbol) && !aths[d.symbol])
    .map((d) => d.name);

  const athLabel = (t: number) =>
    new Date(t * 1000).toLocaleDateString("en-IN", { month: "short", year: "numeric" });

  // "P/E 19.3 · P/B 2.83", with ≈ and a tooltip when it comes from a proxy ETF.
  function ratioBits(d: GlobalDef) {
    const v = valOf(d);
    if (!v || (v.pe == null && v.pb == null)) return null;
    const mark = v.approx ? "≈" : "";
    return (
      <span
        className="gl-pe"
        title={v.approx ? `Approximate — P/E of the ${v.via} ETF, which tracks a similar index` : "NSE published"}
      >
        {v.pe != null && (
          <>
            P/E {mark}
            <b>{num(v.pe, 1)}</b>
          </>
        )}
        {v.pe != null && v.pb != null && " · "}
        {v.pb != null && (
          <>
            P/B {mark}
            <b>{num(v.pb, 2)}</b>
          </>
        )}
      </span>
    );
  }

  const load = useCallback(async () => {
    const { quotes: q, oldestAt } = await getQuotes(QUOTE_SYMBOLS, () => {
      getQuotes(QUOTE_SYMBOLS).then(({ quotes: q2, oldestAt: o2 }) => {
        setQuotes((prev) => ({ ...prev, ...q2 }));
        setFetchedAt(o2);
      });
    });
    setQuotes((prev) => ({ ...prev, ...q }));
    setFetchedAt(oldestAt);
  }, []);

  const { busy, refresh } = useRefreshOnFocus(load);

  // 1-month sparklines. Fetched a few at a time so the first paint isn't gated
  // on 24 chart calls; each is cached for an hour.
  // Wait for the first quotes so the charts don't race the quote call on a cold start.
  const ready = fetchedAt != null;
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const queue = [...ALL_SYMBOLS];
    async function worker() {
      while (queue.length && !cancelled) {
        const sym = queue.shift()!;
        try {
          const { candles } = await getChart(sym, "1mo");
          if (!cancelled && candles.length >= 2) {
            setTrends((p) => ({ ...p, [sym]: candles.map((c) => c.c) }));
          }
        } catch {
          /* a missing sparkline isn't worth an error */
        }
      }
    }
    Promise.all([worker(), worker(), worker(), worker()]);
    return () => {
      cancelled = true;
    };
  }, [ready]);

  // All-time highs for the equity indices — a couple at a time, after the quotes.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const queue = GLOBAL.filter(
      (d) => ["India", "US", "Europe", "Asia-Pacific"].includes(d.group) && !d.neutral
    ).map((d) => d.symbol);
    async function worker() {
      while (queue.length && !cancelled) {
        const sym = queue.shift()!;
        try {
          const a = await getAth(sym);
          if (!cancelled && a) setAths((p) => ({ ...p, [sym]: a }));
        } catch {
          /* leave this index out of the list rather than error */
        }
        if (!cancelled) setAthTried((p) => [...p, sym]);
      }
    }
    Promise.all([worker(), worker(), worker()]);
    return () => {
      cancelled = true;
    };
  }, [ready]);

  const firstLoad = fetchedAt == null && Object.keys(quotes).length === 0;

  return (
    <div className="page">
      <RefreshBar fetchedAt={fetchedAt} busy={busy} onRefresh={refresh} />

      <p className="picks-note">
        Global markets at a glance. Prices are delayed or last close — check the
        live / closed tag. Commodity prices are futures contracts, not spot.
      </p>

      {firstLoad ? (
        <SkeletonRows count={6} />
      ) : (
        <>
          <section>
            <h3 className="sec-title">India &amp; the global moves that matter</h3>
            <div className="gl-strip">
              {INDIA_SIGNALS.map((sym) => {
                const d = globalDef(sym)!;
                const q = quotes[sym];
                return (
                  <Link
                    key={sym}
                    className="gl-tile"
                    to={`/analyse/stock/${encodeURIComponent(sym)}`}
                  >
                    <span className="gl-tile-l">{d.name}</span>
                    <span className="gl-tile-v">{fmt(d, q)}</span>
                    <span className={"gl-tile-c " + (d.neutral ? "" : signClass(q?.changePct))}>
                      {pct(q?.changePct ?? null)}
                    </span>
                    {peOf(d) != null && (
                      <span className="gl-tile-pe">
                        P/E {valOf(d)?.approx ? "≈" : ""}
                        {num(peOf(d), 1)}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </section>

          {highRows.length > 0 && (
            <section>
              <h3 className="idx-group">Below all-time high</h3>
              <p className="gl-hi-note">
                How far each equity index is below its own all-time high (weekly
                closes), furthest below first. This is price distance, not
                valuation — a big drop can mean a market is cheaper or that
                something is wrong. Not a buy signal. P/E marked ≈ is the P/E of an
                ETF that tracks a similar index (Yahoo has none for the index
                itself), so treat it as a rough guide.
              </p>
              {athTried.length < equityTotal && (
                <p className="gl-hi-note">
                  Loading history… {athTried.length} of {equityTotal} indices.
                </p>
              )}
              {athTried.length >= equityTotal && missingHist.length > 0 && (
                <p className="gl-hi-note">
                  Not shown — Yahoo has no price history for: {missingHist.join(", ")}.
                </p>
              )}
              <div className="gl-list">
                <div className="gl-hi-head">
                  <span>Index</span>
                  <span>Below all-time high</span>
                  <span>1Y</span>
                </div>
                {highRows.map(({ d, drop, a, y1 }) => (
                  <Link
                    key={d.symbol}
                    className="gl-hi-row"
                    to={`/analyse/stock/${encodeURIComponent(d.symbol)}`}
                  >
                    <div className="gl-hi-id">
                      <span className="gl-name">{d.name}</span>
                      <span className="gl-sub">
                        <span>{d.group}</span>
                        {ratioBits(d)}
                        {a && <span>peak {athLabel(a.athT)}</span>}
                      </span>
                    </div>
                    <div className="gl-hi-bar" title="Distance below all-time high">
                      <div
                        className="gl-hi-fill"
                        style={{ width: `${Math.min(100, (Math.abs(drop) / maxDrop) * 100)}%` }}
                      />
                      <span className="gl-hi-val">{pct(drop, 1)}</span>
                    </div>
                    <span className={"gl-hi-1y " + signClass(y1)}>{y1 != null ? pct(y1, 1) : "—"}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {GLOBAL_GROUPS.map((g) => (
            <section key={g}>
              <h3 className="idx-group">{g}</h3>
              <div className="gl-list">
                {GLOBAL.filter((d) => d.group === g).map((d) => {
                  const q = quotes[d.symbol];
                  const st = stateLabel(q);
                  return (
                    <Link
                      key={d.symbol}
                      className="gl-row"
                      to={`/analyse/stock/${encodeURIComponent(d.symbol)}`}
                    >
                      <div className="gl-id">
                        <span className="gl-name">{d.name}</span>
                        <span className="gl-sub">
                          {st && <span className={"gl-state " + st.cls}>{st.text}</span>}
                          {d.note && <span>{d.note}</span>}
                          {ratioBits(d)}
                        </span>
                      </div>
                      <Sparkline data={trends[d.symbol] ?? []} width={56} height={22} />
                      <div className="gl-price">
                        <span className="gl-cmp">{fmt(d, q)}</span>
                        <span className={"gl-chg " + (d.neutral ? "" : signClass(q?.changePct))}>
                          {pct(q?.changePct ?? null)}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </>
      )}

      <p className="disclaimer">
        Market data from Yahoo Finance, for information only. Not investment
        advice. Sparklines show the last month.
      </p>
    </div>
  );
}
