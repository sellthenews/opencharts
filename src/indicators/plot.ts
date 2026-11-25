// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import type { UTCTimestamp } from 'lightweight-charts';
import type { Candle } from '../sources';
import type { IndicatorInstance, LinePoint } from './types';
import {
  adx,
  anchoredVwap,
  aroon,
  atr,
  bollinger,
  cci,
  cmf,
  cvd,
  donchian,
  ema,
  emaLine,
  ichimoku,
  isHigherTf,
  keltner,
  macd,
  mapToChartTimes,
  mfi,
  momentum,
  obv,
  parabolicSar,
  roc,
  rsi,
  sessionVwapProfile,
  sma,
  smaLine,
  smaVolume,
  stochastic,
  stochRsi,
  supertrend,
  williamsR,
  wma,
} from './math';

export type PlotPoint = { time: UTCTimestamp; value: number; color?: string };

function asLine(points: LinePoint[]): PlotPoint[] {
  return points
    .filter((p) => Number.isFinite(p.value))
    .map((p) => ({ time: p.time as UTCTimestamp, value: p.value }));
}

export function warmupFor(item: IndicatorInstance): number {
  const p = item.params;
  const period = p.period ?? p.kPeriod ?? p.slow ?? 20;
  const extra = (p.dPeriod ?? 0) + (p.fast ?? 0) + (p.slow ?? 0) + (p.signal ?? 0) + (p.senkou ?? 0) + (p.shift ?? 0) + (p.tenkan ?? 0) + (p.kijun ?? 0);
  return Math.max(80, period * 5 + extra + 10);
}

export interface PlotContext {
  htf?: Map<string, Candle[]>;
  chartInterval?: string;
}

export function resolveTfCandles(item: IndicatorInstance, data: Candle[], ctx?: PlotContext): Candle[] {
  const tf = item.params.tf;
  if (!tf || tf === 'chart' || !ctx?.chartInterval || !isHigherTf(ctx.chartInterval, tf)) return data;
  return ctx.htf?.get(tf) ?? [];
}

function projectLine(_item: IndicatorInstance, chart: Candle[], src: Candle[], _ctx: PlotContext | undefined, points: LinePoint[]): PlotPoint[] {
  if (src === chart || !src.length) return asLine(points);
  return asLine(mapToChartTimes(points, chart));
}

