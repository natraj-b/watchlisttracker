import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Candle, Quote } from "../types";
import { getChart, getQuotes, getQuoteSummary } from "../lib/yahoo";
import { deepLinks } from "../lib/symbols";
import { useRefreshOnFocus } from "../lib/useRefreshOnFocus";
import { RefreshBar } from "../components/RefreshBar";
import { PriceChart } from "../components/PriceChart";
import { MetricGrid } from "../components/MetricGrid";
import { ResearchChecklist } from "../components/ResearchChecklist";
import { crore, num, pct } from "../lib/format";

export function AnalyseStockPage() {
  const { symbol = "" } = useParams();
  const sym = decodeURIComponent(symbol);
  const bare = sym.replace(/\.(NS|BO)$/i, "");

  const [quote, setQuote] = useState<Quote | undefined>();
  const [summary, setSummary] = useState<any | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [range, setRange] = useState("1y");
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { quotes, oldestAt } = await getQuotes([sym], () => {
      getQuotes([sym]).then(({ quotes: q }) => setQuote(q[sym]));
    });
    setQuote(quotes[sym]);
    setFetchedAt(oldestAt);
    getQuoteSummary(sym).then(setSummary);
  }, [sym]);

  const { busy, refresh } = useRefreshOnFocus(load);

  useEffect(() => {
    let cancelled = false;
    getChart(sym, range, () => {
      getChart(sym, range).then(({ candles }) => !cancelled && setCandles(candles));
    }).then(({ candles }) => !cancelled && setCandles(candles));
    return () => {
      cancelled = true;
    };
  }, [sym, range]);

  const ks = summary?.defaultKeyStatistics ?? {};
  const fd = summary?.financialData ?? {};
  const prof = summary?.summaryProfile ?? {};
  const raw = (o: any) => (o && typeof o === "object" ? o.raw : o) ?? null;

  const live = [
    { label: "CMP", value: num(quote?.price ?? null) },
    { label: "Day change", value: pct(quote?.changePct ?? null) },
    { label: "52W High", value: num(quote?.fiftyTwoWeekHigh ?? null) },
    { label: "52W Low", value: num(quote?.fiftyTwoWeekLow ?? null) },
    { label: "52W change", value: pct(quote?.fiftyTwoWeekChangePct ?? null) },
    { label: "Market cap", value: crore(quote?.marketCap ?? null) },
    { label: "Volume", value: num(quote?.volume ?? null, 0) },
    { label: "Face value", value: "—  (see source)" },
  ];

  const val = [
    { label: "P/E (TTM)", value: num(quote?.peTrailing ?? null) },
    { label: "Forward P/E", value: num(quote?.peForward ?? null) },
    { label: "P/B", value: num(quote?.priceToBook ?? null) },
    { label: "PEG", value: num(raw(ks.pegRatio)) },
    { label: "EV/EBITDA", value: num(raw(ks.enterpriseToEbitda)) },
    { label: "EPS (TTM)", value: num(quote?.epsTrailing ?? null) },
    { label: "ROE", value: pct(raw(fd.returnOnEquity) != null ? raw(fd.returnOnEquity) * 100 : null) },
    { label: "Profit margin", value: pct(raw(fd.profitMargins) != null ? raw(fd.profitMargins) * 100 : null) },
    { label: "Op. margin", value: pct(raw(fd.operatingMargins) != null ? raw(fd.operatingMargins) * 100 : null) },
    { label: "Debt/Equity", value: num(raw(fd.debtToEquity)) },
    { label: "Current ratio", value: num(raw(fd.currentRatio)) },
    { label: "Rev. growth (YoY)", value: pct(raw(fd.revenueGrowth) != null ? raw(fd.revenueGrowth) * 100 : null) },
  ];

  return (
    <div className="page analyse">
      <RefreshBar fetchedAt={fetchedAt} busy={busy} onRefresh={refresh} />

      <div className="analyse-head">
        <div>
          <h2>{bare}</h2>
          <p className="analyse-sub">
            {quote?.name || sym} · {prof.sector || quote?.sector || "—"}
            {prof.industry ? ` · ${prof.industry}` : ""}
          </p>
        </div>
        <Link to="/" className="chip">
          ← Watchlist
        </Link>
      </div>

      <Link to={`/analyse/stock/${encodeURIComponent(sym)}/report`} className="report-cta">
        📊 Full fundamental report — valuation, growth, health, returns &amp; a view
      </Link>

      <PriceChart candles={candles} range={range} onRange={setRange} />

      <section>
        <h3 className="sec-title">
          Live <span className="badge live">real-time-ish</span>
        </h3>
        <MetricGrid items={live} />
      </section>

      <section>
        <h3 className="sec-title">
          Valuation & ratios <span className="badge yh">Yahoo · latest</span>
        </h3>
        <MetricGrid items={val} />
        <p className="sec-foot">
          Sector averages and the stock's own 5-year historical averages aren't
          available from a free API — check Screener.in (linked below).
        </p>
      </section>

      <section>
        <h3 className="sec-title">
          Deep research <span className="badge manual">not auto-available</span>
        </h3>
        <ResearchChecklist symbolKey={sym} links={deepLinks(sym, quote?.name || bare)} />
      </section>

      <p className="disclaimer">
        Data aggregated from public sources for information only. Not investment
        advice. Verify on primary sources before acting.
      </p>
    </div>
  );
}
