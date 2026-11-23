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
