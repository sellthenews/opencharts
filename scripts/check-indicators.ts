import { bollinger, ema, macd, rsi, sma } from '../src/indicators/math.ts';
import type { Candle } from '../src/sources/types.ts';

function candle(time: number, close: number): Candle {
  return { time, open: close, high: close, low: close, close, volume: 1 };
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function almost(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) <= eps;
}

const c12345 = [1, 2, 3, 4, 5].map((v, i) => candle(i + 1, v));
const s = sma(c12345, 3);
assert(s.length === 3, `sma length ${s.length}`);
assert(almost(s[0]!.value, 2) && almost(s[1]!.value, 3) && almost(s[2]!.value, 4), 'sma values');

const e = ema(c12345, 3);
assert(e.length === 3, `ema length ${e.length}`);
assert(almost(e[0]!.value, 2), 'ema seed is sma');
// k=0.5, next = 4*0.5 + 2*0.5 = 3; then 5*0.5 + 3*0.5 = 4
assert(almost(e[1]!.value, 3) && almost(e[2]!.value, 4), 'ema recursion');

const bb = bollinger(c12345, 3, 2);
assert(bb.length === 3, 'bb length');
assert(almost(bb[0]!.mid, 2), 'bb mid');
// values 1,2,3 mid 2, variance ((1+0+1)/3)=2/3, std=sqrt(2/3)
const std = Math.sqrt(2 / 3);
assert(almost(bb[0]!.upper, 2 + 2 * std) && almost(bb[0]!.lower, 2 - 2 * std), 'bb bands');

const rising = Array.from({ length: 50 }, (_, i) => candle(i + 1, i + 1));
const r = rsi(rising, 14);
assert(r.length === 36, `rsi length ${r.length}`);
assert(r.every((p) => p.value === 100), 'rsi all-up is 100');

const m = macd(rising, 12, 26, 9);
assert(m.length > 0, 'macd produces points');
assert(m.every((p) => Number.isFinite(p.macd) && Number.isFinite(p.signal) && Number.isFinite(p.histogram)), 'macd finite');

console.log('indicators ok', { sma: s.length, ema: e.length, bb: bb.length, rsi: r.length, macd: m.length });
