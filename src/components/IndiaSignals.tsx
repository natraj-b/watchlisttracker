import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import type { Quote } from "../types";
import { getQuotes } from "../lib/yahoo";
import { getIndexRatios, type IndexRatioMap } from "../lib/nse";
import { INDIA_SIGNALS, formatGlobalPrice, globalDef, valuationOf } from "../lib/global";
import { useRefreshOnFocus } from "../lib/useRefreshOnFocus";
import { num, pct, signClass } from "../lib/format";

// The headline symbols plus the ETFs that stand in for an index with no P/E of its own.
const SIGNAL_SYMBOLS = Array.from(
  new Set(
    INDIA_SIGNALS.flatMap((sym) => {
      const etf = globalDef(sym)?.etf;
      return etf ? [sym, etf] : [sym];
    })
  )
);

/** The "India & the global moves that matter" strip, for quotes and NSE ratios the caller already has.
 * `row` lays the tiles out as one swipeable line instead of a wrapping grid. */
export function IndiaSignals({
  quotes,
  ratios,
  row,
}: {
  quotes: Record<string, Quote>;
  ratios: IndexRatioMap;
  row?: boolean;
}) {
  return (
    <section>
      <h3 className="sec-title">India &amp; the global moves that matter</h3>
      <div className={"gl-strip" + (row ? " gl-strip--row" : "")}>
        {INDIA_SIGNALS.map((sym) => {
          const d = globalDef(sym)!;
          const q = quotes[sym];
          const v = valuationOf(d, quotes, ratios);
          return (
            <Link key={sym} className="gl-tile" to={`/analyse/stock/${encodeURIComponent(sym)}`}>
              <span className="gl-tile-l">{d.name}</span>
              <span className="gl-tile-v">{formatGlobalPrice(d, q)}</span>
              <span className={"gl-tile-c " + (d.neutral ? "" : signClass(q?.changePct))}>
                {pct(q?.changePct ?? null)}
              </span>
              {v?.pe != null && (
                <span className="gl-tile-pe">
                  P/E {v.approx ? "≈" : ""}
                  {num(v.pe, 1)}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/** The same strip, fetching its own quotes and ratios, for screens that don't already hold them. */
export function LiveIndiaSignals({ row }: { row?: boolean }) {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [ratios, setRatios] = useState<IndexRatioMap>({});

  const load = useCallback(async () => {
    const { quotes: q } = await getQuotes(SIGNAL_SYMBOLS, () => {
      getQuotes(SIGNAL_SYMBOLS).then(({ quotes: q2 }) => setQuotes((prev) => ({ ...prev, ...q2 })));
    });
    setQuotes((prev) => ({ ...prev, ...q }));
    try {
      setRatios(await getIndexRatios(() => getIndexRatios().then(setRatios)));
    } catch {
      // P/E on the tiles is a bonus; the prices still show without it
    }
  }, []);

  useRefreshOnFocus(load);

  return <IndiaSignals quotes={quotes} ratios={ratios} row={row} />;
}
