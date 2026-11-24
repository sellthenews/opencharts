// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { STOCKS_PROXY_UNCONFIGURED, STOCKS_PROXY_DEFAULT, getStocksProxyUrl } from './config';

export const PROXY_HOST = 'opencharts-proxy.opencharts.workers.dev';

const PROXY_BLOCKED = `Could not reach the stock data proxy. An ad blocker or privacy extension may be blocking ${PROXY_HOST} – allow it and reload.`;

export function isLikelyBlocked(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (/HTTP\s+\d{3}/.test(msg)) return false;
  return /Failed to fetch|NetworkError|Load failed|Network request failed|ERR_BLOCKED|ERR_FAILED|blockedbyclient|NS_ERROR_FAILURE/i.test(msg);
}

export function describeLoadError(sourceId: string, sourceName: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === STOCKS_PROXY_UNCONFIGURED) return STOCKS_PROXY_UNCONFIGURED;
  const proxy = getStocksProxyUrl() || STOCKS_PROXY_DEFAULT;
  const mentionsProxy =
    sourceId === 'yahoo' ||
    msg.includes('workers.dev') ||
    (proxy && msg.includes(proxy)) ||
    msg.includes(PROXY_HOST);
  if (mentionsProxy && isLikelyBlocked(err)) return PROXY_BLOCKED;
  if (isLikelyBlocked(err)) {
    return `Could not reach ${sourceName}. An ad blocker or privacy extension may be blocking this data source – allow it and reload.`;
  }
  return `Failed to load data from ${sourceName}: ${msg}`;
}
