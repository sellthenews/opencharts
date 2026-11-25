// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { getStocksProxyUrl } from '../config';
import { GECKO_API } from './dex-networks';
import { DEX_PROXY_MISSING } from './ledger-rpc';
import type { Candle } from './types';

export interface GeckoPool {
  id: string;
  address: string;
  name: string;
  base: string;
  quote: string;
  reserveUsd: number | null;
  networkId: string;
}

interface GeckoJson {
  data?: unknown;
  included?: unknown;
  errors?: { title?: string; detail?: string }[];
}

async function getJson(pathAndQuery: string): Promise<GeckoJson> {
  const direct = `${GECKO_API}${pathAndQuery}`;
  let lastErr: Error | null = null;
  try {
    const res = await fetch(direct, { headers: { Accept: 'application/json' } });
    if (res.ok) return (await res.json()) as GeckoJson;
    lastErr = new Error(`HTTP ${res.status} for ${direct}`);
    if (res.status !== 429 && res.status < 500 && res.status !== 403) throw lastErr;
  } catch (err) {
    lastErr = err instanceof Error ? err : new Error(String(err));
    if (/HTTP\s+[4]/.test(lastErr.message) && !/HTTP 429|HTTP 403/.test(lastErr.message)) throw lastErr;
  }
  const base = getStocksProxyUrl();
  if (base) {
    const url = `${base}/dex/gt${pathAndQuery}`;
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (res.status === 404) throw new Error(DEX_PROXY_MISSING);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return (await res.json()) as GeckoJson;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastErr ?? new Error('GeckoTerminal unavailable');
}

function attr(row: { attributes?: Record<string, unknown>; id?: string } | undefined): Record<string, unknown> {
  return (row?.attributes ?? {}) as Record<string, unknown>;
}

function tokenSymbol(pool: Record<string, unknown>, key: string): string {
  const name = String(pool.name ?? '');
  const parts = name.split('/').map((s) => s.trim().split(/\s+/)[0] ?? '');
  if (key === 'base_token' && parts[0]) return parts[0];
  if (key === 'quote_token' && parts[1]) return parts[1];
  return '';
}

export function poolFromGecko(row: { id?: string; attributes?: Record<string, unknown>; relationships?: { network?: { data?: { id?: string } } } }, fallbackNetwork: string): GeckoPool | null {
  const a = attr(row);
  const address = String(a.address ?? '');
  if (!address) return null;
  const networkId = row.relationships?.network?.data?.id || fallbackNetwork;
  const name = String(a.name ?? address);
  return {
    id: `gt:${networkId}:${address}`,
    address,
    name,
    base: tokenSymbol(a, 'base_token') || name.split('/')[0]?.trim() || 'BASE',
    quote: tokenSymbol(a, 'quote_token') || name.split('/')[1]?.trim()?.split(/\s+/)[0] || 'QUOTE',
    reserveUsd: a.reserve_in_usd != null ? Number(a.reserve_in_usd) : null,
    networkId,
  };
}

const GT_CACHE_KEY = 'opencharts:gt-pools:v1';
const GT_LIST_TTL_MS = 5 * 60 * 1000;
const memCache = new Map<string, { exp: number; pools: GeckoPool[] }>();
const inflight = new Map<string, Promise<GeckoPool[]>>();

function readLocalCache(key: string): GeckoPool[] | null {
  const mem = memCache.get(key);
  if (mem && mem.exp > Date.now()) return mem.pools;
  try {
    const raw = localStorage.getItem(GT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, { exp: number; pools: GeckoPool[] }>;
    const row = parsed[key];
    if (!row || row.exp <= Date.now() || !Array.isArray(row.pools)) return null;
    memCache.set(key, row);
    return row.pools;
  } catch {
    return null;
  }
}

function writeLocalCache(key: string, pools: GeckoPool[]): void {
  const row = { exp: Date.now() + GT_LIST_TTL_MS, pools };
  memCache.set(key, row);
  try {
    const raw = localStorage.getItem(GT_CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, { exp: number; pools: GeckoPool[] }>) : {};
    const now = Date.now();
    for (const [k, v] of Object.entries(parsed)) {
      if (!v || v.exp <= now) delete parsed[k];
    }
    parsed[key] = row;
    const keys = Object.keys(parsed);
    if (keys.length > 40) {
      keys.sort((a, b) => (parsed[a]!.exp - parsed[b]!.exp));
      for (const k of keys.slice(0, keys.length - 40)) delete parsed[k];
    }
    localStorage.setItem(GT_CACHE_KEY, JSON.stringify(parsed));
  } catch {
    /* private mode or quota */
  }
}

export function clearGeckoPoolCacheForTests(): void {
  memCache.clear();
  inflight.clear();
  try {
    localStorage.removeItem(GT_CACHE_KEY);
  } catch {
    /* node tests */
  }
}

function poolsFromJson(data: GeckoJson, networkId: string): GeckoPool[] {
  const rows = Array.isArray(data.data) ? data.data : [];
  const out: GeckoPool[] = [];
  for (const row of rows) {
    const pool = poolFromGecko(row as never, networkId);
    if (pool) out.push(pool);
  }
  return out;
}

async function loadGeckoPools(networkId: string, query: string): Promise<GeckoPool[]> {
  const q = query.trim();
  const path = q
    ? `/search/pools?query=${encodeURIComponent(q)}&network=${encodeURIComponent(networkId)}&page=1`
    : `/networks/${encodeURIComponent(networkId)}/pools?page=1`;
  const data = await getJson(path);
  return poolsFromJson(data, networkId);
}

export async function searchGeckoPools(networkId: string, query: string): Promise<GeckoPool[]> {
  const q = query.trim();
  const key = `${networkId}::${q.toLowerCase()}`;
  const cached = readLocalCache(key);
  if (cached) return cached;
  const pending = inflight.get(key);
  if (pending) return pending;
  const task = loadGeckoPools(networkId, q)
    .then((pools) => {
      writeLocalCache(key, pools);
      return pools;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, task);
  return task;
}

interface OhlcvMap {
  minute: number[];
  hour: number[];
  day: number[];
}

const AGGREGATE: Record<string, { timeframe: 'minute' | 'hour' | 'day'; aggregate: number }> = {
  '1m': { timeframe: 'minute', aggregate: 1 },
  '5m': { timeframe: 'minute', aggregate: 5 },
  '15m': { timeframe: 'minute', aggregate: 15 },
  '30m': { timeframe: 'minute', aggregate: 15 }, // 30m is aggregated from 15m
  '1h': { timeframe: 'hour', aggregate: 1 },
  '4h': { timeframe: 'hour', aggregate: 4 },
  '1D': { timeframe: 'day', aggregate: 1 },
  '1W': { timeframe: 'day', aggregate: 1 },
  '1M': { timeframe: 'day', aggregate: 1 },
};

export function geckoTimeframe(interval: string): { timeframe: 'minute' | 'hour' | 'day'; aggregate: number } | null {
  return AGGREGATE[interval] ?? null;
}

export function candlesFromOhlcvList(list: unknown[], intervalSec: number): Candle[] {
  const out: Candle[] = [];
  for (const row of list) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const [ts, o, h, l, c, v] = row as number[];
    const time = Math.floor(Number(ts));
    const open = Number(o);
    const high = Number(h);
    const low = Number(l);
    const close = Number(c);
    const volume = Number(v);
    if (!Number.isFinite(time) || !Number.isFinite(open) || !Number.isFinite(close)) continue;
    if (!(open > 0) || !(close > 0)) continue;
    out.push({
      time,
      open,
      high: Number.isFinite(high) ? high : Math.max(open, close),
      low: Number.isFinite(low) ? low : Math.min(open, close),
      close,
      volume: Number.isFinite(volume) ? volume : 0,
    });
  }
  out.sort((a, b) => a.time - b.time);
  if (intervalSec > 0) {
    // Normalize 15m-sourced 30m, or day-sourced week/month, later via aggregateCandles.
    void intervalSec;
  }
  return out;
}

export async function fetchGeckoOhlcv(networkId: string, pool: string, interval: string, before?: number): Promise<Candle[]> {
  const spec = geckoTimeframe(interval);
  if (!spec) throw new Error(`Unsupported DEX interval ${interval}`);
  const params = new URLSearchParams({
    aggregate: String(spec.aggregate),
    limit: '1000',
    currency: 'token',
  });
  if (before && Number.isFinite(before)) params.set('before_timestamp', String(Math.floor(before)));
  const path = `/networks/${encodeURIComponent(networkId)}/pools/${encodeURIComponent(pool)}/ohlcv/${spec.timeframe}?${params}`;
  const data = await getJson(path);
  const list = ((data.data as { attributes?: { ohlcv_list?: unknown[] } } | undefined)?.attributes?.ohlcv_list) ?? [];
  return candlesFromOhlcvList(list, 0);
}

export async function fetchGeckoTicker(networkId: string, pool: string): Promise<{ last: number; change24hPct: number | null }> {
  const path = `/networks/${encodeURIComponent(networkId)}/pools/${encodeURIComponent(pool)}`;
  const data = await getJson(path);
  const a = attr(data.data as { attributes?: Record<string, unknown> });
  const last = Number(a.base_token_price_native_currency ?? a.base_token_price_usd ?? a.quote_token_price_native_currency);
  const pct = a.price_change_percentage as { h24?: string | number } | undefined;
  const change = pct?.h24 != null ? Number(pct.h24) : null;
  if (!Number.isFinite(last)) throw new Error('GeckoTerminal: no last price');
  return { last, change24hPct: Number.isFinite(change as number) ? (change as number) : null };
}

export type { OhlcvMap };
