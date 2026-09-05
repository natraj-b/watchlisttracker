// Self-contained Vercel serverless proxy for NSE India's public index feed.
// Yahoo Finance doesn't provide P/E or P/B for index-type symbols at all, but
// NSE publishes exactly that for ~150 of its own indices at this endpoint.
//
//   /api/nse?path=allIndices
//
// Unlike the Yahoo proxy this needs no cookie/crumb dance — a plain browser
// User-Agent is enough. Still whitelisted and defensive in the same style.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

const ALLOWED = new Set(["allIndices"]);

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    const url = new URL(req.url, "http://localhost");
    const path = url.searchParams.get("path") || "";
    if (!ALLOWED.has(path)) {
      res.status(400).json({ error: "path not allowed", path });
      return;
    }

    const upstream = await fetch(`https://www.nseindia.com/api/${path}`, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        Referer: "https://www.nseindia.com/market-data/live-equity-market",
      },
    }).catch((e) => {
      throw new Error(`network: ${String(e)}`);
    });

    const body = await upstream.text();
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=600");
    res.status(upstream.status).send(body);
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
}
