import { useEffect, useRef, useState } from "react";
import { searchSymbols } from "../lib/yahoo";
import { normaliseSymbol } from "../lib/symbols";

interface Props {
  open: boolean;
  onClose: () => void;
  onAdd: (symbol: string, name: string) => void;
  title?: string;
  placeholder?: string;
}

export function AddSymbolSheet({
  open,
  onClose,
  onAdd,
  title = "Add to watchlist",
  placeholder = "Search company or ticker (e.g. Reliance, HDFCBANK)",
}: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<
    { symbol: string; name: string; exch: string }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!open) {
      setQ("");
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    timer.current = window.setTimeout(async () => {
      setLoading(true);
      const r = await searchSymbols(q);
      // Prefer Indian listings first.
      r.sort((a, b) => {
        const ai = /\.(NS|BO)$/i.test(a.symbol) ? 0 : 1;
        const bi = /\.(NS|BO)$/i.test(b.symbol) ? 0 : 1;
        return ai - bi;
      });
      setResults(r);
      setLoading(false);
    }, 300);
  }, [q]);

  if (!open) return null;

  const manual = normaliseSymbol(q);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <h3>{title}</h3>
        <input
          autoFocus
          className="sheet-input"
          placeholder={placeholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="sheet-list">
          {loading && <div className="sheet-hint">Searching…</div>}
          {!loading &&
            results.map((r) => (
              <button
                key={r.symbol}
                className="sheet-item"
                onClick={() => {
                  onAdd(r.symbol, r.name);
                  onClose();
                }}
              >
                <span className="sheet-item-sym">
                  {r.symbol.replace(/\.(NS|BO)$/i, "")}
                </span>
                <span className="sheet-item-name">{r.name}</span>
                <span className="sheet-item-exch">{r.exch}</span>
              </button>
            ))}
          {!loading && q.trim().length >= 2 && (
            <button
              className="sheet-item manual"
              onClick={() => {
                onAdd(manual, q.trim());
                onClose();
              }}
            >
              Add “{manual}” directly
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
