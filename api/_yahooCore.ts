// Shared Yahoo Finance fetch core: handles the cookie + "crumb" auth that
// /v7/finance/quote and /v10/finance/quoteSummary now require. Used by both the
// Vercel serverless function (api/yahoo.ts) and the Vite dev middleware.
//
// Everything here is defensive: no path may throw. On any failure we still
// return the last upstream {status, body} so the caller can react.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

const HOSTS = [
  "https://query1.finance.yahoo.com",
  "https://query2.finance.yahoo.com",
];

const NEEDS_CRUMB =
  /^\/(v7\/finance\/quote|v10\/finance\/quoteSummary|v1\/finance\/search)/;

export const ALLOWED_PREFIXES = [
  "/v8/finance/chart/",
  "/v7/finance/quote",
  "/v10/finance/quoteSummary/",
  "/v1/finance/search",
];

let cookie: string | null = null;
let crumb: string | null = null;
let authAt = 0;
export const authLog: string[] = [];

function log(m: string) {
  authLog.length = 0;
  authLog.push(m);
}

async function safeFetch(
  url: string,
  init?: RequestInit
): Promise<Response | null> {
  try {
    return await fetch(url, init);
  } catch (e) {
    log(`fetch failed ${url}: ${String(e)}`);
    return null;
  }
}

function readSetCookie(r: Response | null): string[] {
  if (!r) return [];
  const h: any = r.headers;
  if (typeof h.getSetCookie === "function") {
    try {
      return h.getSetCookie();
    } catch {
      /* fall through */
    }
  }
  const one = r.headers.get("set-cookie");
  return one ? [one] : [];
}

async function ensureAuth(force = false): Promise<void> {
  if (!force && crumb && Date.now() - authAt < 25 * 60_000) return;
  authAt = Date.now();

  // Try a few known cookie-seeding endpoints.
  const seeds = [
    "https://fc.yahoo.com",
    "https://finance.yahoo.com",
    "https://login.yahoo.com",
  ];
  for (const s of seeds) {
    const r = await safeFetch(s, {
      headers: { "User-Agent": UA },
      redirect: "manual",
    });
    const sc = readSetCookie(r);
    if (sc.length) {
      cookie = sc
        .map((c) => c.split(";")[0])
        .filter((c) => /=/.test(c))
        .join("; ");
      if (cookie) break;
    }
  }

  // Exchange the cookie for a crumb (works even without a cookie sometimes).
  const cr = await safeFetch(
    "https://query1.finance.yahoo.com/v1/test/getcrumb",
    { headers: { "User-Agent": UA, ...(cookie ? { Cookie: cookie } : {}) } }
  );
  if (cr && cr.ok) {
    const text = (await cr.text().catch(() => "")).trim();
    crumb = text && text.length < 40 && !text.includes("<") ? text : null;
  } else {
    crumb = null;
  }
  log(
    `auth: cookie=${cookie ? "yes" : "no"} crumb=${crumb ? "yes" : "no"} ` +
      `getcrumbStatus=${cr?.status ?? "n/a"}`
  );
}

export interface CoreResult {
  status: number;
  body: string;
  note?: string;
}

async function doFetch(pathWithQuery: string): Promise<CoreResult> {
  let last: CoreResult = { status: 502, body: '{"error":"no upstream"}' };
  for (const host of HOSTS) {
    let u: URL;
    try {
      u = new URL(host + pathWithQuery);
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

export async function yahooFetch(pathWithQuery: string): Promise<CoreResult> {
  try {
    await ensureAuth();
    let res = await doFetch(pathWithQuery);
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      await ensureAuth(true);
      res = await doFetch(pathWithQuery);
    }
    return { ...res, note: authLog[0] };
  } catch (e) {
    return { status: 500, body: JSON.stringify({ error: String(e) }), note: authLog[0] };
  }
}

export { UA };
