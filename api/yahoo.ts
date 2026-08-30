// Vercel serverless proxy for Yahoo Finance.
// Browser -> /api/yahoo?path=/v7/finance/quote&symbols=RELIANCE.NS
import { ALLOWED_PREFIXES, yahooFetch } from "./_yahooCore";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const reqUrl = new URL(req.url, "http://localhost");
    const path = reqUrl.searchParams.get("path") || "";
    const debug = reqUrl.searchParams.get("debug") === "1";

    if (!ALLOWED_PREFIXES.some((p) => path.startsWith(p))) {
      return res.status(400).json({ error: "path not allowed", path });
    }
    reqUrl.searchParams.delete("path");
    reqUrl.searchParams.delete("debug");
    const qs = reqUrl.searchParams.toString();

    const { status, body, note } = await yahooFetch(path + (qs ? "?" + qs : ""));

    if (debug) {
      return res.status(200).json({
        upstreamStatus: status,
        note: note ?? null,
        bodyPreview: body.slice(0, 500),
        node: (globalThis as any).process?.version ?? "unknown",
      });
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    // Always surface the upstream status so the client can show a real message.
    return res.status(status).send(body);
  } catch (e) {
    return res
      .status(500)
      .json({ error: String(e), stack: (e as Error)?.stack?.split("\n").slice(0, 4) });
  }
}
