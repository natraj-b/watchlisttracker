// Shared Yahoo Finance fetch core: handles the cookie + "crumb" auth that
// /v7/finance/quote and /v10/finance/quoteSummary now require. Used by both the
// Vercel serverless function (api/yahoo.ts) and the Vite dev middleware.

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

async function ensureAuth(force = false): Promise<void> {
  if (!force && crumb && Date.now() - authAt < 25 * 60_000) return;
  // 1. Hit a Yahoo endpoint that sets the session cookie.
  const seed = await fetch("https://fc.yahoo.com", {
    headers: { "User-Agent": UA },
    redirect: "manual",
  }).catch(() => null);
  const setCookie: string[] =
    (seed as any)?.headers?.getSetCookie?.() ??
    (seed?.headers.get("set-cookie") ? [seed.headers.get("set-cookie") as string] : []);
  if (setCookie.length) {
    cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  }
  // 2. Exchange the cookie for a crumb.
  const cr = await fetch(
    "https://query2.finance.yahoo.com/v1/test/getcrumb",
    { headers: { "User-Agent": UA, ...(cookie ? { Cookie: cookie } : {}) } }
  );
  const text = (await cr.text()).trim();
  crumb = text && !text.startsWith("<") ? text : null;
  authAt = Date.now();
}

export interface CoreResult {
  status: number;
  body: string;
}

export async function yahooFetch(pathWithQuery: string): Promise<CoreResult> {
  const doFetch = async (): Promise<CoreResult> => {
    let last: CoreResult = { status: 502, body: '{"error":"no upstream"}' };
    for (const host of HOSTS) {
      const u = new URL(host + pathWithQuery);
      if (NEEDS_CRUMB.test(u.pathname) && crumb) u.searchParams.set("crumb", crumb);
      try {
        const r = await fetch(u, {
          headers: {
            "User-Agent": UA,
            Accept: "application/json",
            ...(cookie ? { Cookie: cookie } : {}),
          },
        });
        const body = await r.text();
        last = { status: r.status, body };
        if (r.ok) return last;
      } catch (e) {
        last = { status: 502, body: JSON.stringify({ error: String(e) }) };
      }
    }
    return last;
  };

  await ensureAuth();
  let res = await doFetch();
  if (res.status === 401 || res.status === 403) {
    await ensureAuth(true);
    res = await doFetch();
  }
  return res;
}

export { UA };
