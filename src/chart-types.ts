// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import type { Candle } from './sources/types';

export const CHART_TYPE_KEY = 'opencharts:chart-type';

export const CHART_TYPE_IDS = [
  'candles',
  'hollow',
  'bars',
  'heikin',
  'high-low',
  'line',
  'line-markers',
  'stepline',
  'area',
  'hlc-area',
  'baseline',
  'columns',
  'renko',
  'kagi',
  'pnf',
  'linebreak',
  'range',
] as const;

export type ChartTypeId = (typeof CHART_TYPE_IDS)[number];

export type ChartTypeGroup = 'bars' | 'line' | 'special';

export const CHART_TYPE_GROUPS: { id: ChartTypeGroup; labelKey: string; types: ChartTypeId[] }[] = [
  {
    id: 'bars',
    labelKey: 'chartType.groupBars',
    types: ['candles', 'hollow', 'bars', 'heikin', 'high-low'],
  },
  {
    id: 'line',
    labelKey: 'chartType.groupLine',
    types: ['line', 'line-markers', 'stepline', 'area', 'hlc-area', 'baseline', 'columns'],
  },
  {
    id: 'special',
    labelKey: 'chartType.groupSpecial',
    types: ['renko', 'kagi', 'pnf', 'linebreak', 'range'],
  },
];

export const CHART_TYPE_LABEL: Record<ChartTypeId, string> = {
  candles: 'chartType.candles',
  hollow: 'chartType.hollow',
  bars: 'chartType.bars',
  heikin: 'chartType.heikin',
  'high-low': 'chartType.highLow',
  line: 'chartType.line',
  'line-markers': 'chartType.lineMarkers',
  stepline: 'chartType.stepline',
  area: 'chartType.area',
  'hlc-area': 'chartType.hlcArea',
  baseline: 'chartType.baseline',
  columns: 'chartType.columns',
  renko: 'chartType.renko',
  kagi: 'chartType.kagi',
  pnf: 'chartType.pnf',
  linebreak: 'chartType.linebreak',
  range: 'chartType.range',
};

const SYNTHETIC = new Set<ChartTypeId>(['renko', 'kagi', 'pnf', 'linebreak', 'range']);

export function isChartTypeId(value: string): value is ChartTypeId {
  return (CHART_TYPE_IDS as readonly string[]).includes(value);
}

export function isSyntheticChartType(type: ChartTypeId): boolean {
  return SYNTHETIC.has(type);
}

export function loadChartType(): ChartTypeId {
  try {
    const raw = localStorage.getItem(CHART_TYPE_KEY);
    if (raw && isChartTypeId(raw)) return raw;
  } catch {
    /* private mode */
  }
  return 'candles';
}

export function saveChartType(type: ChartTypeId): void {
  try {
    localStorage.setItem(CHART_TYPE_KEY, type);
  } catch {
    /* private mode */
  }
}

export function uniquifyTimes<T extends { time: number }>(rows: T[]): T[] {
  const out: T[] = [];
  let last = -Infinity;
  for (const row of rows) {
    let time = row.time;
    if (time <= last) time = last + 1;
    out.push(time === row.time ? row : { ...row, time });
    last = time;
  }
  return out;
}

export function averageTrueRange(candles: Candle[], period = 14): number {
  if (candles.length < 2) {
    const c = candles[0];
    return c ? Math.max(c.high - c.low, Math.abs(c.close) * 0.01, 1e-8) : 1;
  }
  const n = Math.min(period, candles.length - 1);
  const start = candles.length - 1 - n;
  let sum = 0;
  for (let i = start + 1; i < candles.length; i++) {
    const c = candles[i]!;
    const prev = candles[i - 1]!;
    sum += Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close));
  }
  return sum / n;
}

/** Round a raw size to 1 / 2 / 5 × 10^n so brick sizes stay readable. */
export function niceStep(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const f = value / 10 ** exp;
  const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return n * 10 ** exp;
}

