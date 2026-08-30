import type { Candle, Quote } from "../types";
import { swr, quoteTtl } from "./cache";

const BASE = "/api/yahoo";

function api(path: string, params: Record<string, string>): string {
  const u = new URLSearchParams({ path, ...params });
  return `${BASE}?${u.toString()}`;
}

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`yahoo ${r.status}`);
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

// One cached, de-duplicated batch call for a set of symbols.
export async function getQuotes(
  symbols: string[],
  onRefresh?: () => void
): Promise<{ quotes: Record<string, Quote>; oldestAt: number | null }> {
  if (symbols.length === 0) return { quotes: {}, oldestAt: null };
  const key = "quotes." + [...symbols].sort().join(",");
  const res = await swr<Record<string, Quote>>(
    key,
    quoteTtl(),
    () => fetchQuotes(symbols),
    onRefresh
  );
  return { quotes: res.data ?? {}, oldestAt: res.fetchedAt };
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
