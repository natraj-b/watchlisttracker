import { clockTime, timeAgo } from "../lib/format";
import { isMarketHoursIST } from "../lib/cache";

interface Props {
  fetchedAt: number | null;
  busy: boolean;
  onRefresh: () => void;
}

export function RefreshBar({ fetchedAt, busy, onRefresh }: Props) {
  const open = isMarketHoursIST();
  // Flag data that's older than a refresh cycle should have produced, so a
  // silently-failing background refresh doesn't look like live numbers.
  const staleAfter = open ? 5 * 60_000 : 60 * 60_000;
  const stale =
    fetchedAt != null && !busy && Date.now() - fetchedAt > staleAfter;

  return (
    <div className="refreshbar">
      <span className={"mkt " + (open ? "open" : "closed")}>
        {open ? "● Market open" : "○ Market closed"}
      </span>
      <span className={"upd" + (stale ? " stale" : "")}>
        {fetchedAt
          ? `${stale ? "⚠ " : ""}Updated ${clockTime(fetchedAt)} · ${timeAgo(fetchedAt)}`
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
