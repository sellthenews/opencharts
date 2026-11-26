# Swapwick

Swapwick – free charts for everyone. A free, open-source candlestick charting app. It is a static site: no backend, no API keys, no accounts. Stage 1 is ready to publish on GitHub Pages.

This project was formerly called OpenCharts.

## Features

- Seventeen chart types (candles, hollow candles, OHLC bars, Heikin Ashi, line, line with markers, step line, area, HLC area, baseline, columns, high-low, Renko, Kagi, Point & Figure, Line Break and Range), with a dark or light theme and an English UI (14 languages). The type is stored in `opencharts:chart-type`.
- Exchange switcher: **Kraken** (default), **Binance**, **Coinbase**, **Bitstamp**. All four are public REST APIs that work from the browser (CORS checked with a real `fetch` in headless Chrome).
- DEX source, split by network: **XRPL** (official public AMM JSON-RPC, default XRP/RLUSD) and **Xahau** (official public order-book JSON-RPC, default XAH/EVR), plus Ethereum, BNB Chain, Base, Solana, Polygon, Arbitrum, Avalanche, Optimism, Sui, Tron, TON, Aptos, Near, Sei, HyperEVM, Hyperliquid, Berachain, Sonic, Injective, Linea, zkSync, Mantle, Scroll, Unichain, World Chain, Ink and Cronos pools via the free public GeckoTerminal API. A Network dropdown appears when DEX is selected; the last pair per network is stored in `opencharts:dex-network` and `opencharts:dex-pair:<network>`. The app talks to official endpoints first and falls back to the Swapwick Cloudflare Worker (`/dex/gt/…`, `/dex/rpc/xrpl`, `/dex/rpc/xahau`) if the browser is blocked. Until that Worker is redeployed, the chart degrades with a clear status message (see `worker/README.md`).
- Optional accounts and drawing sync (GitHub, Google, or email + password). Without an account, drawings stay in this browser as before. With an account, private `opencharts:` data is stored per user in the Swapwick Worker (D1 + KV), behind HttpOnly session cookies and PBKDF2 password hashes. Accounts stay off until the operator follows `docs/ACCOUNTS-SETUP.md` (OAuth apps, D1, KV, secrets, deploy). The UI is the Sign in button in the top-right of the toolbar (Settings → Account still works).
- Symbol search (click the pair name or start typing on the chart): official spot pairs from Kraken, Binance, Coinbase and Bitstamp, plus Kraken xStocks and a Stocks list (XRPN and major US tickers) served by Yahoo Finance through an optional Swapwick Cloudflare Worker proxy (`worker/`). Exchange and Crypto/Stocks filters, typeahead, Yahoo search (EQUITY/ETF, including GPW `.WA`) when the proxy URL is set, and a 24h `localStorage` cache for exchange lists. Selecting a result switches the source and opens that symbol. The proxy is at `https://opencharts-proxy.opencharts.workers.dev`. If the URL is unset, Stocks Yahoo shows “Stock data proxy not configured yet”; crypto and xStocks keep working.
- Pairs shown by default: XRP/USD, BTC/USD, ETH/USD. On Binance USD maps to USDT (`XRPUSDT`, `BTCUSDT`, `ETHUSDT`); other listed pairs keep the venue’s native symbol.
- Intervals: 1h, 4h, 1D (default), 1W, 1M. Missing intervals are aggregated in `src/sources/aggregate.ts` (Coinbase has no native 4h / 1W / 1M; Bitstamp and Kraken have no native 1M; Bitstamp has no native 1W).
- Watchlists (sidebar): several named lists. **+** opens symbol search in add-to-list mode (does not change the open chart); **×** on a row removes it; the chart context menu has Add/Remove the current symbol to/from the watchlist. Rows work for crypto, Kraken xStocks and Yahoo stocks, with last price and change %. Clicking a row opens that chart. Quotes refresh every 60s (up to 4 at a time) when the tab is visible; Kraken rows also update live over the public ticker WebSocket. Lists are stored in `opencharts:watchlists` (legacy `wykresy:` keys are migrated). Symbols can be reordered by drag and drop and grouped into named, collapsible sections (Add section from the list menu or right-click); deleting a section moves its symbols back to the unsectioned list.
- Indicators (unlimited, all free), calculated from public formulas in the app: SMA, EMA, WMA, session and anchored VWAP, Bollinger, RSI, MACD, Stochastic, Stoch RSI, ATR, ADX/DMI, Ichimoku, Parabolic SAR, SuperTrend, OBV, Volume + MA, Volume Profile (visible and fixed range), Pivot Points (Standard/Fib), Keltner, Donchian, CCI, MFI, Williams %R, ROC, Momentum, Aroon and CMF. Session VWAP can plot ±1/2/3σ bands and session high/low. RSI and MACD can mark regular and hidden divergences on the chart. Auto Fib retracement and Auto Trend follow the latest swings. Moving Average of Indicator applies an SMA or EMA to another series (for example RSI). SMA, EMA, RSI, MACD and VWAP can use a higher timeframe when one is selected. CVD and a simplified footprint are approximated from OHLCV (no bid/ask), and the UI says so. The Indicators window has search, categories and favorites. Each instance has settings (parameters, color, width, timeframe where available), hide and remove. Overlays sit on price; oscillators use resizable panes. Settings are stored per chart under `opencharts:indicators:<exchange>:<symbol>` (legacy `opencharts:indicators` is migrated) and are included in templates and Settings Export/Import.
- Drawing tools (P1–P3, see [STAN.md](STAN.md)): click-click with live preview, optional magnet snap to OHLC, thin antialiased lines, circle handles only when selected, and a floating style bar (color, width, line style, lock, delete; a gear opens Fib settings). Delete/Backspace removes the selected drawing; after finishing a tool the cursor is reselected. Drawings are saved in `localStorage` per exchange + pair, including style. Export/import JSON and “Extend Fib right” are in the chart context menu. Fib retracement uses 24 default levels, a dark-theme colour palette, and a Style settings dialog (double-click, right-click Settings…, or the gear) with Save as default (`opencharts:fib-defaults`).
- Left tool rail is grouped (cursor, lines, Fibonacci, patterns, forecasting/measurers, brush, text, shapes). Clicking a group activates the last-used tool in that group; a small caret opens a flyout with section headings and a star to add the tool to a floating, draggable favorites bar (`opencharts:rail-last` and `opencharts:favorites-v2`). New users (no favorites key) get a default set of tools on a bar centered near the top of the chart. A one-time migration from `opencharts:favorites` writes `opencharts:favorites-v2` as the default set plus any tools the user had starred, shows the bar, and resets its position; after that, an existing v2 list (including an empty one) is left as-is. The bar is hidden when empty. The floating drawing style bar stays hidden until a drawing is selected, then docks small in the top-left corner of the chart and hides on an empty click or Esc. Delete and Backspace remove the selection unless a text field has focus. The bottom of the rail has measure, zoom (in/out/fit), magnet, lock all, hide all, and remove all (with confirm).
- Cursor modes (crosshair with dashed lines and axis labels, dot, or arrow) live in the cursor group and are remembered in `localStorage`. The magnet toggle snaps the pointer and drawings to OHLC.
- Chart context menu (right-click): reset view (zoom/scroll only), copy the price under the cursor, add an alert at that price or on a selected trend/horizontal line, add or remove the current symbol from the watchlist, clear all drawings (with confirm), export or import drawings, and extend a selected Fib to the right.
- Keyboard (not in text fields): Alt+T trend line, Alt+H horizontal line, Alt+V vertical line, Alt+F Fib retracement; Ctrl+Z / Ctrl+Y (Cmd on Mac) undo and redo drawings and indicators; Delete removes the selected drawing; Esc deselects. Typing a letter opens symbol search; a number then Enter changes the interval (for example 4 → 4h, 1D → 1D).
- Compare: overlay other symbols in percent, measured from the first visible candle, each in its own color with a legend. Stored in `opencharts:compare` and included in Export/Import.
- Price alerts: add from the panel or the chart menu, including a cross of a trend or horizontal line, RSI crossing 70 or 30, and MACD crossing its signal. Sound plus the Notification API (permission is requested only after you click). The list supports edit and delete. Stored in `opencharts:alerts`. The panel notes: “Alerts work while this tab is open”.
- Settings (toolbar gear): Export data and Import data for a JSON backup of every `opencharts:` localStorage key (drawings, watchlists, favorites, Fib defaults, last symbol and interval, theme, templates). Import can replace all Swapwick keys or merge the keys from the file. The backup stays in the browser; nothing is uploaded. Save template… stores the current indicators (with settings) plus Fib, Fib Ext and line-style defaults under a name in `opencharts:templates`; click a name to load that set onto the open chart.
- Indicator series are updated incrementally when the last candle changes or a new candle is appended, so adding many indicators does not rebuild the chart on every tick.
- Live updates for Kraken via the public WebSocket `wss://ws.kraken.com/v2` (OHLC + ticker), with automatic reconnect. Aggregated intervals (including 1M) update the last candle.
- GitHub Pages-friendly build: Vite `base` is `./`, output goes to `site/`. The site is published at [https://swapwick.com/](https://swapwick.com/) from `main` via `.github/workflows/pages.yml`.
- Progressive Web App: installable from the browser (manifest, icons, and a service worker). The worker uses network-first for HTML and `version.json` so a new deploy is picked up, and cache-first only for hashed `/assets/` files. Scope and start URL are relative (`./`) so the app works at root (`https://swapwick.com/`) as well as subpaths. See [docs/ANDROID-BUILD.md](docs/ANDROID-BUILD.md) to wrap the live site as an Android APK (Trusted Web Activity).

## Dependencies

Runtime libraries are **vendored** in this repository. Nothing is loaded from a CDN.

| Library | Version | License | Location |
| --- | --- | --- | --- |
| [Lightweight Charts](https://github.com/tradingview/lightweight-charts) | 5.3.0 | Apache 2.0 | `vendor/lightweight-charts@5.3.0/lightweight-charts.standalone.production.mjs` |

`fancy-canvas` 2.1.0 (MIT) is already bundled inside that official standalone file; it is not loaded as a second script. License texts and a short description of what was copied are in [THIRD_PARTY.md](THIRD_PARTY.md).

Vite resolves the `lightweight-charts` import to the vendored file (see the alias in `vite.config.ts`). TypeScript typings come from the same vendor folder. `vendor/` is committed and is not gitignored.

Build-only tools (`vite`, `typescript`, `@playwright/test`) are `devDependencies` installed with `npm install`. They are not shipped in `site/`.

## Getting started

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5173.

### Production build and preview

```bash
npm run build
npm run preview
```

The preview server is http://127.0.0.1:4173. The built files are in `site/` (regenerated on each build; not committed). To publish on GitHub Pages, run the build and serve the contents of `site/`, or use a GitHub Action that runs `npm ci && npm run build` and uploads `site/`.

### Tests

Start the preview server, then:

```bash
npm run test:e2e
```

The Playwright test opens Kraken XRP/USD on 1D, draws a trend line, saves a screenshot to `screenshots-test/xrp-1d.png`, and checks that the drawing is still there after a reload.

## Architecture

Each exchange is one module under `src/sources/` with a shared `DataSource` interface. Register a new venue in `src/sources/index.ts` (one line) — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Roadmap

Stage 2 is implemented (indicators, watchlists, richer drawings, Kraken live data, local Pages workflow). A detailed tool-by-tool checklist, tagged P1/P2/P3, is in [STAN.md](STAN.md#roadmapa-narzędzia-rysowania).

## License

Swapwick is free software licensed under the [GNU Affero General Public License v3.0 or later](LICENSE) (AGPL-3.0-or-later). The `LICENSE` file in the repository root is the official license text.

If you run a modified version of this software and make it available over a network (for example a public website), you must also make the complete corresponding source code of that modified version available to its users under the same license.

Third-party libraries kept in `vendor/` remain under their own licenses; see [THIRD_PARTY.md](THIRD_PARTY.md).
