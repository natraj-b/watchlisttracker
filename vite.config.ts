import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Dev-only middleware mirroring api/yahoo.ts so `npm run dev` needs no Vercel.
// Kept as its own small copy so api/yahoo.ts can stay import-free (simpler
// serverless bundling).
function yahooDevProxy(): Plugin {
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";
  const HOSTS = [
    "https://query1.finance.yahoo.com",
    "https://query2.finance.yahoo.com",
  ];
  const ALLOWED = [
    "/v8/finance/chart/",
    "/v7/finance/quote",
    "/v10/finance/quoteSummary/",
    "/v1/finance/search",
  ];
  const NEEDS_CRUMB =
    /^\/(v7\/finance\/quote|v10\/finance\/quoteSummary|v1\/finance\/search)/;
  let cookie: string | null = null;
  let crumb: string | null = null;

  async function ensureAuth() {
    if (crumb) return;
    const r = await fetch("https://fc.yahoo.com", {
      headers: { "User-Agent": UA },
      redirect: "manual",
    }).catch(() => null);
    const sc = (r as any)?.headers?.getSetCookie?.() ?? [];
    if (sc.length) cookie = sc.map((c: string) => c.split(";")[0]).join("; ");
    const cr = await fetch(
      "https://query1.finance.yahoo.com/v1/test/getcrumb",
      { headers: { "User-Agent": UA, ...(cookie ? { Cookie: cookie } : {}) } }
    ).catch(() => null);
    if (cr && cr.ok) {
      const t = (await cr.text()).trim();
      crumb = t && t.length < 40 && !t.includes("<") ? t : null;
    }
  }

  return {
    name: "yahoo-dev-proxy",
    configureServer(server) {
      server.middlewares.use("/api/yahoo", async (req, res) => {
        try {
          const u = new URL(req.url || "", "http://localhost");
          const path = u.searchParams.get("path") || "";
          if (!ALLOWED.some((p) => path.startsWith(p))) {
            res.statusCode = 400;
            return res.end('{"error":"path not allowed"}');
          }
          u.searchParams.delete("path");
          u.searchParams.delete("debug");
          const qs = u.searchParams.toString();
          await ensureAuth();
          let body = "";
          let status = 502;
          for (const host of HOSTS) {
            const y = new URL(host + path + (qs ? "?" + qs : ""));
            if (NEEDS_CRUMB.test(y.pathname) && crumb)
              y.searchParams.set("crumb", crumb);
            const yr = await fetch(y.toString(), {
              headers: {
                "User-Agent": UA,
                Accept: "application/json",
                ...(cookie ? { Cookie: cookie } : {}),
              },
            }).catch(() => null);
            if (!yr) continue;
            body = await yr.text();
            status = yr.status;
            if (yr.ok) break;
          }
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.end(body);
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), yahooDevProxy()],
});
