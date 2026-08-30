import type { MfWatchItem, WatchItem } from "../types";

const KEYS = {
  stocks: "iw.watchlist.stocks.v1",
  funds: "iw.watchlist.funds.v1",
  hiddenIndices: "iw.indices.hidden.v1",
  notes: "iw.analyse.notes.v1",
  settings: "iw.settings.v1",
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode — ignore */
  }
}

export const store = {
  getStocks: (): WatchItem[] => read<WatchItem[]>(KEYS.stocks, []),
  setStocks: (v: WatchItem[]) => write(KEYS.stocks, v),

  getFunds: (): MfWatchItem[] => read<MfWatchItem[]>(KEYS.funds, []),
  setFunds: (v: MfWatchItem[]) => write(KEYS.funds, v),

  getHiddenIndices: (): string[] => read<string[]>(KEYS.hiddenIndices, []),
  setHiddenIndices: (v: string[]) => write(KEYS.hiddenIndices, v),

  getNotes: (): Record<string, string> => read(KEYS.notes, {}),
  setNotes: (v: Record<string, string>) => write(KEYS.notes, v),

  getSettings: (): { relaxOffHours: boolean } =>
    read(KEYS.settings, { relaxOffHours: true }),
  setSettings: (v: { relaxOffHours: boolean }) => write(KEYS.settings, v),
};
