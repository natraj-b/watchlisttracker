import { useRef, useState } from "react";
import { exportToExcel, importFromExcel, type ImportSummary } from "../lib/excel";
import { SyncSection } from "./SyncSection";

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

export function DataBackupSheet({ open, onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  if (!open) return null;

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      await exportToExcel();
    } catch (e) {
      setError(String(e));
    } finally {
      setExporting(false);
    }
  }

  async function handleFile(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const res = await importFromExcel(f, mode);
      setSummary(res);
      onImported();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <h3>Backup, restore & sync</h3>

        <SyncSection />
        <div className="backup-divider" />

        <button className="backup-action" disabled={exporting} onClick={handleExport}>
          ⬇ {exporting ? "Preparing…" : "Export as Excel"}
          <small>Downloads your stocks, funds & research notes as one .xlsx file</small>
        </button>

        <div className="backup-divider" />

        <div className="backup-mode">
          <span>When importing:</span>
          <label>
            <input
              type="radio"
              checked={mode === "merge"}
              onChange={() => setMode("merge")}
            />
            Merge (add/update, keep existing)
          </label>
          <label>
            <input
              type="radio"
              checked={mode === "replace"}
              onChange={() => setMode("replace")}
            />
            Replace everything on this device
          </label>
        </div>

        <button
          className="backup-action"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          ⬆ {busy ? "Importing…" : "Import from Excel"}
          <small>Pick an .xlsx file exported by this app</small>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          onChange={(e) => handleFile(e.target.files?.[0])}
        />

        {error && <p className="backup-error">{error}</p>}
        {summary && (
          <p className="backup-summary">
            Stocks: +{summary.stocksAdded} new, {summary.stocksUpdated} updated ·
            Funds: +{summary.fundsAdded} new, {summary.fundsUpdated} updated ·
            Notes: {summary.notesImported}
            {summary.errors.length > 0 && (
              <> · {summary.errors.length} issue(s)</>
            )}
          </p>
        )}

        <p className="backup-note">
          Only import files you exported from this app yourself — don't open
          spreadsheets from people or sites you don't trust.
        </p>
      </div>
    </div>
  );
}
