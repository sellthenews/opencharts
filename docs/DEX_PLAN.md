# Swapwick DEX plan: XRPL and Xahau with Xaman (WSSZ-15)

Status: **plan only**. Nothing here is built yet. Written 2026-11-26.

Goal: Swapwick becomes the best front end to the built-in DEX on the XRP Ledger (XRPL) and on Xahau.
Only one wallet is supported: Xaman, on both networks. The rest of the site (crypto charts from exchanges,
stocks) stays as it is. A clear "DEX" button in the header switches the site into DEX mode.
Ethereum, Solana and the other GeckoTerminal chains leave the DEX for now.

## 1. Principles (do not change without a decision)

- **Non-custodial.** Swapwick never holds funds, never sees a seed or private key, and never signs.
  Every transaction is built in the browser as plain JSON and signed by the user inside Xaman.
- **No keys on the site.** The Xaman API key is public by design (it is the OAuth2 `client_id`).
  The Xaman API **secret** is never needed for the MVP. If a later phase needs it, it lives only as
  a Cloudflare Worker secret and never in the repo, chat, `wrangler.toml` or logs.
- **Same liquidity as everyone else.** XRPL and Xahau each have one on-ledger DEX. Magnetic,
  XPMarket, Sologenic and FirstLedger are front ends to that same order book (and, on XRPL, the
  same AMM pools). We win on speed, clarity, charts and safety, not on "more liquidity".
- **Free and open source (AGPL).** Fees are a separate decision (section 8).
- **Ledger is the source of truth.** Indexers are only for lists and history; balances, offers and
  results always come from validated ledger data.

## 2. Facts from primary sources

### Xaman (docs.xaman.dev)

- Browser sign-in works **without a backend**: Xumm/Xaman SDK (`xumm` npm package, PKCE flow via
  `xumm-oauth2-pkce`). It uses only the **API key** as `client_id`. Desktop shows a QR code,
  mobile deep-links into Xaman and back.
- Sign-in returns the r-address, network the user is on, and a **JWT valid 24 h** (not
  refreshable). With that JWT the browser can create sign requests (payloads) for that user.
- Return/redirect URLs must be listed in the Xaman Developer Console (`apps.xaman.dev`) under
  "Origin/Redirect URIs" for the app: `https://swapwick.com/` (and the TWA/PWA start URL).
- PKCE caveat (from the docs): on mobile it only works if the user returns to the **same browser**
  it started in. The implicit flow works across browsers but is weaker; we stay on PKCE and show a
  clear "open in your normal browser" hint for in-app browsers (X, Telegram, ...).
- Networks: a payload can force the network with `options.force_network` (`MAINNET`, `XAHAU`,
  `TESTNET`, `XAHAUTESTNET`). If the tx has a `NetworkID`, Xaman asks the user to switch to it.
  We always check the network in the signed result before showing "done".
- xApps (Swapwick running *inside* Xaman) are a separate track: they need their own app setup and
  listing by XRPL Labs. Not in the MVP; candidate for v2.
- Platform terms and limits for developer apps must be checked by Mateusz in the console at signup
  (the free-tier limits are not stated on the pages we read).

### Xahau (xahau.network/docs)

- Mainnet NetworkID **21337** (testnet 21338). `NetworkID` is **required** on every Xahau tx and
  must be **omitted** on XRPL mainnet.
- Public RPC: `https://xahau.network` and alias `https://xahau.org` (HTTP POST), `wss://xahau.network`.
- Xahau keeps the XRPL **order-book DEX** (OfferCreate/OfferCancel, tfPassive, tfImmediateOrCancel,
  tfFillOrKill, tfSell) and cross-currency payments with pathfinding, with XAH as the bridge.
- **No AMM on Xahau**: the AMM amendment is marked obsolete there and was never enabled.
  So AMMCreate/AMMDeposit/AMMWithdraw are XRPL-only.
- Xahau has Hooks (account smart contracts). Tokens on an account with a Hook can behave differently
  (e.g. reject or tax transfers). We show a "Hook on issuer" badge and warn.
