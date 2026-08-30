import { useCallback, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { MfDetail } from "../types";
import { computeReturns, getFund } from "../lib/mfapi";
import { mfDeepLinks } from "../lib/symbols";
import { useRefreshOnFocus } from "../lib/useRefreshOnFocus";
import { RefreshBar } from "../components/RefreshBar";
import { MetricGrid } from "../components/MetricGrid";
import { num, pct } from "../lib/format";

export function AnalyseFundPage() {
  const { code = "" } = useParams();
  const schemeCode = Number(code);
  const [detail, setDetail] = useState<MfDetail | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { detail, fetchedAt } = await getFund(schemeCode, () => {
      getFund(schemeCode).then(({ detail: d }) => d && setDetail(d));
    });
    setDetail(detail);
    setFetchedAt(fetchedAt);
  }, [schemeCode]);

  const { busy, refresh } = useRefreshOnFocus(load);

  const r = detail ? computeReturns(detail) : null;
  const navSeries = (detail?.history ?? []).slice(0, 260).reverse();

  const w = 320;
  const h = 120;
  let path = "";
  if (navSeries.length > 1) {
    const ys = navSeries.map((x) => x.nav);
    const min = Math.min(...ys);
    const max = Math.max(...ys);
    const span = max - min || 1;
    path = navSeries
      .map((x, i) => {
        const px = (i / (navSeries.length - 1)) * w;
        const py = h - ((x.nav - min) / span) * h;
        return `${i === 0 ? "M" : "L"}${px.toFixed(1)} ${py.toFixed(1)}`;
      })
      .join(" ");
  }

  return (
    <div className="page analyse">
      <RefreshBar fetchedAt={fetchedAt} busy={busy} onRefresh={refresh} />

      <div className="analyse-head">
        <div>
          <h2>{detail?.schemeName || `Scheme ${schemeCode}`}</h2>
          <p className="analyse-sub">
            {detail?.fundHouse || "—"} · {detail?.schemeCategory || "—"}
          </p>
        </div>
        <Link to="/funds" className="chip">
          ← Funds
        </Link>
      </div>

      <div className="chart">
        <div className="chart-head">
          <span className="chart-pchg">NAV · last ~1 year</span>
          <span>
            {num(detail?.nav ?? null)}{" "}
            <small>({detail?.navDate || "—"})</small>
          </span>
        </div>
        {path ? (
          <svg viewBox={`0 0 ${w} ${h}`} className="chart-svg" preserveAspectRatio="none">
            <path
              d={path}
              fill="none"
              stroke="var(--up)"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ) : (
          <div className="chart-empty">Loading NAV history…</div>
        )}
      </div>

      <section>
        <h3 className="sec-title">
          Returns <span className="badge yh">from NAV history</span>
        </h3>
        <MetricGrid
          items={[
            { label: "1M", value: pct(r?.["1M"] ?? null, 1) },
            { label: "6M", value: pct(r?.["6M"] ?? null, 1) },
            { label: "1Y", value: pct(r?.["1Y"] ?? null, 1) },
            { label: "3Y CAGR", value: pct(r?.["3Y"] ?? null, 1) },
            { label: "5Y CAGR", value: pct(r?.["5Y"] ?? null, 1) },
            { label: "Latest NAV", value: num(detail?.nav ?? null) },
          ]}
        />
        <p className="sec-foot">
          Expense ratio, AUM, portfolio holdings, and risk ratios aren't in the
          free NAV API — check the sources below.
        </p>
      </section>

      <section>
        <h3 className="sec-title">
          Deep research <span className="badge manual">external</span>
        </h3>
        <div className="checklist-links">
          {mfDeepLinks(detail?.schemeName || "").map((l) => (
            <a key={l.label} href={l.url} target="_blank" rel="noreferrer" className="chip link">
              {l.label} ↗
            </a>
          ))}
        </div>
      </section>

      <p className="disclaimer">
        Data from AMFI via mfapi.in, for information only. Not investment advice.
      </p>
    </div>
  );
}
