import { num } from "../lib/format";

interface Props {
  low: number | null;
  high: number | null;
  price: number | null;
}

// 52-week low..high position indicator.
export function RangeBar({ low, high, price }: Props) {
  if (low == null || high == null || price == null || high <= low) {
    return <div className="rangebar-empty">—</div>;
  }
  const pos = Math.min(1, Math.max(0, (price - low) / (high - low)));
  return (
    <div className="rangebar" title={`52W: ${num(low)} – ${num(high)}`}>
      <div className="rangebar-track">
        <div className="rangebar-dot" style={{ left: `${pos * 100}%` }} />
      </div>
      <div className="rangebar-labels">
        <span>{num(low, 0)}</span>
        <span>{num(high, 0)}</span>
      </div>
    </div>
  );
}
