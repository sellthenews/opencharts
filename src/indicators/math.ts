// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Wykresy contributors

import type { BandPoint, Candle, LinePoint, MacdPoint } from './types';

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

/** Cumulative VWAP from the first candle (typical price = (H+L+C)/3). */
export function vwap(candles: Candle[]): LinePoint[] {
  const out: LinePoint[] = [];
  let pv = 0;
  let vol = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    pv += tp * c.volume;
    vol += c.volume;
    if (vol > 0) out.push({ time: c.time, value: pv / vol });
  }
  return out;
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

/** Classic floor pivots from the previous completed candle. */
export function pivotPoints(candles: Candle[]): PivotLevels | null {
  const src = candles.length >= 2 ? candles[candles.length - 2]! : candles[candles.length - 1];
  if (!src) return null;
  const p = (src.high + src.low + src.close) / 3;
  const range = src.high - src.low;
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

