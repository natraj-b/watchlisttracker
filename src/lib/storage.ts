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

/* ------------------------- change notifications -------------------------- */
// Lets the UI re-render when data changes from outside the current call (e.g.
// a Firestore snapshot arriving from another device), and lets cloudSync.ts
// mirror local writes up to the cloud without storage.ts knowing it exists.

type Listener = () => void;
const listeners = new Set<Listener>();

export function onStoreChange(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function emit() {
  listeners.forEach((l) => l());
}

export interface CloudDoc {
  stocks?: WatchItem[];
  funds?: MfWatchItem[];
  hiddenIndices?: string[];
  notes?: Record<string, string>;
}

type CloudPush = (patch: CloudDoc) => void;
let cloudPush: CloudPush | null = null;

/** Registered once by cloudSync.ts so local writes also go to the cloud. */
export function setCloudPushHandler(fn: CloudPush | null) {
  cloudPush = fn;
}

export const store = {
  getStocks: (): WatchItem[] => read<WatchItem[]>(KEYS.stocks, []),
  setStocks: (v: WatchItem[]) => {
    write(KEYS.stocks, v);
    emit();
    cloudPush?.({ stocks: v });
  },

  getFunds: (): MfWatchItem[] => read<MfWatchItem[]>(KEYS.funds, []),
  setFunds: (v: MfWatchItem[]) => {
    write(KEYS.funds, v);
    emit();
    cloudPush?.({ funds: v });
  },

  getHiddenIndices: (): string[] => read<string[]>(KEYS.hiddenIndices, []),
  setHiddenIndices: (v: string[]) => {
    write(KEYS.hiddenIndices, v);
    emit();
    cloudPush?.({ hiddenIndices: v });
  },

  getNotes: (): Record<string, string> => read(KEYS.notes, {}),
  setNotes: (v: Record<string, string>) => {
    write(KEYS.notes, v);
    emit();
    cloudPush?.({ notes: v });
  },

  getSettings: (): { relaxOffHours: boolean } =>
    read(KEYS.settings, { relaxOffHours: true }),
  setSettings: (v: { relaxOffHours: boolean }) => write(KEYS.settings, v),

  /** Snapshot of everything cloud-sync-worthy, used to seed a new cloud doc. */
  getAllForCloud: (): Required<CloudDoc> => ({
    stocks: read<WatchItem[]>(KEYS.stocks, []),
    funds: read<MfWatchItem[]>(KEYS.funds, []),
    hiddenIndices: read<string[]>(KEYS.hiddenIndices, []),
    notes: read(KEYS.notes, {}),
  }),

  /** Applies data that arrived FROM the cloud — writes locally without re-pushing. */
  applyRemote: (patch: CloudDoc) => {
    if (patch.stocks !== undefined) write(KEYS.stocks, patch.stocks);
    if (patch.funds !== undefined) write(KEYS.funds, patch.funds);
    if (patch.hiddenIndices !== undefined) write(KEYS.hiddenIndices, patch.hiddenIndices);
    if (patch.notes !== undefined) write(KEYS.notes, patch.notes);
    emit();
  },
};
