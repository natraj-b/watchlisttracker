import { useMemo, useState } from "react";
import type { Candle } from "../types";
import { num } from "../lib/format";

interface Props {
  candles: Candle[];
  range: string;
  onRange: (r: string) => void;
}

const RANGES = [
  { k: "1mo", l: "1M" },
  { k: "6mo", l: "6M" },
  { k: "1y", l: "1Y" },
  { k: "5y", l: "5Y" },
  { k: "max", l: "Max" },
];

export function PriceChart({ candles, range, onRange }: Props) {
  const [hover, setHover] = useState<Candle | null>(null);
  const w = 320;
  const h = 140;

  const path = useMemo(() => {
    if (candles.length < 2) return "";
    const xs = candles.map((c) => c.t);
    const ys = candles.map((c) => c.c);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;
    return candles
      .map((c, i) => {
        const x = ((c.t - minX) / spanX) * w;
        const y = h - ((c.c - minY) / spanY) * h;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }, [candles]);

  const first = candles[0]?.c;
  const last = candles[candles.length - 1]?.c;
  const up = first != null && last != null && last >= first;
  const pchg =
    first != null && last != null ? ((last - first) / first) * 100 : null;

  return (
    <div className="chart">
      <div className="chart-head">
        <div className="chart-ranges">
          {RANGES.map((r) => (
            <button
              key={r.k}
              className={"chip " + (range === r.k ? "on" : "")}
              onClick={() => onRange(r.k)}
            >
              {r.l}
            </button>
          ))}
        </div>
        <span className={"chart-pchg " + (up ? "up" : "down")}>
          {pchg == null ? "" : (pchg > 0 ? "+" : "") + pchg.toFixed(1) + "%"}
        </span>
      </div>
      {candles.length < 2 ? (
        <div className="chart-empty">No price history available.</div>
      ) : (
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="chart-svg"
          preserveAspectRatio="none"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const rect = (e.target as SVGElement).ownerSVGElement!.getBoundingClientRect();
            const rel = (e.clientX - rect.left) / rect.width;
            const idx = Math.round(rel * (candles.length - 1));
            setHover(candles[Math.min(candles.length - 1, Math.max(0, idx))]);
          }}
        >
          <path
            d={path}
            fill="none"
            stroke={up ? "var(--up)" : "var(--down)"}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
      <div className="chart-foot">
        {hover ? (
          <span>
            {new Date(hover.t * 1000).toLocaleDateString("en-IN")} ·{" "}
            {num(hover.c)}
          </span>
        ) : (
          <span>
            {candles.length ? `${num(first)} → ${num(last)}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}
