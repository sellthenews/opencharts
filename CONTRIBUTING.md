# Contributing

Thanks for helping with Wykresy. This is a Stage 1, MIT-licensed, static charting app.

## Development

```bash
npm install
npm run dev
```

The dev server is http://127.0.0.1:5173. Production build:

```bash
npm run build
npm run preview
```

Preview serves the `site/` folder at http://127.0.0.1:4173.

End-to-end test (Chromium / Chrome, against the preview server):

```bash
npm run preview
npm run test:e2e
```

## Adding an exchange

Public, key-free REST APIs only. The source must work from a browser (CORS). Do not add API keys, logins, or a CDN proxy.

1. Add `src/sources/<id>.ts` that implements the `DataSource` interface (`id`, `name`, `pairs`, `nativeIntervals`, `fetchCandles`).
2. Reuse `src/sources/aggregate.ts` when the exchange has no native 4h, 1W, or 1M interval.
3. Register it with one line in `src/sources/index.ts`.
4. If the exchange blocks browser requests, do **not** register it; document the reason in `STAN.md` instead.

Return normalized candles: `{ time, open, high, low, close, volume }` with `time` as a UTC Unix timestamp in seconds.

## Drawings and storage

Drawings are stored in `localStorage` under `wykresy:drawings:<sourceId>:<pairId>`. Keep that key stable, or migrate existing data if you change it.

## Vendored runtime libraries

Do not load libraries from a CDN. Runtime code lives in `vendor/<name>@<version>/` together with its `LICENSE` (and `NOTICE` if the upstream project has one). If you upgrade a library, replace the folder (new version in the name), point the Vite alias at the new file, and update `THIRD_PARTY.md` plus the Dependencies section in the README.

## Pull requests

- Keep the UI in Polish and the docs in English unless a change says otherwise.
- Do not commit `node_modules/`, `site/`, or `screenshots-test/`.
- Do commit `vendor/`.
- Run `npm run build` and, when you touch the chart or drawings, `npm run test:e2e`.
