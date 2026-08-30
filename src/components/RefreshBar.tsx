import { clockTime, timeAgo } from "../lib/format";
import { isMarketHoursIST } from "../lib/cache";

interface Props {
  fetchedAt: number | null;
  busy: boolean;
  onRefresh: () => void;
}

export function RefreshBar({ fetchedAt, busy, onRefresh }: Props) {
  const open = isMarketHoursIST();
  return (
    <div className="refreshbar">
      <span className={"mkt " + (open ? "open" : "closed")}>
        {open ? "● Market open" : "○ Market closed"}
      </span>
      <span className="upd">
        {fetchedAt
          ? `Updated ${clockTime(fetchedAt)} · ${timeAgo(fetchedAt)}`
          : busy
            ? "Loading…"
            : "—"}
      </span>
      <button className="btn-refresh" onClick={onRefresh} disabled={busy}>
        {busy ? "…" : "↻"}
      </button>
    </div>
  );
}
