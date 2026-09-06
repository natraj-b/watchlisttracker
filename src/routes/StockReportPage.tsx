import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { Quote } from "../types";
import { getQuotes } from "../lib/yahoo";
import { buildReport, type Metric, type Report, type Sig } from "../lib/fundamentals";
import { deepLinks } from "../lib/symbols";
import { useRefreshOnFocus } from "../lib/useRefreshOnFocus";
import { RefreshBar } from "../components/RefreshBar";
import { crore, num } from "../lib/format";

const TABS = ["Snapshot", "Valuation", "Growth", "Health", "Returns", "Peers", "Ownership", "View"];
const DEFAULT_TAB = 7; // View — per the analyser spec

function Badge({ b }: { b: Metric["badge"] }) {
  if (!b) return <span className="rp-badge neu">—</span>;
  return <span className={"rp-badge " + b.sig}>{b.text}</span>;
}

function sigClass(s: Sig) {
  return s === "good" ? "green" : s === "bad" ? "red" : s === "warn" ? "amber" : "grey";
}

function MetricTable({
  rows,
  cols,
  valueHead = "Current",
}: {
  rows: Metric[];
  cols: string[];
  valueHead?: string;
}) {
  return (
    <div className="rp-tablewrap">
      <table className="rp-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>{valueHead}</th>
            {cols.map((c) => (
              <th key={c}>{c}</th>
            ))}
            <th>Signal</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className={r.available ? "" : "rp-missing"}>
              <td>{r.label}</td>
              <td>{r.value}</td>
              {r.extra.map((e, i) => (
                <td key={i}>{e}</td>
              ))}
              <td>
                <Badge b={r.badge} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="rp-plain">
        {rows.map((r) => (
          <span key={r.label}>
            <b>{r.label}:</b> {r.plain}
            <br />
          </span>
        ))}
      </p>
    </div>
  );
}

function ScoreBox({ title, verdict, text }: { title: string; verdict: string; text: string }) {
  return (
    <div className="rp-score">
      {title}: <strong>{verdict}</strong>
      <span>{text}</span>
    </div>
  );
}

function ManualCard({ heading, body, links }: { heading: string; body: string; links: { label: string; url: string }[] }) {
  return (
    <div className="rp-card rp-manual">
      <div className="rp-card-h">{heading}</div>
      <p className="rp-flag">🚩 DATA UNAVAILABLE from any free API — this section is manual.</p>
      <p className="rp-plain">{body}</p>
      <div className="rp-links">
        {links.map((l) => (
          <a key={l.label} href={l.url} target="_blank" rel="noreferrer" className="chip link">
            {l.label} ↗
          </a>
        ))}
      </div>
    </div>
  );
}

