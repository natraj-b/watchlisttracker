// Self-contained Vercel serverless proxy for Yahoo Finance.
// No local imports on purpose — keeps @vercel/node bundling trivial.
//
//   /api/yahoo?path=/v7/finance/quote&symbols=RELIANCE.NS
//   /api/yahoo?path=/v8/finance/chart/RELIANCE.NS&range=1y&interval=1d
//   append &debug=1 to see what Yahoo returned from this server's IP

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

const HOSTS = [
  "https://query1.finance.yahoo.com",
  "https://query2.finance.yahoo.com",
];

const ALLOWED_PREFIXES = [
  "/v8/finance/chart/",
  "/v7/finance/quote",
  "/v10/finance/quoteSummary/",
  "/v1/finance/search",
  "/ws/fundamentals-timeseries/",
];

const NEEDS_CRUMB =
  /^\/(v7\/finance\/quote|v10\/finance\/quoteSummary|v1\/finance\/search|ws\/fundamentals-timeseries)/;

let cookie: string | null = null;
let crumb: string | null = null;
let authAt = 0;
let authNote = "";

async function safeFetch(url: string, init?: any): Promise<any> {
  try {
    return await fetch(url, init);
  } catch (e) {
    authNote = `fetch error: ${String(e)}`;
    return null;
  }
}

function setCookiesOf(r: any): string[] {
  if (!r) return [];
  try {
    if (typeof r.headers?.getSetCookie === "function") return r.headers.getSetCookie();
  } catch {
    /* ignore */
  }
  const one = r?.headers?.get?.("set-cookie");
  return one ? [one] : [];
}

async function ensureAuth(force: boolean): Promise<void> {
  if (!force && crumb && Date.now() - authAt < 25 * 60_000) return;
  authAt = Date.now();

  for (const seed of [
    "https://fc.yahoo.com",
    "https://finance.yahoo.com",
  ]) {
    const r = await safeFetch(seed, {
      headers: { "User-Agent": UA },
      redirect: "manual",
    });
    const sc = setCookiesOf(r);
    if (sc.length) {
      cookie = sc
        .map((c: string) => c.split(";")[0])
        .filter((c: string) => c.includes("="))
        .join("; ");
      if (cookie) break;
    }
  }

  const cr = await safeFetch(
    "https://query1.finance.yahoo.com/v1/test/getcrumb",
    { headers: { "User-Agent": UA, ...(cookie ? { Cookie: cookie } : {}) } }
  );
  if (cr && cr.ok) {
    const t = (await cr.text().catch(() => "")).trim();
    crumb = t && t.length < 40 && !t.includes("<") ? t : null;
  } else {
    crumb = null;
  }
  authNote = `cookie=${cookie ? "y" : "n"} crumb=${crumb ? "y" : "n"} getcrumb=${
    cr ? cr.status : "n/a"
  }`;
}

async function callYahoo(pathAndQuery: string): Promise<{ status: number; body: string }> {
  let last = { status: 502, body: '{"error":"no upstream"}' };
  for (const host of HOSTS) {
    let u: URL;
    try {
      u = new URL(host + pathAndQuery);
    } catch (e) {
      return { status: 400, body: JSON.stringify({ error: String(e) }) };
    }
    if (NEEDS_CRUMB.test(u.pathname) && crumb) u.searchParams.set("crumb", crumb);
    const r = await safeFetch(u.toString(), {
      headers: {
        "User-Agent": UA,
        Accept: "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
    });
    if (!r) {
      last = { status: 502, body: '{"error":"network"}' };
      continue;
    }
    const body = await r.text().catch(() => "");
    last = { status: r.status, body };
    if (r.ok) return last;
  }
  return last;
}

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
    const debug = url.searchParams.get("debug") === "1";

    if (!ALLOWED_PREFIXES.some((p) => path.startsWith(p))) {
      res.status(400).json({ error: "path not allowed", path });
      return;
    }
    url.searchParams.delete("path");
    url.searchParams.delete("debug");
    const qs = url.searchParams.toString();
    const pathAndQuery = path + (qs ? "?" + qs : "");

    try {
      await ensureAuth(false);
    } catch (e) {
      authNote = `ensureAuth threw: ${String(e)}`;
    }

    let result = await callYahoo(pathAndQuery);
    if ([401, 403, 429].includes(result.status)) {
      try {
        await ensureAuth(true);
      } catch {
        /* ignore */
      }
      result = await callYahoo(pathAndQuery);
    }

    if (debug) {
      res.status(200).json({
        upstreamStatus: result.status,
        authNote,
        bodyPreview: result.body.slice(0, 600),
        node: (globalThis as any).process?.version ?? "?",
      });
      return;
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    res.status(result.status).send(result.body);
  } catch (e) {
    res.status(500).json({
      error: String(e),
      stack: (e as Error)?.stack?.split("\n").slice(0, 5),
    });
  }
}
