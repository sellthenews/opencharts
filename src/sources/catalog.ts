// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import '../storage';
import { fetchJson } from './http';
import type { DataSource } from './types';
import { PAIR_LABELS } from './types';
import { YAHOO_STOCKS } from './yahoo';

export const SOURCE_FILTERS = ['all', 'kraken', 'binance', 'coinbase', 'bitstamp', 'yahoo'] as const;
export type SourceFilter = (typeof SOURCE_FILTERS)[number];

export type AssetKind = 'crypto' | 'stock';

export interface SymbolInfo {
  sourceId: string;
  id: string;
  native: string;
  base: string;
  quote: string;
  label: string;
  wsname?: string;
  kind: AssetKind;
  search: string;
  name?: string;
}

const TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_VER = 2;

/** [id, native, base, quote, wsname, kind] — kind is 's' for stock, omitted/empty for crypto. */
type CacheRow = [string, string, string, string, string?, string?, string?];

interface CachePayload {
  v: number;
  t: number;
  rows: CacheRow[];
}

const memory = new Map<string, { t: number; items: SymbolInfo[] }>();
const inflight = new Map<string, Promise<SymbolInfo[]>>();

const KRAKEN_ASSET: Record<string, string> = {
  XXBT: 'BTC',
  XBT: 'BTC',
  XETH: 'ETH',
  XLTC: 'LTC',
  XXRP: 'XRP',
  XXLM: 'XLM',
  XZEC: 'ZEC',
  ZUSD: 'USD',
  ZEUR: 'EUR',
  ZGBP: 'GBP',
  ZJPY: 'JPY',
  ZCAD: 'CAD',
  ZAUD: 'AUD',
  ZCHF: 'CHF',
};

function cacheKey(sourceId: string): string {
  return `opencharts:symbols:${sourceId}`;
}

function krakenAsset(code: string): string {
  if (KRAKEN_ASSET[code]) return KRAKEN_ASSET[code];
  if ((code.startsWith('X') || code.startsWith('Z')) && code.length === 4) {
    const rest = code.slice(1);
    return KRAKEN_ASSET[rest] ?? rest;
  }
  return code === 'XBT' ? 'BTC' : code;
}

function makeInfo(
  sourceId: string,
  id: string,
  native: string,
  base: string,
  quote: string,
  wsname?: string,
  kind: AssetKind = 'crypto',
  name?: string,
  labelOverride?: string,
): SymbolInfo {
  const label = labelOverride ?? `${base}/${quote}`;
  const extra = kind === 'stock' ? ' stock xstock equity shares' : '';
  const search = `${id} ${native} ${base}${quote} ${label} ${wsname ?? ''} ${name ?? ''}${extra}`.toLowerCase();
  return { sourceId, id, native, base, quote, label, wsname, kind, search, name };
}

function rowToInfo(sourceId: string, row: CacheRow): SymbolInfo {
  const kind: AssetKind = row[5] === 's' ? 'stock' : 'crypto';
  const name = row[6] || undefined;
  const labelOverride = sourceId === 'yahoo' ? row[0] : undefined;
  return makeInfo(sourceId, row[0], row[1], row[2], row[3], row[4], kind, name, labelOverride);
}

function infoToRow(item: SymbolInfo): CacheRow {
  const kind = item.kind === 'stock' ? 's' : '';
  return [item.id, item.native, item.base, item.quote, item.wsname ?? '', kind, item.name ?? ''];
}

