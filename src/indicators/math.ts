// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import type { BandPoint, Candle, LinePoint, MacdPoint } from './types';
import { intervalSeconds } from '../sources/intervals';
import { nyDateId, usRthSessionId, type SessionKind } from '../timezone';

export function sma(candles: Candle[], period: number): LinePoint[] {
  if (period < 1 || candles.length < period) return [];
  const out: LinePoint[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i]!.close;
    if (i >= period) sum -= candles[i - period]!.close;
    if (i >= period - 1) out.push({ time: candles[i]!.time, value: sum / period });
  }
  return out;
}

export function ema(candles: Candle[], period: number): LinePoint[] {
  return emaValues(
    candles.map((c) => ({ time: c.time, value: c.close })),
    period,
  );
}

export function emaValues(points: LinePoint[], period: number): LinePoint[] {
  if (period < 1 || points.length < period) return [];
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += points[i]!.value;
  prev /= period;
  const out: LinePoint[] = [{ time: points[period - 1]!.time, value: prev }];
  for (let i = period; i < points.length; i++) {
    prev = points[i]!.value * k + prev * (1 - k);
    out.push({ time: points[i]!.time, value: prev });
  }
  return out;
}

export function bollinger(candles: Candle[], period: number, stdMult = 2): BandPoint[] {
  if (period < 2 || candles.length < period) return [];
  const out: BandPoint[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += candles[j]!.close;
    const mid = sum / period;
    let varSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const d = candles[j]!.close - mid;
      varSum += d * d;
    }
    const std = Math.sqrt(varSum / period);
    out.push({
      time: candles[i]!.time,
      mid,
      upper: mid + stdMult * std,
      lower: mid - stdMult * std,
    });
  }
  return out;
}

function rsiValue(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

/** Wilder RSI. */
export function rsi(candles: Candle[], period = 14): LinePoint[] {
  if (period < 1 || candles.length < period + 1) return [];
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = candles[i]!.close - candles[i - 1]!.close;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  const out: LinePoint[] = [{ time: candles[period]!.time, value: rsiValue(gain, loss) }];
  for (let i = period + 1; i < candles.length; i++) {
    const d = candles[i]!.close - candles[i - 1]!.close;
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;
    out.push({ time: candles[i]!.time, value: rsiValue(gain, loss) });
  }
  return out;
}

export function macd(candles: Candle[], fast = 12, slow = 26, signal = 9): MacdPoint[] {
  const a = Math.min(fast, slow);
  const b = Math.max(fast, slow);
  const fastEma = ema(candles, a);
  const slowEma = ema(candles, b);
  if (!fastEma.length || !slowEma.length) return [];
  const slowMap = new Map(slowEma.map((p) => [p.time, p.value]));
  const macdLine: LinePoint[] = [];
  for (const p of fastEma) {
    const s = slowMap.get(p.time);
    if (s === undefined) continue;
    macdLine.push({ time: p.time, value: p.value - s });
  }
  const signalLine = emaValues(macdLine, signal);
  const sigMap = new Map(signalLine.map((p) => [p.time, p.value]));
  const out: MacdPoint[] = [];
  for (const p of macdLine) {
    const sig = sigMap.get(p.time);
    if (sig === undefined) continue;
    out.push({ time: p.time, macd: p.value, signal: sig, histogram: p.value - sig });
  }
  return out;
}

export function wma(candles: Candle[], period: number): LinePoint[] {
  if (period < 1 || candles.length < period) return [];
  const denom = (period * (period + 1)) / 2;
  const out: LinePoint[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += candles[i - period + 1 + j]!.close * (j + 1);
    out.push({ time: candles[i]!.time, value: sum / denom });
  }
  return out;
}

function typicalPrice(c: Candle): number {
  return (c.high + c.low + c.close) / 3;
}

/** Cumulative VWAP from the first candle (typical price = (H+L+C)/3). */
export function vwap(candles: Candle[]): LinePoint[] {
  return anchoredVwap(candles, 0);
}

function isIntradaySeries(candles: Candle[]): boolean {
  let min = Number.POSITIVE_INFINITY;
  for (let i = 1; i < candles.length; i++) {
    const dt = candles[i]!.time - candles[i - 1]!.time;
    if (dt > 0 && dt < min) min = dt;
  }
  return min < 20 * 3600;
}

/**
 * Session key. UTC days stay as before.
 * US regular hours (09:30–16:00 New York) apply to intraday stock bars.
 * Daily (and higher) stock bars represent that session, so they keep the New York date.
 * Bars outside the regular session return null and are left out of the VWAP.
 */
function sessionKey(time: number, session: SessionKind, intraday: boolean): string | null {
  if (session === 'utc-day') return String(Math.floor(time / 86400));
  if (!intraday) return nyDateId(time);
  return usRthSessionId(time);
}

/** Session VWAP. Crypto resets on the UTC day; US stocks use the regular New York session. */
export function sessionVwap(candles: Candle[], session: SessionKind = 'utc-day'): LinePoint[] {
  const out: LinePoint[] = [];
  const intraday = session === 'us-rth' && isIntradaySeries(candles);
  let pv = 0;
  let vol = 0;
  let day = '';
  for (const c of candles) {
    const key = sessionKey(c.time, session, intraday);
    if (key === null) continue;
    if (key !== day) {
      day = key;
      pv = 0;
      vol = 0;
    }
    pv += typicalPrice(c) * c.volume;
    vol += c.volume;
    if (vol > 0) out.push({ time: c.time, value: pv / vol });
  }
  return out;
}

/** Anchored VWAP from the first candle with time >= fromTime. */
export function anchoredVwap(candles: Candle[], fromTime = 0): LinePoint[] {
  const out: LinePoint[] = [];
  let pv = 0;
  let vol = 0;
  for (const c of candles) {
    if (c.time < fromTime) continue;
    pv += typicalPrice(c) * c.volume;
    vol += c.volume;
    if (vol > 0) out.push({ time: c.time, value: pv / vol });
  }
  return out;
}

/** Simple moving average of volume. */
export function smaVolume(candles: Candle[], period: number): LinePoint[] {
  if (period < 1 || candles.length < period) return [];
  const out: LinePoint[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i]!.volume;
    if (i >= period) sum -= candles[i - period]!.volume;
    if (i >= period - 1) out.push({ time: candles[i]!.time, value: sum / period });
  }
  return out;
}

