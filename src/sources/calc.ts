// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { bucketSamples, parseGlobal, ratioCandles, type Dominance } from './calc-math';
import { changePct, fetchJson } from './http';
import { intervalSeconds } from './intervals';
import { kraken } from './kraken';
import type { Candle, CandleQuery, DataSource, IntervalId, PairId, Ticker } from './types';

/**
 * Calculated series built from other free sources:
 * - XLMXRP: Kraken XLM/USD divided by Kraken XRP/USD (full candle history).
 * - BTC.D / XRP.D: market-cap dominance from CoinGecko /global. CoinGecko only serves the
 *   live value for free, so the chart is built from samples this browser has collected.
 */

const NATIVE: IntervalId[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1D', '1W'];

export const CALC_PAIRS = [
  { id: 'XLMXRP', label: 'XLM/XRP', native: 'XLMXRP' },
  { id: 'BTC.D', label: 'BTC dominance', native: 'BTC.D' },
  { id: 'XRP.D', label: 'XRP dominance', native: 'XRP.D' },
] as const;

const SAMPLE_KEY = 'opencharts:dominance';
const SAMPLE_GAP_S = 5 * 60;
const SAMPLE_MAX = 4000;
const GLOBAL_URL = 'https://api.coingecko.com/api/v3/global';
const CACHE_MS = 5 * 60 * 1000;

let latest: { at: number; value: Dominance } | undefined;
let inflight: Promise<Dominance> | undefined;

function readSamples(): Dominance[] {
  try {
    const raw = localStorage.getItem(SAMPLE_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(arr)) return [];
    return arr.filter((s): s is Dominance => !!s && Number.isFinite(s.t) && Number.isFinite(s.btc) && Number.isFinite(s.xrp));
  } catch {
    return [];
  }
}

function storeSample(s: Dominance): void {
  try {
    const all = readSamples();
    const last = all[all.length - 1];
    if (last && s.t - last.t < SAMPLE_GAP_S) return;
    all.push(s);
    localStorage.setItem(SAMPLE_KEY, JSON.stringify(all.slice(-SAMPLE_MAX)));
  } catch {
    /* storage full or blocked: the live value still works */
  }
}

async function loadDominance(): Promise<Dominance> {
  if (latest && Date.now() - latest.at < CACHE_MS) return latest.value;
  if (!inflight) {
    inflight = fetchJson<unknown>(GLOBAL_URL)
      .then((json) => {
        const value = parseGlobal(json);
        latest = { at: Date.now(), value };
        storeSample(value);
        return value;
      })
      .finally(() => {
        inflight = undefined;
      });
  }
  return inflight;
}

async function ratioTicker(): Promise<Ticker> {
  const [a, b] = await Promise.all([kraken.fetchTicker('XLMUSD'), kraken.fetchTicker('XRPUSD')]);
  const last = a.last / b.last;
  let change24hPct: number | null = null;
  if (a.change24hPct != null && b.change24hPct != null) {
    change24hPct = ((1 + a.change24hPct / 100) / (1 + b.change24hPct / 100) - 1) * 100;
  }
  return { last, change24hPct };
}

export const calc: DataSource = {
  id: 'calc',
  name: 'Swapwick (calculated)',
  pairs: CALC_PAIRS,
  nativeIntervals: NATIVE,
  async fetchCandles(pairId: PairId, interval: IntervalId, opts?: CandleQuery): Promise<Candle[]> {
    if (pairId === 'XLMXRP') {
      if (opts?.before !== undefined) return [];
      const [a, b] = await Promise.all([kraken.fetchCandles('XLMUSD', interval, opts), kraken.fetchCandles('XRPUSD', interval, opts)]);
      return ratioCandles(a, b);
    }
    if (pairId !== 'BTC.D' && pairId !== 'XRP.D') throw new Error(`Calculated source: unknown pair ${pairId}`);
    if (opts?.before !== undefined) return [];
    await loadDominance();
    const step = intervalSeconds(interval) ?? 3600;
    const pick = pairId === 'BTC.D' ? (s: Dominance) => s.btc : (s: Dominance) => s.xrp;
    const candles = bucketSamples(readSamples(), pick, step);
    if (!candles.length && latest) return bucketSamples([latest.value], pick, step);
    return candles;
  },
  async fetchTicker(pairId: PairId): Promise<Ticker> {
    if (pairId === 'XLMXRP') return ratioTicker();
    if (pairId !== 'BTC.D' && pairId !== 'XRP.D') throw new Error(`Calculated source: unknown pair ${pairId}`);
    const now = await loadDominance();
    const pick = pairId === 'BTC.D' ? (s: Dominance) => s.btc : (s: Dominance) => s.xrp;
    const dayAgo = now.t - 24 * 3600;
    const old = readSamples().filter((s) => s.t <= dayAgo + 3600).pop();
    return { last: pick(now), change24hPct: old ? changePct(pick(now), pick(old)) : null };
  },
};
