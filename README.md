# OpenCharts

Free, open-source candlestick charting app (TradingView-style). It is a static site: no backend, no API keys, no accounts. Stage 1 is ready to publish on GitHub Pages.

## Features

- Candlestick chart with a dark theme and an English UI.
- Exchange switcher: **Kraken** (default), **Binance**, **Coinbase**, **Bitstamp**. All four are public REST APIs that work from the browser (CORS checked with a real `fetch` in headless Chrome).
- Symbol search (click the pair name or start typing on the chart): official spot pairs from Kraken, Binance, Coinbase and Bitstamp, plus Kraken xStocks and a Stocks list (XRPN and major US tickers) served by Yahoo Finance through an optional OpenCharts Cloudflare Worker proxy (`worker/`). Exchange and Crypto/Stocks filters, typeahead, Yahoo search (EQUITY/ETF, including GPW `.WA`) when the proxy URL is set, and a 24h `localStorage` cache for exchange lists. Selecting a result switches the source and opens that symbol. The proxy is at `https://opencharts-proxy.opencharts.workers.dev`. If the URL is unset, Stocks Yahoo shows “Stock data proxy not configured yet”; crypto and xStocks keep working.
- Pairs shown by default: XRP/USD, BTC/USD, ETH/USD. On Binance USD maps to USDT (`XRPUSDT`, `BTCUSDT`, `ETHUSDT`); other listed pairs keep the venue’s native symbol.
- Intervals: 1h, 4h, 1D (default), 1W, 1M. Missing intervals are aggregated in `src/sources/aggregate.ts` (Coinbase has no native 4h / 1W / 1M; Bitstamp and Kraken have no native 1M; Bitstamp has no native 1W).
- Watchlists (sidebar): several named lists. **+** opens symbol search in add-to-list mode (does not change the open chart); **×** on a row removes it; the chart context menu has Add/Remove the current symbol to/from the watchlist. Rows work for crypto, Kraken xStocks and Yahoo stocks, with last price and change %. Clicking a row opens that chart. Quotes refresh every 60s (up to 4 at a time) when the tab is visible; Kraken rows also update live over the public ticker WebSocket. Lists are stored in `opencharts:watchlists` (legacy `wykresy:` keys are migrated).
- Indicators, calculated locally, with toggles and periods stored in `localStorage`: SMA, EMA and Bollinger Bands on the price chart; volume; RSI and MACD in panes under the chart.
- Drawing tools (P1–P3, see [STAN.md](STAN.md)): click-click with live preview, optional magnet snap to OHLC, thin antialiased lines, circle handles only when selected, and a floating style bar (color, width, line style, lock, delete; a gear opens Fib settings). Delete/Backspace removes the selected drawing; after finishing a tool the cursor is reselected. Drawings are saved in `localStorage` per exchange + pair, including style. Export/import JSON and “Extend Fib right” are in the chart context menu. Fib retracement uses 24 default levels, a dark-theme colour palette, and a Style settings dialog (double-click, right-click Settings…, or the gear) with Save as default (`opencharts:fib-defaults`).
- Left tool rail is grouped (cursor, lines, Fibonacci, patterns, forecasting/measurers, brush, text, shapes). Clicking a group activates the last-used tool in that group; a small caret opens a flyout with section headings and a star to add the tool to a floating, draggable favorites bar (`opencharts:rail-last` and `opencharts:favorites`). New users (no `opencharts:favorites` key) get a default set of tools on a bar centered near the top of the chart; a stored list, including an empty one, is left as-is. The bar is hidden when empty. The bottom of the rail has measure, zoom (in/out/fit), magnet, lock all, hide all, and remove all (with confirm).
- Cursor modes (crosshair with dashed lines and axis labels, dot, or arrow) live in the cursor group and are remembered in `localStorage`. The magnet toggle snaps the pointer and drawings to OHLC.
- Chart context menu (right-click): reset view (zoom/scroll only), copy the price under the cursor, add an alert at that price, add or remove the current symbol from the watchlist, clear all drawings (with confirm), export or import drawings, and extend a selected Fib to the right.
- Live updates for Kraken via the public WebSocket `wss://ws.kraken.com/v2` (OHLC + ticker), with automatic reconnect. Aggregated intervals (including 1M) update the last candle.
- GitHub Pages-friendly build: Vite `base` is `./`, output goes to `site/`. The site is published at [https://sellthenews.github.io/opencharts/](https://sellthenews.github.io/opencharts/) from `main` via `.github/workflows/pages.yml`.

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

Stage 2 is implemented (indicators, watchlists, richer drawings, Kraken live data, local Pages workflow). A detailed tool-by-tool checklist, grouped like the TradingView menu and tagged P1/P2/P3, is in [STAN.md](STAN.md#roadmapa-narzędzia-jak-w-tradingview).

## License

This project is licensed under the [GNU Affero General Public License v3.0 or later](LICENSE) (AGPL-3.0-or-later).

If you run a modified version of this software and make it available over a network (for example a public website), you must also make the complete corresponding source code of that modified version available to its users under the same license.

Third-party libraries kept in `vendor/` remain under their own licenses; see [THIRD_PARTY.md](THIRD_PARTY.md).