export interface VolumeProfileBin {
  low: number;
  high: number;
  price: number;
  volume: number;
}

export interface VolumeProfileResult {
  bins: VolumeProfileBin[];
  poc: number;
  vah: number;
  val: number;
  total: number;
}

/**
 * Volume profile for candles in [fromTime, toTime]. Volume is spread evenly
 * across the bins touched by each candle's high–low range. Value area is 70%
 * of volume around the point of control.
 */
export function volumeProfile(
  candles: Candle[],
  fromTime: number,
  toTime: number,
  rows = 24,
): VolumeProfileResult | null {
  const n = Math.max(2, Math.min(200, Math.round(rows)));
  const slice = candles.filter((c) => c.time >= fromTime && c.time <= toTime);
  if (!slice.length) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const c of slice) {
    lo = Math.min(lo, c.low);
    hi = Math.max(hi, c.high);
  }
  if (!(hi > lo) || !Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  const span = hi - lo;
  const bins: VolumeProfileBin[] = [];
  for (let i = 0; i < n; i++) {
    const a = lo + (span * i) / n;
    const b = lo + (span * (i + 1)) / n;
    bins.push({ low: a, high: b, price: (a + b) / 2, volume: 0 });
  }
  for (const c of slice) {
    const i0 = Math.max(0, Math.min(n - 1, Math.floor(((c.low - lo) / span) * n)));
    const i1 = Math.max(0, Math.min(n - 1, Math.floor(((Math.min(c.high, hi) - lo) / span) * n)));
    const count = i1 - i0 + 1;
    if (count <= 0 || c.volume === 0) continue;
    const share = c.volume / count;
    for (let i = i0; i <= i1; i++) bins[i]!.volume += share;
  }
  const total = bins.reduce((s, b) => s + b.volume, 0);
  if (total <= 0) return null;
  let pocIdx = 0;
  for (let i = 1; i < n; i++) if (bins[i]!.volume > bins[pocIdx]!.volume) pocIdx = i;
  let left = pocIdx;
  let right = pocIdx;
  let covered = bins[pocIdx]!.volume;
  const target = total * 0.7;
  while (covered < target && (left > 0 || right < n - 1)) {
    const takeLeft = left > 0 ? bins[left - 1]!.volume : -1;
    const takeRight = right < n - 1 ? bins[right + 1]!.volume : -1;
    if (takeRight > takeLeft) {
      right += 1;
      covered += bins[right]!.volume;
    } else {
      left -= 1;
      covered += bins[left]!.volume;
    }
  }
  return {
    bins,
    poc: bins[pocIdx]!.price,
    vah: bins[right]!.high,
    val: bins[left]!.low,
    total,
  };
}

