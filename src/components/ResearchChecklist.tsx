import { useState } from "react";
import { store } from "../lib/storage";

export interface ChecklistItem {
  key: string;
  title: string;
  why: string;
}

// The user's deep-research checklist. These are NOT auto-retrievable from any
// free API — each row links out to the source and lets the user log their own
// finding on-device.
export const CHECKLIST: ChecklistItem[] = [
  { key: "val_hist", title: "P/E, P/B, EV/EBITDA vs sector avg & own 5-yr avg", why: "Tells you if the stock is cheap or expensive relative to its history and peers." },
  { key: "rev_cagr", title: "Revenue CAGR — 3-yr & 5-yr", why: "Sustained top-line growth is the base of compounding." },
  { key: "pat_cagr", title: "Net profit CAGR — 3-yr & 5-yr", why: "Profit should grow at least as fast as revenue." },
  { key: "eps_cagr", title: "EPS CAGR — 3-yr & 5-yr", why: "Per-share growth accounts for dilution / buybacks." },
  { key: "ebitda_margin", title: "EBITDA margin trend — 5 yrs", why: "Rising margins signal pricing power or operating leverage." },
  { key: "npm_trend", title: "Net profit margin trend — 5 yrs", why: "Shows whether growth is profitable after interest & tax." },
  { key: "eps_quarters", title: "EPS — last 8 quarters with YoY change", why: "Detects recent acceleration or deterioration." },
  { key: "fcf", title: "Free cash flow — last 3–5 yrs", why: "Profit that isn't converting to cash is a red flag." },
  { key: "de_trend", title: "Debt-to-equity — 5-yr trend", why: "Rising leverage raises risk in downturns." },
  { key: "icr", title: "Interest coverage ratio", why: "Below ~3x means debt servicing is a strain." },
  { key: "current_ratio", title: "Current ratio", why: "Short-term liquidity; below 1 can mean stress." },
  { key: "roe_roce", title: "ROE & ROCE — current, 3-yr avg, 5-yr avg", why: "Quality of capital allocation; look for consistency > 15%." },
  { key: "dividend", title: "Dividend history & payout ratio", why: "Capital return discipline and earnings quality." },
  { key: "promoter_holding", title: "Promoter holding — last 8–12 quarters", why: "Falling promoter stake can signal reduced confidence." },
  { key: "promoter_pledge", title: "Promoter pledging (flag if > 10%)", why: "High pledging is a governance / solvency risk." },
  { key: "fii_dii", title: "FII & DII holding trend — last 8 quarters", why: "Institutional accumulation / distribution." },
  { key: "moat", title: "Competitive moat — pricing power, brand, switching costs, share", why: "Durable advantage protects returns over the long run." },
  { key: "sector_outlook", title: "Sector tailwinds & headwinds — 5–10 yr", why: "A great company in a shrinking pond still struggles." },
  { key: "regulatory", title: "Regulatory risks", why: "Policy shifts can reset the earnings base." },
  { key: "mgmt_track", title: "Management track record — guidance vs delivery, governance flags", why: "Trustworthy, capable management is non-negotiable." },
  { key: "earnings_call", title: "Latest earnings call — key management commentary", why: "Forward-looking colour you won't get from ratios." },
  { key: "peers", title: "3 closest peers — P/E, P/B, ROE, revenue growth, D/E", why: "Relative positioning within the industry." },
  { key: "news", title: "Top 5 recent news items for long-term investors", why: "Structural developments, not daily noise." },
];

export function ResearchChecklist({
  symbolKey,
  links,
}: {
  symbolKey: string;
  links: { label: string; url: string }[];
}) {
  const [notes, setNotes] = useState<Record<string, string>>(() => store.getNotes());

  function update(k: string, v: string) {
    const key = `${symbolKey}::${k}`;
    const next = { ...notes, [key]: v };
    if (!v) delete next[key];
    setNotes(next);
    store.setNotes(next);
  }

  return (
    <div className="checklist">
      <p className="checklist-note">
        These items aren't available from any free API. Open a source, then jot
        your finding — it's saved on this device only.
      </p>
      <div className="checklist-links">
        {links.map((l) => (
          <a key={l.label} href={l.url} target="_blank" rel="noreferrer" className="chip link">
            {l.label} ↗
          </a>
        ))}
      </div>
      {CHECKLIST.map((it) => {
        const key = `${symbolKey}::${it.key}`;
        const val = notes[key] || "";
        return (
          <details key={it.key} className={"cl-item " + (val ? "done" : "")}>
            <summary>
              <span className="cl-check">{val ? "✓" : "○"}</span>
              {it.title}
            </summary>
            <p className="cl-why">{it.why}</p>
            <textarea
              className="cl-note"
              placeholder="Your finding / number / verdict…"
              value={val}
              onChange={(e) => update(it.key, e.target.value)}
            />
          </details>
        );
      })}
    </div>
  );
}
