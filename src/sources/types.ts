// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

/** Builtin or custom interval id, e.g. `15m`, `1h`, `4h`, `1D`, or `6h`. */
export type IntervalId = string;

export { INTERVALS, isIntervalId, intervalLabel, parseIntervalId } from './intervals';

export const PAIR_IDS = ['XRPUSD', 'BTCUSD', 'ETHUSD'] as const;
export type PairId = string;

export const PAIR_LABELS: Record<string, string> = {
  XRPUSD: 'XRP/USD',
  BTCUSD: 'BTC/USD',
  ETHUSD: 'ETH/USD',
};

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Ticker {
  last: number;
  change24hPct: number | null;
}

export interface PairDef {
  id: PairId;
  label: string;
  native: string;
}

export interface DataSource {
  id: string;
  name: string;
  pairs: readonly PairDef[];
  /** Intervals the exchange serves natively. Others are aggregated in fetchCandles. */
  nativeIntervals: readonly IntervalId[];
  fetchCandles(pairId: PairId, interval: IntervalId, opts?: CandleQuery): Promise<Candle[]>;
  fetchTicker(pairId: PairId): Promise<Ticker>;
}

export interface CandleQuery {
  /** Return candles strictly older than this unix time (seconds). */
  before?: number;
  limit?: number;
  /** Yahoo stocks: include pre-market and after-hours bars when the venue supports them. */
  includePrePost?: boolean;
}

export const MAX_CANDLES = 2500;
export const MAX_HISTORY = 10_000;
export const HISTORY_PAGE = 1000;

export function pairsFromNative(map: Record<string, string>): PairDef[] {
  return PAIR_IDS.map((id) => ({ id, label: PAIR_LABELS[id], native: map[id] }));
}

export function nativeOf(source: DataSource, pairId: PairId): string {
  const pair = source.pairs.find((p) => p.id === pairId);
  if (!pair) throw new Error(`Pair ${pairId} is not supported by ${source.name}`);
  return pair.native;
}