export function stochastic(candles: Candle[], kPeriod = 14, dPeriod = 3): { time: number; k: number; d: number }[] {
  if (kPeriod < 1 || dPeriod < 1 || candles.length < kPeriod) return [];
  const ks: LinePoint[] = [];
  for (let i = kPeriod - 1; i < candles.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      hh = Math.max(hh, candles[j]!.high);
      ll = Math.min(ll, candles[j]!.low);
    }
    const den = hh - ll;
    ks.push({ time: candles[i]!.time, value: den === 0 ? 50 : (100 * (candles[i]!.close - ll)) / den });
  }
  const out: { time: number; k: number; d: number }[] = [];
  if (ks.length < dPeriod) return [];
  let sum = 0;
  for (let i = 0; i < ks.length; i++) {
    sum += ks[i]!.value;
    if (i >= dPeriod) sum -= ks[i - dPeriod]!.value;
    if (i >= dPeriod - 1) out.push({ time: ks[i]!.time, k: ks[i]!.value, d: sum / dPeriod });
  }
  return out;
}

export function trueRange(candles: Candle[], i: number): number {
  const c = candles[i]!;
  if (i === 0) return c.high - c.low;
  const prev = candles[i - 1]!.close;
  return Math.max(c.high - c.low, Math.abs(c.high - prev), Math.abs(c.low - prev));
}

/** Wilder ATR. */
export function atr(candles: Candle[], period = 14): LinePoint[] {
  if (period < 1 || candles.length < period + 1) return [];
  let val = 0;
  for (let i = 1; i <= period; i++) val += trueRange(candles, i);
  val /= period;
  const out: LinePoint[] = [{ time: candles[period]!.time, value: val }];
  for (let i = period + 1; i < candles.length; i++) {
    val = (val * (period - 1) + trueRange(candles, i)) / period;
    out.push({ time: candles[i]!.time, value: val });
  }
  return out;
}

export function supertrend(
  candles: Candle[],
  period = 10,
  multiplier = 3,
): { time: number; value: number; dir: 1 | -1 }[] {
  const a = atr(candles, period);
  if (!a.length) return [];
  const atrMap = new Map(a.map((p) => [p.time, p.value]));
  const out: { time: number; value: number; dir: 1 | -1 }[] = [];
  let prevUpper = 0;
  let prevLower = 0;
  let prevDir: 1 | -1 = 1;
  let started = false;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    const atrVal = atrMap.get(c.time);
    if (atrVal === undefined) continue;
    const mid = (c.high + c.low) / 2;
    let upper = mid + multiplier * atrVal;
    let lower = mid - multiplier * atrVal;
    const prev = candles[i - 1];
    if (started && prev) {
      if (!(upper < prevUpper || prev.close > prevUpper)) upper = prevUpper;
      if (!(lower > prevLower || prev.close < prevLower)) lower = prevLower;
    }
    let dir: 1 | -1 = prevDir;
    let st: number;
    if (!started) {
      dir = c.close >= mid ? 1 : -1;
      st = dir === 1 ? lower : upper;
      started = true;
    } else if (prevDir === 1) {
      if (c.close < lower) {
        dir = -1;
        st = upper;
      } else st = lower;
    } else if (c.close > upper) {
      dir = 1;
      st = lower;
    } else st = upper;
    out.push({ time: c.time, value: st, dir });
    prevUpper = upper;
    prevLower = lower;
    prevDir = dir;
  }
  return out;
}

export interface PivotLevels {
  p: number;
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
}

/** Classic or Fibonacci floor pivots from the previous completed candle. */
export function pivotPoints(candles: Candle[], mode: 'standard' | 'fib' = 'standard'): PivotLevels | null {
  const src = candles.length >= 2 ? candles[candles.length - 2]! : candles[candles.length - 1];
  if (!src) return null;
  const p = (src.high + src.low + src.close) / 3;
  const range = src.high - src.low;
  if (mode === 'fib') {
    return {
      p,
      r1: p + 0.382 * range,
      s1: p - 0.382 * range,
      r2: p + 0.618 * range,
      s2: p - 0.618 * range,
      r3: p + range,
      s3: p - range,
    };
  }
  return {
    p,
    r1: 2 * p - src.low,
    s1: 2 * p - src.high,
    r2: p + range,
    s2: p - range,
    r3: src.high + 2 * (p - src.low),
    s3: src.low - 2 * (src.high - p),
  };
}

function midHL(candles: Candle[], end: number, period: number): number | null {
  if (end < period - 1) return null;
  let hh = -Infinity;
  let ll = Infinity;
  for (let i = end - period + 1; i <= end; i++) {
    hh = Math.max(hh, candles[i]!.high);
    ll = Math.min(ll, candles[i]!.low);
  }
  return (hh + ll) / 2;
}

