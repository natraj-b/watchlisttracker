import { Link } from "react-router-dom";
import { num } from "../lib/format";

export interface LadderRow {
  symbol: string;
  name: string;
  value: number;
  price: number | null;
}

interface Props {
  title: string;
  metricLabel: string;
  rows: LadderRow[];
  greenMax: number;
  orangeMax: number;
  emptyText: string;
}

function tier(value: number, greenMax: number, orangeMax: number): "green" | "orange" | "" {
  if (value <= greenMax) return "green";
  if (value <= orangeMax) return "orange";
  return "";
}

export function RecommendationLadder({
  title,
  metricLabel,
  rows,
  greenMax,
  orangeMax,
  emptyText,
}: Props) {
  return (
    <div className="ladder">
      <h3 className="ladder-title">{title}</h3>
      {rows.length === 0 ? (
        <div className="empty">{emptyText}</div>
      ) : (
        <div className="ladder-list">
          {rows.map((r, i) => {
            const cls = tier(r.value, greenMax, orangeMax);
            const bare = r.symbol.replace(/\.(NS|BO)$/i, "");
            return (
              <Link
                key={r.symbol}
                to={`/analyse/stock/${encodeURIComponent(r.symbol)}`}
                className={"ladder-row " + cls}
              >
                <span className="ladder-rank">{i + 1}</span>
                <span className="ladder-id">
                  <span className="ladder-sym">{bare}</span>
                  <span className="ladder-name">{r.name}</span>
                </span>
                <span className="ladder-cmp">
                  {r.price == null ? "—" : "₹" + num(r.price)}
                  <small>CMP</small>
                </span>
                <span className="ladder-val">
                  {num(r.value)}
                  <small>{metricLabel}</small>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
