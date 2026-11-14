// Global-market symbols for the Global tab. Yahoo symbols; display names are our
// own because Yahoo's shortName is truncated or odd for several of these
// ("DAX   P", "Brent Crude Oil Last Day Financ…").

import type { Quote } from "../types";
import type { IndexRatioMap } from "./nse";
import { num } from "./format";

export type GlobalGroup =
  | "India"
  | "US"
  | "Europe"
  | "Asia-Pacific"
  | "Commodities"
  | "FX & rates"
  | "Crypto";

export interface GlobalDef {
  symbol: string;
  name: string;
  group: GlobalGroup;
  /** decimals to show for the price */
  digits?: number;
  /** appended to the price, e.g. "%" for a yield */
  suffix?: string;
  /** shown under the name, e.g. "futures" — commodity quotes are contracts, not spot */
  note?: string;
  /** NSE indexSymbol — lets the page show NSE's published P/E and P/B */
  nseKey?: string;
  /** An ETF that tracks this (or a close) index. Yahoo has no P/E for indices, but it
   * does for ETFs — so the page shows the ETF's P/E / P/B, marked as approximate. */
  etf?: string;
  /** don't colour the % change green/red — an up-move isn't "good" (e.g. VIX) */
  neutral?: boolean;
}

export const GLOBAL_GROUPS: GlobalGroup[] = [
  "India",
  "US",
  "Europe",
  "Asia-Pacific",
  "Commodities",
  "FX & rates",
  "Crypto",
];

export const GLOBAL: GlobalDef[] = [
  { symbol: "^NSEI", name: "Nifty 50", group: "India", nseKey: "NIFTY 50" },
  { symbol: "^BSESN", name: "Sensex", group: "India", etf: "INDA" },
  { symbol: "^NSEBANK", name: "Nifty Bank", group: "India", nseKey: "NIFTY BANK" },
  { symbol: "^NSMIDCP", name: "Nifty Midcap 100", group: "India", nseKey: "NIFTY MIDCAP 100" },
  { symbol: "^CNXSC", name: "Nifty Smallcap 100", group: "India", nseKey: "NIFTY SMLCAP 100" },
  { symbol: "^INDIAVIX", name: "India VIX", group: "India", neutral: true },

  { symbol: "^GSPC", name: "S&P 500", group: "US", etf: "SPY" },
  { symbol: "^IXIC", name: "Nasdaq Composite", group: "US", etf: "ONEQ" },
  { symbol: "^DJI", name: "Dow Jones", group: "US", etf: "DIA" },
  { symbol: "^RUT", name: "Russell 2000", group: "US", etf: "IWM" },
  { symbol: "^VIX", name: "VIX (US volatility)", group: "US", neutral: true },

  { symbol: "^FTSE", name: "FTSE 100", group: "Europe", etf: "EWU" },
  { symbol: "^GDAXI", name: "DAX", group: "Europe", etf: "EWG" },
  { symbol: "^FCHI", name: "CAC 40", group: "Europe", etf: "EWQ" },

  { symbol: "^N225", name: "Nikkei 225", group: "Asia-Pacific", etf: "EWJ" },
  { symbol: "^HSI", name: "Hang Seng", group: "Asia-Pacific", etf: "EWH" },
  { symbol: "000001.SS", name: "Shanghai Composite", group: "Asia-Pacific", etf: "ASHR" },
  { symbol: "^KS11", name: "KOSPI", group: "Asia-Pacific", etf: "EWY" },
  { symbol: "^AXJO", name: "ASX 200", group: "Asia-Pacific", etf: "EWA" },
  { symbol: "^STI", name: "Straits Times", group: "Asia-Pacific", etf: "EWS" },

  { symbol: "GC=F", name: "Gold", group: "Commodities", note: "futures · USD/oz" },
  { symbol: "SI=F", name: "Silver", group: "Commodities", note: "futures · USD/oz" },
  { symbol: "CL=F", name: "Crude oil (WTI)", group: "Commodities", note: "futures · USD/bbl" },
  { symbol: "BZ=F", name: "Brent crude", group: "Commodities", note: "futures · USD/bbl" },
  { symbol: "NG=F", name: "Natural gas", group: "Commodities", digits: 3, note: "futures · USD/MMBtu" },
  { symbol: "HG=F", name: "Copper", group: "Commodities", digits: 3, note: "futures · USD/lb" },

  { symbol: "USDINR=X", name: "USD / INR", group: "FX & rates", digits: 2 },
  { symbol: "EURUSD=X", name: "EUR / USD", group: "FX & rates", digits: 4 },
  { symbol: "DX-Y.NYB", name: "US Dollar Index", group: "FX & rates", digits: 2 },
  { symbol: "^TNX", name: "US 10Y yield", group: "FX & rates", digits: 3, suffix: "%" },

  { symbol: "BTC-USD", name: "Bitcoin", group: "Crypto" },
  { symbol: "ETH-USD", name: "Ethereum", group: "Crypto" },
];

/** Everything that must be quoted: the displayed symbols plus the proxy ETFs. */
export const QUOTE_SYMBOLS = Array.from(
  new Set([...GLOBAL.map((g) => g.symbol), ...GLOBAL.flatMap((g) => (g.etf ? [g.etf] : []))])
);

/** Headline strip: the Indian benchmarks plus the global series that move them most. */
export const INDIA_SIGNALS = ["^NSEI", "^BSESN", "USDINR=X", "BZ=F", "^TNX", "^VIX", "DX-Y.NYB"];

const BY_SYMBOL = new Map(GLOBAL.map((g) => [g.symbol, g]));
export const globalDef = (symbol: string): GlobalDef | undefined => BY_SYMBOL.get(symbol);

/** Indices, futures, FX and crypto have no company financials — the fundamental
 * report doesn't apply to them. */
export function isEquitySymbol(symbol: string): boolean {
  return !(
    symbol.startsWith("^") ||
    symbol === "000001.SS" ||
    /=(F|X)$/i.test(symbol) ||
    /-USD$/i.test(symbol) ||
    symbol === "DX-Y.NYB"
  );
}

/** The price as shown on a Global tile or row: the symbol's own decimals and suffix. */
export function formatGlobalPrice(d: GlobalDef, q: Quote | undefined): string {
  const v = q?.price ?? null;
  if (v == null) return "—";
  const digits = d.digits ?? (v >= 1000 ? 0 : 2);
  return num(v, digits) + (d.suffix ?? "");
}

export interface Valuation {
  pe: number | null;
  pb: number | null;
  approx: boolean;
  via?: string;
}

/** P/E and P/B for an index. NSE publishes them for its own indices (exact).
 * Everything else falls back to the P/E of an ETF that tracks the index or a
 * close cousin (approximate) — Yahoo has no P/E for the indices themselves. */
export function valuationOf(
  d: GlobalDef,
  quotes: Record<string, Quote>,
  ratios: IndexRatioMap
): Valuation | null {
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

/** Human label for a non-equity symbol, for the Analyse subtitle. */
export function symbolKind(symbol: string): string {
  if (symbol.startsWith("^") || symbol === "000001.SS") return "Index";
  if (/=F$/i.test(symbol)) return "Commodity futures";
  if (/=X$/i.test(symbol) || symbol === "DX-Y.NYB") return "Currency";
  if (/-USD$/i.test(symbol)) return "Crypto";
  return "";
}