export function ichimoku(
  candles: Candle[],
  tenkanPeriod = 9,
  kijunPeriod = 26,
  senkouPeriod = 52,
  shift = 26,
): { tenkan: LinePoint[]; kijun: LinePoint[]; spanA: LinePoint[]; spanB: LinePoint[]; chikou: LinePoint[] } {
  const tenkan: LinePoint[] = [];
  const kijun: LinePoint[] = [];
  const spanA: LinePoint[] = [];
  const spanB: LinePoint[] = [];
  const chikou: LinePoint[] = [];
  if (candles.length < 2) return { tenkan, kijun, spanA, spanB, chikou };
  const step = candles[candles.length - 1]!.time - candles[candles.length - 2]!.time;
  const lastI = candles.length - 1;
  const timeAt = (i: number): number =>
    i <= lastI ? candles[i]!.time : candles[lastI]!.time + (i - lastI) * step;

  for (let i = 0; i < candles.length; i++) {
    const t = midHL(candles, i, tenkanPeriod);
    const k = midHL(candles, i, kijunPeriod);
    if (t !== null) tenkan.push({ time: candles[i]!.time, value: t });
    if (k !== null) kijun.push({ time: candles[i]!.time, value: k });
    if (t !== null && k !== null) spanA.push({ time: timeAt(i + shift), value: (t + k) / 2 });
    const s = midHL(candles, i, senkouPeriod);
    if (s !== null) spanB.push({ time: timeAt(i + shift), value: s });
    const back = i - shift;
    if (back >= 0) chikou.push({ time: candles[back]!.time, value: candles[i]!.close });
  }
  return { tenkan, kijun, spanA, spanB, chikou };
}

export function adx(
  candles: Candle[],
  period = 14,
): { time: number; adx: number; pdi: number; mdi: number }[] {
  if (period < 1 || candles.length < period + 2) return [];
  const plus: number[] = [0];
  const minus: number[] = [0];
  const tr: number[] = [candles[0]!.high - candles[0]!.low];
  for (let i = 1; i < candles.length; i++) {
    const up = candles[i]!.high - candles[i - 1]!.high;
    const down = candles[i - 1]!.low - candles[i]!.low;
    plus.push(up > down && up > 0 ? up : 0);
    minus.push(down > up && down > 0 ? down : 0);
    tr.push(trueRange(candles, i));
  }
  let smP = 0;
  let smM = 0;
  let smTr = 0;
  for (let i = 1; i <= period; i++) {
    smP += plus[i]!;
    smM += minus[i]!;
    smTr += tr[i]!;
  }
  const dxs: { time: number; pdi: number; mdi: number; dx: number }[] = [];
  const pushDx = (i: number, p: number, m: number, trs: number) => {
    const pdi = trs === 0 ? 0 : (100 * p) / trs;
    const mdi = trs === 0 ? 0 : (100 * m) / trs;
    const den = pdi + mdi;
    const dx = den === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / den;
    dxs.push({ time: candles[i]!.time, pdi, mdi, dx });
  };
  pushDx(period, smP, smM, smTr);
  for (let i = period + 1; i < candles.length; i++) {
    smP = smP - smP / period + plus[i]!;
    smM = smM - smM / period + minus[i]!;
    smTr = smTr - smTr / period + tr[i]!;
    pushDx(i, smP, smM, smTr);
  }
  if (dxs.length < period) return [];
  let adxVal = 0;
  for (let i = 0; i < period; i++) adxVal += dxs[i]!.dx;
  adxVal /= period;
  const out: { time: number; adx: number; pdi: number; mdi: number }[] = [
    { time: dxs[period - 1]!.time, adx: adxVal, pdi: dxs[period - 1]!.pdi, mdi: dxs[period - 1]!.mdi },
  ];
  for (let i = period; i < dxs.length; i++) {
    adxVal = (adxVal * (period - 1) + dxs[i]!.dx) / period;
    out.push({ time: dxs[i]!.time, adx: adxVal, pdi: dxs[i]!.pdi, mdi: dxs[i]!.mdi });
  }
  return out;
}