export function autoBrickSize(candles: Candle[]): number {
  const atr = averageTrueRange(candles, 14);
  const last = candles[candles.length - 1]?.close ?? 0;
  const floor = Math.abs(last) * 1e-6 || 1e-8;
  return Math.max(niceStep(atr), floor);
}

export function heikinAshi(candles: Candle[]): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const prev = out[i - 1];
    const haOpen = prev ? (prev.open + prev.close) / 2 : (c.open + c.close) / 2;
    out.push({
      time: c.time,
      open: haOpen,
      high: Math.max(c.high, haOpen, haClose),
      low: Math.min(c.low, haOpen, haClose),
      close: haClose,
      volume: c.volume,
    });
  }
  return out;
}

export function renkoBricks(candles: Candle[], brick: number): Candle[] {
  if (!(brick > 0) || !candles.length) return [];
  const out: Candle[] = [];
  let last = Math.round(candles[0]!.close / brick) * brick;
  let dir = 0;
  let vol = 0;
  const emit = (open: number, close: number, time: number, volume: number): void => {
    out.push({
      time,
      open,
      high: Math.max(open, close),
      low: Math.min(open, close),
      close,
      volume,
    });
  };
  for (const c of candles) {
    vol += c.volume;
    if (dir === 0) {
      while (c.close >= last + brick) {
        emit(last, last + brick, c.time, vol);
        last += brick;
        dir = 1;
        vol = 0;
      }
      while (c.close <= last - brick) {
        emit(last, last - brick, c.time, vol);
        last -= brick;
        dir = -1;
        vol = 0;
      }
      continue;
    }
    if (dir === 1) {
      while (c.close >= last + brick) {
        emit(last, last + brick, c.time, vol);
        last += brick;
        vol = 0;
      }
      while (c.close <= last - 2 * brick) {
        emit(last - brick, last - 2 * brick, c.time, vol);
        last -= 2 * brick;
        dir = -1;
        vol = 0;
      }
    } else {
      while (c.close <= last - brick) {
        emit(last, last - brick, c.time, vol);
        last -= brick;
        vol = 0;
      }
      while (c.close >= last + 2 * brick) {
        emit(last + brick, last + 2 * brick, c.time, vol);
        last += 2 * brick;
        dir = 1;
        vol = 0;
      }
    }
  }
  return uniquifyTimes(out);
}

export function lineBreakBars(candles: Candle[], lines = 3): Candle[] {
  if (!candles.length) return [];
  const out: Candle[] = [];
  for (const c of candles) {
    if (out.length < lines) {
      const prev = out[out.length - 1];
      const open = prev ? prev.close : c.open;
      if (out.length && c.close === open) continue;
      out.push({
        time: c.time,
        open,
        close: c.close,
        high: Math.max(open, c.close),
        low: Math.min(open, c.close),
        volume: c.volume,
      });
      continue;
    }
    const window = out.slice(-lines);
    const high = Math.max(...window.map((b) => Math.max(b.open, b.close)));
    const low = Math.min(...window.map((b) => Math.min(b.open, b.close)));
    if (c.close > high) {
      const open = out[out.length - 1]!.close;
      out.push({
        time: c.time,
        open,
        close: c.close,
        high: Math.max(open, c.close),
        low: Math.min(open, c.close),
        volume: c.volume,
      });
    } else if (c.close < low) {
      const open = out[out.length - 1]!.close;
      out.push({
        time: c.time,
        open,
        close: c.close,
        high: Math.max(open, c.close),
        low: Math.min(open, c.close),
        volume: c.volume,
      });
    }
  }
  return uniquifyTimes(out);
}

function candlePath(c: Candle): number[] {
  return c.close >= c.open ? [c.open, c.low, c.high, c.close] : [c.open, c.high, c.low, c.close];
}

