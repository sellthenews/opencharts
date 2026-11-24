// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { aggregateCandles, sortDedup } from './aggregate';
import { changePct, fetchJson } from './http';
import type { Candle, CandleQuery, DataSource, IntervalId, PairId, Ticker } from './types';
import { MAX_CANDLES, pairsFromNative } from './types';
import { sourceIntervalFor } from './intervals';
import { nativeSymbol } from './catalog';

/** Coinbase Exchange public candles: granularity in seconds. */
const NATIVE_GRANULARITY: Record<string, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '1D': 86400,
};
const NATIVE_IDS = Object.keys(NATIVE_GRANULARITY);

const PAGE = 300;

/** [time, low, high, open, close, volume] */
type CoinbaseRow = [number, number, number, number, number, number];

function rowToCandle(row: CoinbaseRow): Candle {
  return {
    time: Number(row[0]),
    open: Number(row[3]),
    high: Number(row[2]),
    low: Number(row[1]),
    close: Number(row[4]),
    volume: Number(row[5]),
  };
}

async function fetchGranularity(
  product: string,
  granularity: number,
  opts?: CandleQuery,
): Promise<Candle[]> {
  const maxCandles = opts?.limit ?? MAX_CANDLES;
  const collected: Candle[] = [];
  let end = opts?.before !== undefined ? opts.before : Math.floor(Date.now() / 1000);
  let guard = 0;
  while (collected.length < maxCandles && guard < 16) {
    guard += 1;
    const start = end - granularity * PAGE;
    const url =
      `https://api.exchange.coinbase.com/products/${encodeURIComponent(product)}/candles` +
      `?granularity=${granularity}&start=${new Date(start * 1000).toISOString()}` +
      `&end=${new Date(end * 1000).toISOString()}`;
    const rows = await fetchJson<CoinbaseRow[]>(url);
    if (!rows.length) break;
    const batch = rows.map(rowToCandle).filter((c) => opts?.before === undefined || c.time < opts.before);
    collected.push(...batch);
    const oldest = Math.min(...rows.map((r) => Number(r[0])));
    if (oldest >= end) break;
    end = oldest;
    if (rows.length < 10) break;
  }
  return sortDedup(collected);
}

export const coinbase: DataSource = {
  id: 'coinbase',
  name: 'Coinbase',
  pairs: pairsFromNative({
    XRPUSD: 'XRP-USD',
    BTCUSD: 'BTC-USD',
    ETHUSD: 'ETH-USD',
  }),
  nativeIntervals: NATIVE_IDS,
  async fetchCandles(pairId: PairId, interval: IntervalId, opts?: CandleQuery): Promise<Candle[]> {
    const product = nativeSymbol(this, pairId);
    const srcId = sourceIntervalFor(this.nativeIntervals, interval);
    if (!srcId) throw new Error(`Coinbase: unsupported interval ${interval}`);
    const gran = NATIVE_GRANULARITY[srcId];
    if (!gran) throw new Error(`Coinbase: unsupported interval ${interval}`);
    const raw = await fetchGranularity(product, gran, opts);
    if (srcId === interval) return raw;
    const aggregated = aggregateCandles(raw, interval);
    return opts?.before !== undefined ? aggregated.filter((c) => c.time < opts.before!) : aggregated;
  },
  async fetchTicker(pairId: PairId): Promise<Ticker> {
    const product = nativeSymbol(this, pairId);
    const url = `https://api.exchange.coinbase.com/products/${encodeURIComponent(product)}/stats`;
    const data = await fetchJson<{ last: string; open: string }>(url);
    const last = Number(data.last);
    return { last, change24hPct: changePct(last, Number(data.open)) };
  },
};
