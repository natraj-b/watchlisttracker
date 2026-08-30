import type { MfDetail, MfScheme } from "../types";
import { swr } from "./cache";

const BASE = "https://api.mfapi.in";

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`mfapi ${r.status}`);
  return (await r.json()) as T;
}

export async function searchFunds(q: string): Promise<MfScheme[]> {
  if (!q.trim()) return [];
  const res = await swr<MfScheme[]>(
    `mf.search.${q.toLowerCase()}`,
    10 * 60_000,
    async () => {
      const data = await getJson<any[]>(
        `${BASE}/mf/search?q=${encodeURIComponent(q)}`
      );
      return data.map((d) => ({
        schemeCode: d.schemeCode,
        schemeName: d.schemeName,
      }));
    }
  );
  return res.data ?? [];
}

function parseDate(d: string): number {
  // mfapi format: DD-MM-YYYY
  const [dd, mm, yyyy] = d.split("-").map(Number);
  return Date.UTC(yyyy, mm - 1, dd);
}

export async function getFund(
  schemeCode: number,
  onRefresh?: () => void
): Promise<{ detail: MfDetail | null; fetchedAt: number | null }> {
  const res = await swr<MfDetail>(
    `mf.detail.${schemeCode}`,
    6 * 60 * 60_000,
    async () => {
      const data = await getJson<any>(`${BASE}/mf/${schemeCode}`);
      const history = (data.data ?? [])
        .map((x: any) => ({ date: x.date, nav: parseFloat(x.nav) }))
        .filter((x: any) => Number.isFinite(x.nav));
      return {
        schemeCode,
        schemeName: data.meta?.scheme_name ?? String(schemeCode),
        fundHouse: data.meta?.fund_house ?? null,
        schemeCategory: data.meta?.scheme_category ?? null,
        schemeType: data.meta?.scheme_type ?? null,
        nav: history[0]?.nav ?? null,
        navDate: history[0]?.date ?? null,
        history,
        fetchedAt: Date.now(),
      } as MfDetail;
    },
    onRefresh
  );
  return { detail: res.data, fetchedAt: res.fetchedAt };
}

// Nearest NAV on or before a target date (history is newest-first).
function navOnOrBefore(
  history: { date: string; nav: number }[],
  targetMs: number
): number | null {
  for (const h of history) {
    if (parseDate(h.date) <= targetMs) return h.nav;
  }
  return history.length ? history[history.length - 1].nav : null;
}

export interface FundReturns {
  "1M": number | null;
  "6M": number | null;
  "1Y": number | null;
  "3Y": number | null;
  "5Y": number | null;
}

export function computeReturns(detail: MfDetail): FundReturns {
  const h = detail.history;
  const latest = h[0]?.nav ?? null;
  const latestMs = h[0] ? parseDate(h[0].date) : Date.now();
  const day = 86400_000;
  const simple = (past: number | null) =>
    past && latest ? ((latest - past) / past) * 100 : null;
  const cagr = (past: number | null, years: number) =>
    past && latest ? (Math.pow(latest / past, 1 / years) - 1) * 100 : null;
  return {
    "1M": simple(navOnOrBefore(h, latestMs - 30 * day)),
    "6M": simple(navOnOrBefore(h, latestMs - 182 * day)),
    "1Y": simple(navOnOrBefore(h, latestMs - 365 * day)),
    "3Y": cagr(navOnOrBefore(h, latestMs - 3 * 365 * day), 3),
    "5Y": cagr(navOnOrBefore(h, latestMs - 5 * 365 * day), 5),
  };
}