export function rangeBars(candles: Candle[], size: number): Candle[] {
  if (!(size > 0) || !candles.length) return [];
  const out: Candle[] = [];
  let open = candles[0]!.open;
  let high = open;
  let low = open;
  let time = candles[0]!.time;
  let vol = 0;

  const flush = (close: number, t: number, volume: number): void => {
    out.push({
      time: t,
      open,
      close,
      high: Math.max(open, close, high),
      low: Math.min(open, close, low),
      volume,
    });
  };

  const feed = (price: number, t: number): void => {
    high = Math.max(high, price);
    low = Math.min(low, price);
    if (price >= open + size) {
      let level = open;
      while (price >= level + size) {
        const close = level + size;
        flush(close, t, vol);
        vol = 0;
        level = close;
        open = close;
        high = close;
        low = close;
        time = t;
      }
      high = Math.max(high, price);
      low = Math.min(low, price);
    } else if (price <= open - size) {
      let level = open;
      while (price <= level - size) {
        const close = level - size;
        flush(close, t, vol);
        vol = 0;
        level = close;
        open = close;
        high = close;
        low = close;
        time = t;
      }
      high = Math.max(high, price);
      low = Math.min(low, price);
    }
  };

  for (const c of candles) {
    vol += c.volume;
    time = c.time;
    for (const p of candlePath(c)) feed(p, c.time);
  }
  const last = out[out.length - 1];
  if (!last || last.close !== open || last.time !== time) {
    if (high !== low || open !== candles[0]!.open || out.length === 0) {
      out.push({
        time,
        open,
        close: candles[candles.length - 1]!.close,
        high,
        low,
        volume: vol,
      });
    }
  }
  return uniquifyTimes(out);
}

export interface KagiPoint {
  time: number;
  price: number;
  yang: boolean;
}

export function kagiPoints(candles: Candle[], reversal: number): KagiPoint[] {
  if (!candles.length || !(reversal > 0)) return [];
  const pts: KagiPoint[] = [];
  let price = candles[0]!.close;
  let time = candles[0]!.time;
  let dir = 0;
  let yang = false;
  let shoulder = price;
  let waist = price;
  pts.push({ time, price, yang: false });

  const commit = (next: number, t: number): void => {
    if (dir === 1 && next > shoulder) yang = true;
    if (dir === -1 && next < waist) yang = false;
    if (dir === 1) shoulder = Math.max(shoulder, next);
    if (dir === -1) waist = Math.min(waist, next);
    price = next;
    time = t;
    pts.push({ time, price, yang });
  };

  for (const c of candles.slice(1)) {
    const close = c.close;
    if (dir === 0) {
      if (Math.abs(close - price) < reversal && close !== price) {
        // wait for a move of at least the reversal to pick a direction,
        // but still extend if the first legs are smaller so the line isn't stuck
      }
      if (close > price) {
        dir = 1;
        commit(close, c.time);
      } else if (close < price) {
        dir = -1;
        commit(close, c.time);
      }
      continue;
    }
    if (dir === 1) {
      if (close > price) commit(close, c.time);
      else if (price - close >= reversal) {
        dir = -1;
        commit(close, c.time);
      }
    } else if (close < price) commit(close, c.time);
    else if (close - price >= reversal) {
      dir = 1;
      commit(close, c.time);
    }
  }
  return uniquifyTimes(pts);
}

export interface PnfColumn {
  time: number;
  dir: 1 | -1;
  low: number;
  high: number;
  box: number;
  volume: number;
}

