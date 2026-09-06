// Turns Yahoo (quoteSummary + fundamentals-timeseries) and NSE sector-index
// ratios into a structured fundamental report (Steps 3–11 of the analyser spec).
// Everything is derived from verified historical data only — no forward-looking
// language. Fields with no free source are marked NOT `available` and the UI
// shows "DATA UNAVAILABLE — verify at <source>".

import type { Quote } from "../types";
import { getFinancials, getTimeseries } from "./yahoo";
import { getIndexRatios } from "./nse";

export type Sig = "good" | "warn" | "bad" | "neutral";

function R(o: any): number | null {
  if (o == null) return null;
  if (typeof o === "number") return Number.isFinite(o) ? o : null;
  if (typeof o === "object" && "raw" in o) {
    const n = (o as any).raw;
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  }
  return null;
}

/** CAGR % from first to last over (n-1) years. Null if either end non-positive. */
function cagr(series: number[]): number | null {
  if (series.length < 2) return null;
  const first = series[0];
  const last = series[series.length - 1];
  if (first <= 0 || last <= 0) return null;
  return (Math.pow(last / first, 1 / (series.length - 1)) - 1) * 100;
}

function avg(series: number[]): number | null {
  const v = series.filter((x) => Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** element-wise a/b for two equal-length yearly series */
function ratio(a: number[], b: number[]): number[] {
  const n = Math.min(a.length, b.length);
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (b[i] && b[i] !== 0) out.push(a[i] / b[i]);
  return out;
}

function trendArrow(series: number[]): "📈 rising" | "➡️ stable" | "📉 falling" | "—" {
  const v = series.filter((x) => Number.isFinite(x));
  if (v.length < 2) return "—";
  const change = (v[v.length - 1] - v[0]) / Math.abs(v[0] || 1);
  if (change > 0.08) return "📈 rising";
  if (change < -0.08) return "📉 falling";
  return "➡️ stable";
}

export interface Metric {
  label: string;
  value: string;
  extra: string[];
  badge: { text: string; sig: Sig } | null;
  plain: string;
  available: boolean;
}

export interface Scenario {
  name: string;
  assume: string;
  revenue: number | null;
  profit: number | null;
  eps: number | null;
}

export interface Report {
  symbol: string;
  bare: string;
  name: string;
  sector: string | null;
  industry: string | null;
  about: string | null;
  fetchedAt: number | null;
  horizonY: number;
  years: number; // fiscal-year data points we actually got
  span: number; // year-gaps those points cover (years - 1); the CAGR/trend window

  snapshot: {
    cmp: number | null;
    high52: number | null;
    low52: number | null;
    marketCap: number | null;
  };
  flags: { title: string; note: string }[];

  valuation: { rows: Metric[]; verdict: string; benchmark: string; summary: string };
  growth: {
    rows: Metric[];
    eps: { period: string; value: number | null }[];
    classification: string;
    summary: string;
  };
  health: {
    rows: Metric[];
    projection: { scenarios: Scenario[]; available: boolean };
    verdict: string;
    summary: string;
  };
  returns: { rows: Metric[]; verdict: string; summary: string };

  confidence: {
    level: "HIGH" | "MODERATE" | "LOW" | "VERY LOW";
    live: number;
    total: number;
    sources: string[];
  };
  view: {
    quality: "STRONG" | "MODERATE" | "WEAK";
    sig: Sig;
    oneLiner: string;
    strengths: string[];
    watch: string[];
    track: string[];
  };
}

/* ---------------- sector → NSE benchmark index -------------------- */

const SECTOR_INDEX: [RegExp, string, string][] = [
  [/bank/, "NIFTY BANK", "Nifty Bank"],
  [/insurance|nbfc|financial|finance|capital market|asset management|broker/, "NIFTY FIN SERVICE", "Nifty Fin Services"],
  [/tech|software|it services|information technology|semiconductor/, "NIFTY IT", "Nifty IT"],
  [/pharma|drug|healthcare|biotech|hospital|medical/, "NIFTY PHARMA", "Nifty Pharma"],
  [/auto|automobile|vehicle|tyre|tire/, "NIFTY AUTO", "Nifty Auto"],
  [/fmcg|consumer packaged|personal product|household|beverage|tobacco|food product/, "NIFTY FMCG", "Nifty FMCG"],
  [/metal|steel|mining|aluminium|aluminum|iron|copper|zinc/, "NIFTY METAL", "Nifty Metal"],
  [/oil|gas|petroleum|energy|power|coal|refinery/, "NIFTY ENERGY", "Nifty Energy"],
  [/realty|real estate|property|construction/, "NIFTY REALTY", "Nifty Realty"],
];

function pickBenchmark(sector: string | null, industry: string | null): { key: string; name: string } {
  const hay = `${sector || ""} ${industry || ""}`.toLowerCase();
  for (const [re, key, name] of SECTOR_INDEX) if (re.test(hay)) return { key, name };
  return { key: "NIFTY 50", name: "Nifty 50" };
}

function valuationSignal(cur: number | null, sector: number | null): { text: string; sig: Sig } | null {
  if (cur == null || sector == null || sector <= 0) return null;
  if (cur < sector * 0.9) return { text: "CHEAP", sig: "good" };
  if (cur > sector * 1.1) return { text: "EXPENSIVE", sig: "bad" };
  return { text: "FAIR", sig: "warn" };
}

const crStr = (n: number | null): string =>
  n == null ? "🚩" : `₹${(n / 1e7).toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr`;

/* ============================ builder =========================== */

export async function buildReport(
  symbol: string,
  quote: Quote | undefined,
  horizonY: number,
  onRefresh?: () => void
): Promise<Report> {
  const bare = symbol.replace(/\.(NS|BO)$/i, "");
  const [{ data: fin, fetchedAt }, { data: ts }, idx] = await Promise.all([
    getFinancials(symbol, onRefresh),
    getTimeseries(symbol, onRefresh),
    getIndexRatios(onRefresh).catch(() => ({} as Record<string, { pe: number | null; pb: number | null }>)),
  ]);

  const price = fin?.price ?? {};
  const prof = fin?.summaryProfile ?? {};
  const fd = fin?.financialData ?? {};
  const ks = fin?.defaultKeyStatistics ?? {};
  const sd = fin?.summaryDetail ?? {};
  const epsQ: any[] = fin?.earnings?.earningsChart?.quarterly ?? [];

  const S = (k: string): number[] => ts[k] ?? [];
  const lastOf = (k: string): number | null => {
    const a = S(k);
    return a.length ? a[a.length - 1] : null;
  };

  const rev = S("annualTotalRevenue");
  const nip = S("annualNetIncome");
  const epsA = S("annualDilutedEPS");
  const ebit = S("annualEBIT");
  const ebitda = S("annualEBITDA");
  const intExp = S("annualInterestExpense");
  const debt = S("annualTotalDebt");
  const equity = S("annualStockholdersEquity");
  const assets = S("annualTotalAssets");
  const curA = S("annualCurrentAssets");
  const curL = S("annualCurrentLiabilities");
  const ocf = S("annualOperatingCashFlow");
  const capex = S("annualCapitalExpenditure");
  const years = Math.max(rev.length, nip.length, epsA.length);
  const yspan = Math.max(years - 1, 0);

  const sector = prof.sector ?? quote?.sector ?? null;
  const industry = prof.industry ?? quote?.industry ?? null;
  const bench = pickBenchmark(sector, industry);
  const benchRatio = (idx as any)[bench.key] ?? { pe: null, pb: null };

  const sources = new Set<string>(["Yahoo Finance"]);
  if (rev.length) sources.add("Yahoo fundamentals (annual)");
  if (benchRatio.pe != null || benchRatio.pb != null) sources.add("NSE sector index");

  /* ---------- snapshot ---------- */
  const snapshot = {
    cmp: quote?.price ?? R(price.regularMarketPrice),
    high52: quote?.fiftyTwoWeekHigh ?? R(sd.fiftyTwoWeekHigh),
    low52: quote?.fiftyTwoWeekLow ?? R(sd.fiftyTwoWeekLow),
    marketCap: quote?.marketCap ?? R(price.marketCap),
  };

  /* ---------- valuation ---------- */
  const peCur = quote?.peTrailing ?? R(sd.trailingPE);
  const pbCur = quote?.priceToBook ?? R(ks.priceToBook);
  const evEbitda = R(ks.enterpriseToEbitda);
  const peSig = valuationSignal(peCur, benchRatio.pe);
  const pbSig = valuationSignal(pbCur, benchRatio.pb);

  const valRows: Metric[] = [
    {
      label: "P/E (TTM)",
      value: peCur != null ? `${peCur.toFixed(1)}x` : "🚩 DATA UNAVAILABLE",
      extra: [benchRatio.pe != null ? `${benchRatio.pe.toFixed(1)}x` : "🚩", "🚩 verify"],
      badge: peSig,
      plain: peCur != null ? `You pay about ₹${peCur.toFixed(0)} per ₹1 of annual profit` : "",
      available: peCur != null,
    },
    {
      label: "P/B",
      value: pbCur != null ? `${pbCur.toFixed(2)}x` : "🚩 DATA UNAVAILABLE",
      extra: [benchRatio.pb != null ? `${benchRatio.pb.toFixed(2)}x` : "🚩", "🚩 verify"],
      badge: pbSig,
      plain: "Price versus the net assets the company owns",
      available: pbCur != null,
    },
    {
      label: "EV/EBITDA",
      value: evEbitda != null ? `${evEbitda.toFixed(1)}x` : "🚩 DATA UNAVAILABLE",
      extra: ["🚩 sector", "🚩 verify"],
      badge: null,
      plain: "Whole-business value including debt",
      available: evEbitda != null,
    },
  ];

  const valSigs = [peSig, pbSig].filter(Boolean) as { text: string; sig: Sig }[];
  let valVerdict = "INSUFFICIENT DATA";
  if (valSigs.length) {
    const cheap = valSigs.filter((s) => s.text === "CHEAP").length;
    const exp = valSigs.filter((s) => s.text === "EXPENSIVE").length;
    valVerdict =
      cheap === valSigs.length ? "UNDERVALUED" : exp === valSigs.length ? "OVERVALUED" : cheap === 0 && exp === 0 ? "FAIRLY VALUED" : "MIXED";
  }
  const valuation = {
    rows: valRows,
    verdict: valVerdict,
    benchmark: bench.name,
    summary:
      valSigs.length === 0
        ? "Not enough live valuation data to classify. Check Screener.in."
        : `Signal is versus ${bench.name} (${bench.key}) today. The stock's own 5-year average multiples aren't in a free source — verify on Screener.in.`,
  };

  /* ---------- growth ---------- */
  const revC = cagr(rev);
  const patC = cagr(nip);
  const epsC = cagr(epsA);
  const ebitdaMargins = ratio(ebitda, rev).map((x) => x * 100);
  const netMargins = ratio(nip, rev).map((x) => x * 100);

  const growthRows: Metric[] = [
    {
      label: "Revenue",
      value: revC != null ? `${revC.toFixed(1)}%` : "🚩 DATA UNAVAILABLE",
      extra: [trendArrow(rev)],
      badge: null,
      plain: `${yspan}-year CAGR (${crStr(rev[0])} → ${crStr(rev[rev.length - 1])})`,
      available: revC != null,
    },
    {
      label: "Net profit",
      value: patC != null ? `${patC.toFixed(1)}%` : "🚩 DATA UNAVAILABLE",
      extra: [trendArrow(nip)],
      badge: null,
      plain: `${yspan}-year CAGR (${crStr(nip[0])} → ${crStr(nip[nip.length - 1])})`,
      available: patC != null,
    },
    {
      label: "EPS (diluted)",
      value: epsC != null ? `${epsC.toFixed(1)}%` : "🚩 DATA UNAVAILABLE",
      extra: [trendArrow(epsA)],
      badge: null,
      plain: epsA.length ? `${yspan}-year CAGR (₹${epsA[0].toFixed(1)} → ₹${epsA[epsA.length - 1].toFixed(1)})` : "",
      available: epsC != null,
    },
    {
      label: "EBITDA margin",
      value: ebitdaMargins.length ? `${ebitdaMargins[ebitdaMargins.length - 1].toFixed(1)}%` : "🚩 DATA UNAVAILABLE",
      extra: [trendArrow(ebitdaMargins)],
      badge: null,
      plain: ebitdaMargins.length ? `${ebitdaMargins[0].toFixed(1)}% → ${ebitdaMargins[ebitdaMargins.length - 1].toFixed(1)}% over ${yspan} yrs` : "",
      available: ebitdaMargins.length > 0,
    },
    {
      label: "Net profit margin",
      value: netMargins.length ? `${netMargins[netMargins.length - 1].toFixed(1)}%` : "🚩 DATA UNAVAILABLE",
      extra: [trendArrow(netMargins)],
      badge: null,
      plain: netMargins.length ? `${netMargins[0].toFixed(1)}% → ${netMargins[netMargins.length - 1].toFixed(1)}% over ${yspan} yrs` : "",
      available: netMargins.length > 0,
    },
  ];

  const eps = epsQ.slice(-8).map((q) => ({ period: String(q.date ?? "—"), value: R(q.actual) }));

  let growthClass = "INSUFFICIENT DATA";
  const gCandidates = [revC, patC].filter((x): x is number => x != null);
  if (gCandidates.length) {
    const g = Math.min(...gCandidates);
    const accel = netMargins.length >= 2 && netMargins[netMargins.length - 1] > netMargins[0];
    growthClass = g >= 20 ? "ACCELERATING" : g >= 8 ? (accel ? "ACCELERATING" : "STEADY") : g >= 0 ? "SLOWING" : "DECLINING";
  }

  const growth = {
    rows: growthRows,
    eps,
    classification: growthClass,
    summary:
      growthClass === "INSUFFICIENT DATA"
        ? "Yahoo returned too few annual periods. Screener.in has 10-year history and full 8-quarter EPS."
        : `Based on ${yspan} fiscal years from Yahoo. 5-year+ CAGR and per-quarter YoY are on Screener.in / Tickertape.`,
  };
  if (revC != null || patC != null) sources.add("Yahoo fundamentals (annual)");

  /* ---------- health ---------- */
  const deSeries = ratio(debt, equity);
  const de = deSeries.length ? deSeries[deSeries.length - 1] : R(fd.debtToEquity) != null ? R(fd.debtToEquity)! / 100 : null;
  const icrSeries = ratio(ebit, intExp.map((x) => Math.abs(x)));
  const icr = icrSeries.length ? icrSeries[icrSeries.length - 1] : null;
  const crSeries = ratio(curA, curL);
  const cr = crSeries.length ? crSeries[crSeries.length - 1] : R(fd.currentRatio);
  const fcfSeries: number[] = [];
  {
    const n = Math.min(ocf.length, capex.length);
    for (let i = 0; i < n; i++) fcfSeries.push(ocf[i] + capex[i]); // capex is negative
  }
  const fcf = fcfSeries.length ? fcfSeries[fcfSeries.length - 1] : null;

  const deSig: { text: string; sig: Sig } | null =
    de == null ? null : de < 1 ? { text: "SAFE", sig: "good" } : de <= 2 ? { text: "MODERATE", sig: "warn" } : { text: "LEVERAGED", sig: "bad" };
  const icrSig: { text: string; sig: Sig } | null =
    icr == null ? null : icr > 3 ? { text: "HEALTHY", sig: "good" } : icr >= 1.5 ? { text: "WATCH", sig: "warn" } : { text: "RISK", sig: "bad" };
  const crSig: { text: string; sig: Sig } | null =
    cr == null ? null : cr > 1.5 ? { text: "COMFORTABLE", sig: "good" } : cr >= 1 ? { text: "WATCH", sig: "warn" } : { text: "RISK", sig: "bad" };
  let fcfSig: { text: string; sig: Sig } | null = null;
  if (fcf != null) {
    if (fcf <= 0) fcfSig = { text: "CONCERN", sig: "bad" };
    else if (fcfSeries.length >= 2 && fcf > fcfSeries[0]) fcfSig = { text: "STRONG", sig: "good" };
    else fcfSig = { text: "STABLE", sig: "warn" };
  }

  const healthRows: Metric[] = [
    {
      label: "Debt / equity",
      value: de != null ? de.toFixed(2) : "🚩 DATA UNAVAILABLE",
      extra: [trendArrow(deSeries)],
      badge: deSig,
      plain: "Below 1 = conservatively financed",
      available: de != null,
    },
    {
      label: "Interest coverage",
      value: icr != null ? `${icr.toFixed(1)}x` : "🚩 DATA UNAVAILABLE",
      extra: [trendArrow(icrSeries)],
      badge: icrSig,
      plain: "EBIT ÷ interest cost. Above 3x = comfortable",
      available: icr != null,
    },
    {
      label: "Current ratio",
      value: cr != null ? cr.toFixed(2) : "🚩 DATA UNAVAILABLE",
      extra: [trendArrow(crSeries)],
      badge: crSig,
      plain: "Above 1.5 = short-term bills well covered",
      available: cr != null,
    },
    {
      label: "Free cash flow",
      value: fcf != null ? crStr(fcf) : "🚩 DATA UNAVAILABLE",
      extra: [trendArrow(fcfSeries)],
      badge: fcfSig,
      plain: "Operating cash minus capex. Positive = real cash business",
      available: fcf != null,
    },
  ];

  // Forward projection — mechanical extrapolation of the trailing CAGR only.
  const revNow = lastOf("annualTotalRevenue");
  const profitNow = lastOf("annualNetIncome");
  const epsNow = lastOf("annualDilutedEPS") ?? quote?.epsTrailing ?? null;
  const projAvailable = revNow != null && revNow > 0 && profitNow != null && profitNow > 0 && revC != null;
  const scenarios: Scenario[] = [];
  if (projAvailable) {
    const g = revC! / 100;
    const pg = patC != null ? patC / 100 : g;
    const mk = (name: string, assume: string, gr: number, pgr: number): Scenario => {
      const revF = revNow! * Math.pow(1 + gr, horizonY);
      const proF = profitNow! * Math.pow(1 + pgr, horizonY);
      return { name, assume, revenue: revF, profit: proF, eps: epsNow != null ? epsNow * (proF / profitNow!) : null };
    };
    scenarios.push(
      mk("Bear", "Growth slows, margins compress", Math.max(g - 0.05, 0), Math.max(pg - 0.07, -0.05)),
      mk("Base", "Trailing trajectory holds", g, pg),
      mk("Bull", "Growth picks up, margins expand", g + 0.05, pg + 0.05)
    );
  }

  const hSigs = [deSig, icrSig, crSig, fcfSig].filter(Boolean) as { sig: Sig }[];
  const hBad = hSigs.filter((s) => s.sig === "bad").length;
  const hGood = hSigs.filter((s) => s.sig === "good").length;
  let healthVerdict = "INSUFFICIENT DATA";
  if (hSigs.length) healthVerdict = hBad >= 2 ? "LEVERAGED / STRETCHED" : hBad === 1 ? "MODERATE RISK" : hGood >= 3 ? "SAFE" : "MODERATE RISK";

  const health = {
    rows: healthRows,
    projection: { scenarios, available: projAvailable },
    verdict: healthVerdict,
    summary:
      hSigs.length === 0
        ? "Balance-sheet data unavailable from Yahoo for this stock. Check Screener.in."
        : `${hGood} of ${hSigs.length} balance-sheet checks sit in the healthy band, on ${yspan} years of data.`,
  };
  if (de != null || cr != null || fcf != null) sources.add("Yahoo fundamentals (balance sheet / cash flow)");

  /* ---------- returns ---------- */
  const roeSeries = ratio(nip, equity).map((x) => x * 100);
  const roe = roeSeries.length ? roeSeries[roeSeries.length - 1] : R(fd.returnOnEquity) != null ? R(fd.returnOnEquity)! * 100 : null;
  const roceSeries: number[] = [];
  {
    const n = Math.min(ebit.length, assets.length, curL.length);
    for (let i = 0; i < n; i++) {
      const capEmployed = assets[i] - curL[i];
      if (capEmployed > 0) roceSeries.push((ebit[i] / capEmployed) * 100);
    }
  }
  const roce = roceSeries.length ? roceSeries[roceSeries.length - 1] : null;
  const divYield = R(sd.dividendYield) != null ? R(sd.dividendYield)! * 100 : null;
  const payout = R(sd.payoutRatio) != null ? R(sd.payoutRatio)! * 100 : null;

  const band = (v: number | null): { text: string; sig: Sig } | null =>
    v == null ? null : v > 15 ? { text: "GOOD", sig: "good" } : v >= 10 ? { text: "AVERAGE", sig: "warn" } : { text: "WEAK", sig: "bad" };

  const returnsRows: Metric[] = [
    {
      label: "ROE",
      value: roe != null ? `${roe.toFixed(1)}%` : "🚩 DATA UNAVAILABLE",
      extra: [avg(roeSeries) != null ? `${avg(roeSeries)!.toFixed(1)}%` : "🚩"],
      badge: band(roe),
      plain: "Profit earned on shareholders' capital",
      available: roe != null,
    },
    {
      label: "ROCE",
      value: roce != null ? `${roce.toFixed(1)}%` : "🚩 DATA UNAVAILABLE",
      extra: [avg(roceSeries) != null ? `${avg(roceSeries)!.toFixed(1)}%` : "🚩"],
      badge: band(roce),
      plain: "EBIT on capital employed (assets − current liabilities)",
      available: roce != null,
    },
    {
      label: "Dividend yield",
      value: divYield != null ? `${divYield.toFixed(2)}%` : "🚩 DATA UNAVAILABLE",
      extra: ["—"],
      badge: null,
      plain: "Annual dividend as % of price",
      available: divYield != null,
    },
    {
      label: "Dividend payout",
      value: payout != null ? `${payout.toFixed(0)}%` : "🚩 DATA UNAVAILABLE",
      extra: ["—"],
      badge: null,
      plain: "Share of profit paid out as dividend",
      available: payout != null,
    },
  ];

  let returnsVerdict = "INSUFFICIENT DATA";
  if (roe != null || roce != null) {
    const best = Math.max(roe ?? -99, roce ?? -99);
    if (best > 18 && (payout == null || payout < 40)) returnsVerdict = "HIGH-QUALITY COMPOUNDER";
    else if (best > 15) returnsVerdict = "STRONG RETURNS";
    else if (best >= 10) returnsVerdict = "AVERAGE RETURNS";
    else returnsVerdict = "WEAK RETURNS";
    if (divYield != null && divYield > 3 && best < 15) returnsVerdict = "DIVIDEND PLAY";
  }
  const returns = {
    rows: returnsRows,
    verdict: returnsVerdict,
    summary:
      roe == null && roce == null
        ? "Return ratios unavailable from Yahoo. Check Screener.in."
        : `Latest fiscal year, with the ${yspan}-year average alongside. Screener.in has the full history.`,
  };

  /* ---------- flags ---------- */
  const flags: { title: string; note: string }[] = [];
  if (de != null && de > 2) flags.push({ title: "HIGH LEVERAGE", note: `Debt is ${de.toFixed(1)}x equity — above the 2x line where downturns bite.` });
  if (icr != null && icr < 1.5) flags.push({ title: "THIN INTEREST COVER", note: `EBIT covers interest only ${icr.toFixed(1)}x — below 1.5x is a strain.` });
  if (fcf != null && fcf < 0) flags.push({ title: "NEGATIVE FREE CASH FLOW", note: "The business consumed more cash than it produced in the latest year." });
  if (netMargins.length >= 2 && netMargins[netMargins.length - 1] < netMargins[0] - 3)
    flags.push({ title: "MARGIN COMPRESSION", note: `Net margin fell from ${netMargins[0].toFixed(1)}% to ${netMargins[netMargins.length - 1].toFixed(1)}% over ${yspan} years.` });
  const isBankLike = bench.key === "NIFTY BANK" || bench.key === "NIFTY FIN SERVICE";
  if (isBankLike)
    flags.push({
      title: "BANK / NBFC — RATIOS NEED CARE",
      note: "For lenders, debt/equity, current ratio, interest coverage and free cash flow don't carry their usual meaning (deposits are 'debt', there's no working-capital cycle). Use Screener.in's banking view — NIM, GNPA/NNPA, CASA, capital adequacy — instead.",
    });
  flags.push({
    title: "OWNERSHIP NOT CHECKED",
    note: "Promoter holding, pledging and FII/DII trends aren't in any free API. Verify on Screener.in or Trendlyne before relying on this report.",
  });

  /* ---------- confidence (Step 11) ---------- */
  const checks = [
    snapshot.cmp != null,
    peCur != null,
    benchRatio.pe != null,
    revC != null,
    epsC != null,
    netMargins.length > 0,
    de != null,
    icr != null,
    cr != null,
    fcf != null,
    roe != null,
    false, // ownership — never available from a free source
  ];
  const live = checks.filter(Boolean).length;
  const total = checks.length;
  const level: Report["confidence"]["level"] = live >= 9 ? "HIGH" : live >= 6 ? "MODERATE" : live >= 1 ? "LOW" : "VERY LOW";

  /* ---------- view (Step 10) ---------- */
  const strengths: string[] = [];
  const watch: string[] = [];
  if (roe != null && roe > 15) strengths.push(`ROE of ${roe.toFixed(0)}% — efficient use of shareholder capital.`);
  if (roce != null && roce > 15) strengths.push(`ROCE of ${roce.toFixed(0)}% — the whole capital base earns well.`);
  if (!isBankLike && de != null && de < 1) strengths.push(`Low leverage — debt is ${de.toFixed(2)}x equity.`);
  if (!isBankLike && icr != null && icr > 5) strengths.push(`Interest cover of ${icr.toFixed(0)}x — debt servicing is comfortable.`);
  if (!isBankLike && fcfSig?.text === "STRONG") strengths.push("Free cash flow is positive and rising across the period.");
  if (revC != null && revC > 12) strengths.push(`Revenue compounded ${revC.toFixed(0)}%/yr over ${yspan} years.`);
  if (epsC != null && epsC > 12) strengths.push(`EPS compounded ${epsC.toFixed(0)}%/yr over ${yspan} years.`);
  if (peSig?.text === "CHEAP") strengths.push(`Trades below the ${bench.name} P/E.`);
  while (strengths.length < 3) strengths.push("🚩 Not enough live data for another strength — work the deep-research checklist on the Analyse page.");

  if (!isBankLike && de != null && de > 1.5) watch.push(`Debt/equity of ${de.toFixed(1)} — track whether leverage keeps climbing.`);
  if (!isBankLike && icrSig && icrSig.sig !== "good") watch.push("Interest coverage isn't comfortably above 3x.");
  if (!isBankLike && fcfSig && fcfSig.sig === "bad") watch.push("Free cash flow was negative in the latest year.");
  if (isBankLike) watch.push("It's a lender — check NIM, GNPA/NNPA and capital adequacy on Screener.in; the health ratios here don't capture those.");
  if (growthClass === "SLOWING" || growthClass === "DECLINING") watch.push(`Growth looks ${growthClass.toLowerCase()} on a ${yspan}-year view.`);
  if (netMargins.length >= 2 && netMargins[netMargins.length - 1] < netMargins[0]) watch.push("Net margin has drifted down over the period.");
  if (peSig?.text === "EXPENSIVE") watch.push(`P/E is above the ${bench.name} average.`);
  watch.push("Promoter holding, pledging and FII/DII trends are unverified here — check them before acting.");
  const watchTop = watch.slice(0, 3);

  const goodCount = [
    peSig?.text === "CHEAP",
    roe != null && roe > 15,
    roce != null && roce > 15,
    de != null && de < 1,
    fcfSig?.text === "STRONG",
    revC != null && revC > 12,
    epsC != null && epsC > 12,
  ].filter(Boolean).length;
  const badCount = [hBad >= 2, growthClass === "DECLINING", roe != null && roe < 10, fcf != null && fcf < 0].filter(Boolean).length;
  let quality: Report["view"]["quality"] = "MODERATE";
  let sig: Sig = "warn";
  if (live >= 6 && goodCount >= 3 && badCount === 0) {
    quality = "STRONG";
    sig = "good";
  } else if (badCount >= 2 || (live >= 6 && goodCount === 0)) {
    quality = "WEAK";
    sig = "bad";
  }

  const view = {
    quality,
    sig,
    oneLiner:
      live < 6
        ? "Only part of the picture is available from free data — treat this as a starting point, not a conclusion."
        : `On ${yspan} years of Yahoo data — health: ${healthVerdict.toLowerCase()}; returns: ${returnsVerdict.toLowerCase()}; growth: ${growthClass.toLowerCase()}.`,
    strengths: strengths.slice(0, 3),
    watch: watchTop,
    track:
      growthClass === "INSUFFICIENT DATA"
        ? ["Revenue and margin trend once you pull 10-year data from Screener.in."]
        : [`Revenue CAGR (now ${revC?.toFixed(0) ?? "—"}%) and net-margin trend at each quarterly result.`],
  };

  return {
    symbol,
    bare,
    name: quote?.name || (typeof price.longName === "string" ? price.longName : bare),
    sector,
    industry,
    about: prof.longBusinessSummary ? String(prof.longBusinessSummary).split(". ").slice(0, 2).join(". ") + "." : null,
    fetchedAt,
    horizonY,
    years,
    span: yspan,
    snapshot,
    flags,
    valuation,
    growth,
    health,
    returns,
    confidence: { level, live, total, sources: [...sources] },
    view,
  };
}
