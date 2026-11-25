// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { t } from './i18n';

import { STOCKS_PROXY_UNCONFIGURED, STOCKS_PROXY_DEFAULT, getStocksProxyUrl } from './config';
import { DEX_PROXY_MISSING } from './sources/ledger-rpc';

export const PROXY_HOST = 'opencharts-proxy.opencharts.workers.dev';

function proxyBlocked(): string {
  return t('status.loadProxyBlocked', { host: PROXY_HOST });
}

export function isLikelyBlocked(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (/HTTP\s+\d{3}/.test(msg)) return false;
  return /Failed to fetch|NetworkError|Load failed|Network request failed|ERR_BLOCKED|ERR_FAILED|blockedbyclient|NS_ERROR_FAILURE/i.test(msg);
}

export function describeLoadError(sourceId: string, sourceName: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === STOCKS_PROXY_UNCONFIGURED) return STOCKS_PROXY_UNCONFIGURED;
  if (msg === DEX_PROXY_MISSING || msg.includes(DEX_PROXY_MISSING)) return t('status.loadDexProxyMissing');
  const proxy = getStocksProxyUrl() || STOCKS_PROXY_DEFAULT;
  const mentionsProxy =
    sourceId === 'yahoo' ||
    msg.includes('workers.dev') ||
    (proxy && msg.includes(proxy)) ||
    msg.includes(PROXY_HOST);
  if (mentionsProxy && isLikelyBlocked(err)) return proxyBlocked();
  if (isLikelyBlocked(err)) {
    return t('status.loadBlocked', { source: sourceName });
  }
  return t('status.loadFailed', { source: sourceName, message: msg });
}
