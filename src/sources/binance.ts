// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { fetchJson } from './http';
import { aggregateCandles, sortDedup } from './aggregate';
import type { Candle, CandleQuery, DataSource, IntervalId, PairId, Ticker } from './types';
import { MAX_CANDLES, pairsFromNative } from './types';
import { sourceIntervalFor } from './intervals';
import { nativeSymbol } from './catalog';

const NATIVE_IDS = ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '1D', '1W', '1M'] as const;

const BINANCE_INTERVAL: Record<string, string> = {
  '1m': '1m',
  '3m': '3m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '2h': '2h',
  '4h': '4h',
  '1D': '1d',
  '1W': '1w',
  '1M': '1M',
};

type BinanceRow = [
  number,
  string,
  string,
  string,
  string,
  string,
  ...unknown[],
];

function rowToCandle(row: BinanceRow): Candle {
  return {
    time: Math.floor(row[0] / 1000),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
  };
}

async function fetchKlines(
  symbol: string,
  interval: string,
  opts?: CandleQuery,
): Promise<Candle[]> {
  const maxCandles = opts?.limit ?? MAX_CANDLES;
  const collected: Candle[] = [];
  let endTime: number | undefined = opts?.before !== undefined ? opts.before * 1000 - 1 : undefined;
  while (collected.length < maxCandles) {
    const url = new URL('https://api.binance.com/api/v3/klines');
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', interval);
    url.searchParams.set('limit', String(Math.min(1000, maxCandles - collected.length)));
    if (endTime !== undefined) url.searchParams.set('endTime', String(endTime));
    const rows = await fetchJson<BinanceRow[]>(url.toString());
    if (!rows.length) break;
    const batch = rows.map(rowToCandle).filter((c) => opts?.before === undefined || c.time < opts.before);
    collected.push(...batch);
    if (rows.length < 1000) break;
    const oldestOpen = rows[0][0];
    const nextEnd = oldestOpen - 1;
    if (endTime !== undefined && nextEnd >= endTime) break;
    endTime = nextEnd;
  }
  return sortDedup(collected);
}

export const binance: DataSource = {
  id: 'binance',
  name: 'Binance',
  pairs: pairsFromNative({
    XRPUSD: 'XRPUSDT',
    BTCUSD: 'BTCUSDT',
    ETHUSD: 'ETHUSDT',
  }),
  nativeIntervals: [...NATIVE_IDS],
  async fetchCandles(pairId: PairId, interval: IntervalId, opts?: CandleQuery): Promise<Candle[]> {
    const symbol = nativeSymbol(this, pairId);
    const srcId = sourceIntervalFor(this.nativeIntervals, interval);
    if (!srcId) throw new Error(`Binance: unsupported interval ${interval}`);
    const key = BINANCE_INTERVAL[srcId];
    if (!key) throw new Error(`Binance: unsupported interval ${interval}`);
    const raw = await fetchKlines(symbol, key, opts);
    if (srcId === interval) return raw;
    const aggregated = aggregateCandles(raw, interval);
    return opts?.before !== undefined ? aggregated.filter((c) => c.time < opts.before!) : aggregated;
  },
  async fetchTicker(pairId: PairId): Promise<Ticker> {
    const symbol = nativeSymbol(this, pairId);
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`;
    const data = await fetchJson<{ lastPrice: string; priceChangePercent: string }>(url);
    const last = Number(data.lastPrice);
    const change = Number(data.priceChangePercent);
    return { last, change24hPct: Number.isFinite(change) ? change : null };
  },
};
