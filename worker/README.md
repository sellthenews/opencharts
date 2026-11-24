# OpenCharts Yahoo proxy (Cloudflare Worker)

A narrow GET proxy in front of Yahoo Finance. It is not an open proxy: only
`/v8/finance/chart/{symbol}` and `/v1/finance/search` are allowed, query
parameters are allow-listed, and client cookies or headers are never forwarded.

Do not put `account_id` or secrets in `wrangler.toml`.

## Local tests

From the repository root (no Cloudflare account required):

```bash
npm install
npm run worker:test
```

Optional live listen (also does not require `wrangler login` when used with `--local`):

```bash
npm run worker:dev
# then: curl 'http://127.0.0.1:8787/v8/finance/chart/XRPN?interval=1d&range=1y'
```

## Deploy (after `wrangler login` on this machine)

```bash
cd /workspace/wykresy-strona/worker
npx wrangler deploy
```

The command prints a `https://opencharts-proxy.<account>.workers.dev` URL. Put
that URL into `VITE_STOCKS_PROXY` / `src/config.ts` and ship a new Pages build.