export function indicatorPlots(item: IndicatorInstance, data: Candle[], ctx?: PlotContext): PlotPoint[][] {
  const p = item.params;
  const src = resolveTfCandles(item, data, ctx);
  const line = (points: LinePoint[]) => projectLine(item, data, src, ctx, points);
  switch (item.kind) {
    case 'sma':
      return [line(sma(src, p.period ?? 20))];
    case 'ema':
      return [line(ema(src, p.period ?? 20))];
    case 'wma':
      return [line(wma(src, p.period ?? 20))];
    case 'vwap': {
      const prof = sessionVwapProfile(src);
      const bands = Math.max(0, Math.min(3, Math.round(p.bands ?? 0)));
      const plots: PlotPoint[][] = [line(prof.map((b) => ({ time: b.time, value: b.vwap })))];
      for (let n = 1; n <= bands; n++) {
        plots.push(line(prof.map((b) => ({ time: b.time, value: b.vwap + n * b.sigma }))));
        plots.push(line(prof.map((b) => ({ time: b.time, value: b.vwap - n * b.sigma }))));
      }
      if ((p.highs ?? 'off') === 'on') {
        plots.push(line(prof.map((b) => ({ time: b.time, value: b.high }))));
        plots.push(line(prof.map((b) => ({ time: b.time, value: b.low }))));
      }
      return plots;
    }
    case 'vwapAnchor':
      return [asLine(anchoredVwap(data, p.anchor ?? 0))];
    case 'vpvr':
    case 'vpfr':
    case 'pivots':
      return [];
    case 'bb': {
      const bands = bollinger(data, p.period ?? 20, p.std ?? 2);
      return [
        asLine(bands.map((b) => ({ time: b.time, value: b.mid }))),
        asLine(bands.map((b) => ({ time: b.time, value: b.upper }))),
        asLine(bands.map((b) => ({ time: b.time, value: b.lower }))),
      ];
    }
    case 'ichimoku': {
      const cloud = ichimoku(data, p.tenkan ?? 9, p.kijun ?? 26, p.senkou ?? 52, p.shift ?? 26);
      return [asLine(cloud.tenkan), asLine(cloud.kijun), asLine(cloud.spanA), asLine(cloud.spanB), asLine(cloud.chikou)];
    }
    case 'supertrend': {
      const pts = supertrend(data, p.period ?? 10, p.multiplier ?? 3);
      return [
        asLine(pts.filter((x) => x.dir === 1).map((x) => ({ time: x.time, value: x.value }))),
        asLine(pts.filter((x) => x.dir === -1).map((x) => ({ time: x.time, value: x.value }))),
      ];
    }
    case 'donchian': {
      const bands = donchian(data, p.period ?? 20);
      return [
        asLine(bands.map((b) => ({ time: b.time, value: b.mid }))),
        asLine(bands.map((b) => ({ time: b.time, value: b.upper }))),
        asLine(bands.map((b) => ({ time: b.time, value: b.lower }))),
      ];
    }
    case 'keltner': {
      const bands = keltner(data, p.period ?? 20, p.kPeriod ?? 10, p.multiplier ?? 2);
      return [
        asLine(bands.map((b) => ({ time: b.time, value: b.mid }))),
        asLine(bands.map((b) => ({ time: b.time, value: b.upper }))),
        asLine(bands.map((b) => ({ time: b.time, value: b.lower }))),
      ];
    }
    case 'sar': {
      const pts = parabolicSar(data, p.start ?? 0.02, p.multiplier ?? 0.02, p.max ?? 0.2);
      return [
        asLine(pts.filter((x) => x.dir === 1).map((x) => ({ time: x.time, value: x.value }))),
        asLine(pts.filter((x) => x.dir === -1).map((x) => ({ time: x.time, value: x.value }))),
      ];
    }
    case 'volume': {
      const hist: PlotPoint[] = data.map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? 'rgba(38, 166, 154, 0.45)' : 'rgba(239, 83, 80, 0.45)',
      }));
      const period = p.period ?? 20;
      if ((p.ma ?? 'on') === 'on' && period >= 1) return [hist, asLine(smaVolume(data, period))];
      return [hist];
    }
    case 'rsi':
      return [line(rsi(src, p.period ?? 14))];
    case 'stoch': {
      const pts = stochastic(data, p.kPeriod ?? 14, p.dPeriod ?? 3);
      return [asLine(pts.map((x) => ({ time: x.time, value: x.k }))), asLine(pts.map((x) => ({ time: x.time, value: x.d })))];
    }
    case 'atr':
      return [asLine(atr(data, p.period ?? 14))];
    case 'adx': {
      const pts = adx(data, p.period ?? 14);
      return [
        asLine(pts.map((x) => ({ time: x.time, value: x.adx }))),
        asLine(pts.map((x) => ({ time: x.time, value: x.pdi }))),
        asLine(pts.map((x) => ({ time: x.time, value: x.mdi }))),
      ];
    }
    case 'stochRsi': {
      const pts = stochRsi(data, p.period ?? 14, p.period ?? 14, p.kPeriod ?? 3, p.dPeriod ?? 3);
      return [asLine(pts.map((x) => ({ time: x.time, value: x.k }))), asLine(pts.map((x) => ({ time: x.time, value: x.d })))];
    }
    case 'momentum':
      return [asLine(momentum(data, p.period ?? 10))];
    case 'roc':
      return [asLine(roc(data, p.period ?? 12))];
    case 'willr':
      return [asLine(williamsR(data, p.period ?? 14))];
    case 'cci':
      return [asLine(cci(data, p.period ?? 20))];
    case 'cmf':
      return [asLine(cmf(data, p.period ?? 20))];
    case 'mfi':
      return [asLine(mfi(data, p.period ?? 14))];
    case 'obv':
      return [asLine(obv(data))];
    case 'aroon': {
      const pts = aroon(data, p.period ?? 25);
      return [asLine(pts.map((x) => ({ time: x.time, value: x.up }))), asLine(pts.map((x) => ({ time: x.time, value: x.down })))];
    }
    case 'macd': {
      const pts = macd(src, p.fast ?? 12, p.slow ?? 26, p.signal ?? 9);
      const hist = line(pts.map((x) => ({ time: x.time, value: x.histogram }))).map((pt) => ({
        ...pt,
        color: pt.value >= 0 ? 'rgba(38, 166, 154, 0.6)' : 'rgba(239, 83, 80, 0.6)',
      }));
      return [hist, line(pts.map((x) => ({ time: x.time, value: x.macd }))), line(pts.map((x) => ({ time: x.time, value: x.signal })))];
    }
    case 'cvd':
      return [line(cvd(src.length ? src : data))];
    case 'maOf': {
      const source = p.source ?? 'rsi';
      const period = p.period ?? 14;
      let base: LinePoint[] = [];
      const series = src.length ? src : data;
      if (source === 'rsi') base = rsi(series, period);
      else if (source === 'macd') base = macd(series, 12, 26, 9).map((x) => ({ time: x.time, value: x.macd }));
      else if (source === 'cvd') base = cvd(series);
      else if (source === 'volume') base = series.map((c) => ({ time: c.time, value: c.volume }));
      else if (source === 'vwap') base = sessionVwapProfile(series).map((b) => ({ time: b.time, value: b.vwap }));
      else base = series.map((c) => ({ time: c.time, value: c.close }));
      const ma = (p.mode ?? 'sma') === 'ema' ? emaLine(base, period) : smaLine(base, period);
      return [line(base), line(ma)];
    }
    case 'autoFib':
    case 'autoTrend':
    case 'footprint':
      return [];
    default:
      return [];
  }
}

