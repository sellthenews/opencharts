# OpenCharts

Free, open-source candlestick charting app (TradingView-style). It is a static site: no backend, no API keys, no accounts. Stage 1 is ready to publish on GitHub Pages.

## Features

- Candlestick chart with a dark theme and an English UI.
- Exchange switcher: **Kraken** (default), **Binance**, **Coinbase**, **Bitstamp**. All four are public REST APIs that work from the browser (CORS checked with a real `fetch` in headless Chrome).
- Symbol search (click the pair name or start typing on the chart): all official spot pairs from Kraken, Binance, Coinbase and Bitstamp, with exchange filters, typeahead, and a 24h `localStorage` cache. Selecting a result switches the exchange and opens that pair.
- Pairs shown by default: XRP/USD, BTC/USD, ETH/USD. On Binance USD maps to USDT (`XRPUSDT`, `BTCUSDT`, `ETHUSDT`); other listed pairs keep the venue’s native symbol.
- Intervals: 1h, 4h, 1D (default), 1W, 1M. Missing intervals are aggregated in `src/sources/aggregate.ts` (Coinbase has no native 4h / 1W / 1M; Bitstamp and Kraken have no native 1M; Bitstamp has no native 1W).
- Watchlists (sidebar): several named lists, add/remove pairs from any exchange, last price and 24h change. Default list **My list** is Kraken XRP/USD, BTC/USD and ETH/USD. A second empty list, **Crypto**, is included. Quotes refresh every 45s when the tab is visible; Kraken rows also update live over the public ticker WebSocket.
- Indicators, calculated locally, with toggles and periods stored in `localStorage`: SMA, EMA and Bollinger Bands on the price chart; volume; RSI and MACD in panes under the chart.
- Drawing tools (P1–P3, see [STAN.md](STAN.md)): click-click with live preview, optional magnet snap to OHLC, thin antialiased lines, circle handles only when selected, and a floating style bar (color, width, line style, lock, delete). Delete/Backspace removes the selected drawing; after finishing a tool the cursor is reselected. Drawings are saved in `localStorage` per exchange + pair, including style. Export/import JSON is available.
- Cursor modes on the left rail (crosshair with dashed lines and axis labels, dot, or arrow), remembered in `localStorage`. A magnet toggle snaps the pointer and drawings to OHLC.
- Chart context menu (right-click): reset view (zoom/scroll only), copy the price under the cursor, add an alert at that price, or clear all drawings (with confirm).
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
