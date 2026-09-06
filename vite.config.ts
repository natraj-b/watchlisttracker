import { execSync } from "node:child_process";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Build identifier shown in the header — derived from git so it can't go stale.
function gitInfo() {
  try {
    const count = execSync("git rev-list --count HEAD").toString().trim();
    const sha = execSync("git rev-parse --short HEAD").toString().trim();
    return { build: count, commit: sha };
  } catch {
    return { build: "dev", commit: "local" };
  }
}

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

// Dev-only middleware mirroring api/nse.ts.
function nseDevProxy(): Plugin {
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";
  const ALLOWED = new Set(["allIndices"]);

  return {
    name: "nse-dev-proxy",
    configureServer(server) {
      server.middlewares.use("/api/nse", async (req, res) => {
        try {
          const u = new URL(req.url || "", "http://localhost");
          const path = u.searchParams.get("path") || "";
          if (!ALLOWED.has(path)) {
            res.statusCode = 400;
            return res.end('{"error":"path not allowed"}');
          }
          const r = await fetch(`https://www.nseindia.com/api/${path}`, {
            headers: {
              "User-Agent": UA,
              Accept: "application/json",
              Referer: "https://www.nseindia.com/market-data/live-equity-market",
            },
          }).catch(() => null);
          res.statusCode = r?.status ?? 502;
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.end(r ? await r.text() : '{"error":"network"}');
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
    },
  };
}

const { build, commit } = gitInfo();

export default defineConfig({
  define: {
    __BUILD__: JSON.stringify(build),
    __COMMIT__: JSON.stringify(commit),
  },
  plugins: [
    react(),
    yahooDevProxy(),
    nseDevProxy(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png"],
      // Service worker is a production-only concern; `npm run dev` keeps using
      // the plain dev proxies with no SW interception.
      devOptions: { enabled: false },
      manifest: {
        name: "Investment Watchlist",
        short_name: "Watchlist",
        description:
          "Watch Indian stocks & mutual funds, with a Screener-style analysis view for any of them.",
        start_url: "/",
        display: "standalone",
        background_color: "#0b0d10",
        theme_color: "#0b0d10",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "pwa-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Our own serverless proxies (Yahoo quotes / NSE index ratios):
            // serve fresh when online, fall back to the last response offline.
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "api",
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.hostname === "api.mfapi.in",
            handler: "NetworkFirst",
            options: {
              cacheName: "mfapi",
              networkTimeoutSeconds: 6,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
