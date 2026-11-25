// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { aggregateCandles, sortDedup } from './aggregate';
import {
  DEX_NETWORKS,
  currencyCode,
  getDexNetwork,
  loadDexNetworkId,
  loadDexPairId,
  type DexNetwork,
  type LedgerAmount,
} from './dex-networks';
import {
  aggregateTrades,
  bookQualityToPrice,
  currencySpec,
  estimateLedgerIndex,
  fetchValidatedLedger,
  initialSampleCount,
  ledgerRpc,
  mergeSamples,
  midFromBooks,
  parseAmmInfo,
  shouldStopAccountTxPaging,
  tradesFromAccountTx,
} from './ledger-rpc';
import { fetchGeckoOhlcv, fetchGeckoTicker, searchGeckoPools } from './geckoterminal';
import { changePct } from './http';
import { intervalSeconds, sourceIntervalFor } from './intervals';
import type { Candle, CandleQuery, DataSource, IntervalId, PairDef, PairId, Ticker } from './types';

export interface DexPairRef {
  id: string;
  networkId: string;
  kind: 'amm' | 'book' | 'gt';
  label: string;
  base: string;
  quote: string;
  /** AMM account, pool address, or empty for a book pair identified by assets. */
  native: string;
  account?: string;
  address?: string;
  baseIssuer?: string;
  quoteIssuer?: string;
}

