import type { Candle, Quote } from "../types";
import { swr, quoteTtl, cacheGet, cacheSet, dedupe } from "./cache";
import { setDataError } from "./status";

const BASE = "/api/yahoo";

function api(path: string, params: Record<string, string>): string {
  const u = new URLSearchParams({ path, ...params });
  return `${BASE}?${u.toString()}`;
}

async function getJson<T>(url: string): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url);
  } catch {
    setDataError("Can't reach the data server. Check your connection.");
    throw new Error("network");
  }
  if (!r.ok) {
    setDataError(
      r.status >= 500
        ? "The price data source is unavailable right now. Cached values are shown where possible."
        : `Price data request failed (${r.status}).`
    );
    throw new Error(`yahoo ${r.status}`);
  }
  setDataError(null);
  return (await r.json()) as T;
}

/* ----------------------------- quotes ----------------------------- */

function mapQuote(q: any): Quote {
  return {
    symbol: q.symbol,
    name: q.longName || q.shortName || q.symbol,
    price: q.regularMarketPrice ?? null,
    previousClose: q.regularMarketPreviousClose ?? null,
    changePct: q.regularMarketChangePercent ?? null,
    currency: q.currency ?? null,
    marketCap: q.marketCap ?? null,
    peTrailing: q.trailingPE ?? null,
    peForward: q.forwardPE ?? null,
    priceToBook: q.priceToBook ?? null,
    epsTrailing: q.epsTrailingTwelveMonths ?? null,
    fiftyTwoWeekHigh: q.fiftyTwoWeekHigh ?? null,
    fiftyTwoWeekLow: q.fiftyTwoWeekLow ?? null,
    fiftyTwoWeekChangePct: q.fiftyTwoWeekChangePercent ?? null,
    sector: q.sector ?? null,
    industry: q.industry ?? null,
    quoteType: q.quoteType ?? null,
    faceValue: null,
    volume: q.regularMarketVolume ?? null,
    fetchedAt: Date.now(),
  };
}

async function fetchQuotes(symbols: string[]): Promise<Record<string, Quote>> {
  if (symbols.length === 0) return {};
  const url = api("/v7/finance/quote", { symbols: symbols.join(",") });
  const data = await getJson<any>(url);
  const out: Record<string, Quote> = {};
  for (const q of data?.quoteResponse?.result ?? []) out[q.symbol] = mapQuote(q);
  return out;
}

const quoteKey = (symbol: string) => "quote." + symbol;

// Quotes are cached per symbol, so adding or removing one watchlist entry
// doesn't invalidate the rest. Returns whatever is cached immediately; any
// symbols that are missing or past their TTL are refreshed in one batch call,
// after which `onRefresh` fires so the caller can re-read.
export async function getQuotes(
  symbols: string[],
  onRefresh?: () => void
): Promise<{ quotes: Record<string, Quote>; oldestAt: number | null }> {
  if (symbols.length === 0) return { quotes: {}, oldestAt: null };

  const ttl = quoteTtl();
  const now = Date.now();
  const out: Record<string, Quote> = {};
  let oldestAt: number | null = null;
  const missing: string[] = [];
  const stale: string[] = [];

  for (const sym of symbols) {
    const entry = cacheGet<Quote>(quoteKey(sym));
    if (entry) {
      out[sym] = entry.v;
      oldestAt = oldestAt == null ? entry.at : Math.min(oldestAt, entry.at);
      if (now - entry.at >= ttl) stale.push(sym);
    } else {
      missing.push(sym);
    }
  }

  const toFetch = [...missing, ...stale];
  if (toFetch.length === 0) return { quotes: out, oldestAt };

  const batchKey = "quotes." + [...toFetch].sort().join(",");
  const fetchP = dedupe(batchKey, () => fetchQuotes(toFetch)).then((fetched) => {
    const at = Date.now();
    for (const sym of toFetch) {
      if (fetched[sym]) cacheSet(quoteKey(sym), fetched[sym]);
    }
    return { fetched, at };
  });

  // Only block if we'd otherwise have nothing to show for some symbol.
  if (missing.length > 0) {
    const { fetched, at } = await fetchP;
    for (const sym of symbols) if (fetched[sym]) out[sym] = fetched[sym];
    oldestAt = oldestAt == null ? at : Math.min(oldestAt, at);
    onRefresh?.();
  } else {
    fetchP.then(() => onRefresh?.()).catch(() => onRefresh?.());
  }

  return { quotes: out, oldestAt };
}

/* ------------------------- historical chart ------------------------ */

