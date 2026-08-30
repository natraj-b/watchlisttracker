import { Link } from "react-router-dom";
import type { Quote, Section } from "../types";
import { num, pct, signClass } from "../lib/format";
import { RangeBar } from "./RangeBar";

interface Props {
  symbol: string;
  name: string;
  section: Section;
  quote: Quote | undefined;
  onRemove: () => void;
}

export function TickerRow({ symbol, name, section, quote, onRemove }: Props) {
  const bare = symbol.replace(/\.(NS|BO)$/i, "");
  return (
    <div className="row">
      <Link className="row-main" to={`/analyse/stock/${encodeURIComponent(symbol)}`}>
        <div className="row-id">
          <span className="row-sym">{bare}</span>
          <span className="row-name">{quote?.name || name}</span>
        </div>
        <div className="row-price">
          <span className="row-cmp">{num(quote?.price ?? null)}</span>
          <span className={"row-chg " + signClass(quote?.changePct)}>
            {pct(quote?.changePct ?? null)}
          </span>
        </div>
        <div className="row-metrics">
          {section === "fin" ? (
            <Metric label="P/B" value={num(quote?.priceToBook ?? null)} />
          ) : (
            <>
              <Metric label="P/E" value={num(quote?.peTrailing ?? null)} />
              <Metric label="Fwd P/E" value={num(quote?.peForward ?? null)} />
            </>
          )}
        </div>
        <div className="row-range">
          <RangeBar
            low={quote?.fiftyTwoWeekLow ?? null}
            high={quote?.fiftyTwoWeekHigh ?? null}
            price={quote?.price ?? null}
          />
        </div>
      </Link>
      <button
        className="row-remove"
        aria-label={`Remove ${bare}`}
        onClick={onRemove}
      >
        ✕
      </button>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="metric">
      <span className="metric-l">{label}</span>
      <span className="metric-v">{value}</span>
    </span>
  );
}
