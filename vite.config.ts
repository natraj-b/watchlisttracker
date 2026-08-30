import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { ALLOWED_PREFIXES, yahooFetch } from "./shared/yahooCore";

// Dev-only middleware that mirrors api/yahoo.ts so `npm run dev` needs no Vercel.
function yahooDevProxy(): Plugin {
  return {
    name: "yahoo-dev-proxy",
    configureServer(server) {
      server.middlewares.use("/api/yahoo", async (req, res) => {
        try {
          const url = new URL(req.url || "", "http://localhost");
          const path = url.searchParams.get("path") || "";
          if (!ALLOWED_PREFIXES.some((p) => path.startsWith(p))) {
            res.statusCode = 400;
            return res.end(JSON.stringify({ error: "path not allowed" }));
          }
          url.searchParams.delete("path");
          const qs = url.searchParams.toString();
          const { status, body } = await yahooFetch(path + (qs ? "?" + qs : ""));
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