- Data for lists and history: public Data API by INFTF (`data.xahau.network`, CORS open; exchange
  rates, exchanges, market and ticker data for IOU pairs) and the independent XahauIndex API
  (`xahauindex.dev`; token list with name, icon, holders, trust count, `domain_verified` from
  `xahau.toml`, candles and trades). Both are third-party: cache through our Worker, never trust them
  for balances.

### XRPL (xrpl.org)

- Transactions we need: `OfferCreate`, `OfferCancel`, `TrustSet`, `Payment` (cross-currency with
  `SendMax`, `Paths` from `ripple_path_find`/`path_find`), `AMMDeposit`, `AMMWithdraw`,
  `AMMCreate`, `AMMVote` (optional), `AccountSet` is not needed.
- Reads: `book_offers`, `amm_info`, `account_lines`, `account_offers`, `account_info`, `account_tx`,
  `ripple_path_find`, `ledger`. Our Worker already proxies and caches the read-only ones
  (`amm_info`, `book_offers`, `account_info`, `account_tx`, `ledger`, `server_info`).
- Safety: never trust `Amount` on incoming payments with `tfPartialPayment`; always read
  `meta.delivered_amount`. Every tx gets `LastLedgerSequence` (current + ~20) so it expires
  instead of hanging.

## 3. Competitors (public pages) and their gaps

| | Magnetic | XPMarket | Sologenic | FirstLedger | Swapwick target |
|---|---|---|---|---|---|
| XRPL order book + limit orders | yes | yes | yes | yes (fast terminal) | yes |
| XRPL swap with routing | yes | yes | yes | yes | yes |
| XRPL AMM deposit/withdraw | yes | yes | partly | yes | v2 |
| Xahau DEX | yes | no (XRPL only) | no | no | **yes, first class** |
| Wallets | many | Xaman, Ledger, MetaMask Snap, Crossmark, GemWallet, WalletConnect | many | Xaman + Telegram bot | Xaman only |
| Charting | basic | basic/medium | medium | basic | **best: our full chart engine, drawings, indicators, alerts** |
| Extras | farming, dice, bridge, NFT | NFT, token analytics, ETF tracking | tokenised assets, Coreum bridge | Telegram bot, launches | no gambling, no launches |
| Open source | no | no | partly | no | **yes, AGPL** |
| Fees | own fees on some features | own fees on some features | own fees | bot fees | free (decision) |

Gaps we can fill: Xahau is weak everywhere except Magnetic; nobody combines a real chart workstation
with the DEX; scam-token protection (issuer verification, Hook and blackhole badges, freeze/clawback
flags) is thin; most UIs are crowded with games and launches; none is open source.

## 4. Product shape

- Header button **"DEX"** (prominent, accent colour). Click switches the whole site into DEX mode:
  network tabs **XRPL | Xahau**, pair list only from those two ledgers, order panel on the right,
  "Connect Xaman" in the header. Click again (or "Charts") goes back to normal mode.
  The mode and the network are remembered; URL `/?dex=xrpl&pair=...` is shareable.
- Pairs:
  - XRPL: everything we have today (AMM pools + order books), ranked by liquidity.
  - Xahau: every token with real order-book depth **vs XAH**, **vs XRP** (where an XRP IOU exists)
    and **vs USD** stable IOUs. List built from the indexer, filtered by live `book_offers` depth.
- Remove the GeckoTerminal chains from the DEX picker (data code stays for later).

## 5. Phased roadmap

Effort is in focused work sessions of roughly a day each for one developer (me).

### Phase 0: setup (Mateusz, about 15 minutes)
See section 7. Nothing can be signed before the Xaman app exists.

### Phase 1, MVP (about 5 to 7 sessions)
1. DEX mode button, XRPL/Xahau tabs, ETH and others removed from the DEX picker. (1)
2. Xahau pair discovery: indexer list, cached in the Worker for 10 to 30 min, verified depth with
   `book_offers`, issuer badges (domain verified, blackholed, Hook, freeze). (1 to 2)
3. Xaman connect (PKCE), account panel: XRP/XAH balance, reserve, trustlines, open offers. (1)
4. Trading: limit buy/sell (OfferCreate), market buy/sell (OfferCreate + tfImmediateOrCancel with a
   slippage cap), cancel (OfferCancel), add trustline (TrustSet) when needed. Every order shows a
   plain preview: you pay, you get at most/at least, fee, reserve impact, network. (2)