/** Stochastic RSI: stochastic of RSI values, then SMA of %K and %D. */
export function stochRsi(
  candles: Candle[],
  rsiPeriod = 14,
  stochPeriod = 14,
  kSmooth = 3,
  dPeriod = 3,
): { time: number; k: number; d: number }[] {
  const rsiLine = rsi(candles, rsiPeriod);
  if (stochPeriod < 1 || kSmooth < 1 || dPeriod < 1 || rsiLine.length < stochPeriod) return [];
  const raw: LinePoint[] = [];
  for (let i = stochPeriod - 1; i < rsiLine.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - stochPeriod + 1; j <= i; j++) {
      hh = Math.max(hh, rsiLine[j]!.value);
      ll = Math.min(ll, rsiLine[j]!.value);
    }
    const den = hh - ll;
    raw.push({ time: rsiLine[i]!.time, value: den === 0 ? 50 : (100 * (rsiLine[i]!.value - ll)) / den });
  }
  const ks: LinePoint[] = [];
  if (raw.length < kSmooth) return [];
  let ksum = 0;
  for (let i = 0; i < raw.length; i++) {
    ksum += raw[i]!.value;
    if (i >= kSmooth) ksum -= raw[i - kSmooth]!.value;
    if (i >= kSmooth - 1) ks.push({ time: raw[i]!.time, value: ksum / kSmooth });
  }
  if (ks.length < dPeriod) return [];
  const out: { time: number; k: number; d: number }[] = [];
  let dsum = 0;
  for (let i = 0; i < ks.length; i++) {
    dsum += ks[i]!.value;
    if (i >= dPeriod) dsum -= ks[i - dPeriod]!.value;
    if (i >= dPeriod - 1) out.push({ time: ks[i]!.time, k: ks[i]!.value, d: dsum / dPeriod });
  }
  return out;
}

/** Commodity Channel Index of typical price. */
export function cci(candles: Candle[], period = 20): LinePoint[] {
  if (period < 1 || candles.length < period) return [];
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
  const out: LinePoint[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += tp[j]!;
    const mean = sum / period;
    let dev = 0;
    for (let j = i - period + 1; j <= i; j++) dev += Math.abs(tp[j]! - mean);
    dev /= period;
    const value = dev === 0 ? 0 : (tp[i]! - mean) / (0.015 * dev);
    out.push({ time: candles[i]!.time, value });
  }
  return out;
}

/** Wilder Parabolic SAR. dir +1 below price (uptrend), -1 above (downtrend). */
export function parabolicSar(
  candles: Candle[],
  start = 0.02,
  increment = 0.02,
  max = 0.2,
): { time: number; value: number; dir: 1 | -1 }[] {
  if (candles.length < 2) return [];
  const out: { time: number; value: number; dir: 1 | -1 }[] = [];
  let dir: 1 | -1 = candles[1]!.close >= candles[0]!.close ? 1 : -1;
  let ep = dir === 1 ? Math.max(candles[0]!.high, candles[1]!.high) : Math.min(candles[0]!.low, candles[1]!.low);
  let sar = dir === 1 ? candles[0]!.low : candles[0]!.high;
  let af = start;
  out.push({ time: candles[0]!.time, value: sar, dir });
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]!;
    const prev = candles[i - 1]!;
    let next = sar + af * (ep - sar);
    if (dir === 1) {
      const priorLow = i >= 2 ? Math.min(prev.low, candles[i - 2]!.low) : prev.low;
      next = Math.min(next, priorLow);
      if (c.low < next) {
        dir = -1;
        next = ep;
        ep = c.low;
        af = start;
      } else {
        if (c.high > ep) {
          ep = c.high;
          af = Math.min(max, af + increment);
        }
      }
    } else {
      const priorHigh = i >= 2 ? Math.max(prev.high, candles[i - 2]!.high) : prev.high;
      next = Math.max(next, priorHigh);
      if (c.high > next) {
        dir = 1;
        next = ep;
        ep = c.high;
        af = start;
      } else {
        if (c.low < ep) {
          ep = c.low;
          af = Math.min(max, af + increment);
        }
      }
    }
    sar = next;
    out.push({ time: c.time, value: sar, dir });
  }
  return out;
}

/** Keltner channels: EMA mid, bands at mid ± multiplier × ATR. */
export function keltner(candles: Candle[], period = 20, atrPeriod = 10, multiplier = 2): BandPoint[] {
  const mid = ema(candles, period);
  const atrLine = atr(candles, atrPeriod);
  if (!mid.length || !atrLine.length) return [];
  const atrMap = new Map(atrLine.map((p) => [p.time, p.value]));
  const out: BandPoint[] = [];
  for (const m of mid) {
    const a = atrMap.get(m.time);
    if (a === undefined) continue;
    out.push({ time: m.time, mid: m.value, upper: m.value + multiplier * a, lower: m.value - multiplier * a });
  }
  return out;
}

/** Donchian channels: highest high, lowest low, and midpoint. */
export function donchian(candles: Candle[], period = 20): BandPoint[] {
  if (period < 1 || candles.length < period) return [];
  const out: BandPoint[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      hh = Math.max(hh, candles[j]!.high);
      ll = Math.min(ll, candles[j]!.low);
    }
    out.push({ time: candles[i]!.time, mid: (hh + ll) / 2, upper: hh, lower: ll });
  }
  return out;
}