export function pointAndFigure(candles: Candle[], box: number, reversalBoxes = 3): PnfColumn[] {
  if (!(box > 0) || !candles.length) return [];
  const out: PnfColumn[] = [];
  let dir: 0 | 1 | -1 = 0;
  let lastHigh = Math.floor(candles[0]!.close / box) * box;
  let lastLow = lastHigh;
  let vol = 0;
  const rev = box * Math.max(1, reversalBoxes);

  const startUp = (price: number, t: number, volume: number): void => {
    const high = Math.floor(price / box) * box;
    const low = high;
    out.push({ time: t, dir: 1, low, high, box, volume });
    lastHigh = high;
    lastLow = low;
    dir = 1;
  };
  const startDown = (price: number, t: number, volume: number): void => {
    const low = Math.ceil(price / box) * box;
    const high = low;
    out.push({ time: t, dir: -1, low, high, box, volume });
    lastHigh = high;
    lastLow = low;
    dir = -1;
  };

  for (const c of candles) {
    vol += c.volume;
    const px = c.close;
    if (dir === 0) {
      if (px >= lastHigh + box) {
        startUp(px, c.time, vol);
        vol = 0;
        // extend if the close overshoots
        const col = out[out.length - 1]!;
        col.high = Math.floor(px / box) * box;
        lastHigh = col.high;
      } else if (px <= lastLow - box) {
        startDown(px, c.time, vol);
        vol = 0;
        const col = out[out.length - 1]!;
        col.low = Math.ceil(px / box) * box;
        lastLow = col.low;
      }
      continue;
    }
    if (dir === 1) {
      if (px >= lastHigh + box) {
        const col = out[out.length - 1]!;
        col.high = Math.floor(px / box) * box;
        col.time = c.time;
        col.volume += vol;
        lastHigh = col.high;
        vol = 0;
      } else if (px <= lastHigh - rev) {
        startDown(px, c.time, vol);
        vol = 0;
        const col = out[out.length - 1]!;
        col.low = Math.ceil(px / box) * box;
        lastLow = col.low;
      }
    } else if (px <= lastLow - box) {
      const col = out[out.length - 1]!;
      col.low = Math.ceil(px / box) * box;
      col.time = c.time;
      col.volume += vol;
      lastLow = col.low;
      vol = 0;
    } else if (px >= lastLow + rev) {
      startUp(px, c.time, vol);
      vol = 0;
      const col = out[out.length - 1]!;
      col.high = Math.floor(px / box) * box;
      lastHigh = col.high;
    }
  }
  return uniquifyTimes(out);
}

export type ChartPoint =
  | { kind: 'ohlc'; data: Candle[] }
  | { kind: 'line'; data: { time: number; value: number }[] }
  | { kind: 'baseline'; data: { time: number; value: number }[]; basePrice: number }
  | { kind: 'histogram'; data: { time: number; value: number; color: string }[] }
  | { kind: 'hlc'; data: { time: number; high: number; low: number; close: number }[] }
  | { kind: 'highlow'; data: Candle[] }
  | { kind: 'kagi'; data: KagiPoint[] }
  | { kind: 'pnf'; data: PnfColumn[] };

export interface ChartView {
  type: ChartTypeId;
  points: ChartPoint;
  bars: Candle[];
}

const UP = '#26a69a';
const DOWN = '#ef5350';

function asLine(candles: Candle[]): { time: number; value: number }[] {
  return candles.map((c) => ({ time: c.time, value: c.close }));
}

function asHlc(candles: Candle[]): { time: number; high: number; low: number; close: number }[] {
  return candles.map((c) => ({ time: c.time, high: c.high, low: c.low, close: c.close }));
}

function asColumns(candles: Candle[]): { time: number; value: number; color: string }[] {
  return candles.map((c, i) => {
    const prev = i > 0 ? candles[i - 1]!.close : c.open;
    return { time: c.time, value: c.close, color: c.close >= prev ? UP : DOWN };
  });
}

function kagiAsBars(points: KagiPoint[]): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const prev = points[i - 1];
    const open = prev ? prev.price : p.price;
    out.push({
      time: p.time,
      open,
      close: p.price,
      high: Math.max(open, p.price),
      low: Math.min(open, p.price),
      volume: 0,
    });
  }
  return out;
}

function pnfAsBars(cols: PnfColumn[]): Candle[] {
  return cols.map((c) => ({
    time: c.time,
    open: c.dir > 0 ? c.low : c.high,
    close: c.dir > 0 ? c.high : c.low,
    high: c.high,
    low: c.low,
    volume: c.volume,
  }));
}

