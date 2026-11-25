# OpenCharts data proxy (Cloudflare Worker)

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

The frontend talks to official public endpoints first (they currently send
`Access-Control-Allow-Origin: *`). The Worker is only a fallback when a
browser, extension, or rate limit blocks those hosts. A 404 from an older
Worker is turned into a clear “proxy not updated yet” status in the app; the
chart starts working automatically after this Worker is redeployed.

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

This cannot be done from a machine that is not logged in to the OpenCharts
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
