import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Quote } from "../types";
import { getChart, getQuotes } from "../lib/yahoo";
import { getIndexRatios, type IndexRatioMap } from "../lib/nse";
import { GLOBAL, GLOBAL_GROUPS, INDIA_SIGNALS, globalDef, type GlobalDef } from "../lib/global";
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

  const peOf = (d: GlobalDef) => (d.nseKey ? ratios[d.nseKey]?.pe ?? null : null);
  const pbOf = (d: GlobalDef) => (d.nseKey ? ratios[d.nseKey]?.pb ?? null : null);

  const load = useCallback(async () => {
    const { quotes: q, oldestAt } = await getQuotes(ALL_SYMBOLS, () => {
      getQuotes(ALL_SYMBOLS).then(({ quotes: q2, oldestAt: o2 }) => {
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
                    {peOf(d) != null && <span className="gl-tile-pe">P/E {num(peOf(d), 1)}</span>}
                  </Link>
                );
              })}
            </div>
          </section>

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
                          {peOf(d) != null && (
                            <span className="gl-pe">
                              P/E <b>{num(peOf(d), 1)}</b>
                              {pbOf(d) != null && (
                                <>
                                  {" · "}P/B <b>{num(pbOf(d), 2)}</b>
                                </>
                              )}
                            </span>
                          )}
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
