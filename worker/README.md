# Swapwick data proxy (Cloudflare Worker)

A narrow proxy in front of Yahoo Finance and optional DEX fallbacks. It is not
an open proxy:

- Yahoo: only `GET /v8/finance/chart/{symbol}` and `GET /v1/finance/search`,
  with allow-listed query parameters. Upstream responses must be JSON.
- DEX / GeckoTerminal: only `GET /dex/gt/…` on an allow-listed path
  (`/search/pools`, `/networks/{network}`, `/networks/{network}/trending_pools`,
  `/networks/{network}/pools/{address}`, and
  `/networks/{network}/pools/{address}/ohlcv/{minute|hour|day}`).
- DEX / ledgers: only `POST /dex/rpc/xrpl` and `POST /dex/rpc/xahau`, and only
  the read-only methods `amm_info`, `account_tx`, `book_offers`, `ledger`,
  `server_info`, and `account_info`. `submit`, `sign`, and any other method are
  rejected with 403. Upstream hosts are the official public nodes
  (`https://xrplcluster.com/`, `https://s2.ripple.com:51234/`,
  `https://xahau.network/`, `https://xahau.org/`).

Client cookies and headers are never forwarded. CORS is limited to the GitHub
Pages origin and local Vite preview/dev origins (not `*`). Each client IP is
limited to 60 requests per minute inside one Worker isolate.

DEX pool data (`/dex/gt/…`) goes through this Worker first, and the browser only
falls back to the keyless public GeckoTerminal API if the Worker fails. Ledger
RPC still goes browser-first to the official nodes with this Worker as fallback.
A 404 from an older Worker is turned into a clear “proxy not updated yet” status.

## Shared cache and CoinGecko Demo key

- Optional secret `COINGECKO_DEMO_KEY` (`wrangler secret put COINGECKO_DEMO_KEY`;
  never in `wrangler.toml`, git, logs or chat). With it, a cache miss on
  `/dex/gt/…` is fetched from `https://api.coingecko.com/api/v3/onchain/…` with the
  `x-cg-demo-api-key` header. Without it, or on any CoinGecko error (401, 403, 429,
  5xx, budget exhausted), the Worker uses keyless GeckoTerminal. After a CoinGecko
  error it skips CoinGecko for 15 s to 60 min (per isolate), at most 4 CoinGecko calls run at once and 40 per minute, and fallbacks are marked with `X-Swapwick-Fallback`.
- Demo plan limit: CoinGecko Demo only returns the last 180 days of OHLCV. Pages older than
  175 days (`before_timestamp`) skip CoinGecko and go to keyless GeckoTerminal (no credit spent);
  a plan-limit 401 only falls back for that request and does not block the key.
- Credit guard: `worker/market.ts` counts every CoinGecko call per UTC day in D1
  (`api_budget`, created on first use; `migrations/0002_api_budget.sql` is optional).
  Hard stops: 300 per day and 9,000 per month (Demo plan is 10,000). Lists and search
  stop at 150 per day so charts keep priority. Without D1 an in-memory guard of 100
  per isolate per day is used.
- Cache API TTLs (seconds, shared by all users; stretched 2x at 50% and 4x at 80% of
  the daily budget, 2x when CoinGecko is not serving):
  OHLCV 1m 60 · 5m 60 (last bars) / 120 (full) · 15m 120 / 300 · 1h 300 / 600 ·
  4h 600 / 900 · 1D 600 / 1800; older pages (`before_timestamp`) 1 to 6 h;
  pool detail 120; pool lists 300; search 600.
  Yahoo by interval: 1m 30 · 2m–5m 60 · 15m–30m 120 · 1h 300 · 1d 300 ·
  1wk/1mo 900; ranges 1d/5d 60; older pages 3600.
  Ledger RPC reads: `server_info`/`ledger` 10, `amm_info`/`book_offers`/`account_info` 15,
  `account_tx` 60, requests pinned to a past ledger 3600. Errors are never cached.
- Browsers only reuse live data for 30 s (DEX) or 60 s (Yahoo) so polling stays fresh.
- Cache hits are not counted toward the 60 requests/min/IP limit.
- Responses carry `X-Swapwick-Cache: HIT|MISS` and `X-Swapwick-Upstream: coingecko|geckoterminal`.
- Data from CoinGecko must be credited: the site footer links to coingecko.com.

Changes in this Worker are not live until the owner deploys them with wrangler.

Do not put `account_id` or secrets in `wrangler.toml`.

## Local tests

From the repository root (no Cloudflare account required):

```bash
npm install
npm run worker:test
```

Optional live listen (also does not require `wrangler login` when used with
`--local`):

```bash
npm run worker:dev
# Yahoo:  curl 'http://127.0.0.1:8787/v8/finance/chart/XRPN?interval=1d&range=1y'
# DEX:    curl -X POST http://127.0.0.1:8787/dex/rpc/xrpl \
#            -H 'Content-Type: application/json' \
#            -d '{"method":"amm_info","params":[{"amm_account":"rhWTXC2m2gGGA9WozUaoMm6kLAVPb1tcS3"}]}'
```

## Deploy (needs the operator's Cloudflare login)

This cannot be done from a machine that is not logged in to the Swapwick
Cloudflare account. After `wrangler login` on the operator's machine:

```bash
cd worker
npx wrangler deploy
```

Confirm the script name is still `opencharts-proxy` (see `wrangler.toml`).
The public URL stays `https://opencharts-proxy.opencharts.workers.dev`
(account workers.dev subdomain `opencharts`). The app default in `src/config.ts`
already points at this URL, so no frontend rebuild is required after a
same-name deploy. You do not need to set or commit `account_id`; Wrangler
fills it on the logged-in machine.

After deploy, a previously 404 `/dex/gt/…` or `/dex/rpc/…` path should return
the upstream JSON (or a 403 for a disallowed method), and the DEX chart will
use the proxy when a direct official request fails.

## Accounts and drawing sync

When D1 (`DB`) and KV (`ACCOUNTS`) bindings are configured, this same Worker
also serves `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`,
`GET /auth/me`, GitHub/Google OAuth (`/auth/github`, `/auth/google` and their
callbacks), `GET /sync` and `PUT /sync`. Without those bindings the routes
return 503 and the site keeps using localStorage only.

Do not put OAuth client secrets or `SESSION_SECRET` in this file or in
`wrangler.toml`. The operator steps (OAuth app registration, D1, KV, secrets
and deploy) are in `docs/ACCOUNTS-SETUP.md` (Polish).
