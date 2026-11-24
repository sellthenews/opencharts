// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { aggregateCandles, sortDedup } from './aggregate';
import { changePct, fetchJson } from './http';
import type { Candle, CandleQuery, DataSource, IntervalId, PairId, Ticker } from './types';
import { MAX_CANDLES, pairsFromNative } from './types';
import { sourceIntervalFor } from './intervals';
import { nativeSymbol } from './catalog';

const STEP: Record<string, number> = {
  '1m': 60,
  '3m': 180,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '2h': 7200,
  '4h': 14400,
  '1D': 86400,
};
const NATIVE_IDS = Object.keys(STEP);

interface BitstampOhlcResponse {
  data?: {
    ohlc?: Array<{
      timestamp: string;
      open: string;
      high: string;
      low: string;
      close: string;
      volume: string;
    }>;
  };
}

function toCandle(row: NonNullable<NonNullable<BitstampOhlcResponse['data']>['ohlc']>[number]): Candle {
  return {
    time: Number(row.timestamp),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
  };
}

async function fetchStep(pair: string, step: number, opts?: CandleQuery): Promise<Candle[]> {
  const maxCandles = opts?.limit ?? MAX_CANDLES;
  const collected: Candle[] = [];
  let end: number | undefined = opts?.before !== undefined ? opts.before - 1 : undefined;
  let guard = 0;
  while (collected.length < maxCandles && guard < 12) {
    guard += 1;
    const url = new URL(`https://www.bitstamp.net/api/v2/ohlc/${encodeURIComponent(pair)}/`);
    url.searchParams.set('step', String(step));
    url.searchParams.set('limit', String(Math.min(1000, maxCandles - collected.length)));
    if (end !== undefined) url.searchParams.set('end', String(end));
    const data = await fetchJson<BitstampOhlcResponse>(url.toString());
    const rows = data.data?.ohlc ?? [];
    if (!rows.length) break;
    collected.push(...rows.map(toCandle).filter((c) => opts?.before === undefined || c.time < opts.before));
    const oldest = Math.min(...rows.map((r) => Number(r.timestamp)));
    if (end !== undefined && oldest >= end) break;
    end = oldest - 1;
    if (rows.length < 50) break;
  }
  return sortDedup(collected);
}

export const bitstamp: DataSource = {
  id: 'bitstamp',
  name: 'Bitstamp',
  pairs: pairsFromNative({
    XRPUSD: 'xrpusd',
    BTCUSD: 'btcusd',
    ETHUSD: 'ethusd',
  }),
  nativeIntervals: NATIVE_IDS,
  async fetchCandles(pairId: PairId, interval: IntervalId, opts?: CandleQuery): Promise<Candle[]> {
    const pair = nativeSymbol(this, pairId);
    const srcId = sourceIntervalFor(this.nativeIntervals, interval);
    if (!srcId || !STEP[srcId]) throw new Error(`Bitstamp: unsupported interval ${interval}`);
    const raw = await fetchStep(pair, STEP[srcId], opts);
    if (srcId === interval) return raw;
    const aggregated = aggregateCandles(raw, interval);
    return opts?.before !== undefined ? aggregated.filter((c) => c.time < opts.before!) : aggregated;
  },
  async fetchTicker(pairId: PairId): Promise<Ticker> {
    const pair = nativeSymbol(this, pairId);
    const url = `https://www.bitstamp.net/api/v2/ticker/${encodeURIComponent(pair)}/`;
    const data = await fetchJson<{ last: string; percent_change_24?: string; open_24?: string; open?: string }>(url);
    const last = Number(data.last);
    const pct = Number(data.percent_change_24);
    if (Number.isFinite(pct)) return { last, change24hPct: pct };
    const open = Number(data.open_24 ?? data.open);
    return { last, change24hPct: changePct(last, open) };
  },
};