function prefixTimesMatch(prev: Candle[], next: Candle[], count: number): boolean {
  if (count > prev.length || count > next.length) return false;
  for (let i = 0; i < count; i++) {
    if (prev[i]!.time !== next[i]!.time) return false;
  }
  return true;
}

export function canPatchCandles(prev: Candle[], next: Candle[]): boolean {
  if (!prev.length || next.length < 1) return false;
  if (next.length === prev.length) return prefixTimesMatch(prev, next, next.length - 1) && next[next.length - 1]!.time === prev[prev.length - 1]!.time;
  if (next.length === prev.length + 1) return prefixTimesMatch(prev, next, prev.length);
  return false;
}

/** Recompute only the warmed-up tail and splice it onto the previous plots. */
export function plotsFromTail(
  item: IndicatorInstance,
  data: Candle[],
  prevData: Candle[],
  prevPlots: PlotPoint[][],
  ctx?: PlotContext,
): PlotPoint[][] {
  if (!prevPlots.length || !canPatchCandles(prevData, data)) return indicatorPlots(item, data, ctx);
  if (item.params.tf && item.params.tf !== 'chart') return indicatorPlots(item, data, ctx);
  const warm = warmupFor(item);
  const from = Math.max(0, data.length - warm);
  const tail = indicatorPlots(item, data.slice(from), ctx);
  if (tail.length !== prevPlots.length) return indicatorPlots(item, data, ctx);
  return prevPlots.map((prev, i) => {
    const piece = tail[i] ?? [];
    const last = piece[piece.length - 1];
    if (!last) return prev;
    const keepUntil = last.time;
    const head = prev.filter((p) => p.time < keepUntil);
    return [...head, last];
  });
}
