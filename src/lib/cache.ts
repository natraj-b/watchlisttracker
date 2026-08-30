// Tiny stale-while-revalidate cache backed by localStorage + an in-memory map of
// in-flight promises so concurrent callers share one network request.

interface Entry<T> {
  v: T;
  at: number;
}

const inflight = new Map<string, Promise<unknown>>();

function lsGet<T>(key: string): Entry<T> | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Entry<T>) : null;
  } catch {
    return null;
  }
}

function lsSet<T>(key: string, v: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({ v, at: Date.now() } as Entry<T>));
  } catch {
    /* ignore */
  }
}

export interface SwrResult<T> {
  data: T | null;
  fetchedAt: number | null;
  stale: boolean;
}

/**
 * Returns cached data immediately (even if stale) and, when stale, triggers a
 * background refresh. Call again after `onRefresh` fires to read fresh data.
 */
export async function swr<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
  onRefresh?: () => void
): Promise<SwrResult<T>> {
  const cacheKey = "iw.cache." + key;
  const cached = lsGet<T>(cacheKey);
  const fresh = cached && Date.now() - cached.at < ttlMs;

  if (!fresh) {
    if (!inflight.has(cacheKey)) {
      const p = fetcher()
        .then((v) => {
          lsSet(cacheKey, v);
          return v;
        })
        .finally(() => {
          inflight.delete(cacheKey);
          onRefresh?.();
        });
      inflight.set(cacheKey, p);
    }
    // If we have no cached value at all, wait for the fetch.
    if (!cached) {
      const v = (await inflight.get(cacheKey)) as T;
      return { data: v, fetchedAt: Date.now(), stale: false };
    }
  }

  return {
    data: cached ? cached.v : null,
    fetchedAt: cached ? cached.at : null,
    stale: !fresh,
  };
}

export function isMarketHoursIST(d = new Date()): boolean {
  // Convert to IST regardless of the device timezone.
  const ist = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const day = ist.getDay(); // 0 Sun .. 6 Sat
  if (day === 0 || day === 6) return false;
  const mins = ist.getHours() * 60 + ist.getMinutes();
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}

export function quoteTtl(): number {
  return isMarketHoursIST() ? 60_000 : 15 * 60_000;
}
