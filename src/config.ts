// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

/** Shown in the Stocks search and on the chart when the Worker URL is empty. */
export const STOCKS_PROXY_UNCONFIGURED = 'Stock data proxy not configured yet';

/**
 * Origin of the OpenCharts Yahoo proxy Worker, without a trailing slash.
 * Set `VITE_STOCKS_PROXY` at build time after deploy, e.g. https://opencharts-proxy.<account>.workers.dev
 * Until then this stays empty so the site keeps working and Stocks Yahoo shows the message above.
 * Tests (and a local check) may set `opencharts:stocks-proxy` in localStorage to override.
 */
export const STOCKS_PROXY_DEFAULT = (typeof import.meta.env.VITE_STOCKS_PROXY === 'string'
  ? import.meta.env.VITE_STOCKS_PROXY.trim()
  : ''
).replace(/\/$/, '');

export function getStocksProxyUrl(): string {
  try {
    const override = localStorage.getItem('opencharts:stocks-proxy')?.trim();
    if (override) return override.replace(/\/$/, '');
  } catch {
    /* ignore */
  }
  return STOCKS_PROXY_DEFAULT;
}