/** On-Balance Volume. */
export function obv(candles: Candle[]): LinePoint[] {
  const out: LinePoint[] = [];
  let val = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    if (i > 0) {
      const prev = candles[i - 1]!.close;
      if (c.close > prev) val += c.volume;
      else if (c.close < prev) val -= c.volume;
    }
    out.push({ time: c.time, value: val });
  }
  return out;
}

/** Money Flow Index (RSI-like, volume-weighted typical price). */
export function mfi(candles: Candle[], period = 14): LinePoint[] {
  if (period < 1 || candles.length < period + 1) return [];
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
  const pos: number[] = [0];
  const neg: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const mf = tp[i]! * candles[i]!.volume;
    const d = tp[i]! - tp[i - 1]!;
    pos.push(d > 0 ? mf : 0);
    neg.push(d < 0 ? mf : 0);
  }
  const out: LinePoint[] = [];
  let psum = 0;
  let nsum = 0;
  for (let i = 1; i < candles.length; i++) {
    psum += pos[i]!;
    nsum += neg[i]!;
    if (i > period) {
      psum -= pos[i - period]!;
      nsum -= neg[i - period]!;
    }
    if (i >= period) {
      const ratio = nsum === 0 ? Infinity : psum / nsum;
      const value = nsum === 0 && psum === 0 ? 50 : 100 - 100 / (1 + ratio);
      out.push({ time: candles[i]!.time, value: Number.isFinite(value) ? value : 100 });
    }
  }
  return out;
}

/** Williams %R, range typically −100..0. */
export function williamsR(candles: Candle[], period = 14): LinePoint[] {
  if (period < 1 || candles.length < period) return [];
  const out: LinePoint[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      hh = Math.max(hh, candles[j]!.high);
      ll = Math.min(ll, candles[j]!.low);
    }
    const den = hh - ll;
    out.push({ time: candles[i]!.time, value: den === 0 ? -50 : ((hh - candles[i]!.close) / den) * -100 });
  }
  return out;
}

/** Rate of Change as a percent of the close n bars ago. */
export function roc(candles: Candle[], period = 12): LinePoint[] {
  if (period < 1 || candles.length < period + 1) return [];
  const out: LinePoint[] = [];
  for (let i = period; i < candles.length; i++) {
    const prev = candles[i - period]!.close;
    out.push({ time: candles[i]!.time, value: prev === 0 ? 0 : ((candles[i]!.close - prev) / prev) * 100 });
  }
  return out;
}

/** Momentum as 100 × close / close[n] (100 = unchanged). */
export function momentum(candles: Candle[], period = 10): LinePoint[] {
  if (period < 1 || candles.length < period + 1) return [];
  const out: LinePoint[] = [];
  for (let i = period; i < candles.length; i++) {
    const prev = candles[i - period]!.close;
    out.push({ time: candles[i]!.time, value: prev === 0 ? 100 : (100 * candles[i]!.close) / prev });
  }
  return out;
}

/** Chaikin Money Flow. */
export function cmf(candles: Candle[], period = 20): LinePoint[] {
  if (period < 1 || candles.length < period) return [];
  const mfv: number[] = [];
  for (const c of candles) {
    const den = c.high - c.low;
    const mfm = den === 0 ? 0 : (2 * c.close - c.high - c.low) / den;
    mfv.push(mfm * c.volume);
  }
  const out: LinePoint[] = [];
  let flow = 0;
  let vol = 0;
  for (let i = 0; i < candles.length; i++) {
    flow += mfv[i]!;
    vol += candles[i]!.volume;
    if (i >= period) {
      flow -= mfv[i - period]!;
      vol -= candles[i - period]!.volume;
    }
    if (i >= period - 1) out.push({ time: candles[i]!.time, value: vol === 0 ? 0 : flow / vol });
  }
  return out;
}

/** Aroon Up / Aroon Down over the lookback period. */
export function aroon(candles: Candle[], period = 25): { time: number; up: number; down: number }[] {
  if (period < 1 || candles.length < period + 1) return [];
  const out: { time: number; up: number; down: number }[] = [];
  for (let i = period; i < candles.length; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    let hi = i;
    let lo = i;
    for (let j = i - period; j <= i; j++) {
      if (candles[j]!.high >= hh) {
        hh = candles[j]!.high;
        hi = j;
      }
      if (candles[j]!.low <= ll) {
        ll = candles[j]!.low;
        lo = j;
      }
    }
    out.push({
      time: candles[i]!.time,
      up: (100 * (period - (i - hi))) / period,
      down: (100 * (period - (i - lo))) / period,
    });
  }
  return out;
}


export interface VwapBandPoint {
  time: number;
  vwap: number;
  sigma: number;
  high: number;
  low: number;
}

