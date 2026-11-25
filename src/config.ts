// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

/** Shown in the Stocks search and on the chart when the Worker URL is empty. */
export const STOCKS_PROXY_UNCONFIGURED = 'Stock data proxy not configured yet';

/**
 * Origin of the OpenCharts Yahoo proxy Worker, without a trailing slash.
 * Override at build time with `VITE_STOCKS_PROXY`. Tests may set
 * `opencharts:stocks-proxy` in localStorage (`off` clears it for the unconfigured-message test).
 */
const FALLBACK_PROXY = 'https://opencharts-proxy.opencharts.workers.dev';

const envProxy =
  typeof import.meta.env === 'object' &&
  import.meta.env &&
  typeof import.meta.env.VITE_STOCKS_PROXY === 'string'
    ? import.meta.env.VITE_STOCKS_PROXY.trim()
    : '';

export const STOCKS_PROXY_DEFAULT = (envProxy || FALLBACK_PROXY).replace(/\/$/, '');

export function getStocksProxyUrl(): string {
  try {
    const raw = localStorage.getItem('opencharts:stocks-proxy');
    if (raw !== null) {
      const value = raw.trim();
      if (!value || value === 'off' || value === '-') return '';
      return value.replace(/\/$/, '');
    }
  } catch {
    /* ignore */
  }
  return STOCKS_PROXY_DEFAULT;
}
