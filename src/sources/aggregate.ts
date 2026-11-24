// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import type { Candle, IntervalId } from './types';
import { intervalSeconds } from './intervals';

/** Monday 00:00 UTC of the ISO week containing `time`. */
export function weekStartUtc(time: number): number {
  const d = new Date(time * 1000);
  const day = d.getUTCDay();
  const daysFromMonday = (day + 6) % 7;
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysFromMonday) / 1000);
}

/** First day of the UTC calendar month. */
export function monthStartUtc(time: number): number {
  const d = new Date(time * 1000);
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000);
}

export function isValidCandle(c: Candle): boolean {
  return (
    Number.isFinite(c.time) &&
    Number.isFinite(c.open) &&
    Number.isFinite(c.high) &&
    Number.isFinite(c.low) &&
    Number.isFinite(c.close) &&
    c.open > 0 &&
    c.high > 0 &&
    c.low > 0 &&
    c.close > 0 &&
    c.high >= c.low &&
    Number.isFinite(c.volume) &&
    c.volume >= 0
  );
}

export function bucketStart(time: number, interval: IntervalId): number {
  if (interval === '1M') return monthStartUtc(time);
  if (interval === '1W') return weekStartUtc(time);
  const step = intervalSeconds(interval);
  if (!step) return time;
  return Math.floor(time / step) * step;
}

/** Merge smaller candles into `interval` buckets. Input may be unsorted. */
export function aggregateCandles(candles: Candle[], interval: IntervalId): Candle[] {
  const buckets = new Map<number, Candle>();
  const ordered = [...candles].filter(isValidCandle).sort((a, b) => a.time - b.time);
  for (const c of ordered) {
    const t = bucketStart(c.time, interval);
    const existing = buckets.get(t);
    if (!existing) {
      buckets.set(t, {
        time: t,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      });
    } else {
      existing.high = Math.max(existing.high, c.high);
      existing.low = Math.min(existing.low, c.low);
      existing.close = c.close;
      existing.volume += c.volume;
    }
  }
  return [...buckets.values()].sort((a, b) => a.time - b.time);
}

export function sortDedup(candles: Candle[]): Candle[] {
  const byTime = new Map<number, Candle>();
  for (const c of candles) {
    if (!isValidCandle(c)) continue;
    byTime.set(c.time, c);
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}
