import type * as XLSXType from "xlsx";
import type { MfWatchItem, Section, WatchItem } from "../types";
import { store } from "./storage";

function toEpoch(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = Date.parse(v);
    if (!Number.isNaN(t)) return t;
  }
  return Date.now();
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : v == null ? fallback : String(v);
}

/* --------------------------------- export -------------------------------- */

export async function exportToExcel(): Promise<void> {
  const XLSX = await import("xlsx");
  const stocks = store.getStocks();
  const funds = store.getFunds();
  const notes = store.getNotes();
  const hidden = store.getHiddenIndices();

  const wb = XLSX.utils.book_new();

  const stockRows = stocks.map((s) => ({
    Symbol: s.symbol,
    Name: s.name,
    Section: s.section === "fin" ? "Financial" : "Non-financial",
    AddedAt: new Date(s.addedAt).toISOString(),
    Classified: s.classified ? "yes" : "no",
  }));
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(stockRows.length ? stockRows : [{ Symbol: "", Name: "", Section: "", AddedAt: "", Classified: "" }]),
    "Stocks"
  );

  const fundRows = funds.map((f) => ({
    SchemeCode: f.schemeCode,
    SchemeName: f.schemeName,
    AddedAt: new Date(f.addedAt).toISOString(),
  }));
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(fundRows.length ? fundRows : [{ SchemeCode: "", SchemeName: "", AddedAt: "" }]),
    "Funds"
  );

  const noteRows = Object.entries(notes).map(([key, note]) => {
    const [symbol, item] = key.split("::");
    return { Symbol: symbol, ChecklistItem: item, Note: note };
  });
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(noteRows.length ? noteRows : [{ Symbol: "", ChecklistItem: "", Note: "" }]),
    "Notes"
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      hidden.length ? hidden.map((s) => ({ Symbol: s })) : [{ Symbol: "" }]
    ),
    "HiddenIndices"
  );

  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `investment-watchlist-${date}.xlsx`);
}

/* --------------------------------- import -------------------------------- */

export interface ImportSummary {
  stocksAdded: number;
  stocksUpdated: number;
  fundsAdded: number;
  fundsUpdated: number;
  notesImported: number;
  errors: string[];
}

function sheetRows(
  XLSX: typeof XLSXType,
  wb: XLSXType.WorkBook,
  name: string
): Record<string, unknown>[] {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
}

export async function importFromExcel(
  file: File,
  mode: "merge" | "replace"
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    stocksAdded: 0,
    stocksUpdated: 0,
    fundsAdded: 0,
    fundsUpdated: 0,
    notesImported: 0,
    errors: [],
  };

  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  let wb: XLSXType.WorkBook;
  try {
    wb = XLSX.read(buf, { type: "array" });
  } catch (e) {
    summary.errors.push(`Could not read file: ${String(e)}`);
    return summary;
  }

  // Stocks
  const existingStocks = mode === "replace" ? [] : store.getStocks();
  const stockMap = new Map(existingStocks.map((s) => [s.symbol, s]));
  for (const row of sheetRows(XLSX, wb, "Stocks")) {
    const symbol = str(row.Symbol).trim().toUpperCase();
    if (!symbol) continue;
    const name = str(row.Name, symbol);
    const rawSection = str(row.Section).toLowerCase();
    const section: Section = rawSection.startsWith("fin") && !rawSection.startsWith("non")
      ? "fin"
      : "nonfin";
    const item: WatchItem = {
      symbol,
      name,
      section,
      addedAt: toEpoch(row.AddedAt),
      classified: true,
    };
    if (stockMap.has(symbol)) {
      summary.stocksUpdated++;
    } else {
      summary.stocksAdded++;
    }
    stockMap.set(symbol, item);
  }
  store.setStocks(Array.from(stockMap.values()));

  // Funds
  const existingFunds = mode === "replace" ? [] : store.getFunds();
  const fundMap = new Map(existingFunds.map((f) => [f.schemeCode, f]));
  for (const row of sheetRows(XLSX, wb, "Funds")) {
    const code = Number(row.SchemeCode);
    if (!Number.isFinite(code) || code <= 0) continue;
    const item: MfWatchItem = {
      schemeCode: code,
      schemeName: str(row.SchemeName, String(code)),
      addedAt: toEpoch(row.AddedAt),
    };
    if (fundMap.has(code)) {
      summary.fundsUpdated++;
    } else {
      summary.fundsAdded++;
    }
    fundMap.set(code, item);
  }
  store.setFunds(Array.from(fundMap.values()));

  // Notes
  const existingNotes = mode === "replace" ? {} : store.getNotes();
  const notes = { ...existingNotes };
  for (const row of sheetRows(XLSX, wb, "Notes")) {
    const symbol = str(row.Symbol).trim();
    const itemKey = str(row.ChecklistItem).trim();
    const note = str(row.Note).trim();
    if (!symbol || !itemKey || !note) continue;
    notes[`${symbol}::${itemKey}`] = note;
    summary.notesImported++;
  }
  store.setNotes(notes);

  // Hidden indices
  const hiddenRows = sheetRows(XLSX, wb, "HiddenIndices")
    .map((r) => str(r.Symbol).trim())
    .filter(Boolean);
  if (hiddenRows.length) {
    const existingHidden = mode === "replace" ? [] : store.getHiddenIndices();
    store.setHiddenIndices(Array.from(new Set([...existingHidden, ...hiddenRows])));
  } else if (mode === "replace") {
    store.setHiddenIndices([]);
  }

  return summary;
}
