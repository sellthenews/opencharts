// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Wykresy contributors

export type IntervalId = '1h' | '4h' | '1D' | '1W' | '1M';

export const INTERVALS: { id: IntervalId; label: string }[] = [
  { id: '1h', label: '1h' },
  { id: '4h', label: '4h' },
  { id: '1D', label: '1D' },
  { id: '1W', label: '1W' },
  { id: '1M', label: '1M' },
];

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
  fetchCandles(pairId: PairId, interval: IntervalId): Promise<Candle[]>;
  fetchTicker(pairId: PairId): Promise<Ticker>;
}

export const MAX_CANDLES = 2500;

export function pairsFromNative(map: Record<string, string>): PairDef[] {
  return PAIR_IDS.map((id) => ({ id, label: PAIR_LABELS[id], native: map[id] }));
}

export function nativeOf(source: DataSource, pairId: PairId): string {
  const pair = source.pairs.find((p) => p.id === pairId);
  if (!pair) throw new Error(`Para ${pairId} nie jest obsługiwana przez ${source.name}`);
  return pair.native;
}