function readCache(sourceId: string): SymbolInfo[] | null {
  const mem = memory.get(sourceId);
  if (mem && Date.now() - mem.t < TTL_MS) return mem.items;
  try {
    const raw = localStorage.getItem(cacheKey(sourceId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachePayload;
    if (parsed.v !== CACHE_VER || !Array.isArray(parsed.rows) || Date.now() - parsed.t >= TTL_MS) return null;
    const items = parsed.rows.map((row) => rowToInfo(sourceId, row));
    memory.set(sourceId, { t: parsed.t, items });
    return items;
  } catch {
    return null;
  }
}

function writeCache(sourceId: string, items: SymbolInfo[]): void {
  const t = Date.now();
  memory.set(sourceId, { t, items });
  try {
    const payload: CachePayload = { v: CACHE_VER, t, rows: items.map(infoToRow) };
    localStorage.setItem(cacheKey(sourceId), JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

function splitKnownQuote(id: string): { base: string; quote: string } | null {
  const upper = id.toUpperCase().replace(/[-_/]/g, '');
  const quotes = ['USDT', 'USDC', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'BTC', 'ETH', 'EURT'];
  for (const quote of quotes) {
    if (upper.endsWith(quote) && upper.length > quote.length) {
      return { base: upper.slice(0, -quote.length), quote };
    }
  }
  return null;
}

export function splitPairLabel(pairId: string): string {
  if (pairId.includes('/')) return pairId.replace(/XBT/g, 'BTC');
  if (pairId.includes('-')) return pairId.replace(/-/g, '/').replace(/XBT/g, 'BTC');
  const parts = splitKnownQuote(pairId);
  if (parts) return `${parts.base === 'XBT' ? 'BTC' : parts.base}/${parts.quote}`;
  return pairId;
}

export function formatPairLabel(sourceId: string, pairId: string): string {
  const known = PAIR_LABELS[pairId];
  if (known) return known;
  const hit = lookupSymbol(sourceId, pairId);
  if (hit) return hit.label;
  return splitPairLabel(pairId);
}

export function lookupSymbol(sourceId: string, pairId: string): SymbolInfo | undefined {
  const items = memory.get(sourceId)?.items ?? readCache(sourceId) ?? [];
  return items.find((s) => s.id === pairId || s.native === pairId || s.label === pairId);
}

export function fallbackNative(sourceId: string, pairId: string): string {
  if (sourceId === 'binance') {
    if (/USD$/i.test(pairId) && !/USDT$/i.test(pairId) && !/USDC$/i.test(pairId)) return `${pairId}T`.replace(/usdT$/i, 'USDT');
    return pairId.toUpperCase();
  }
  if (sourceId === 'coinbase') {
    if (pairId.includes('-')) return pairId.toUpperCase();
    const parts = splitKnownQuote(pairId);
    return parts ? `${parts.base}-${parts.quote}` : pairId;
  }
  if (sourceId === 'bitstamp') return pairId.toLowerCase().replace(/[-/]/g, '');
  if (sourceId === 'kraken') {
    if (pairId === 'BTCUSD') return 'XBTUSD';
    const compact = pairId.replace(/[-/]/g, '');
    if (isXStockNative(compact)) return compact;
    return compact.toUpperCase();
  }
  if (sourceId === 'yahoo') return pairId;
  return pairId;
}

export function nativeSymbol(source: DataSource, pairId: string): string {
  const listed = source.pairs.find((p) => p.id === pairId);
  if (listed) return listed.native;
  const hit = lookupSymbol(source.id, pairId);
  if (hit) return hit.native;
  return fallbackNative(source.id, pairId);
}

/** True for Kraken xStock tickers such as AAPLxUSD. */
export function isXStockNative(symbol: string): boolean {
  return /x(USD|EUR|GBP|USDT|USDC)$/.test(symbol.replace(/[-/]/g, ''));
}

export function isKrakenTokenized(pairId: string): boolean {
  const hit = lookupSymbol('kraken', pairId);
  if (hit) return hit.kind === 'stock';
  return isXStockNative(pairId);
}

export function krakenWsName(pairId: string): string | undefined {
  const hit = lookupSymbol('kraken', pairId);
  if (hit?.wsname) return hit.wsname;
  if (hit) return hit.label;
  const label = formatPairLabel('kraken', pairId);
  return label.includes('/') ? label : undefined;
}

function parseKrakenPairs(
  result: Record<string, Record<string, unknown>> | undefined,
  kind: AssetKind,
): SymbolInfo[] {
  const items: SymbolInfo[] = [];
  for (const [key, row] of Object.entries(result ?? {})) {
    if (key.endsWith('.d')) continue;
    const status = String(row.status ?? 'online');
    if (status && status !== 'online') continue;
    const altname = String(row.altname ?? key);
    const wsname = typeof row.wsname === 'string' ? row.wsname : undefined;
    let base: string;
    let quote: string;
    if (wsname && wsname.includes('/')) {
      const [b, q] = wsname.split('/');
      base = krakenAsset(b ?? '');
      quote = krakenAsset(q ?? '');
    } else {
      base = krakenAsset(String(row.base ?? ''));
      quote = krakenAsset(String(row.quote ?? ''));
    }
    if (!base || !quote) continue;
    if (kind === 'stock') {
      // Keep tradable xStocks (AAPLx). Skip parallel *SPV listings that duplicate the same name.
      if (!base.endsWith('x') || base.endsWith('SPV') || /SPV$/i.test(altname)) continue;
    }
    const id = kind === 'crypto' && base === 'BTC' && altname.startsWith('XBT') ? altname.replace(/^XBT/, 'BTC') : altname;
    items.push(makeInfo('kraken', id, altname, base, quote, wsname ?? `${base}/${quote}`, kind));
  }
  return items;
}

async function fetchKraken(): Promise<SymbolInfo[]> {
  const spot = await fetchJson<{ error?: string[]; result?: Record<string, Record<string, unknown>> }>(
    'https://api.kraken.com/0/public/AssetPairs',
  );
  if (spot.error?.length) throw new Error(spot.error.join(', '));
  const items = parseKrakenPairs(spot.result, 'crypto');
  try {
    const stocks = await fetchJson<{ error?: string[]; result?: Record<string, Record<string, unknown>> }>(
      'https://api.kraken.com/0/public/AssetPairs?aclass_base=tokenized_asset',
    );
    if (!stocks.error?.length) items.push(...parseKrakenPairs(stocks.result, 'stock'));
  } catch {
    // Tokenized list is optional: a failure must not hide spot pairs.
  }
  return items;
}

async function fetchBinance(): Promise<SymbolInfo[]> {
  const data = await fetchJson<{ symbols?: Array<Record<string, unknown>> }>('https://api.binance.com/api/v3/exchangeInfo');
  const items: SymbolInfo[] = [];
  for (const row of data.symbols ?? []) {
    if (row.status !== 'TRADING') continue;
    const permissions = Array.isArray(row.permissions) ? (row.permissions as string[]) : [];
    const sets = Array.isArray(row.permissionSets) ? (row.permissionSets as string[][]) : [];
    const spotAllowed = row.isSpotTradingAllowed === true || permissions.includes('SPOT') || sets.some((s) => s.includes('SPOT'));
    const explicitlyNonSpot = row.isSpotTradingAllowed === false && !permissions.includes('SPOT') && !sets.some((s) => s.includes('SPOT'));
    if (explicitlyNonSpot) continue;
    if (!spotAllowed && (permissions.length || sets.length)) continue;
    const symbol = String(row.symbol ?? '');
    const base = String(row.baseAsset ?? '');
    const quote = String(row.quoteAsset ?? '');
    if (!symbol || !base || !quote) continue;
    items.push(makeInfo('binance', symbol, symbol, base, quote));
  }
  return items;
}

async function fetchCoinbase(): Promise<SymbolInfo[]> {
  const rows = await fetchJson<Array<Record<string, unknown>>>('https://api.exchange.coinbase.com/products');
  const items: SymbolInfo[] = [];
  for (const row of rows) {
    if (row.status && row.status !== 'online') continue;
    if (row.trading_disabled === true || row.disabled === true) continue;
    const native = String(row.id ?? '');
    const base = String(row.base_currency ?? '');
    const quote = String(row.quote_currency ?? '');
    if (!native || !base || !quote) continue;
    const id = native.replace(/-/g, '');
    items.push(makeInfo('coinbase', id, native, base, quote));
  }
  return items;
}

async function fetchBitstamp(): Promise<SymbolInfo[]> {
  const rows = await fetchJson<Array<Record<string, unknown>>>('https://www.bitstamp.net/api/v2/trading-pairs-info/');
  const items: SymbolInfo[] = [];
  for (const row of rows) {
    const trading = String(row.trading ?? '');
    if (trading && trading.toLowerCase() !== 'enabled') continue;
    const native = String(row.url_symbol ?? '');
    const name = String(row.name ?? '');
    if (!native) continue;
    let base = '';
    let quote = '';
    if (name.includes('/')) {
      const [b, q] = name.split('/');
      base = (b ?? '').trim().toUpperCase();
      quote = (q ?? '').trim().toUpperCase();
    } else {
      const parts = splitKnownQuote(native);
      if (parts) {
        base = parts.base;
        quote = parts.quote;
      }
    }
    if (!base || !quote) continue;
    items.push(makeInfo('bitstamp', `${base}${quote}`, native, base, quote));
  }
  return items;
}

function fetchYahoo(): Promise<SymbolInfo[]> {
  return Promise.resolve(
    YAHOO_STOCKS.map((s) => makeInfo('yahoo', s.id, s.id, s.id, 'USD', undefined, 'stock', s.name, s.id)),
  );
}

const FETCHERS: Record<string, () => Promise<SymbolInfo[]>> = {
  kraken: fetchKraken,
  binance: fetchBinance,
  coinbase: fetchCoinbase,
  bitstamp: fetchBitstamp,
  yahoo: fetchYahoo,
};

export function symbolFromYahooQuote(symbol: string, name?: string): SymbolInfo {
  const id = symbol.trim();
  return makeInfo('yahoo', id, id, id, 'USD', undefined, 'stock', name, id);
}

export async function loadSourceSymbols(sourceId: string, force = false): Promise<SymbolInfo[]> {
  if (!force) {
    const cached = readCache(sourceId);
    if (cached?.length) return cached;
  }
  const pending = inflight.get(sourceId);
  if (pending) return pending;
  const fetcher = FETCHERS[sourceId];
  if (!fetcher) return [];
  const task = fetcher()
    .then((items) => {
      items.sort((a, b) => a.label.localeCompare(b.label, 'en'));
      writeCache(sourceId, items);
      return items;
    })
    .finally(() => inflight.delete(sourceId));
  inflight.set(sourceId, task);
  return task;
}

export async function loadAllSymbols(): Promise<{ items: SymbolInfo[]; errors: Record<string, string>; counts: Record<string, number> }> {
  const ids = Object.keys(FETCHERS);
  const results = await Promise.allSettled(ids.map((id) => loadSourceSymbols(id)));
  const items: SymbolInfo[] = [];
  const errors: Record<string, string> = {};
  const counts: Record<string, number> = {};
  results.forEach((result, i) => {
    const id = ids[i]!;
    if (result.status === 'fulfilled') {
      items.push(...result.value);
      counts[id] = result.value.length;
    } else {
      const cached = readCache(id);
      if (cached?.length) {
        items.push(...cached);
        counts[id] = cached.length;
      } else counts[id] = 0;
      errors[id] = result.reason instanceof Error ? result.reason.message : String(result.reason);
    }
  });
  return { items, errors, counts };
}

export function cachedCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of Object.keys(FETCHERS)) counts[id] = readCache(id)?.length ?? 0;
  return counts;
}

export type CategoryFilter = 'all' | 'crypto' | 'stocks';

export function searchSymbols(
  query: string,
  filter: SourceFilter,
  items: SymbolInfo[],
  limit = 100,
  category: CategoryFilter = 'all',
): SymbolInfo[] {
  const q = query.trim().toLowerCase().replace(/[-_/]/g, '');
  let pool = filter === 'all' ? items : items.filter((s) => s.sourceId === filter);
  if (category === 'crypto') pool = pool.filter((s) => s.kind !== 'stock');
  if (category === 'stocks') pool = pool.filter((s) => s.kind === 'stock');
  if (!q) {
    if (category === 'stocks') {
      const curated = pool.filter((s) => s.sourceId === 'yahoo');
      const rest = pool.filter((s) => s.sourceId !== 'yahoo');
      return [...curated, ...rest].slice(0, limit);
    }
    return pool.slice(0, limit);
  }
  const ranked: { item: SymbolInfo; rank: number; baseHits: boolean }[] = [];
  for (const item of pool) {
    const base = item.base.toLowerCase();
    const id = item.id.toLowerCase();
    const compact = `${item.base}${item.quote}`.toLowerCase();
    const label = item.label.toLowerCase().replace('/', '');
    let rank: number | null = null;
    if (base.startsWith(q) || id.startsWith(q) || compact.startsWith(q) || label.startsWith(q)) rank = 0;
    else if (item.search.includes(q) || base.includes(q) || id.includes(q) || label.includes(q)) rank = 1;
    if (rank === null) continue;
    ranked.push({ item, rank, baseHits: base.startsWith(q) });
  }
  ranked.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.baseHits !== b.baseHits) return a.baseHits ? -1 : 1;
    if (a.item.base.length !== b.item.base.length) return a.item.base.length - b.item.base.length;
    return a.item.label.localeCompare(b.item.label, 'en');
  });
  return ranked.slice(0, limit).map((r) => r.item);
}

export function aliasPairId(sourceId: string, pairId: string): string {
  if (sourceId === 'binance' && pairId === 'BTCUSD') return 'BTCUSDT';
  if (sourceId === 'binance' && pairId === 'ETHUSD') return 'ETHUSDT';
  if (sourceId === 'binance' && pairId === 'XRPUSD') return 'XRPUSDT';
  return pairId;
}