5. Result tracking: wait for the validated tx, show success/failure with an explorer link, check the
   signed network matches. (included above)
6. Tests: unit tests for tx builders (amounts, drops, hex currency codes, NetworkID rules), e2e with a
   mocked Xaman, one manual test on XRPL Testnet and Xahau Testnet. (1)

### Phase 2, v2 (about 6 to 10 sessions)
- Swap screen with pathfinding (`ripple_path_find`, Payment with SendMax/DeliverMin), best route across
  book and AMM on XRPL.
- XRPL AMM: pool page, deposit/withdraw (AMMDeposit/AMMWithdraw), LP position and fees earned,
  optional AMMVote. AMMCreate behind an "advanced" switch.
- Order book depth chart, trade tape, my trade history with P/L, alerts on fills.
- Xaman xApp version (same code, xApp environment).
- Price alerts tied to pairs; "watch issuer" warnings (freeze, clawback, Hook change).

### Later ideas
Hooks-aware features on Xahau, cross-chain XRPL<->Xahau transfers via existing bridges (only if a
trusted, audited bridge exists), more wallets if Mateusz changes the "Xaman only" rule.

## 6. Usage and cost estimates

- Xaman: one sign-in per user per day (JWT 24 h) plus one payload per transaction. No server needed.
- Worker (Cloudflare free plan, 100k requests/day): pair lists and indexer data cached 10 to 30 min,
  ledger reads cached 3 to 15 s and shared through the Cache API. Rough load for 1,000 daily DEX users:
  20k to 40k Worker requests per day, so the free plan is enough at first.
- Ledger RPC: browser-first to public nodes (as today), Worker only as fallback, so we stay under public
  node rate limits.
- No new paid services needed for the MVP.

## 7. What Mateusz must do himself

1. Create a Xaman developer app at **apps.xaman.dev** (sign in with his own Xaman): name "Swapwick",
   website `https://swapwick.com`, icon, and in "Origin/Redirect URIs" add `https://swapwick.com/`.
   Read and accept the platform terms.
2. Give me only the **API key** (public `client_id`). Easiest and safe: store it as a Cloudflare
   Worker secret or variable (`XAMAN_API_KEY`) in the dashboard, or put it in the box secrets folder.
   **The API secret must not be sent in chat**; the MVP does not need it at all.
3. Make 2 or 3 small test trades on XRPL and Xahau testnets with his Xaman when the MVP is ready
   (Xaman lets you switch network in settings).
4. Decide the three questions in section 8.

## 8. Decisions for Mateusz (max 3)

1. **Fees:** stay 100% free (recommended at launch), or add an optional small fee later.
   Caution: a fee needs a second Payment the user signs (or a Hook on Xahau), and charging for
   transmitting orders can bring EU crypto rules (MiCA) into play even for a non-custodial front end.
   Ask a lawyer before any fee. We never custody funds either way.
2. **Xahau pair scope:** list every token with any order (complete, but many scam/dead tokens), or only
   tokens with a verified issuer domain or minimum depth by default with "show all" behind a warning
   (recommended).
3. **Scope of v1:** order book only (limit/market/cancel) on both ledgers first, AMM and swap routing in
   v2 (recommended), or wait longer and ship everything together.

## 9. Security checklist

- No seeds, keys or secrets in the site, repo or logs. Only the public Xaman API key in the bundle.
- Pin exact versions of the Xaman SDK and `xrpl` libraries, check package integrity, review updates;
  do not load wallet code from random CDNs. Treat any third-party snippet or "helper" package as
  hostile until reviewed (supply-chain attacks target wallet front ends).
- Strict Content Security Policy: scripts only from our origin; `connect-src` only to our Worker,
  Xaman endpoints and the listed ledger nodes/indexers.
- Every tx preview is built from the same JSON we send to Xaman; Xaman shows it again before signing.
- Slippage caps on market orders, `LastLedgerSequence` on all txs, `delivered_amount` checks.
- Warn on: unverified issuer, Hook on issuer (Xahau), freeze or clawback enabled, low depth, token
  with a confusable name (e.g. fake "USD" or "RLUSD"). The issuer address is the real identity.
- Network check after signing: the result must say XRPL mainnet or Xahau (21337) as expected.
