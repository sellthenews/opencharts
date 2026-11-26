// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

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
import {
  DEFAULT_PAIRS,
  curatedPairsFor,
  invertCandles,
  labelFromGtAddress,
  mergeDexPairs,
  parseClassicAddress,
  parseLedgerTokenInput,
  pairFromPastedToken,
  type DexPairRef,
} from './ledger-tokens';

export type { DexPairRef } from './ledger-tokens';

const known = new Map<string, DexPairRef>();
for (const pair of Object.values(DEFAULT_PAIRS)) known.set(pair.id, pair);
for (const pair of [...curatedPairsFor('xrpl'), ...curatedPairsFor('xahau')]) known.set(pair.id, pair);

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
  const gt = /^gt:([a-z0-9_]+):([a-zA-Z0-9._-]+)(?::(inv))?$/.exec(id);
  if (gt) {
    const networkId = gt[1]!;
    const address = gt[2]!;
    const invert = gt[3] === 'inv';
    const named = labelFromGtAddress(networkId, address, invert);
    return {
      id,
      networkId,
      kind: 'gt',
      label: named.label === address.slice(0, 10) + '…' && !invert ? address.slice(0, 10) + '…' : named.label,
      base: named.base,
      quote: named.quote,
      native: address,
      address,
      invert,
      baseIssuer: invert ? undefined : named.issuer,
      quoteIssuer: invert ? named.issuer : undefined,
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
  const extras = mergeDexPairs(
    def ? [def] : [],
    [...curatedPairsFor(networkId), ...known.values()].filter((p) => p.networkId === networkId),
  );
  for (const pair of extras) rememberDexPair(pair);
  return extras.map((p) => ({ id: p.id, label: p.label, native: p.native }));
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
  // Polls only need the last bars. Ask upstream for just enough source bars to rebuild them.
  let bars = 1000;
  if (opts?.limit && opts.limit <= 5 && opts.before === undefined) {
    const ratio = Math.max(1, Math.ceil((intervalSeconds(interval) ?? 86400) / Math.max(1, intervalSeconds(srcId) ?? 86400)));
    bars = Math.min(1000, (opts.limit + 1) * ratio);
  }
  let candles = await fetchGeckoOhlcv(pair.networkId, pair.address, srcId, opts?.before, bars);
  if (pair.invert) candles = invertCandles(candles);
  if (srcId !== interval) candles = aggregateCandles(candles, interval);
  if (opts?.before !== undefined) candles = candles.filter((c) => c.time < opts.before!);
  if (opts?.limit && candles.length > opts.limit) candles = candles.slice(-opts.limit);
  return candles;
}

/** Prefer GeckoTerminal OHLCV when a pool address is known, to avoid hammering ledger nodes. */
async function fetchCandlesPreferringGecko(pair: DexPairRef, interval: IntervalId, opts?: CandleQuery): Promise<Candle[] | null> {
  if (!pair.address) return null;
  try {
    const candles = await fetchGtCandles(pair, interval, opts);
    return candles.length ? candles : null;
  } catch {
    return null;
  }
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
    const fromGecko = await fetchCandlesPreferringGecko(pair, interval, opts);
    if (fromGecko) return fromGecko;
    return fetchLedgerCandles(network, pair, interval, opts);
  },
  async fetchTicker(pairId: PairId): Promise<Ticker> {
    const pair = lookupDexPair(pairId) ?? defaultPairFor(loadDexNetworkId());
    if (!pair) throw new Error('No DEX pair selected');
    const network = getDexNetwork(pair.networkId) ?? currentDexNetwork();
    if (pair.address) {
      try {
        const ticker = await fetchGeckoTicker(pair.networkId, pair.address);
        if (pair.invert && ticker.last) ticker.last = 1 / ticker.last;
        return ticker;
      } catch {
        if (pair.kind === 'gt') throw new Error('GeckoTerminal: no last price');
      }
    }
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

function refsFromGeckoPools(networkId: string, query: string): Promise<DexPairRef[]> {
  return searchGeckoPools(networkId, query).then((pools) => {
    const refs = pools.map((p) => {
      const named = labelFromGtAddress(p.networkId || networkId, p.address);
      const ref: DexPairRef = {
        id: p.id,
        networkId: p.networkId || networkId,
        kind: 'gt',
        label: p.base && p.quote ? `${p.base}/${p.quote}` : named.label,
        base: p.base || named.base,
        quote: p.quote || named.quote,
        native: p.address,
        address: p.address,
        baseIssuer: named.issuer,
      };
      rememberDexPair(ref);
      return ref;
    });
    return refs;
  });
}

function matchesQuery(pair: DexPairRef, q: string): boolean {
  const hay = `${pair.label} ${pair.id} ${pair.native} ${pair.base} ${pair.quote} ${pair.address ?? ''} ${pair.account ?? ''} ${pair.baseIssuer ?? ''} ${pair.quoteIssuer ?? ''}`.toLowerCase();
  return hay.includes(q);
}

export async function searchDexSymbols(networkId: string, query: string): Promise<DexPairRef[]> {
  const network = getDexNetwork(networkId);
  if (!network) return [];
  const q = query.trim();
  const curated = curatedPairsFor(networkId);
  for (const pair of curated) rememberDexPair(pair);

  if (network.kind === 'geckoterminal') {
    const pools = await refsFromGeckoPools(networkId, q);
    const local = q ? curated.filter((p) => p.networkId === networkId && matchesQuery(p, q.toLowerCase())) : curated.filter((p) => p.networkId === networkId);
    return mergeDexPairs(local, pools);
  }

  const local = q ? curated.filter((p) => matchesQuery(p, q.toLowerCase())) : curated;
  const pasted: DexPairRef[] = [];
  const token = parseLedgerTokenInput(q);
  if (token) {
    const ref = pairFromPastedToken(networkId, network.native, token);
    rememberDexPair(ref);
    pasted.push(ref);
  }
  const account = parseClassicAddress(q);
  if (account && network.kind === 'amm') {
    const ref = parseDexPairId(`amm:${networkId}:${account}`);
    if (ref) {
      rememberDexPair(ref);
      pasted.push(ref);
    }
  }

  let remote: DexPairRef[] = [];
  if (networkId === 'xrpl') {
    try {
      remote = await refsFromGeckoPools('xrpl', q);
    } catch {
      remote = [];
    }
  }
  return mergeDexPairs(pasted, mergeDexPairs(local, remote));
}

export { changePct };