export async function getChart(
  symbol: string,
  range: string,
  onRefresh?: () => void
): Promise<{ candles: Candle[]; fetchedAt: number | null }> {
  const interval = range === "1mo" || range === "6mo" ? "1d" : range === "1y" ? "1d" : "1wk";
  const res = await swr<Candle[]>(
    `chart.${symbol}.${range}`,
    60 * 60_000,
    async () => {
      const url = api(`/v8/finance/chart/${encodeURIComponent(symbol)}`, {
        range,
        interval,
      });
      const data = await getJson<any>(url);
      const r = data?.chart?.result?.[0];
      const ts: number[] = r?.timestamp ?? [];
      const cl: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? [];
      const candles: Candle[] = [];
      ts.forEach((t, i) => {
        if (cl[i] != null) candles.push({ t, c: cl[i] as number });
      });
      return candles;
    },
    onRefresh
  );
  return { candles: res.data ?? [], fetchedAt: res.fetchedAt };
}

/* ----------------------- deep stats (best effort) ------------------ */

export async function getQuoteSummary(
  symbol: string
): Promise<any | null> {
  try {
    const modules = [
      "defaultKeyStatistics",
      "financialData",
      "summaryProfile",
      "earnings",
      "price",
    ].join(",");
    const url = api(`/v10/finance/quoteSummary/${encodeURIComponent(symbol)}`, {
      modules,
    });
    const data = await getJson<any>(url);
    return data?.quoteSummary?.result?.[0] ?? null;
  } catch {
    return null;
  }
}

// Heavier quoteSummary pull for the full fundamental report. Financial-statement
// history barely moves intraday, so this is cached for 12h (SWR) rather than on
// the quote TTL. Any module Yahoo declines to serve just comes back missing and
// the report flags that section as DATA UNAVAILABLE.
export async function getFinancials(
  symbol: string,
  onRefresh?: () => void
): Promise<{ data: any | null; fetchedAt: number | null }> {
  const modules = [
    "incomeStatementHistory",
    "incomeStatementHistoryQuarterly",
    "balanceSheetHistory",
    "cashflowStatementHistory",
    "earnings",
    "earningsHistory",
    "financialData",
    "defaultKeyStatistics",
    "summaryDetail",
    "summaryProfile",
    "price",
  ].join(",");
  const res = await swr<any>(
    `fin.${symbol}`,
    12 * 60 * 60_000,
    async () => {
      const url = api(`/v10/finance/quoteSummary/${encodeURIComponent(symbol)}`, {
        modules,
      });
      const data = await getJson<any>(url);
      return data?.quoteSummary?.result?.[0] ?? null;
    },
    onRefresh
  );
  return { data: res.data ?? null, fetchedAt: res.fetchedAt };
}

// Yahoo's fundamentals-timeseries endpoint — the currently-working source for
// multi-year statement data (quoteSummary's *History modules are largely gutted
// now). Returns ~4 fiscal years. Cached 12h (SWR).
const TS_TYPES = [
  "annualTotalRevenue",
  "annualNetIncome",
  "annualDilutedEPS",
  "annualEBIT",
  "annualEBITDA",
  "annualInterestExpense",
  "annualTotalDebt",
  "annualStockholdersEquity",
  "annualTotalAssets",
  "annualCurrentAssets",
  "annualCurrentLiabilities",
  "annualOperatingCashFlow",
  "annualCapitalExpenditure",
];

/** type -> array of yearly numbers, oldest first. Missing types are absent. */
export async function getTimeseries(
  symbol: string,
  onRefresh?: () => void
): Promise<{ data: Record<string, number[]>; fetchedAt: number | null }> {
  const res = await swr<Record<string, number[]>>(
    `ts.${symbol}`,
    12 * 60 * 60_000,
    async () => {
      const p2 = Math.floor(Date.now() / 1000);
      const p1 = p2 - 6 * 365 * 24 * 3600;
      const url = api(`/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}`, {
        type: TS_TYPES.join(","),
        period1: String(p1),
        period2: String(p2),
        merge: "false",
      });
      const data = await getJson<any>(url);
      const out: Record<string, number[]> = {};
      for (const row of data?.timeseries?.result ?? []) {
        const t: string | undefined = row?.meta?.type?.[0];
        if (!t) continue;
        const series = (row[t] ?? [])
          .map((v: any) => (v && typeof v.reportedValue?.raw === "number" ? v.reportedValue.raw : null))
          .filter((x: number | null): x is number => x != null);
        if (series.length) out[t] = series;
      }
      return out;
    },
    onRefresh
  );
  return { data: res.data ?? {}, fetchedAt: res.fetchedAt };
}

export async function searchSymbols(
  q: string
): Promise<{ symbol: string; name: string; exch: string }[]> {
  if (!q.trim()) return [];
  const url = api("/v1/finance/search", { q, quotesCount: "10", newsCount: "0" });
  try {
    const data = await getJson<any>(url);
    return (data?.quotes ?? [])
      .filter((x: any) => x.symbol)
      .map((x: any) => ({
        symbol: x.symbol,
        name: x.longname || x.shortname || x.symbol,
        exch: x.exchDisp || x.exchange || "",
      }));
  } catch {
    return [];
  }
}
