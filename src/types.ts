export type Section = "nonfin" | "fin";

export interface WatchItem {
  symbol: string; // Yahoo symbol, e.g. RELIANCE.NS
  name: string;
  section: Section;
  addedAt: number;
  classified?: boolean; // true once auto-classified from Yahoo sector/industry
  sector?: string | null; // Yahoo GICS-ish sector, e.g. "Financial Services"
}

export interface Quote {
  symbol: string;
  name: string;
  price: number | null;
  previousClose: number | null;
  changePct: number | null;
  currency: string | null;
  marketCap: number | null;
  peTrailing: number | null;
  peForward: number | null;
  priceToBook: number | null;
  epsTrailing: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  fiftyTwoWeekChangePct: number | null;
  sector: string | null;
  industry: string | null;
  quoteType: string | null;
  faceValue: number | null;
  volume: number | null;
  fetchedAt: number;
}

export interface Candle {
  t: number; // epoch seconds
  c: number; // close
}

export interface MfScheme {
  schemeCode: number;
  schemeName: string;
}

export interface MfDetail {
  schemeCode: number;
  schemeName: string;
  fundHouse: string | null;
  schemeCategory: string | null;
  schemeType: string | null;
  nav: number | null;
  navDate: string | null;
  history: { date: string; nav: number }[]; // newest first
  fetchedAt: number;
}

export interface MfWatchItem {
  schemeCode: number;
  schemeName: string;
  addedAt: number;
}

export interface CustomIndex {
  symbol: string;
  name: string;
  addedAt: number;
}
