# Third-party notices

OpenCharts itself is licensed under AGPL-3.0-or-later. Libraries vendored under `vendor/<name>@<version>/` keep their **own** licenses. The Apache-2.0 code in `vendor/` is not relicensed: Apache-2.0 is compatible with GPLv3/AGPLv3, and each vendor folder still includes the upstream `LICENSE` (and `NOTICE` when the upstream project ships one).

This project vendors every library used at runtime. Nothing is loaded from a CDN. Build-time tools (Vite, TypeScript, Playwright) stay in `devDependencies` and are not required to view a built copy of the site. New third-party runtime code should still be MIT or Apache 2.0 until a later project decision says otherwise; do not copy GPL-licensed projects into this tree for now.

The drawing overlay in `src/drawings.ts` is original code written against the public Lightweight Charts API. It does not vendor the official `plugin-examples` (trend-line, rectangle-drawing-tool, and similar) from the Lightweight Charts repository. Those Apache-2.0 examples were reviewed only as a possible alternative; the existing overlay was already in the tree, so it was kept to finish Stage 1 faster. KLineChart (Apache 2.0) was also considered and not adopted, for the same reason.

No GPL-licensed projects (for example DegenView) were copied.

## lightweight-charts 5.3.0

- Source: https://github.com/tradingview/lightweight-charts
- npm: https://www.npmjs.com/package/lightweight-charts
- License: Apache License 2.0
- License file: `vendor/lightweight-charts@5.3.0/LICENSE`
- What we took:
  - `vendor/lightweight-charts@5.3.0/lightweight-charts.standalone.production.mjs` — official standalone production ESM bundle from the npm package (`dist/lightweight-charts.standalone.production.mjs`). This is the runtime library. Vite is configured to resolve the `lightweight-charts` import to this file (see `vite.config.ts`).
  - `vendor/lightweight-charts@5.3.0/typings.d.ts` — official TypeScript typings from `dist/typings.d.ts` (build-time only).
  - `vendor/lightweight-charts@5.3.0/LICENSE` — the Apache 2.0 license text shipped with the package.
- There was no `NOTICE` file in the npm package.
- The official Apache 2.0 header inside the `.mjs` file was left intact.

## fancy-canvas 2.1.0 (bundled, not loaded separately)

- Source: https://github.com/tradingview/fancy-canvas
- License: MIT
- License file: `vendor/lightweight-charts@5.3.0/LICENSE.fancy-canvas` (copied from https://raw.githubusercontent.com/tradingview/fancy-canvas/master/LICENSE; the npm package does not ship a LICENSE file)
- What we took: we do **not** load `fancy-canvas` as its own script. Version 2.1.0 is already bundled inside `lightweight-charts.standalone.production.mjs` (it is a runtime dependency of Lightweight Charts). The MIT license is included here because that code ships in the vendored bundle.
- `vendor/lightweight-charts@5.3.0/fancy-canvas-shim.d.ts` is a tiny local typings stub so `tsc` can resolve the `fancy-canvas` import inside `typings.d.ts`. It is not third-party source.