/** Session VWAP plus volume-weighted sigma and running session high/low. */
export function sessionVwapProfile(candles: Candle[], session: SessionKind = 'utc-day'): VwapBandPoint[] {
  const out: VwapBandPoint[] = [];
  const intraday = session === 'us-rth' && isIntradaySeries(candles);
  let pv = 0;
  let pv2 = 0;
  let vol = 0;
  let day = '';
  let hi = Number.NEGATIVE_INFINITY;
  let lo = Number.POSITIVE_INFINITY;
  for (const c of candles) {
    const key = sessionKey(c.time, session, intraday);
    if (key === null) continue;
    if (key !== day) {
      day = key;
      pv = 0;
      pv2 = 0;
      vol = 0;
      hi = Number.NEGATIVE_INFINITY;
      lo = Number.POSITIVE_INFINITY;
    }
    const tp = typicalPrice(c);
    pv += tp * c.volume;
    pv2 += tp * tp * c.volume;
    vol += c.volume;
    if (c.high > hi) hi = c.high;
    if (c.low < lo) lo = c.low;
    if (vol > 0) {
      const mid = pv / vol;
      const variance = Math.max(0, pv2 / vol - mid * mid);
      out.push({ time: c.time, vwap: mid, sigma: Math.sqrt(variance), high: hi, low: lo });
    }
  }
  return out;
}

export function smaLine(points: LinePoint[], period: number): LinePoint[] {
  if (period < 1 || points.length < period) return [];
  const out: LinePoint[] = [];
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    sum += points[i]!.value;
    if (i >= period) sum -= points[i - period]!.value;
    if (i >= period - 1) out.push({ time: points[i]!.time, value: sum / period });
  }
  return out;
}

export function emaLine(points: LinePoint[], period: number): LinePoint[] {
  return emaValues(points, period);
}

/** Map a higher-timeframe series onto chart bars (step hold of the last completed higher bar). */
export function mapToChartTimes(higher: LinePoint[], chart: Candle[]): LinePoint[] {
  if (!higher.length || !chart.length) return [];
  let j = 0;
  const out: LinePoint[] = [];
  for (const c of chart) {
    while (j + 1 < higher.length && higher[j + 1]!.time <= c.time) j++;
    const src = higher[j]!;
    if (src.time <= c.time) out.push({ time: c.time, value: src.value });
  }
  return out;
}

export function intervalRank(id: string): number {
  if (id === '1M') return 10_000_000;
  return intervalSeconds(id) ?? 0;
}

export const INTERVAL_RANK: Record<string, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
  '4h': 14400,
  '1D': 86400,
  '1W': 604800,
  '1M': 10_000_000,
};

export function isHigherTf(chart: string, tf: string): boolean {
  return intervalRank(tf) > intervalRank(chart);
}

export type DivergenceKind = 'regular-bull' | 'regular-bear' | 'hidden-bull' | 'hidden-bear';

export interface DivergenceHit {
  kind: DivergenceKind;
  time: number;
  startTime: number;
  price: number;
  indicator: number;
}

interface Pivot {
  index: number;
  time: number;
  value: number;
}

function seriesPivots(times: number[], values: number[], left: number, right: number, highs: boolean): Pivot[] {
  const out: Pivot[] = [];
  const n = values.length;
  for (let i = left; i < n - right; i++) {
    const v = values[i]!;
    let ok = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (highs ? values[j]! >= v : values[j]! <= v) {
        ok = false;
        break;
      }
    }
    if (ok) out.push({ index: i, time: times[i]!, value: v });
  }
  return out;
}

function nearestPivot(pivots: Pivot[], time: number, window: number): Pivot | null {
  let best: Pivot | null = null;
  let bestDt = Infinity;
  for (const p of pivots) {
    const dt = Math.abs(p.time - time);
    if (dt <= window && dt < bestDt) {
      best = p;
      bestDt = dt;
    }
  }
  return best;
}

