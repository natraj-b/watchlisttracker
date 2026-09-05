# Investment Watchlist

Mobile-first web app to watch Indian stocks & mutual funds and pull up an analysis
view for any of them. Screener.in-style, but yours. All watchlist data stays on
your device (`localStorage`) — no accounts, no server database.

## What it does

- **Stocks watchlist**, three sections:
  - **Non-financial** — shows CMP, day %, P/E (TTM), Forward P/E, 52W range
  - **Financial** — shows CMP, day %, P/B, 52W range
  - **Indices** — Nifty 50, Sensex, Bank Nifty, Nifty IT, and other sector indices
    with a 1-month sparkline
- **Mutual fund screener** — search any Indian scheme, track NAV and 1M/6M/1Y/3Y/5Y
  returns (computed from NAV history), sort by any period
- **Analyse screen** (stock or fund) — live price + chart, valuation & ratios from
  Yahoo, plus a deep-research checklist (the 23-point framework) with one-tap links
  to Screener / Tickertape / Moneycontrol / NSE / BSE and a notes field per item
  that saves on-device
- **Auto-refresh** — every time you open the app or return to the tab it shows
  cached values instantly and refreshes in the background. Quote TTL is 60s during
  NSE hours (09:15–15:30 IST, Mon–Fri), 15m otherwise.
- **Backup & restore (⇅ button, top-right)** — since data lives only in this
  device's browser, "Export as Excel" downloads a `.xlsx` with your stocks, funds,
  and research notes. "Import from Excel" restores it (Merge adds/updates on top
  of what's already there; Replace wipes and reloads from the file). Use this to
  move your watchlist to another device/browser or keep a backup.

## Data sources & honest limits

| Data | Source | Notes |
|---|---|---|
| Price, P/E, Fwd P/E, P/B, market cap, 52W, EPS, index levels | Yahoo Finance (unofficial) via `api/yahoo.ts` proxy | needs the serverless proxy for CORS |
| Some ratios (ROE, D/E, margins, PEG, EV/EBITDA) | Yahoo `quoteSummary` | availability varies by symbol |
| Historical prices / NAV charts | Yahoo / mfapi.in | |
| MF NAV & returns | [mfapi.in](https://www.mfapi.in) (AMFI data) | free, no key, CORS-friendly |
| 5-yr CAGRs, promoter holding/pledging, FII/DII, moat, earnings-call notes, governance, peer tables, sector-avg valuation | **none — not available from any free API** | the Analyse screen deep-links you to the source and lets you record your own finding |

NSE/BSE and Screener/Tickertape have no public API and block scraping from a hosted
site, so the deep-fundamental items are deliberately manual.

This app is for information only. It is **not investment advice** and generates no
buy/sell/valuation verdicts.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173. In dev, Vite proxies `/api/yahoo` straight to Yahoo
(server-to-server, no CORS issue), so the serverless function isn't needed.

To test the real serverless proxy:

```bash
npm i -g vercel
vercel dev
```

## Deploy free (Vercel)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/natraj-b/watchlisttracker)

**Dashboard (recommended):**

1. Open <https://vercel.com/new> and sign in with GitHub
2. Import the **watchlisttracker** repo
3. Framework preset auto-detects as **Vite** — leave every default, click **Deploy**
4. ~1 min later you get a live `https://<name>.vercel.app` URL

No environment variables. `api/yahoo.ts` deploys automatically as a serverless
function. Every `git push` to `main` redeploys. Open the URL on your phone and
"Add to Home Screen" for a PWA-style app.

**Or via CLI:**

```bash
npm i -g vercel
vercel        # first run links the project and logs you in
vercel --prod # deploy to the production URL
```

GitHub Pages is *not* an option on its own — it serves static files only and
can't run `api/yahoo.ts`, which is required for stock/index data.

## Adding an index

Edit `src/lib/symbols.ts` → `INDICES`. Use the Yahoo symbol (check it resolves at
`https://query1.finance.yahoo.com/v8/finance/chart/<SYMBOL>` first).

## Structure

```
api/yahoo.ts            serverless proxy (CORS + path whitelist)
src/lib/                 yahoo, mfapi, cache (SWR), storage, symbols, format
src/components/          rows, cards, chart, sparkline, sheets, checklist
src/routes/              Watchlist, MutualFunds, Analyse (stock / fund)
```
