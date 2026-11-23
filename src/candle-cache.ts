// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Wykresy contributors

import type { Candle, IntervalId, PairId } from './sources';

const mem = new Map<string, Candle[]>();
const PREFIX = 'wykresy:candles:';
const INDEX_KEY = 'wykresy:candles:index';
const MAX_SESSION = 8;

export function candleCacheKey(sourceId: string, pairId: string, intervalId: string): string {
  return `${sourceId}:${pairId}:${intervalId}`;
}

function isCandle(x: unknown): x is Candle {
  if (!x || typeof x !== 'object') return false;
  const c = x as Candle;
  return [c.time, c.open, c.high, c.low, c.close].every((n) => Number.isFinite(n));
}

function readIndex(): string[] {
  try {
    const raw = sessionStorage.getItem(INDEX_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

function writeIndex(keys: string[]): void {
  sessionStorage.setItem(INDEX_KEY, JSON.stringify(keys.slice(-MAX_SESSION)));
}

export function getCachedCandles(sourceId: string, pairId: PairId, intervalId: IntervalId): Candle[] | null {
  const key = candleCacheKey(sourceId, pairId, intervalId);
  const hit = mem.get(key);
  if (hit?.length) return hit;
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || !parsed.length || !parsed.every(isCandle)) return null;
    mem.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function setCachedCandles(sourceId: string, pairId: PairId, intervalId: IntervalId, candles: Candle[]): void {
  if (!candles.length) return;
  const key = candleCacheKey(sourceId, pairId, intervalId);
  mem.set(key, candles);
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(candles));
    const index = readIndex().filter((k) => k !== key);
    index.push(key);
    while (index.length > MAX_SESSION) {
      const drop = index.shift();
      if (drop) sessionStorage.removeItem(PREFIX + drop);
    }
    writeIndex(index);
  } catch {
    /* quota or private mode */
  }
}
