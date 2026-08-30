import type { Quote } from "../types";
import { num, pct, signClass } from "../lib/format";
import { Sparkline } from "./Sparkline";

interface Props {
  name: string;
  quote: Quote | undefined;
  spark: number[];
}

export function IndexCard({ name, quote, spark }: Props) {
  return (
    <div className="idxcard">
      <div className="idxcard-top">
        <span className="idxcard-name">{name}</span>
        <Sparkline data={spark} />
      </div>
      <div className="idxcard-bot">
        <span className="idxcard-lvl">{num(quote?.price ?? null)}</span>
        <span className={"idxcard-chg " + signClass(quote?.changePct)}>
          {pct(quote?.changePct ?? null)}
        </span>
      </div>
    </div>
  );
}
