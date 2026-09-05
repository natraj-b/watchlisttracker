import { swr } from "./cache";

export interface IndexRatio {
  pe: number | null;
  pb: number | null;
  dy: number | null;
}

/** NSE indexSymbol -> ratios, e.g. "NIFTY 50" -> { pe: 20.2, pb: 2.89, dy: 1.19 } */
export type IndexRatioMap = Record<string, IndexRatio>;

function num(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n !== 0 ? n : null;
}

async function fetchIndexRatios(): Promise<IndexRatioMap> {
  const r = await fetch("/api/nse?path=allIndices");
  if (!r.ok) throw new Error(`nse ${r.status}`);
  const data = await r.json();
  const out: IndexRatioMap = {};
  for (const row of data?.data ?? []) {
    if (!row.indexSymbol) continue;
    out[row.indexSymbol] = { pe: num(row.pe), pb: num(row.pb), dy: num(row.dy) };
  }
  return out;
}

/** Cached ~5 min — NSE's own page doesn't refresh this any faster either. */
export async function getIndexRatios(
  onRefresh?: () => void
): Promise<IndexRatioMap> {
  const res = await swr<IndexRatioMap>("nse.allIndices", 5 * 60_000, fetchIndexRatios, onRefresh);
  return res.data ?? {};
}
