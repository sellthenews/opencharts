// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import {
  AreaSeries,
  BarSeries,
  BaselineSeries,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineType,
  customSeriesDefaultOptions,
} from 'lightweight-charts';
import type {
  CustomData,
  CustomSeriesOptions,
  CustomSeriesWhitespaceData,
  IChartApi,
  ICustomSeriesPaneRenderer,
  ICustomSeriesPaneView,
  ISeriesApi,
  PaneRendererCustomData,
  PriceToCoordinateConverter,
  SeriesType,
  Time,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import { candleSeriesOptions } from './chart-options';
import { cssVar } from './theme';
import type { ChartTypeId } from './chart-types';

function upColor(): string {
  return cssVar('--up', '#26a69a');
}

function downColor(): string {
  return cssVar('--down', '#ef5350');
}

function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return `rgba(38, 166, 154, ${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const COMMON = {
  lastValueVisible: true,
  priceLineVisible: true,
  priceLineWidth: 1 as const,
  priceLineColor: '#787b86',
};

type MediaScope = { context: CanvasRenderingContext2D };

function ctxOf(target: CanvasRenderingTarget2D, fn: (ctx: CanvasRenderingContext2D) => void): void {
  target.useMediaCoordinateSpace((scope) => {
    fn((scope as MediaScope).context);
  });
}

function barColor(up: boolean): string {
  return up ? upColor() : downColor();
}

interface HlcDatum extends CustomData<Time> {
  high: number;
  low: number;
  close: number;
}

class HlcAreaRenderer implements ICustomSeriesPaneRenderer {
  data: PaneRendererCustomData<Time, HlcDatum> | null = null;
  options: CustomSeriesOptions | null = null;

  update(data: PaneRendererCustomData<Time, HlcDatum>, options: CustomSeriesOptions): void {
    this.data = data;
    this.options = options;
  }

  draw(target: CanvasRenderingTarget2D, priceToY: PriceToCoordinateConverter): void {
    const data = this.data;
    const range = data?.visibleRange;
    if (!data || !range) return;
    ctxOf(target, (ctx) => {
      const highs: { x: number; y: number }[] = [];
      const lows: { x: number; y: number }[] = [];
      const closes: { x: number; y: number }[] = [];
      for (let i = range.from; i <= range.to; i++) {
        const bar = data.bars[i];
        if (!bar) continue;
        const d = bar.originalData;
        const yH = priceToY(d.high);
        const yL = priceToY(d.low);
        const yC = priceToY(d.close);
        if (yH === null || yL === null || yC === null) continue;
        highs.push({ x: bar.x, y: yH as number });
        lows.push({ x: bar.x, y: yL as number });
        closes.push({ x: bar.x, y: yC as number });
      }
      if (highs.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(highs[0]!.x, highs[0]!.y);
      for (const p of highs) ctx.lineTo(p.x, p.y);
      for (let i = lows.length - 1; i >= 0; i--) ctx.lineTo(lows[i]!.x, lows[i]!.y);
      ctx.closePath();
      ctx.fillStyle = 'rgba(38, 166, 154, 0.22)';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(closes[0]!.x, closes[0]!.y);
      for (const p of closes) ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = this.options?.color ?? upColor();
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }
}

export class HlcAreaSeriesView implements ICustomSeriesPaneView<Time, HlcDatum, CustomSeriesOptions> {
  private readonly _renderer = new HlcAreaRenderer();

  renderer(): ICustomSeriesPaneRenderer {
    return this._renderer;
  }

  update(data: PaneRendererCustomData<Time, HlcDatum>, options: CustomSeriesOptions): void {
    this._renderer.update(data, options);
  }

  priceValueBuilder(plotRow: HlcDatum): number[] {
    return [plotRow.low, plotRow.high, plotRow.close];
  }

  isWhitespace(data: HlcDatum | CustomSeriesWhitespaceData<Time>): data is CustomSeriesWhitespaceData<Time> {
    return (data as HlcDatum).close === undefined || (data as HlcDatum).high === undefined;
  }

  defaultOptions(): CustomSeriesOptions {
    return { ...customSeriesDefaultOptions, color: upColor() };
  }
}

interface HighLowDatum extends CustomData<Time> {
  open: number;
  high: number;
  low: number;
  close: number;
}

class HighLowRenderer implements ICustomSeriesPaneRenderer {
  data: PaneRendererCustomData<Time, HighLowDatum> | null = null;

  update(data: PaneRendererCustomData<Time, HighLowDatum>): void {
    this.data = data;
  }

  draw(target: CanvasRenderingTarget2D, priceToY: PriceToCoordinateConverter): void {
    const data = this.data;
    const range = data?.visibleRange;
    if (!data || !range) return;
    const half = Math.max(1, Math.min(data.barSpacing * 0.15, 3));
    ctxOf(target, (ctx) => {
      ctx.lineWidth = Math.max(1.25, Math.min(data.barSpacing * 0.18, 2.5));
      ctx.lineCap = 'round';
      for (let i = range.from; i <= range.to; i++) {
        const bar = data.bars[i];
        if (!bar) continue;
        const d = bar.originalData;
        const yH = priceToY(d.high);
        const yL = priceToY(d.low);
        const yC = priceToY(d.close);
        if (yH === null || yL === null) continue;
        ctx.strokeStyle = barColor(d.close >= d.open);
        ctx.beginPath();
        ctx.moveTo(bar.x, yH as number);
        ctx.lineTo(bar.x, yL as number);
        ctx.stroke();
        if (yC !== null) {
          ctx.beginPath();
          ctx.moveTo(bar.x, yC as number);
          ctx.lineTo(bar.x + half * 2, yC as number);
          ctx.stroke();
        }
      }
    });
  }
}

export class HighLowSeriesView implements ICustomSeriesPaneView<Time, HighLowDatum, CustomSeriesOptions> {
  private readonly _renderer = new HighLowRenderer();

  renderer(): ICustomSeriesPaneRenderer {
    return this._renderer;
  }

  update(data: PaneRendererCustomData<Time, HighLowDatum>, _options: CustomSeriesOptions): void {
    this._renderer.update(data);
  }

  priceValueBuilder(plotRow: HighLowDatum): number[] {
    return [plotRow.low, plotRow.high, plotRow.close];
  }

  isWhitespace(data: HighLowDatum | CustomSeriesWhitespaceData<Time>): data is CustomSeriesWhitespaceData<Time> {
    return (data as HighLowDatum).high === undefined || (data as HighLowDatum).low === undefined;
  }

  defaultOptions(): CustomSeriesOptions {
    return { ...customSeriesDefaultOptions, color: upColor() };
  }
}

interface KagiDatum extends CustomData<Time> {
  price: number;
  yang: boolean;
  value?: number;
}

class KagiRenderer implements ICustomSeriesPaneRenderer {
  data: PaneRendererCustomData<Time, KagiDatum> | null = null;

  update(data: PaneRendererCustomData<Time, KagiDatum>): void {
    this.data = data;
  }

  draw(target: CanvasRenderingTarget2D, priceToY: PriceToCoordinateConverter): void {
    const data = this.data;
    const range = data?.visibleRange;
    if (!data || !range || data.bars.length < 2) return;
    // Draw from one bar before the visible range so incoming horizontals connect.
    const from = Math.max(1, range.from);
    const to = Math.min(data.bars.length - 1, range.to);
    ctxOf(target, (ctx) => {
      ctx.lineJoin = 'miter';
      ctx.lineCap = 'butt';
      for (let i = from; i <= to; i++) {
        const prev = data.bars[i - 1];
        const cur = data.bars[i];
        if (!prev || !cur) continue;
        const y0 = priceToY(prev.originalData.price);
        const y1 = priceToY(cur.originalData.price);
        if (y0 === null || y1 === null) continue;
        ctx.strokeStyle = barColor(cur.originalData.yang);
        ctx.lineWidth = cur.originalData.yang ? 3 : 1.25;
        ctx.beginPath();
        ctx.moveTo(prev.x, y0 as number);
        ctx.lineTo(cur.x, y0 as number);
        ctx.lineTo(cur.x, y1 as number);
        ctx.stroke();
      }
    });
  }
}

export class KagiSeriesView implements ICustomSeriesPaneView<Time, KagiDatum, CustomSeriesOptions> {
  private readonly _renderer = new KagiRenderer();

  renderer(): ICustomSeriesPaneRenderer {
    return this._renderer;
  }

  update(data: PaneRendererCustomData<Time, KagiDatum>, _options: CustomSeriesOptions): void {
    this._renderer.update(data);
  }

  priceValueBuilder(plotRow: KagiDatum): number[] {
    return [plotRow.price];
  }

  isWhitespace(data: KagiDatum | CustomSeriesWhitespaceData<Time>): data is CustomSeriesWhitespaceData<Time> {
    return (data as KagiDatum).price === undefined;
  }

  defaultOptions(): CustomSeriesOptions {
    return { ...customSeriesDefaultOptions, color: upColor() };
  }
}

interface PnfDatum extends CustomData<Time> {
  dir: 1 | -1;
  low: number;
  high: number;
  box: number;
}

class PnfRenderer implements ICustomSeriesPaneRenderer {
  data: PaneRendererCustomData<Time, PnfDatum> | null = null;

  update(data: PaneRendererCustomData<Time, PnfDatum>): void {
    this.data = data;
  }

  draw(target: CanvasRenderingTarget2D, priceToY: PriceToCoordinateConverter): void {
    const data = this.data;
    const range = data?.visibleRange;
    if (!data || !range) return;
    const half = Math.max(3, Math.min(data.barSpacing * 0.35, 8));
    ctxOf(target, (ctx) => {
      ctx.lineWidth = 1.25;
      for (let i = range.from; i <= range.to; i++) {
        const bar = data.bars[i];
        if (!bar) continue;
        const d = bar.originalData;
        const up = d.dir > 0;
        ctx.strokeStyle = barColor(up);
        const start = d.low;
        const end = d.high;
        if (!(d.box > 0)) continue;
        // Walk each box in the column. X columns stack upward; O columns downward.
        const step = d.box;
        if (up) {
          for (let px = start; px < end - step * 0.25; px += step) {
            const y1 = priceToY(px);
            const y2 = priceToY(px + step);
            if (y1 === null || y2 === null) continue;
            ctx.beginPath();
            ctx.moveTo(bar.x - half, y1 as number);
            ctx.lineTo(bar.x + half, y2 as number);
            ctx.moveTo(bar.x + half, y1 as number);
            ctx.lineTo(bar.x - half, y2 as number);
            ctx.stroke();
          }
        } else {
          for (let px = start; px < end - step * 0.25 || px === start; px += step) {
            if (px >= end && px !== start) break;
            const top = Math.min(px + step, end);
            if (top <= px) break;
            const y1 = priceToY(px);
            const y2 = priceToY(top);
            if (y1 === null || y2 === null) continue;
            const cy = ((y1 as number) + (y2 as number)) / 2;
            const rx = half;
            const ry = Math.abs((y2 as number) - (y1 as number)) / 2;
            ctx.beginPath();
            ctx.ellipse(bar.x, cy, rx, Math.max(ry, 2), 0, 0, Math.PI * 2);
            ctx.stroke();
            if (px + step > end) break;
          }
        }
      }
    });
  }
}

export class PnfSeriesView implements ICustomSeriesPaneView<Time, PnfDatum, CustomSeriesOptions> {
  private readonly _renderer = new PnfRenderer();

  renderer(): ICustomSeriesPaneRenderer {
    return this._renderer;
  }

  update(data: PaneRendererCustomData<Time, PnfDatum>, _options: CustomSeriesOptions): void {
    this._renderer.update(data);
  }

  priceValueBuilder(plotRow: PnfDatum): number[] {
    const current = plotRow.dir > 0 ? plotRow.high : plotRow.low;
    return [plotRow.low, plotRow.high, current];
  }

  isWhitespace(data: PnfDatum | CustomSeriesWhitespaceData<Time>): data is CustomSeriesWhitespaceData<Time> {
    return (data as PnfDatum).box === undefined || (data as PnfDatum).high === undefined;
  }

  defaultOptions(): CustomSeriesOptions {
    return { ...customSeriesDefaultOptions, color: upColor() };
  }
}


export function priceSeriesThemeOptions(type: ChartTypeId): Record<string, unknown> {
  const up = upColor();
  const down = downColor();
  switch (type) {
    case 'hollow':
      return {
        ...candleSeriesOptions(),
        ...COMMON,
        upColor: 'rgba(0,0,0,0)',
        downColor: down,
        borderVisible: true,
        borderUpColor: up,
        borderDownColor: down,
        wickUpColor: up,
        wickDownColor: down,
      };
    case 'bars':
      return { ...COMMON, upColor: up, downColor: down, thinBars: false, openVisible: true };
    case 'line':
      return { ...COMMON, color: up, lineWidth: 2, lineType: LineType.Simple, pointMarkersVisible: false };
    case 'line-markers':
      return {
        ...COMMON,
        color: up,
        lineWidth: 2,
        lineType: LineType.Simple,
        pointMarkersVisible: true,
        pointMarkersRadius: 3,
      };
    case 'stepline':
      return { ...COMMON, color: up, lineWidth: 2, lineType: LineType.WithSteps, pointMarkersVisible: false };
    case 'area':
      return {
        ...COMMON,
        lineColor: up,
        topColor: withAlpha(up, 0.28),
        bottomColor: withAlpha(up, 0.02),
        lineWidth: 2,
        lineType: LineType.Simple,
      };
    case 'baseline':
      return {
        ...COMMON,
        topLineColor: up,
        bottomLineColor: down,
        topFillColor1: withAlpha(up, 0.28),
        topFillColor2: withAlpha(up, 0.05),
        bottomFillColor1: withAlpha(down, 0.28),
        bottomFillColor2: withAlpha(down, 0.05),
        baseValue: { type: 'price', price: 0 },
        lineWidth: 2,
      };
    case 'columns':
      return { ...COMMON, color: up };
    case 'hlc-area':
    case 'high-low':
    case 'kagi':
    case 'pnf':
      return { ...COMMON, color: up };
    case 'renko':
    case 'linebreak':
    case 'range':
      return {
        ...candleSeriesOptions(),
        ...COMMON,
        borderVisible: true,
        borderUpColor: up,
        borderDownColor: down,
        wickVisible: false,
      };
    default:
      return { ...candleSeriesOptions(), ...COMMON };
  }
}

export function applyPriceSeriesTheme(series: ISeriesApi<SeriesType>, type: ChartTypeId): void {
  series.applyOptions(priceSeriesThemeOptions(type) as never);
}

export function createPriceSeries(chart: IChartApi, type: ChartTypeId): ISeriesApi<SeriesType> {
  const opts = priceSeriesThemeOptions(type);
  switch (type) {
    case 'hollow':
    case 'renko':
    case 'linebreak':
    case 'range':
    case 'candles':
    case 'heikin':
      return chart.addSeries(CandlestickSeries, opts as never);
    case 'bars':
      return chart.addSeries(BarSeries, opts as never);
    case 'line':
    case 'line-markers':
    case 'stepline':
      return chart.addSeries(LineSeries, opts as never);
    case 'area':
      return chart.addSeries(AreaSeries, opts as never);
    case 'baseline':
      return chart.addSeries(BaselineSeries, opts as never);
    case 'columns':
      return chart.addSeries(HistogramSeries, opts as never);
    case 'hlc-area':
      return chart.addCustomSeries(new HlcAreaSeriesView(), opts as never);
    case 'high-low':
      return chart.addCustomSeries(new HighLowSeriesView(), opts as never);
    case 'kagi':
      return chart.addCustomSeries(new KagiSeriesView(), opts as never);
    case 'pnf':
      return chart.addCustomSeries(new PnfSeriesView(), opts as never);
    default:
      return chart.addSeries(CandlestickSeries, opts as never);
  }
}

export function writeSeriesData(series: ISeriesApi<SeriesType>, data: unknown[]): void {
  (series as ISeriesApi<'Line'>).setData(data as never);
}

export function writeSeriesUpdate(series: ISeriesApi<SeriesType>, point: unknown): void {
  if (point == null) return;
  (series as ISeriesApi<'Line'>).update(point as never);
}

export function writeBaselinePrice(series: ISeriesApi<SeriesType>, price: number): void {
  (series as ISeriesApi<'Baseline'>).applyOptions({ baseValue: { type: 'price', price } });
}
