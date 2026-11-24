// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { aggregateCandles, sortDedup } from './aggregate';
import { changePct, fetchJson } from './http';
import type { Candle, CandleQuery, DataSource, IntervalId, PairId, Ticker } from './types';
import { HISTORY_PAGE } from './types';
import { sourceIntervalFor } from './intervals';
import { binance } from './binance';
import { pairsFromNative } from './types';
import { isKrakenTokenized, nativeSymbol } from './catalog';

/** Kraken public OHLC intervals in minutes. 1M is aggregated. */
const NATIVE_MINUTES: Record<string, number> = {
  '1m': 1,
  '5m': 5,
  '15m': 15,
  '30m': 30,
  '1h': 60,
  '4h': 240,
  '1D': 1440,
  '1W': 10080,
};

const NATIVE_IDS = Object.keys(NATIVE_MINUTES);

interface KrakenOhlcResponse {
  error: string[];
  result?: Record<string, unknown>;
}

function tokenizedQuery(pair: string): string {
  return isKrakenTokenized(pair) ? '&asset_class=tokenized_asset' : '';
}

async function fetchInterval(pair: string, interval: number): Promise<Candle[]> {
  const url = `https://api.kraken.com/0/public/OHLC?pair=${encodeURIComponent(pair)}&interval=${interval}${tokenizedQuery(pair)}`;
  const data = await fetchJson<KrakenOhlcResponse>(url);
  if (data.error?.length) throw new Error(`Kraken: ${data.error.join(', ')}`);
  const result = data.result ?? {};
  const key = Object.keys(result).find((k) => k !== 'last');
  const rows = key ? (result[key] as unknown[]) : [];
  if (!Array.isArray(rows)) throw new Error('Kraken: unexpected OHLC format');
  const candles: Candle[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 7) continue;
    candles.push({
      time: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[6]),
    });
  }
  return sortDedup(candles);
}

export const kraken: DataSource = {
  id: 'kraken',
  name: 'Kraken',
  pairs: pairsFromNative({
    XRPUSD: 'XRPUSD',
    BTCUSD: 'XBTUSD',
    ETHUSD: 'ETHUSD',
  }),
  nativeIntervals: NATIVE_IDS,
  async fetchCandles(pairId: PairId, interval: IntervalId, opts?: CandleQuery): Promise<Candle[]> {
    const symbol = nativeSymbol(this, pairId);
    const srcId = sourceIntervalFor(NATIVE_IDS, interval) ?? '1h';
    let candles: Candle[];
    if (opts?.before !== undefined) {
      // Kraken OHLC cannot page backwards (always the latest ~720 bars), so older history comes from Binance.
      candles = await binance.fetchCandles(pairId, srcId, { before: opts.before, limit: opts.limit ?? HISTORY_PAGE });
    } else {
      candles = await fetchInterval(symbol, NATIVE_MINUTES[srcId] ?? 60);
    }
    if (srcId !== interval) {
      candles = aggregateCandles(candles, interval);
    }
    if (opts?.before !== undefined) candles = candles.filter((c) => c.time < opts.before!);
    if (opts?.limit && candles.length > opts.limit) candles = candles.slice(-opts.limit);
    return candles;
  },
  async fetchTicker(pairId: PairId): Promise<Ticker> {
    const symbol = nativeSymbol(this, pairId);
    const url = `https://api.kraken.com/0/public/Ticker?pair=${encodeURIComponent(symbol)}${tokenizedQuery(symbol)}`;
    const data = await fetchJson<{ error: string[]; result?: Record<string, Record<string, unknown>> }>(url);
    if (data.error?.length) throw new Error(`Kraken: ${data.error.join(', ')}`);
    const result = data.result ?? {};
    const key = Object.keys(result).find((k) => k !== 'last') ?? Object.keys(result)[0];
    const row = key ? result[key] : undefined;
    if (!row) throw new Error('Kraken: empty ticker');
    const lastRaw = Array.isArray(row.c) ? row.c[0] : row.c;
    const last = Number(lastRaw);
    const open = Number(row.o);
    return { last, change24hPct: changePct(last, open) };
  },
};