const RLUSD = { currency: '524C555344000000000000000000000000000000', issuer: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De', ticker: 'RLUSD' };
const EVR = { currency: 'EVR', issuer: 'rEvernodee8dJLaFsujS6q1EiXvZYmHXr8', ticker: 'EVR' };

const DEFAULT_PAIRS: Record<string, DexPairRef> = {
  xrpl: {
    id: 'amm:xrpl:rhWTXC2m2gGGA9WozUaoMm6kLAVPb1tcS3',
    networkId: 'xrpl',
    kind: 'amm',
    label: 'XRP/RLUSD',
    base: 'XRP',
    quote: 'RLUSD',
    native: 'rhWTXC2m2gGGA9WozUaoMm6kLAVPb1tcS3',
    account: 'rhWTXC2m2gGGA9WozUaoMm6kLAVPb1tcS3',
    quoteIssuer: RLUSD.issuer,
  },
  xahau: {
    id: `book:xahau:XAH:EVR.${EVR.issuer}`,
    networkId: 'xahau',
    kind: 'book',
    label: 'XAH/EVR',
    base: 'XAH',
    quote: 'EVR',
    native: `${EVR.currency}.${EVR.issuer}`,
    quoteIssuer: EVR.issuer,
  },
  eth: {
    id: 'gt:eth:0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
    networkId: 'eth',
    kind: 'gt',
    label: 'WETH/USDC',
    base: 'WETH',
    quote: 'USDC',
    native: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
    address: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
  },
};

const known = new Map<string, DexPairRef>();
for (const pair of Object.values(DEFAULT_PAIRS)) known.set(pair.id, pair);

export function rememberDexPair(pair: DexPairRef): void {
  known.set(pair.id, pair);
}

export function lookupDexPair(pairId: string): DexPairRef | undefined {
  return known.get(pairId) ?? parseDexPairId(pairId);
}

export function parseDexPairId(id: string): DexPairRef | undefined {
  const amm = /^amm:([a-z0-9_]+):([a-zA-Z0-9]{20,64})$/.exec(id);
  if (amm) {
    const networkId = amm[1]!;
    const account = amm[2]!;
    const net = getDexNetwork(networkId);
    return {
      id,
      networkId,
      kind: 'amm',
      label: account.slice(0, 6) + '…',
      base: net?.nativeLabel ?? 'BASE',
      quote: 'QUOTE',
      native: account,
      account,
    };
  }
  const book = /^book:([a-z0-9_]+):([A-Za-z0-9]+):([A-Za-z0-9]+)(?:\.([a-zA-Z0-9]+))?$/.exec(id);
  if (book) {
    const [, networkId, base, quote, quoteIssuer] = book;
    return {
      id,
      networkId: networkId!,
      kind: 'book',
      label: `${base}/${quote}`,
      base: base!,
      quote: quote!,
      native: quoteIssuer ? `${quote}.${quoteIssuer}` : `${base}/${quote}`,
      quoteIssuer,
    };
  }
  const gt = /^gt:([a-z0-9_]+):([a-zA-Z0-9]+)$/.exec(id);
  if (gt) {
    return {
      id,
      networkId: gt[1]!,
      kind: 'gt',
      label: gt[2]!.slice(0, 10) + '…',
      base: 'BASE',
      quote: 'QUOTE',
      native: gt[2]!,
      address: gt[2]!,
    };
  }
  return undefined;
}

export function defaultPairFor(networkId: string): DexPairRef | undefined {
  const cached = loadDexPairId(networkId);
  if (cached) {
    const parsed = lookupDexPair(cached);
    if (parsed && parsed.networkId === networkId) return parsed;
  }
  return DEFAULT_PAIRS[networkId];
}

export function currentDexNetwork(): DexNetwork {
  return getDexNetwork(loadDexNetworkId()) ?? DEX_NETWORKS[0]!;
}

export function defaultPairsForNetwork(networkId: string): PairDef[] {
  const def = defaultPairFor(networkId);
  const extras = [...known.values()].filter((p) => p.networkId === networkId && p.id !== def?.id);
  const list = def ? [def, ...extras] : extras;
  return list.map((p) => ({ id: p.id, label: p.label, native: p.native }));
}

const NATIVE_IDS = ['1m', '5m', '15m', '30m', '1h', '4h', '1D', '1W', '1M'] as const;

function bucketSeconds(interval: string): number {
  if (interval === '1M') return 30 * 86400;
  return intervalSeconds(interval) ?? 86400;
}

async function fetchAmmAccountTx(network: DexNetwork, account: string, pages = 3): Promise<unknown[]> {
  const all: unknown[] = [];
  let marker: unknown;
  for (let i = 0; i < pages; i++) {
    const params: Record<string, unknown> = {
      account,
      ledger_index_min: -1,
      ledger_index_max: -1,
      limit: 100,
      forward: false,
      binary: false,
    };
    if (marker) params.marker = marker;
    try {
      const result = await ledgerRpc<{ transactions?: unknown[]; marker?: unknown }>(network, 'account_tx', params);
      const txs = result.transactions ?? [];
      all.push(...txs);
      if (!result.marker || txs.length === 0) break;
      marker = result.marker;
    } catch (err) {
      if (shouldStopAccountTxPaging(all.length, err)) break;
      throw err;
    }
  }
  return all;
}

async function sampleAmmPrices(
  network: DexNetwork,
  pair: DexPairRef,
  times: number[],
): Promise<{ time: number; price: number }[]> {
  if (!times.length) return [];
  const current = await fetchValidatedLedger(network);
  const out: { time: number; price: number }[] = [];
  const concurrency = 2;
  let failedChunks = 0;
  for (let i = 0; i < times.length; i += concurrency) {
    const chunk = times.slice(i, i + concurrency);
    const rows = await Promise.all(
      chunk.map(async (time) => {
        const index = estimateLedgerIndex(current.index, current.closeTime, time);
        try {
          const params: Record<string, unknown> = { ledger_index: index };
          if (pair.account) params.amm_account = pair.account;
          else {
            params.asset = currencySpec(pair.base, pair.baseIssuer, network.native);
            params.asset2 = currencySpec(pair.quote, pair.quoteIssuer, network.native);
          }
          const result = await ledgerRpc<Record<string, unknown>>(network, 'amm_info', params);
          const snap = parseAmmInfo(result, network.native);
          if (!snap) return null;
          return { time, price: snap.price };
        } catch {
          return null;
        }
      }),
    );
    let hit = 0;
    for (const row of rows) if (row) { out.push(row); hit += 1; }
    failedChunks = hit ? 0 : failedChunks + 1;
    if (failedChunks >= 2) break;
  }
  return out;
}

async function sampleBookPrices(
  network: DexNetwork,
  pair: DexPairRef,
  times: number[],
): Promise<{ time: number; price: number }[]> {
  if (!times.length) return [];
  const current = await fetchValidatedLedger(network);
  const out: { time: number; price: number }[] = [];
  const concurrency = 2;
  let failedChunks = 0;
  for (let i = 0; i < times.length; i += concurrency) {
    const chunk = times.slice(i, i + concurrency);
    const rows = await Promise.all(chunk.map(async (time) => {
      const index = estimateLedgerIndex(current.index, current.closeTime, time);
      try {
        const quote = await fetchBookMid(network, pair, index);
        return quote.mid != null ? { time, price: quote.mid } : null;
      } catch {
        return null;
      }
    }));
    let hit = 0;
    for (const row of rows) if (row) { out.push(row); hit += 1; }
    failedChunks = hit ? 0 : failedChunks + 1;
    if (failedChunks >= 2) break;
  }
  return out;
}

async function fetchBookMid(network: DexNetwork, pair: DexPairRef, ledgerIndex: number | 'validated' = 'validated') {
  const base = currencySpec(pair.base, pair.baseIssuer, network.native);
  const quote = currencySpec(pair.quote, pair.quoteIssuer, network.native);
  const [askRes, bidRes] = await Promise.all([
    ledgerRpc<{ offers?: { TakerGets?: LedgerAmount; TakerPays?: LedgerAmount }[] }>(network, 'book_offers', {
      taker_gets: base,
      taker_pays: quote,
      limit: 5,
      ledger_index: ledgerIndex,
    }),
    ledgerRpc<{ offers?: { TakerGets?: LedgerAmount; TakerPays?: LedgerAmount }[] }>(network, 'book_offers', {
      taker_gets: quote,
      taker_pays: base,
      limit: 5,
      ledger_index: ledgerIndex,
    }),
  ]);
  const asks = (askRes.offers ?? [])
    .map((o) => bookQualityToPrice(o, pair.base, pair.quote, network.native))
    .filter((n): n is number => n != null && n > 0);
  const bids = (bidRes.offers ?? [])
    .map((o) => bookQualityToPrice(o, pair.base, pair.quote, network.native))
    .filter((n): n is number => n != null && n > 0);
  return midFromBooks(bids, asks);
}

function sampleTimes(interval: string, last: number, count: number): number[] {
  const step = bucketSeconds(interval);
  const end = Math.floor(last / step) * step;
  const times: number[] = [];
  for (let i = count - 1; i >= 0; i--) times.push(end - i * step);
  return times;
}

function appendLastPrice(candles: Candle[], time: number, price: number): Candle[] {
  const last = candles[candles.length - 1];
  if (!last || last.time < time) {
    candles.push({
      time,
      open: last?.close ?? price,
      high: Math.max(last?.close ?? price, price),
      low: Math.min(last?.close ?? price, price),
      close: price,
      volume: 0,
    });
  } else {
    last.close = price;
    last.high = Math.max(last.high, price);
    last.low = Math.min(last.low, price);
  }
  return candles;
}

async function fetchLedgerCandles(network: DexNetwork, pair: DexPairRef, interval: IntervalId, opts?: CandleQuery): Promise<Candle[]> {
  const step = bucketSeconds(interval);
  const now = Math.floor(Date.now() / 1000);
  const lastTime = opts?.before != null ? Math.floor((opts.before - 1) / step) * step : Math.floor(now / step) * step;
  const sampleCount = initialSampleCount(interval, opts?.before != null);
  let candles: Candle[] = [];
  if (pair.kind === 'amm' && pair.account) {
    const info = await ledgerRpc<Record<string, unknown>>(network, 'amm_info', { amm_account: pair.account, ledger_index: 'validated' });
    const snap = parseAmmInfo(info, network.native);
    if (snap) {
      pair.account = snap.account;
      if (snap.amount.currency) pair.base = currencyCode(snap.amount.currency) || pair.base;
      if (snap.amount2.currency) pair.quote = currencyCode(snap.amount2.currency) || pair.quote;
      pair.label = `${pair.base}/${pair.quote}`;
      rememberDexPair(pair);
    }
    try {
      const txs = await fetchAmmAccountTx(network, pair.account);
      const trades = tradesFromAccountTx(txs, pair.account, network.native);
      candles = aggregateTrades(trades, step);
    } catch (err) {
      if (!snap || !Number.isFinite(snap.price)) throw err;
    }
    if (snap && Number.isFinite(snap.price) && opts?.before === undefined) {
      appendLastPrice(candles, lastTime, snap.price);
    }
    const oldestTrade = candles[0]?.time;
    const need = sampleTimes(interval, lastTime, sampleCount);
    const missing = need.filter((t) => !oldestTrade || t < oldestTrade - step);
    if (missing.length) {
      try {
        const samples = await sampleAmmPrices(network, pair, missing);
        candles = mergeSamples(candles, samples);
      } catch {
        /* keep trades / current price already collected */
      }
    }
  } else if (pair.kind === 'book') {
    const quote = await fetchBookMid(network, pair, 'validated');
    const mid = quote.mid;
    const times = sampleTimes(interval, lastTime, sampleCount);
    try {
      const samples = await sampleBookPrices(network, pair, times);
      candles = mergeSamples([], samples);
    } catch {
      candles = [];
    }
    if (mid != null && opts?.before === undefined) {
      appendLastPrice(candles, lastTime, mid);
    }
    if (!candles.length && mid == null) throw new Error('Order book: no quotes');
  } else {
    throw new Error('Unexpected ledger pair kind');
  }
  candles = sortDedup(candles);
  if (opts?.before !== undefined) candles = candles.filter((c) => c.time < opts.before!);
  if (opts?.limit && candles.length > opts.limit) candles = candles.slice(-opts.limit);
  return candles;
}

async function fetchGtCandles(pair: DexPairRef, interval: IntervalId, opts?: CandleQuery): Promise<Candle[]> {
  if (!pair.address) throw new Error('Missing pool address');
  const srcId = sourceIntervalFor(NATIVE_IDS, interval) ?? interval;
  let candles = await fetchGeckoOhlcv(pair.networkId, pair.address, srcId, opts?.before);
  if (srcId !== interval) candles = aggregateCandles(candles, interval);
  if (opts?.before !== undefined) candles = candles.filter((c) => c.time < opts.before!);
  if (opts?.limit && candles.length > opts.limit) candles = candles.slice(-opts.limit);
  return candles;
}

export const dex: DataSource = {
  id: 'dex',
  name: 'DEX',
  get pairs(): readonly PairDef[] {
    return defaultPairsForNetwork(loadDexNetworkId());
  },
  nativeIntervals: NATIVE_IDS,
  async fetchCandles(pairId: PairId, interval: IntervalId, opts?: CandleQuery): Promise<Candle[]> {
    const pair = lookupDexPair(pairId) ?? defaultPairFor(loadDexNetworkId());
    if (!pair) throw new Error('No DEX pair selected');
    rememberDexPair(pair);
    const network = getDexNetwork(pair.networkId) ?? currentDexNetwork();
    if (pair.kind === 'gt') return fetchGtCandles(pair, interval, opts);
    return fetchLedgerCandles(network, pair, interval, opts);
  },
  async fetchTicker(pairId: PairId): Promise<Ticker> {
    const pair = lookupDexPair(pairId) ?? defaultPairFor(loadDexNetworkId());
    if (!pair) throw new Error('No DEX pair selected');
    const network = getDexNetwork(pair.networkId) ?? currentDexNetwork();
    if (pair.kind === 'gt' && pair.address) {
      return fetchGeckoTicker(pair.networkId, pair.address);
    }
    if (pair.kind === 'amm' && pair.account) {
      const snap = parseAmmInfo(
        await ledgerRpc<Record<string, unknown>>(network, 'amm_info', { amm_account: pair.account, ledger_index: 'validated' }),
        network.native,
      );
      if (!snap) throw new Error('AMM: no price');
      return { last: snap.price, change24hPct: null };
    }
    const quote = await fetchBookMid(network, pair, 'validated');
    if (quote.mid == null) throw new Error('Order book: no quotes');
    return { last: quote.mid, change24hPct: null };
  },
};

export async function searchDexSymbols(networkId: string, query: string): Promise<DexPairRef[]> {
  const network = getDexNetwork(networkId);
  if (!network) return [];
  if (network.kind === 'geckoterminal') {
    const pools = await searchGeckoPools(networkId, query);
    const refs = pools.map((p) => {
      const ref: DexPairRef = {
        id: p.id,
        networkId: p.networkId,
        kind: 'gt',
        label: `${p.base}/${p.quote}`,
        base: p.base,
        quote: p.quote,
        native: p.address,
        address: p.address,
      };
      rememberDexPair(ref);
      return ref;
    });
    return refs;
  }
  const q = query.trim().toLowerCase();
  const curated = defaultPairsForNetwork(networkId)
    .map((p) => lookupDexPair(p.id))
    .filter((p): p is DexPairRef => Boolean(p));
  if (!q) return curated;
  const hits = curated.filter((p) => `${p.label} ${p.id} ${p.native} ${p.base} ${p.quote}`.toLowerCase().includes(q));
  const amm = q.match(/^(r[a-zA-Z0-9]{20,})$/);
  if (amm && network.kind === 'amm') {
    const id = `amm:${networkId}:${amm[1]}`;
    const ref = parseDexPairId(id);
    if (ref) {
      rememberDexPair(ref);
      hits.unshift(ref);
    }
  }
  return hits;
}

export { changePct };