/** Regular and hidden divergences between candle swings and an oscillator. */
export function findDivergences(candles: Candle[], indicator: LinePoint[], left = 5, right = 5): DivergenceHit[] {
  if (candles.length < left + right + 3 || indicator.length < left + right + 3) return [];
  const times = candles.map((c) => c.time);
  const highs = seriesPivots(times, candles.map((c) => c.high), left, right, true);
  const lows = seriesPivots(times, candles.map((c) => c.low), left, right, false);
  const indTimes = indicator.map((p) => p.time);
  const indVals = indicator.map((p) => p.value);
  const indHighs = seriesPivots(indTimes, indVals, left, right, true);
  const indLows = seriesPivots(indTimes, indVals, left, right, false);
  const step = candles.length >= 2 ? Math.abs(candles[1]!.time - candles[0]!.time) : 86400;
  const window = Math.max(step * (left + right), step);
  const out: DivergenceHit[] = [];

  const pairLows = (a: Pivot, b: Pivot): void => {
    const ia = nearestPivot(indLows, a.time, window);
    const ib = nearestPivot(indLows, b.time, window);
    if (!ia || !ib || ia.time === ib.time) return;
    if (b.value < a.value && ib.value > ia.value) {
      out.push({ kind: 'regular-bull', time: b.time, startTime: a.time, price: b.value, indicator: ib.value });
    } else if (b.value > a.value && ib.value < ia.value) {
      out.push({ kind: 'hidden-bull', time: b.time, startTime: a.time, price: b.value, indicator: ib.value });
    }
  };
  const pairHighs = (a: Pivot, b: Pivot): void => {
    const ia = nearestPivot(indHighs, a.time, window);
    const ib = nearestPivot(indHighs, b.time, window);
    if (!ia || !ib || ia.time === ib.time) return;
    if (b.value > a.value && ib.value < ia.value) {
      out.push({ kind: 'regular-bear', time: b.time, startTime: a.time, price: b.value, indicator: ib.value });
    } else if (b.value < a.value && ib.value > ia.value) {
      out.push({ kind: 'hidden-bear', time: b.time, startTime: a.time, price: b.value, indicator: ib.value });
    }
  };
  for (let i = 1; i < lows.length; i++) pairLows(lows[i - 1]!, lows[i]!);
  for (let i = 1; i < highs.length; i++) pairHighs(highs[i - 1]!, highs[i]!);
  return out.slice(-12);
}

/** Cumulative volume delta approximated from OHLCV: +volume on up candles, −volume on down candles. */
export function cvd(candles: Candle[]): LinePoint[] {
  const out: LinePoint[] = [];
  let sum = 0;
  for (const c of candles) {
    if (c.close > c.open) sum += c.volume;
    else if (c.close < c.open) sum -= c.volume;
    out.push({ time: c.time, value: sum });
  }
  return out;
}

export interface FootprintBin {
  low: number;
  high: number;
  buy: number;
  sell: number;
}

/** Approximate per-price volume split from a single OHLCV candle (no bid/ask). */
export function approximateFootprint(c: Candle, rows: number): FootprintBin[] {
  const n = Math.max(2, Math.min(48, Math.round(rows) || 8));
  const span = c.high - c.low;
  if (!(span > 0) || !(c.volume > 0)) {
    return [{ low: c.low, high: c.high, buy: c.close >= c.open ? c.volume : 0, sell: c.close < c.open ? c.volume : 0 }];
  }
  const step = span / n;
  const mid = (c.open + c.close) / 2;
  const bins: FootprintBin[] = [];
  let weight = 0;
  const raw: { buy: number; sell: number }[] = [];
  for (let i = 0; i < n; i++) {
    const low = c.low + step * i;
    const high = i === n - 1 ? c.high : c.low + step * (i + 1);
    const center = (low + high) / 2;
    const w = 1 / (1 + Math.abs(center - mid) / (span || 1));
    const buyShare = c.close >= c.open ? 0.65 + 0.25 * ((center - c.low) / span) : 0.35 - 0.25 * ((center - c.low) / span);
    raw.push({ buy: w * Math.max(0.05, Math.min(0.95, buyShare)), sell: w * Math.max(0.05, Math.min(0.95, 1 - buyShare)) });
    weight += w;
  }
  const scale = c.volume / Math.max(weight, 1e-9);
  for (let i = 0; i < n; i++) {
    const low = c.low + step * i;
    const high = i === n - 1 ? c.high : c.low + step * (i + 1);
    bins.push({
      low,
      high,
      buy: raw[i]!.buy * scale,
      sell: raw[i]!.sell * scale,
    });
  }
  return bins;
}

export interface SwingPoint {
  time: number;
  price: number;
  kind: 'high' | 'low';
}

export function lastSwings(candles: Candle[], left = 5): { first: SwingPoint; second: SwingPoint } | null {
  if (candles.length < left * 2 + 3) return null;
  const times = candles.map((c) => c.time);
  const highs = seriesPivots(times, candles.map((c) => c.high), left, left, true).map(
    (p) => ({ time: p.time, price: p.value, kind: 'high' as const }),
  );
  const lows = seriesPivots(times, candles.map((c) => c.low), left, left, false).map(
    (p) => ({ time: p.time, price: p.value, kind: 'low' as const }),
  );
  const all = [...highs, ...lows].sort((a, b) => a.time - b.time);
  if (all.length < 2) return null;
  return { first: all[all.length - 2]!, second: all[all.length - 1]! };
}