export function buildChartView(type: ChartTypeId, candles: Candle[]): ChartView {
  if (!candles.length) return { type, points: { kind: 'ohlc', data: [] }, bars: [] };
  const brick = autoBrickSize(candles);
  switch (type) {
    case 'heikin': {
      const bars = heikinAshi(candles);
      return { type, points: { kind: 'ohlc', data: bars }, bars };
    }
    case 'line':
    case 'line-markers':
    case 'stepline':
    case 'area':
      return { type, points: { kind: 'line', data: asLine(candles) }, bars: candles };
    case 'baseline':
      return {
        type,
        points: { kind: 'baseline', data: asLine(candles), basePrice: candles[0]!.close },
        bars: candles,
      };
    case 'columns':
      return { type, points: { kind: 'histogram', data: asColumns(candles) }, bars: candles };
    case 'hlc-area':
      return { type, points: { kind: 'hlc', data: asHlc(candles) }, bars: candles };
    case 'high-low':
      return { type, points: { kind: 'highlow', data: candles }, bars: candles };
    case 'renko': {
      const bars = renkoBricks(candles, brick);
      return { type, points: { kind: 'ohlc', data: bars }, bars };
    }
    case 'linebreak': {
      const bars = lineBreakBars(candles, 3);
      return { type, points: { kind: 'ohlc', data: bars }, bars };
    }
    case 'range': {
      const bars = rangeBars(candles, brick);
      return { type, points: { kind: 'ohlc', data: bars }, bars };
    }
    case 'kagi': {
      const data = kagiPoints(candles, brick);
      return { type, points: { kind: 'kagi', data }, bars: kagiAsBars(data) };
    }
    case 'pnf': {
      const data = pointAndFigure(candles, brick, 3);
      return { type, points: { kind: 'pnf', data }, bars: pnfAsBars(data) };
    }
    default:
      return { type, points: { kind: 'ohlc', data: candles }, bars: candles };
  }
}

export function viewLastPoint(view: ChartView): unknown | null {
  const pts = view.points;
  switch (pts.kind) {
    case 'ohlc':
    case 'highlow':
      return toOhlcPoint(pts.data[pts.data.length - 1]);
    case 'line':
    case 'baseline':
      return toLinePoint(pts.data[pts.data.length - 1]);
    case 'histogram':
      return toHistPoint(pts.data[pts.data.length - 1]);
    case 'hlc':
      return toHlcPoint(pts.data[pts.data.length - 1]);
    case 'kagi':
      return toKagiPoint(pts.data[pts.data.length - 1]);
    case 'pnf':
      return toPnfPoint(pts.data[pts.data.length - 1]);
  }
}

export function viewAllPoints(view: ChartView): unknown[] {
  const pts = view.points;
  switch (pts.kind) {
    case 'ohlc':
    case 'highlow':
      return pts.data.map(toOhlcPoint);
    case 'line':
    case 'baseline':
      return pts.data.map(toLinePoint);
    case 'histogram':
      return pts.data.map(toHistPoint);
    case 'hlc':
      return pts.data.map(toHlcPoint);
    case 'kagi':
      return pts.data.map(toKagiPoint);
    case 'pnf':
      return pts.data.map(toPnfPoint);
  }
}

function toOhlcPoint(c: Candle | undefined): unknown {
  if (!c) return null;
  return { time: c.time as Candle['time'], open: c.open, high: c.high, low: c.low, close: c.close };
}

function toLinePoint(c: { time: number; value: number } | undefined): unknown {
  if (!c) return null;
  return { time: c.time, value: c.value };
}

function toHistPoint(c: { time: number; value: number; color: string } | undefined): unknown {
  if (!c) return null;
  return { time: c.time, value: c.value, color: c.color };
}

function toHlcPoint(c: { time: number; high: number; low: number; close: number } | undefined): unknown {
  if (!c) return null;
  return { time: c.time, high: c.high, low: c.low, close: c.close };
}

function toKagiPoint(c: KagiPoint | undefined): unknown {
  if (!c) return null;
  return { time: c.time, price: c.price, yang: c.yang, value: c.price };
}

function toPnfPoint(c: PnfColumn | undefined): unknown {
  if (!c) return null;
  return { time: c.time, dir: c.dir, low: c.low, high: c.high, box: c.box, volume: c.volume };
}