export function StockReportPage() {
  const { symbol = "" } = useParams();
  const sym = decodeURIComponent(symbol);
  const bare = sym.replace(/\.(NS|BO)$/i, "");
  const [sp, setSp] = useSearchParams();
  const horizonY = Math.min(Math.max(parseInt(sp.get("years") || "5", 10) || 5, 1), 30);

  const [tab, setTab] = useState(DEFAULT_TAB);
  const [quote, setQuote] = useState<Quote | undefined>();
  const [report, setReport] = useState<Report | null>(null);
  const [err, setErr] = useState(false);

  const load = useCallback(async () => {
    setErr(false);
    try {
      const { quotes } = await getQuotes([sym], () => {
        getQuotes([sym]).then(({ quotes: q }) => setQuote(q[sym]));
      });
      const q = quotes[sym];
      setQuote(q);
      const r = await buildReport(sym, q, horizonY, () => {
        buildReport(sym, q, horizonY).then(setReport).catch(() => {});
      });
      setReport(r);
    } catch {
      setErr(true);
    }
  }, [sym, horizonY]);

  const { busy, refresh } = useRefreshOnFocus(load);

  const links = useMemo(() => deepLinks(sym, quote?.name || bare), [sym, quote?.name, bare]);

  function setHorizon(y: number) {
    sp.set("years", String(y));
    setSp(sp, { replace: true });
  }

  useEffect(() => {
    document.title = `${bare} — Fundamental report`;
  }, [bare]);

  return (
    <div className="page report">
      <RefreshBar fetchedAt={report?.fetchedAt ?? null} busy={busy} onRefresh={refresh} />

      <div className="analyse-head">
        <div>
          <h2>{bare}</h2>
          <p className="analyse-sub">
            {report?.name || quote?.name || sym}
            {report?.sector ? ` · ${report.sector}` : ""}
            {report?.industry ? ` · ${report.industry}` : ""}
          </p>
        </div>
        <Link to={`/analyse/stock/${encodeURIComponent(sym)}`} className="chip">
          ← Analyse
        </Link>
      </div>

      {err && !report && (
        <div className="rp-card rp-manual">
          <p className="rp-flag">Couldn't load fundamental data for {bare}.</p>
          <p className="rp-plain">
            Yahoo may not cover this symbol, or the data source is temporarily down. Try refreshing, or open the
            sources below.
          </p>
          <div className="rp-links">
            {links.map((l) => (
              <a key={l.label} href={l.url} target="_blank" rel="noreferrer" className="chip link">
                {l.label} ↗
              </a>
            ))}
          </div>
        </div>
      )}

      {report && (
        <>
          <div className={"rp-conf " + report.confidence.level.toLowerCase().replace(" ", "")}>
            <strong>Data confidence: {report.confidence.level}</strong>
            <br />
            Live metrics: {report.confidence.live} of {report.confidence.total} key checks · Sources:{" "}
            {report.confidence.sources.join(", ")}
            {report.confidence.live < 6 && " · Treat as a starting point, not a conclusion."}
          </div>

          <div className="rp-tabs" role="tablist">
            {TABS.map((t, i) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === i}
                className={"rp-tab" + (tab === i ? " on" : "")}
                onClick={() => setTab(i)}
              >
                {t}
              </button>
            ))}
          </div>

          {/* 0 — Snapshot */}
          {tab === 0 && (
            <div className="rp-panel">
              <div className="rp-card">
                <div className="rp-inforow">
                  <span>Company</span>
                  <span>{report.name}</span>
                </div>
                <div className="rp-inforow">
                  <span>Ticker</span>
                  <span>{report.bare}</span>
                </div>
                <div className="rp-inforow">
                  <span>Sector</span>
                  <span>{report.sector || "🚩 —"}</span>
                </div>
                <div className="rp-inforow">
                  <span>Industry</span>
                  <span>{report.industry || "🚩 —"}</span>
                </div>
                {report.about && (
                  <div className="rp-inforow">
                    <span>What it does</span>
                    <span className="rp-wide">{report.about}</span>
                  </div>
                )}
              </div>

              <div className="mgrid">
                <div className="mgrid-cell">
                  <span className="mgrid-l">CMP</span>
                  <span className="mgrid-v">{num(report.snapshot.cmp)}</span>
                </div>
                <div className="mgrid-cell">
                  <span className="mgrid-l">52W High</span>
                  <span className="mgrid-v">{num(report.snapshot.high52)}</span>
                </div>
                <div className="mgrid-cell">
                  <span className="mgrid-l">52W Low</span>
                  <span className="mgrid-v">{num(report.snapshot.low52)}</span>
                </div>
                <div className="mgrid-cell">
                  <span className="mgrid-l">Market cap</span>
                  <span className="mgrid-v">{crore(report.snapshot.marketCap)}</span>
                </div>
                <div className="mgrid-cell">
                  <span className="mgrid-l">Face value</span>
                  <span className="mgrid-v">🚩 see NSE</span>
                </div>
              </div>

              {report.flags.map((f) => (
                <div className="rp-flagcard" key={f.title}>
                  <div className="rp-flagcard-t">{f.title}</div>
                  <div className="rp-flagcard-n">{f.note}</div>
                </div>
              ))}
            </div>
          )}

          {/* 1 — Valuation */}
          {tab === 1 && (
            <div className="rp-panel">
              <div className="rp-card">
                <div className="rp-card-h">Is this stock cheap, fair, or expensive right now?</div>
                <MetricTable rows={report.valuation.rows} cols={[`${report.valuation.benchmark} today`, "Own 5Y avg"]} valueHead="Current" />
              </div>
              <ScoreBox title="Overall valuation" verdict={report.valuation.verdict} text={report.valuation.summary} />
            </div>
          )}

          {/* 2 — Growth */}
          {tab === 2 && (
            <div className="rp-panel">
              <div className="rp-card">
                <div className="rp-card-h">Is the company growing revenue and profit?</div>
                <MetricTable rows={report.growth.rows} cols={["trend"]} valueHead="CAGR / latest" />
              </div>
              <div className="rp-card">
                <div className="rp-card-h">EPS — recent quarters (Yahoo)</div>
                {report.growth.eps.length ? (
                  <div className="rp-eps">
                    {report.growth.eps.map((e) => (
                      <div className="rp-eps-chip" key={e.period}>
                        <div className="rp-eps-q">{e.period}</div>
                        <div className="rp-eps-v">{e.value != null ? `₹${e.value.toFixed(2)}` : "🚩"}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rp-flag">🚩 DATA UNAVAILABLE — verify on Screener.in / Tickertape.</p>
                )}
                <p className="rp-plain">Yahoo exposes ~4 quarters. The full 8-quarter series with YoY is on Screener.in.</p>
              </div>
              <ScoreBox title="Growth" verdict={report.growth.classification} text={report.growth.summary} />
            </div>
          )}

          {/* 3 — Health */}
          {tab === 3 && (
            <div className="rp-panel">
              <div className="rp-card">
                <div className="rp-card-h">Is the company financially safe and stable?</div>
                <MetricTable rows={report.health.rows} cols={["trend"]} valueHead="Latest" />
              </div>
              <div className="rp-card">
                <div className="rp-card-h">Forward projection — {report.horizonY} year horizon</div>
                {report.health.projection.available ? (
                  <div className="rp-tablewrap">
                    <table className="rp-table">
                      <thead>
                        <tr>
                          <th>Scenario</th>
                          <th>Assumption</th>
                          <th>Est. revenue</th>
                          <th>Est. net profit</th>
                          <th>Est. EPS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.health.projection.scenarios.map((s) => (
                          <tr key={s.name}>
                            <td>{s.name}</td>
                            <td>{s.assume}</td>
                            <td>{crore(s.revenue)}</td>
                            <td>{crore(s.profit)}</td>
                            <td>{s.eps != null ? `₹${s.eps.toFixed(1)}` : "🚩"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="rp-flag">🚩 Not enough annual data to extrapolate.</p>
                )}
                <p className="rp-plain">
                  Mechanical extrapolation of the trailing {report.span}-year revenue and net-profit CAGR only — not a
                  forecast, not a prediction, and not advice. Bands widen fast beyond 3 years.
                </p>
              </div>
              <ScoreBox title="Financial health" verdict={report.health.verdict} text={report.health.summary} />
            </div>
          )}

          {/* 4 — Returns */}
          {tab === 4 && (
            <div className="rp-panel">
              <div className="rp-card">
                <div className="rp-card-h">Is the company creating real value for shareholders?</div>
                <MetricTable rows={report.returns.rows} cols={[`${report.span}-yr avg`]} valueHead="Latest FY" />
              </div>
              <ScoreBox title="Return quality" verdict={report.returns.verdict} text={report.returns.summary} />
            </div>
          )}

          {/* 5 — Peers */}
          {tab === 5 && (
            <div className="rp-panel">
              <ManualCard
                heading="How does it compare to its closest competitors?"
                body="A reliable peer set with matched P/E, P/B, ROE, revenue growth and D/E isn't available from a free API. Screener.in shows a peer table on every company page; Tickertape and Trendlyne let you build one."
                links={links}
              />
            </div>
          )}

          {/* 6 — Ownership */}
          {tab === 6 && (
            <div className="rp-panel">
              <ManualCard
                heading="Who is backing this company — and are they buying or stepping away?"
                body="Promoter holding and pledging, plus the FII/DII trend over recent quarters, come from BSE/NSE shareholding filings. Screener.in and Trendlyne summarise them per company. Promoter pledging above 10% is a red flag."
                links={links}
              />
              <ManualCard
                heading="Latest earnings-call commentary"
                body="Management's own words from the most recent concall — guidance, demand colour, margin outlook — aren't machine-readable from a free source. Read the transcript on Screener.in (Documents tab) or the company site."
                links={links}
              />
            </div>
          )}

          {/* 7 — View */}
          {tab === 7 && (
            <div className="rp-panel">
              <div className={"rp-card " + sigClass(report.view.sig)}>
                <div className={"rp-view-label " + sigClass(report.view.sig)}>
                  {report.view.quality} FUNDAMENTALS
                </div>
                <div className="rp-view-reason">{report.view.oneLiner}</div>

                <div className="rp-seclabel">What works</div>
                {report.view.strengths.map((s, i) => (
                  <div className="rp-bullet" key={i}>
                    <span className="rp-bicon good">✓</span>
                    <span>{s}</span>
                  </div>
                ))}

                <div className="rp-seclabel">What to watch</div>
                {report.view.watch.map((s, i) => (
                  <div className="rp-bullet" key={i}>
                    <span className="rp-bicon warn">⚠</span>
                    <span>{s}</span>
                  </div>
                ))}

                <div className="rp-seclabel">Track going forward</div>
                {report.view.track.map((s, i) => (
                  <div className="rp-bullet" key={i}>
                    <span className="rp-bicon">→</span>
                    <span>{s}</span>
                  </div>
                ))}

                <p className="rp-view-foot">
                  A VIEW from historical fundamentals only — not a buy/sell call, not a price target, not SEBI-registered
                  research. The decision is yours.
                </p>
              </div>

              <div className="rp-horizon">
                Horizon:
                {[3, 5, 10].map((y) => (
                  <button key={y} className={"chip" + (report.horizonY === y ? " on" : "")} onClick={() => setHorizon(y)}>
                    {y}Y
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="disclaimer">
            Auto-generated from Yahoo Finance and NSE public data for information and education only. Not investment
            advice or a recommendation. AI and third-party data can be wrong — verify every number on NSE, BSE or
            Screener.in before acting. Past performance does not guarantee future results.
          </p>
        </>
      )}

      {!report && !err && <p className="rp-plain">Building report…</p>}
    </div>
  );
}
