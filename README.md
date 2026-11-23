# Wykresy

Free, open-source candlestick charting app (TradingView-style). It is a static site: no backend, no API keys, no accounts. Stage 1 is ready to publish on GitHub Pages.

## Features (Stage 1)

- Candlestick chart with a dark theme and a Polish UI.
- Exchange switcher: **Kraken** (default), **Binance**, **Coinbase**, **Bitstamp**. All four are public REST APIs that work from the browser (CORS checked with a real `fetch` in headless Chrome).
- Pairs: XRP/USD (default), BTC/USD, ETH/USD. On Binance these map to the USDT symbols (`XRPUSDT`, `BTCUSDT`, `ETHUSDT`).
- Intervals: 1h, 4h, 1D (default), 1W, 1M. Missing intervals are aggregated in `src/sources/aggregate.ts` (Coinbase has no native 4h / 1W / 1M; Bitstamp and Kraken have no native 1M; Bitstamp has no native 1W).
- Drawing tools: trend line, horizontal line, rectangle, select and delete one drawing, clear all. Drawings are saved in `localStorage` per exchange + pair.
- GitHub Pages-friendly build: Vite `base` is `./`, output goes to `site/`.

Indicators (SMA, EMA, Bollinger Bands, RSI, MACD, volume) are **not** in Stage 1.

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

- **Stage 2** — local indicators: SMA, EMA, Bollinger Bands on the price chart; RSI and MACD in a separate pane; volume.
- **Stage 3** — more drawing tools, optional live updates over public WebSockets, more pairs and timeframes, tighter GitHub Pages packaging.

## License

[MIT](LICENSE). Third-party licenses are listed in [THIRD_PARTY.md](THIRD_PARTY.md).
