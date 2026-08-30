export function num(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function pct(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const s = v.toFixed(digits);
  return (v > 0 ? "+" : "") + s + "%";
}

// Indian crore / lakh crore formatting for market cap (input in absolute currency).
export function crore(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const cr = v / 1e7;
  if (cr >= 1e5) return "₹" + (cr / 1e5).toFixed(2) + " L Cr";
  if (cr >= 1) return "₹" + cr.toLocaleString("en-IN", { maximumFractionDigits: 0 }) + " Cr";
  return "₹" + v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function signClass(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "";
  if (v > 0) return "up";
  if (v < 0) return "down";
  return "";
}

export function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return s + "s ago";
  const m = Math.round(s / 60);
  if (m < 60) return m + "m ago";
  const h = Math.round(m / 60);
  return h + "h ago";
}

export function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
