import type { Section } from "../types";

export interface IndexDef {
  symbol: string;
  name: string;
  group: "Broad" | "Sector" | "Other" | "Custom";
  /** NSE's own index key (nseindia.com/api/allIndices "indexSymbol" field),
   * used to look up live P/E and P/B — Yahoo doesn't provide those for indices. */
  nseKey?: string;
}

// Yahoo Finance symbols for Indian indices. A few sector indices are not exposed
// consistently by Yahoo; those are omitted rather than shown broken.
export const INDICES: IndexDef[] = [
  { symbol: "^NSEI", name: "Nifty 50", group: "Broad", nseKey: "NIFTY 50" },
  { symbol: "^BSESN", name: "Sensex", group: "Broad" },
  { symbol: "^NSMIDCP", name: "Nifty Midcap 100", group: "Broad", nseKey: "NIFTY MIDCAP 100" },
  { symbol: "^CNXSC", name: "Nifty Smallcap 100", group: "Broad", nseKey: "NIFTY SMLCAP 100" },
  { symbol: "^NSEBANK", name: "Nifty Bank", group: "Sector", nseKey: "NIFTY BANK" },
  { symbol: "NIFTY_FIN_SERVICE.NS", name: "Nifty Fin Services", group: "Sector", nseKey: "NIFTY FIN SERVICE" },
  { symbol: "^CNXIT", name: "Nifty IT", group: "Sector", nseKey: "NIFTY IT" },
  { symbol: "^CNXAUTO", name: "Nifty Auto", group: "Sector", nseKey: "NIFTY AUTO" },
  { symbol: "^CNXPHARMA", name: "Nifty Pharma", group: "Sector", nseKey: "NIFTY PHARMA" },
  { symbol: "^CNXFMCG", name: "Nifty FMCG", group: "Sector", nseKey: "NIFTY FMCG" },
  { symbol: "^CNXMETAL", name: "Nifty Metal", group: "Sector", nseKey: "NIFTY METAL" },
  { symbol: "^CNXENERGY", name: "Nifty Energy", group: "Sector", nseKey: "NIFTY ENERGY" },
  { symbol: "^CNXREALTY", name: "Nifty Realty", group: "Sector", nseKey: "NIFTY REALTY" },
  { symbol: "^CNXPSUBANK", name: "Nifty PSU Bank", group: "Sector", nseKey: "NIFTY PSU BANK" },
  { symbol: "^INDIAVIX", name: "India VIX", group: "Other" },
];

const FIN_HINTS = [
  "financial",
  "bank",
  "insurance",
  "nbfc",
  "capital market",
  "asset management",
  "finance",
  "housing finance",
  "broker",
];

export function guessSection(
  sector: string | null,
  industry: string | null
): Section {
  const hay = `${sector || ""} ${industry || ""}`.toLowerCase();
  return FIN_HINTS.some((h) => hay.includes(h)) ? "fin" : "nonfin";
}

// Normalise user input into a Yahoo symbol. Bare tickers -> NSE (.NS).
export function normaliseSymbol(raw: string): string {
  const s = raw.trim().toUpperCase();
  if (!s) return s;
  if (s.startsWith("^")) return s;
  if (s.includes(".")) return s;
  return s + ".NS";
}

// External research deep links for a given Yahoo symbol.
export function deepLinks(symbol: string, name: string) {
  const bare = symbol.replace(/\.(NS|BO)$/i, "");
  const q = encodeURIComponent(name || bare);
  return [
    { label: "Screener.in", url: `https://www.screener.in/company/${bare}/consolidated/` },
    { label: "Tickertape", url: `https://www.tickertape.in/search?q=${q}` },
    { label: "Moneycontrol", url: `https://www.moneycontrol.com/india/stockpricequote/search?search_str=${q}` },
    { label: "NSE India", url: `https://www.nseindia.com/get-quotes/equity?symbol=${bare}` },
    { label: "BSE India", url: `https://www.bseindia.com/stock-share-price/x/x/x/?text=${q}` },
    { label: "Trendlyne", url: `https://trendlyne.com/equity/search/?q=${q}` },
  ];
}

export function mfDeepLinks(schemeName: string) {
  const q = encodeURIComponent(schemeName);
  return [
    { label: "Tickertape MF", url: `https://www.tickertape.in/mutualfunds?search=${q}` },
    { label: "Value Research", url: `https://www.valueresearchonline.com/funds/selector/?q=${q}` },
    { label: "Morningstar", url: `https://www.morningstar.in/mutualfunds/default.aspx` },
    { label: "AMFI", url: `https://www.amfiindia.com/nav-history-download` },
  ];
}
