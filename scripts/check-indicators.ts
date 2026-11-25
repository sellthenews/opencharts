// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import {
  adx,
  anchoredVwap,
  aroon,
  atr,
  bollinger,
  cci,
  cmf,
  donchian,
  ema,
  ichimoku,
  keltner,
  macd,
  mfi,
  momentum,
  obv,
  parabolicSar,
  pivotPoints,
  roc,
  rsi,
  sessionVwap,
  sma,
  smaVolume,
  stochRsi,
  stochastic,
  supertrend,
  volumeProfile,
  vwap,
  williamsR,
  wma,
  sessionVwapProfile,
  smaLine,
  mapToChartTimes,
  isHigherTf,
  findDivergences,
  cvd,
  approximateFootprint,
  lastSwings,
} from '../src/indicators/math.ts';
import type { Candle } from '../src/sources/types.ts';

function candle(time: number, close: number, extra?: Partial<Candle>): Candle {
  return { time, open: close, high: close, low: close, close, volume: 1, ...extra };
}

function ohlc(time: number, open: number, high: number, low: number, close: number, volume: number): Candle {
  return { time, open, high, low, close, volume };
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
assert(almost(e[1]!.value, 3) && almost(e[2]!.value, 4), 'ema recursion');

const w = wma(c12345, 3);
assert(w.length === 3, 'wma length');
// (1*1+2*2+3*3)/6 = 14/6
assert(almost(w[0]!.value, 14 / 6) && almost(w[1]!.value, 20 / 6) && almost(w[2]!.value, 26 / 6), 'wma values');

const bb = bollinger(c12345, 3, 2);
assert(bb.length === 3, 'bb length');
assert(almost(bb[0]!.mid, 2), 'bb mid');
const std = Math.sqrt(2 / 3);
assert(almost(bb[0]!.upper, 2 + 2 * std) && almost(bb[0]!.lower, 2 - 2 * std), 'bb bands');

const rising = Array.from({ length: 50 }, (_, i) => candle(i + 1, i + 1));
const r = rsi(rising, 14);
assert(r.length === 36, `rsi length ${r.length}`);
assert(r.every((p) => p.value === 100), 'rsi all-up is 100');

const m = macd(rising, 12, 26, 9);
assert(m.length > 0, 'macd produces points');
assert(m.every((p) => Number.isFinite(p.macd) && Number.isFinite(p.signal) && Number.isFinite(p.histogram)), 'macd finite');
assert(almost(m[0]!.histogram, m[0]!.macd - m[0]!.signal), 'macd histogram is macd-signal');

const bars = [
  ohlc(1, 10, 12, 9, 11, 100),
  ohlc(2, 11, 13, 10, 12, 110),
  ohlc(3, 12, 14, 11, 13, 120),
  ohlc(4, 13, 15, 12, 14, 130),
  ohlc(5, 14, 16, 13, 15, 140),
];
const tp = bars.map((c) => (c.high + c.low + c.close) / 3);
let pv = 0;
let vol = 0;
const expectedVwap = bars.map((c, i) => {
  pv += tp[i]! * c.volume;
  vol += c.volume;
  return pv / vol;
});
const vw = vwap(bars);
assert(vw.length === 5, 'vwap length');
vw.forEach((p, i) => assert(almost(p.value, expectedVwap[i]!), `vwap ${i}`));

const day1 = 86400;
const day2 = 2 * 86400;
const sessionBars = [
  ohlc(day1, 10, 12, 9, 11, 100),
  ohlc(day1 + 3600, 11, 13, 10, 12, 100),
  ohlc(day2, 20, 22, 19, 21, 100),
];
const sess = sessionVwap(sessionBars);
assert(sess.length === 3, 'session vwap length');
assert(almost(sess[0]!.value, (12 + 9 + 11) / 3), 'session first typ');
const tp0 = (12 + 9 + 11) / 3;
const tp1 = (13 + 10 + 12) / 3;
assert(almost(sess[1]!.value, (tp0 * 100 + tp1 * 100) / 200), 'session same-day accumulate');
assert(almost(sess[2]!.value, (22 + 19 + 21) / 3), 'session resets on new UTC day');

const anc = anchoredVwap(sessionBars, day2);
assert(anc.length === 1 && almost(anc[0]!.value, (22 + 19 + 21) / 3), 'anchored vwap starts at fromTime');

const stoch = stochastic(bars, 3, 2);
assert(stoch.length >= 1, 'stochastic length');
// last bar: window of 3,4,5 highs 14,15,16 lows 11,12,13 close 15 -> k = (15-11)/(16-11)*100 = 80
const lastK = stoch[stoch.length - 1]!;
assert(almost(lastK.k, 80), `stoch k ${lastK.k}`);

const trRising = Array.from({ length: 20 }, (_, i) =>
  ohlc(i + 1, i + 10, i + 12, i + 9, i + 11, 10),
);
const atrLine = atr(trRising, 5);
assert(atrLine.length > 0 && atrLine.every((p) => p.value > 0 && Number.isFinite(p.value)), 'atr finite positive');

const adxLine = adx(trRising, 5);
assert(adxLine.length > 0 && adxLine.every((p) => Number.isFinite(p.adx) && Number.isFinite(p.pdi) && Number.isFinite(p.mdi)), 'adx finite');

const ichi = ichimoku(trRising, 3, 5, 8, 3);
assert(ichi.tenkan.length > 0 && ichi.kijun.length > 0, 'ichimoku lines');

const sar = parabolicSar(trRising);
assert(sar.length > 0 && sar.every((p) => Number.isFinite(p.value)), 'sar finite');

const st = supertrend(trRising, 5, 2);
assert(st.length > 0 && st.every((p) => p.dir === 1 || p.dir === -1), 'supertrend dir');

const obvLine = obv(bars);
assert(obvLine.length === 5, 'obv length');
assert(almost(obvLine[0]!.value, 0), 'obv starts at 0');
assert(almost(obvLine[1]!.value, 110), 'obv adds volume on up close');

const volMa = smaVolume(bars, 3);
assert(volMa.length === 3 && almost(volMa[0]!.value, 110) && almost(volMa[2]!.value, 130), 'volume sma');

const vp = volumeProfile(bars, 1, 5, 4);
assert(vp !== null && vp.bins.length === 4 && vp.total === 600, 'volume profile total');
assert(vp!.poc >= vp!.val && vp!.poc <= vp!.vah, 'poc inside value area');

const prev = bars[bars.length - 2]!;
const stdPiv = pivotPoints(bars, 'standard')!;
const p = (prev.high + prev.low + prev.close) / 3;
assert(almost(stdPiv.p, p), 'standard pivot P');
assert(almost(stdPiv.r1, 2 * p - prev.low) && almost(stdPiv.s1, 2 * p - prev.high), 'standard R1/S1');
const fibPiv = pivotPoints(bars, 'fib')!;
const range = prev.high - prev.low;
assert(almost(fibPiv.p, p), 'fib pivot P');
assert(almost(fibPiv.r1, p + 0.382 * range) && almost(fibPiv.s2, p - 0.618 * range), 'fib R1/S2');

const kel = keltner(bars, 3, 3, 2);
assert(kel.length > 0 && kel.every((b) => b.upper > b.mid && b.mid > b.lower), 'keltner bands');
const don = donchian(bars, 3);
assert(don.length > 0 && almost(don[don.length - 1]!.upper, 16) && almost(don[don.length - 1]!.lower, 11), 'donchian last');

const cciLine = cci(bars, 3);
assert(cciLine.length > 0 && cciLine.every((p) => Number.isFinite(p.value)), 'cci finite');
const mfiLine = mfi(bars, 3);
assert(mfiLine.length > 0 && mfiLine.every((p) => p.value >= 0 && p.value <= 100), 'mfi 0-100');
const wr = williamsR(bars, 3);
assert(wr.length > 0 && almost(wr[wr.length - 1]!.value, -20), 'williams %R last = (16-15)/(16-11)*-100');
const rocLine = roc(c12345, 3);
// (5-2)/2*100 = 150
assert(almost(rocLine[rocLine.length - 1]!.value, 150), 'roc last');
const mom = momentum(c12345, 3);
assert(almost(mom[mom.length - 1]!.value, 5 / 2 * 100), 'momentum last is 100*close/close[n]');
const cmfLine = cmf(bars, 3);
assert(cmfLine.length > 0 && cmfLine.every((p) => Number.isFinite(p.value)), 'cmf finite');
const ar = aroon(bars, 3);
assert(ar.length > 0 && ar.every((p) => p.up >= 0 && p.up <= 100 && p.down >= 0 && p.down <= 100), 'aroon 0-100');
const srsi = stochRsi(rising, 14, 14, 3, 3);
assert(srsi.length > 0 && srsi.every((p) => Number.isFinite(p.k) && Number.isFinite(p.d)), 'stoch rsi finite');


const day = 1_700_000_000;
const vwapDay = [
  ohlc(day, 10, 10, 10, 10, 1),
  ohlc(day + 3600, 20, 20, 20, 20, 1),
  ohlc(day + 86400, 30, 30, 30, 30, 2),
];
const prof = sessionVwapProfile(vwapDay);
assert(prof.length === 3, 'vwap profile length');
assert(almost(prof[1]!.vwap, 15) && almost(prof[1]!.sigma, 5), 'vwap mid and sigma');
assert(almost(prof[1]!.high, 20) && almost(prof[1]!.low, 10), 'session high/low day 1');
assert(almost(prof[2]!.vwap, 30) && almost(prof[2]!.high, 30) && almost(prof[2]!.low, 30), 'session reset next day');

const ma = smaLine([{ time: 1, value: 1 }, { time: 2, value: 2 }, { time: 3, value: 3 }, { time: 4, value: 4 }], 2);
assert(ma.length === 3 && almost(ma[0]!.value, 1.5) && almost(ma[2]!.value, 3.5), 'smaLine');

const mapped = mapToChartTimes(
  [{ time: 0, value: 1 }, { time: 4, value: 2 }],
  [0, 1, 2, 3, 4, 5].map((t) => candle(t, 1)),
);
assert(mapped.map((p) => p.value).join(',') === '1,1,1,1,2,2', `mapToChartTimes ${mapped.map((p) => p.value)}`);
assert(isHigherTf('1h', '1D') && !isHigherTf('1D', '1h') && !isHigherTf('1D', 'chart'), 'isHigherTf');

const divBars: Candle[] = [];
const divOsc: { time: number; value: number }[] = [];
for (let i = 0; i < 21; i++) {
  const low = i === 5 ? 10 : i === 15 ? 8 : 14;
  const high = i === 8 ? 20 : i === 18 ? 22 : 16;
  const osc = i === 5 ? 20 : i === 15 ? 28 : i === 8 ? 80 : i === 18 ? 70 : 50;
  divBars.push(ohlc(i, 15, high, low, 15, 1));
  divOsc.push({ time: i, value: osc });
}
const divs = findDivergences(divBars, divOsc, 1, 1);
assert(divs.some((d) => d.kind === 'regular-bull'), `regular bull missing: ${divs.map((d) => d.kind).join(',')}`);
assert(divs.some((d) => d.kind === 'regular-bear'), `regular bear missing: ${divs.map((d) => d.kind).join(',')}`);

const delta = cvd([
  ohlc(1, 1, 2, 1, 2, 3),
  ohlc(2, 2, 2, 1, 1, 1),
  ohlc(3, 1, 1, 1, 1, 9),
]);
assert(almost(delta[0]!.value, 3) && almost(delta[1]!.value, 2) && almost(delta[2]!.value, 2), 'cvd close==open is flat');

const fp = approximateFootprint(ohlc(1, 10, 12, 8, 11, 100), 4);
assert(fp.length === 4, 'footprint rows');
const volSum = fp.reduce((s, b) => s + b.buy + b.sell, 0);
assert(almost(volSum, 100, 1e-6), `footprint volume ${volSum}`);

const swingBars = Array.from({ length: 30 }, (_, i) => {
  const peak = i === 8 ? 30 : i === 20 ? 10 : 20;
  return ohlc(i, 20, i === 8 ? 30 : 21, i === 20 ? 10 : 19, 20, 1);
});
const swings = lastSwings(swingBars, 3);
assert(swings !== null && swings.first.kind === 'high' && swings.second.kind === 'low', 'lastSwings high then low');
assert(swings !== null && almost(swings.first.price, 30) && almost(swings.second.price, 10), 'lastSwings prices');

console.log('indicators ok');
