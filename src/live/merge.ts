// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import type { Candle, IntervalId } from '../sources/types';

function monthStartUtc(time: number): number {
  const d = new Date(time * 1000);
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000);
}

export function isoToUnix(iso: string): number {
  const trimmed = iso.replace(/(\.\d{3})\d+Z$/, '$1Z');
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) throw new Error(`Invalid time: ${iso}`);
  return Math.floor(ms / 1000);
}

/** Merge a live OHLC bar into the candle list. For 1M, fold a smaller bar into the last month. */
export function mergeLiveCandle(candles: Candle[], incoming: Candle, viewInterval: IntervalId): Candle[] {
  if (!candles.length) return [{ ...incoming, time: viewInterval === '1M' ? monthStartUtc(incoming.time) : incoming.time }];
  const next = candles.map((c) => ({ ...c }));
  if (viewInterval === '1M') {
    const t = monthStartUtc(incoming.time);
    const last = next[next.length - 1]!;
    if (t < last.time) return next;
    if (t === last.time) {
      last.high = Math.max(last.high, incoming.high);
      last.low = Math.min(last.low, incoming.low);
      last.close = incoming.close;
      return next;
    }
    next.push({
      time: t,
      open: incoming.open,
      high: incoming.high,
      low: incoming.low,
      close: incoming.close,
      volume: incoming.volume,
    });
    return next;
  }
  const last = next[next.length - 1]!;
  if (incoming.time < last.time) {
    const i = next.findIndex((c) => c.time === incoming.time);
    if (i >= 0) next[i] = { ...incoming };
    return next;
  }
  if (incoming.time === last.time) {
    next[next.length - 1] = { ...incoming };
    return next;
  }
  next.push({ ...incoming });
  return next;
}
