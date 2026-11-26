// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import type { Candle } from './types';

export type Dominance = { t: number; btc: number; xrp: number };

export function parseGlobal(json: unknown, now = Date.now()): Dominance {
  const pct = (json as { data?: { market_cap_percentage?: Record<string, number> } })?.data?.market_cap_percentage;
  const btc = Number(pct?.btc);
  const xrp = Number(pct?.xrp);
  if (!Number.isFinite(btc) || !Number.isFinite(xrp)) throw new Error('CoinGecko: dominance not available');
  return { t: Math.floor(now / 1000), btc, xrp };
}

export function bucketSamples(samples: Dominance[], pick: (s: Dominance) => number, step: number): Candle[] {
  const out: Candle[] = [];
  for (const s of [...samples].sort((a, b) => a.t - b.t)) {
    const time = Math.floor(s.t / step) * step;
    const v = pick(s);
    const last = out[out.length - 1];
    if (last && last.time === time) {
      last.high = Math.max(last.high, v);
      last.low = Math.min(last.low, v);
      last.close = v;
    } else {
      out.push({ time, open: v, high: v, low: v, close: v, volume: 0 });
    }
  }
  return out;
}

export function ratioCandles(a: Candle[], b: Candle[]): Candle[] {
  const byTime = new Map(b.map((c) => [c.time, c]));
  const out: Candle[] = [];
  for (const x of a) {
    const y = byTime.get(x.time);
    if (!y || !y.open || !y.close || !y.high || !y.low) continue;
    const open = x.open / y.open;
    const close = x.close / y.close;
    out.push({
      time: x.time,
      open,
      high: Math.max(open, close, x.high / y.high),
      low: Math.min(open, close, x.low / y.low),
      close,
      volume: 0,
    });
  }
  return out;
}

