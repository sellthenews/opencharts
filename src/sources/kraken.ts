// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { aggregateCandles, sortDedup } from './aggregate';
import { changePct, fetchJson } from './http';
import type { Candle, DataSource, IntervalId, PairId, Ticker } from './types';
import { pairsFromNative } from './types';
import { nativeSymbol } from './catalog';

const NATIVE: Record<Exclude<IntervalId, '1M'>, number> = {
  '1h': 60,
  '4h': 240,
  '1D': 1440,
  '1W': 10080,
};

interface KrakenOhlcResponse {
  error: string[];
  result?: Record<string, unknown>;
}

async function fetchInterval(pair: string, interval: number): Promise<Candle[]> {
  const url = `https://api.kraken.com/0/public/OHLC?pair=${encodeURIComponent(pair)}&interval=${interval}`;
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
  nativeIntervals: ['1h', '4h', '1D', '1W'],
  async fetchCandles(pairId: PairId, interval: IntervalId): Promise<Candle[]> {
    const symbol = nativeSymbol(this, pairId);
    if (interval === '1M') {
      const weekly = await fetchInterval(symbol, NATIVE['1W']);
      return aggregateCandles(weekly, '1M');
    }
    return fetchInterval(symbol, NATIVE[interval]);
  },
  async fetchTicker(pairId: PairId): Promise<Ticker> {
    const symbol = nativeSymbol(this, pairId);
    const url = `https://api.kraken.com/0/public/Ticker?pair=${encodeURIComponent(symbol)}`;
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
