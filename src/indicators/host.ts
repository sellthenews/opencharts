// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { HistogramSeries, LineSeries, LineStyle } from 'lightweight-charts';
import type { IChartApi, IPriceLine, ISeriesApi, SeriesType, Time, UTCTimestamp } from 'lightweight-charts';
import { t } from '../i18n';
import type { Candle } from '../sources/types';
import type { SessionKind } from '../timezone';
import {
  adx,
  anchoredVwap,
  aroon,
  atr,
  bollinger,
  cci,
  cmf,
  donchian,
  ichimoku,
  keltner,
  mfi,
  momentum,
  obv,
  parabolicSar,
  pivotPoints,
  roc,
  smaVolume,
  stochRsi,
  stochastic,
  supertrend,
  volumeProfile,
  williamsR,
  findDivergences,
  lastSwings,
  approximateFootprint,
} from './math';
import { fibRetracementPrice } from '../drawings-math';
import { indicatorPane, type IndicatorInstance, type LinePoint } from './types';
import { canPatchCandles, indicatorPlots, plotsFromTail, type PlotContext, type PlotPoint } from './plot';

function lineBase(color: string, width: 1 | 2 | 3 | 4 = 1) {
  return {
    color,
    lineWidth: width,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false,
  };
}

function strokeWidth(item: IndicatorInstance): 1 | 2 | 3 | 4 {
  const w = item.style?.width;
  return w === 2 || w === 3 || w === 4 ? w : 1;
}

function strokeColor(item: IndicatorInstance, fallback: string): string {
  return item.style?.color ?? fallback;
}

function asLine(points: LinePoint[]): { time: UTCTimestamp; value: number }[] {
  return points.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }));
}

const KIND_COLOR: Record<string, string> = {
  sma: '#f5d76e',
  ema: '#42a5f5',
  wma: '#66bb6a',
  vwap: '#ff7043',
  bb: '#787b86',
  ichimoku: '#26a69a',
  supertrend: '#26a69a',
  rsi: '#ab47bc',
  stoch: '#26a69a',
  atr: '#ffa726',
  adx: '#9c27b0',
  macd: '#26c6da',
  stochRsi: '#7e57c2',
  cci: '#29b6f6',
  sar: '#26a69a',
  keltner: '#26c6da',
  donchian: '#8d6e63',
  obv: '#5c6bc0',
  mfi: '#26a69a',
  willr: '#ec407a',
  roc: '#7e57c2',
  momentum: '#42a5f5',
  cmf: '#26a69a',
  aroon: '#26a69a',
  volume: '#26a69a',
  pivots: '#787b86',
  vwapAnchor: '#ffab40',
  vpvr: '#5c6bc0',
  vpfr: '#7e57c2',
  autoFib: '#26a69a',
  autoTrend: '#42a5f5',
  maOf: '#ab47bc',
  cvd: '#ffa726',
  footprint: '#8d6e63',
};

const PALETTE = ['#42a5f5', '#26a69a', '#ab47bc', '#ff9800', '#ef5350', '#f5d76e', '#66bb6a', '#ff7043', '#26c6da', '#9c27b0'];

export type PaneMap = Record<string, number>;

export type ApplyTiming = { mode: 'full' | 'patch'; ms: number };

function itemsSignature(items: IndicatorInstance[]): string {
  return JSON.stringify(
    items.map((i) => ({ id: i.id, kind: i.kind, visible: i.visible, params: i.params, style: i.style })),
  );
}

function canUpdateLast(prev: PlotPoint[], next: PlotPoint[]): boolean {
  if (!next.length) return false;
  if (next.length === prev.length) {
    if (!prev.length || prev[prev.length - 1]!.time !== next[next.length - 1]!.time) return false;
    for (let i = 0; i < next.length - 1; i++) {
      if (prev[i]?.time !== next[i]!.time) return false;
    }
    return true;
  }
  if (next.length === prev.length + 1) {
    for (let i = 0; i < prev.length; i++) {
      if (prev[i]!.time !== next[i]!.time) return false;
    }
    return true;
  }
  return false;
}

function valueAtOrBefore(points: PlotPoint[], time: number): number | null {
  if (!points.length) return null;
  if (time < (points[0]!.time as number)) return null;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((points[mid]!.time as number) <= time) lo = mid;
    else hi = mid - 1;
  }
  const value = points[lo]!.value;
  return Number.isFinite(value) ? value : null;
}

function formatLegendValue(kind: string, value: number): string {
  if (kind === 'volume' || kind === 'obv' || kind === 'cvd') {
    const abs = Math.abs(value);
    const sign = value < 0 ? '-' : '';
    if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(2)}B`;
    if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(2)}K`;
    return value.toFixed(0);
  }
  if (
    kind === 'rsi' ||
    kind === 'stoch' ||
    kind === 'stochRsi' ||
    kind === 'mfi' ||
    kind === 'adx' ||
    kind === 'aroon' ||
    kind === 'cci' ||
    kind === 'williamsR'
  ) {
    return value.toFixed(1);
  }
  if (Math.abs(value) >= 1000) return value.toFixed(2);
  if (Math.abs(value) >= 1) return value.toFixed(4);
  return value.toFixed(6);
}

export class IndicatorHost {
  private series: (ISeriesApi<'Line'> | ISeriesApi<'Histogram'>)[] = [];
  private pivotLines: IPriceLine[] = [];
  private lastData: Candle[] = [];
  private lastItems: IndicatorInstance[] = [];
  private vpCanvas: HTMLCanvasElement | null = null;
  private wrap: HTMLElement | null = null;
  private paneStretches: number[] | undefined;
  private onPaneResize: ((stretches: number[]) => void) | null = null;
  private paneObs: ResizeObserver | null = null;
  private profileRange: { from: number; to: number } | null = null;
  private resizeTimer = 0;
  private bindings: { id: string; series: (ISeriesApi<'Line'> | ISeriesApi<'Histogram'>)[] }[] = [];
  private currentBind: (ISeriesApi<'Line'> | ISeriesApi<'Histogram'>)[] | null = null;
  private lastMap: PaneMap = {};
  private lastPlots = new Map<string, PlotPoint[][]>();
  private lastApply: ApplyTiming = { mode: 'full', ms: 0 };
  private forceFullNext = false;
  private htf = new Map<string, Candle[]>();
  private chartInterval = '1D';
  private session: SessionKind = 'utc-day';
  private onNeedTf: ((tf: string) => void) | null = null;
  private globalHidden = false;

  constructor(
    private readonly chart: IChartApi,
    private candles: ISeriesApi<SeriesType>,
  ) {}

  setPriceSeries(series: ISeriesApi<SeriesType>): void {
    this.candles = series;
    this.forceFullNext = true;
  }

  isGlobalHidden(): boolean {
    return this.globalHidden;
  }

  setGlobalHidden(hidden: boolean): void {
    if (this.globalHidden === hidden) return;
    this.globalHidden = hidden;
    this.forceFullNext = true;
  }

  setOverlay(canvas: HTMLCanvasElement, wrap: HTMLElement): void {
    this.vpCanvas = canvas;
    this.wrap = wrap;
  }

  setPaneStretches(values: number[] | undefined): void {
    this.paneStretches = values;
  }

  setOnPaneResize(cb: (stretches: number[]) => void): void {
    this.onPaneResize = cb;
  }

  setChartInterval(id: string): void {
    this.chartInterval = id;
  }

  setSession(kind: SessionKind): void {
    this.session = kind;
  }

  setOnNeedTimeframe(cb: (tf: string) => void): void {
    this.onNeedTf = cb;
  }

  setHigherTf(interval: string, candles: Candle[]): void {
    this.htf.set(interval, candles);
    this.forceFullNext = true;
  }

  clearHigherTf(): void {
    this.htf.clear();
    this.forceFullNext = true;
  }

  private plotCtx(): PlotContext {
    return { htf: this.htf, chartInterval: this.chartInterval, session: this.session };
  }

  private itemPane(item: IndicatorInstance): 'price' | 'osc' {
    return indicatorPane(item);
  }

  private isHiddenByToggle(item: IndicatorInstance): boolean {
    return this.globalHidden && this.itemPane(item) === 'osc';
  }

  private requestMissingTf(items: IndicatorInstance[]): void {
    const needed = new Set<string>();
    for (const item of items) {
      const tf = item.params.tf;
      if (tf && tf !== 'chart' && tf !== this.chartInterval && !this.htf.has(tf)) needed.add(tf);
    }
    for (const tf of needed) this.onNeedTf?.(tf);
  }

  getPaneStretches(): number[] {
    return this.chart.panes().map((pane) => pane.getStretchFactor());
  }

  lastApplyInfo(): ApplyTiming {
    return { ...this.lastApply };
  }

  valuesAt(time: number | null): Record<string, string> {
    const t = time ?? this.lastData[this.lastData.length - 1]?.time ?? null;
    const out: Record<string, string> = {};
    if (t === null) return out;
    for (const item of this.lastItems) {
      if (!item.visible) continue;
      const plots = this.lastPlots.get(item.id);
      if (!plots?.length) continue;
      const parts: string[] = [];
      for (const pts of plots) {
        const value = valueAtOrBefore(pts, t);
        if (value === null) continue;
        parts.push(formatLegendValue(item.kind, value));
      }
      if (parts.length) out[item.id] = parts.join('  ');
    }
    return out;
  }

  requestFullApply(): void {
    this.forceFullNext = true;
  }

  setVisibleTimeRange(from: number, to: number): void {
    this.profileRange = { from, to };
    this.paintProfiles();
  }

  apply(data: Candle[], items: IndicatorInstance[]): PaneMap {
    const started = performance.now();
    if (!this.forceFullNext && this.tryPatch(data, items)) {
      this.lastApply = { mode: 'patch', ms: performance.now() - started };
      return this.lastMap;
    }
    this.forceFullNext = false;
    this.clear();
    this.lastData = data;
    this.lastItems = items;
    const map: PaneMap = {};
    const visible = items.filter((i) => i.visible && !this.isHiddenByToggle(i));
    const kindCount: Record<string, number> = {};
    let hasVolume = false;

    this.requestMissingTf(visible);
    for (const item of visible) {
      if (this.itemPane(item) === 'osc') continue;
      const slot = kindCount[item.kind] ?? 0;
      kindCount[item.kind] = slot + 1;
      this.currentBind = [];
      this.addOverlay(data, item, strokeColor(item, this.color(item.kind, slot, item.params.period)));
      this.bindings.push({ id: item.id, series: this.currentBind });
      this.lastPlots.set(item.id, indicatorPlots(item, data, this.plotCtx()));
      this.currentBind = null;
      map[item.id] = 0;
      if (item.kind === 'volume') hasVolume = true;
    }

    this.candles.priceScale().applyOptions({
      scaleMargins: { top: 0.05, bottom: hasVolume ? 0.2 : 0.03 },
    });

    for (const item of visible) {
      if (this.itemPane(item) !== 'osc') continue;
      this.chart.addPane();
      const idx = this.chart.panes().length - 1;
      const slot = kindCount[item.kind] ?? 0;
      kindCount[item.kind] = slot + 1;
      this.currentBind = [];
      this.addOscillator(data, item, idx, strokeColor(item, this.color(item.kind, slot, item.params.period)));
      this.bindings.push({ id: item.id, series: this.currentBind });
      this.lastPlots.set(item.id, indicatorPlots(item, data, this.plotCtx()));
      this.currentBind = null;
      map[item.id] = idx;
    }

    const panes = this.chart.panes();
    const saved = this.paneStretches;
    if (saved && saved.length === panes.length) {
      panes.forEach((pane, i) => pane.setStretchFactor(saved[i]!));
    } else {
      panes[0]?.setStretchFactor(3);
      for (let i = 1; i < panes.length; i++) panes[i]!.setStretchFactor(1);
    }
    this.observePanes();
    this.paintProfiles();
    this.lastMap = map;
    this.lastApply = { mode: 'full', ms: performance.now() - started };
    return map;
  }

  private tryPatch(data: Candle[], items: IndicatorInstance[]): boolean {
    if (!this.lastData.length || itemsSignature(this.lastItems) !== itemsSignature(items)) return false;
    if (!canPatchCandles(this.lastData, data)) return false;
    const visible = items.filter((i) => i.visible && !this.isHiddenByToggle(i));
    for (const item of visible) {
      if (item.kind === 'vpvr' || item.kind === 'vpfr' || item.kind === 'autoFib' || item.kind === 'autoTrend' || item.kind === 'footprint') continue;
      if (item.kind === 'pivots') {
        this.patchPivots(data, item);
        continue;
      }
      const bind = this.bindings.find((b) => b.id === item.id);
      const prev = this.lastPlots.get(item.id) ?? [];
      const plots = plotsFromTail(item, data, this.lastData, prev, this.plotCtx());
      if (!bind || bind.series.length !== plots.length) return false;
      for (let i = 0; i < plots.length; i++) {
        const pts = plots[i]!;
        const series = bind.series[i]!;
        const last = pts[pts.length - 1];
        if (last && canUpdateLast(prev[i] ?? [], pts)) series.update(last);
        else series.setData(pts);
      }
      this.lastPlots.set(item.id, plots);
    }
    this.lastData = data;
    this.lastItems = items;
    this.paintProfiles();
    return true;
  }

  private patchPivots(data: Candle[], item: IndicatorInstance): void {
    const lv = pivotPoints(data, item.params.mode === 'fib' ? 'fib' : 'standard');
    if (!lv || this.pivotLines.length < 7) return;
    const prices = [lv.p, lv.r1, lv.r2, lv.r3, lv.s1, lv.s2, lv.s3];
    this.pivotLines.forEach((line, i) => {
      const price = prices[i];
      if (typeof price === 'number') line.applyOptions({ price });
    });
  }

  paneOffset(index: number): number {
    let y = 0;
    const n = this.chart.panes().length;
    for (let i = 0; i < index && i < n; i++) {
      const size = this.safePaneSize(i);
      if (!size) break;
      y += size.height;
    }
    return y;
  }

  private safePaneSize(index: number): { width: number; height: number } | null {
    try {
      const size = this.chart.paneSize(index);
      if (!size || !Number.isFinite(size.height)) return null;
      return size;
    } catch {
      return null;
    }
  }

  private color(kind: string, slot: number, period?: number): string {
    if (kind === 'ema') {
      if (period === 50) return '#7e57c2';
      if (period === 200) return '#ffa726';
      if (period === 20) return '#42a5f5';
      const emaColors = ['#42a5f5', '#7e57c2', '#ffa726'];
      return emaColors[slot % emaColors.length]!;
    }
    if (slot === 0) return KIND_COLOR[kind] ?? PALETTE[0]!;
    return PALETTE[slot % PALETTE.length]!;
  }

  private keep(series: ISeriesApi<'Line'> | ISeriesApi<'Histogram'>): void {
    this.series.push(series);
    this.currentBind?.push(series);
  }

  private clear(): void {
    for (const line of this.pivotLines) this.candles.removePriceLine(line);
    this.pivotLines = [];
    for (const s of this.series) this.chart.removeSeries(s);
    this.series = [];
    this.bindings = [];
    this.lastPlots.clear();
    const panes = this.chart.panes();
    for (let i = panes.length - 1; i >= 1; i--) this.chart.removePane(i);
  }

  private addOverlay(data: Candle[], item: IndicatorInstance, color: string): void {
    const p = item.params;
    const width = strokeWidth(item);
    if (item.kind === 'sma' || item.kind === 'ema' || item.kind === 'wma') {
      this.addPlotLines(indicatorPlots(item, data, this.plotCtx()), color, width, 0);
    } else if (item.kind === 'vwap') {
      this.addPlotLines(indicatorPlots(item, data, this.plotCtx()), color, width, 0);
    } else if (item.kind === 'maOf') {
      this.addPlotLines(indicatorPlots(item, data, this.plotCtx()), color, width, 0);
    } else if (item.kind === 'autoFib' || item.kind === 'autoTrend' || item.kind === 'footprint') {
      /* painted on the overlay canvas */
    } else if (item.kind === 'vwapAnchor') {
      const s = this.chart.addSeries(LineSeries, lineBase(color, width), 0);
      s.setData(asLine(anchoredVwap(data, p.anchor ?? 0)));
      this.keep(s);
    } else if (item.kind === 'vpvr' || item.kind === 'vpfr') {
      /* painted on the overlay canvas */
    } else if (item.kind === 'bb') {
      const bands = bollinger(data, p.period ?? 20, p.std ?? 2);
      const mid = this.chart.addSeries(LineSeries, lineBase(color, width), 0);
      const up = this.chart.addSeries(LineSeries, lineBase(color, width), 0);
      const lo = this.chart.addSeries(LineSeries, lineBase(color, width), 0);
      mid.setData(asLine(bands.map((b) => ({ time: b.time, value: b.mid }))));
      up.setData(asLine(bands.map((b) => ({ time: b.time, value: b.upper }))));
      lo.setData(asLine(bands.map((b) => ({ time: b.time, value: b.lower }))));
      this.keep(mid);
      this.keep(up);
      this.keep(lo);
    } else if (item.kind === 'ichimoku') {
      const cloud = ichimoku(data, p.tenkan ?? 9, p.kijun ?? 26, p.senkou ?? 52, p.shift ?? 26);
      const tenkan = this.chart.addSeries(LineSeries, lineBase('#f44336', width), 0);
      const kijun = this.chart.addSeries(LineSeries, lineBase('#2196f3', width), 0);
      const spanA = this.chart.addSeries(LineSeries, lineBase('#26a69a', width), 0);
      const spanB = this.chart.addSeries(LineSeries, lineBase('#ef5350', width), 0);
      const chikou = this.chart.addSeries(LineSeries, lineBase('#9c27b0', width), 0);
      tenkan.setData(asLine(cloud.tenkan));
      kijun.setData(asLine(cloud.kijun));
      spanA.setData(asLine(cloud.spanA));
      spanB.setData(asLine(cloud.spanB));
      chikou.setData(asLine(cloud.chikou));
      this.keep(tenkan);
      this.keep(kijun);
      this.keep(spanA);
      this.keep(spanB);
      this.keep(chikou);
    } else if (item.kind === 'supertrend') {
      const pts = supertrend(data, p.period ?? 10, p.multiplier ?? 3);
      const up = this.chart.addSeries(LineSeries, lineBase('#26a69a', width), 0);
      const down = this.chart.addSeries(LineSeries, lineBase('#ef5350', width), 0);
      up.setData(asLine(pts.filter((x) => x.dir === 1).map((x) => ({ time: x.time, value: x.value }))));
      down.setData(asLine(pts.filter((x) => x.dir === -1).map((x) => ({ time: x.time, value: x.value }))));
      this.keep(up);
      this.keep(down);
    } else if (item.kind === 'pivots') {
      const lv = pivotPoints(data, p.mode === 'fib' ? 'fib' : 'standard');
      if (!lv) return;
      const add = (price: number, col: string, title: string) => {
        this.pivotLines.push(
          this.candles.createPriceLine({
            price,
            color: col,
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: true,
            title,
          }),
        );
      };
      add(lv.p, '#787b86', 'P');
      add(lv.r1, '#ef5350', 'R1');
      add(lv.r2, '#ef5350', 'R2');
      add(lv.r3, '#ef5350', 'R3');
      add(lv.s1, '#26a69a', 'S1');
      add(lv.s2, '#26a69a', 'S2');
      add(lv.s3, '#26a69a', 'S3');
    } else if (item.kind === 'donchian') {
      const bands = donchian(data, p.period ?? 20);
      const mid = this.chart.addSeries(LineSeries, lineBase(color, width), 0);
      const up = this.chart.addSeries(LineSeries, lineBase(color, width), 0);
      const lo = this.chart.addSeries(LineSeries, lineBase(color, width), 0);
      mid.setData(asLine(bands.map((b) => ({ time: b.time, value: b.mid }))));
      up.setData(asLine(bands.map((b) => ({ time: b.time, value: b.upper }))));
      lo.setData(asLine(bands.map((b) => ({ time: b.time, value: b.lower }))));
      this.keep(mid);
      this.keep(up);
      this.keep(lo);
    } else if (item.kind === 'keltner') {
      const bands = keltner(data, p.period ?? 20, p.kPeriod ?? 10, p.multiplier ?? 2);
      const mid = this.chart.addSeries(LineSeries, lineBase(color, width), 0);
      const up = this.chart.addSeries(LineSeries, lineBase(color, width), 0);
      const lo = this.chart.addSeries(LineSeries, lineBase(color, width), 0);
      mid.setData(asLine(bands.map((b) => ({ time: b.time, value: b.mid }))));
      up.setData(asLine(bands.map((b) => ({ time: b.time, value: b.upper }))));
      lo.setData(asLine(bands.map((b) => ({ time: b.time, value: b.lower }))));
      this.keep(mid);
      this.keep(up);
      this.keep(lo);
    } else if (item.kind === 'sar') {
      const pts = parabolicSar(data, p.start ?? 0.02, p.multiplier ?? 0.02, p.max ?? 0.2);
      const up = this.chart.addSeries(
        LineSeries,
        { ...lineBase('#26a69a', width), lineVisible: false, pointMarkersVisible: true, lastValueVisible: false },
        0,
      );
      const down = this.chart.addSeries(
        LineSeries,
        { ...lineBase('#ef5350', width), lineVisible: false, pointMarkersVisible: true, lastValueVisible: false },
        0,
      );
      up.setData(asLine(pts.filter((x) => x.dir === 1).map((x) => ({ time: x.time, value: x.value }))));
      down.setData(asLine(pts.filter((x) => x.dir === -1).map((x) => ({ time: x.time, value: x.value }))));
      this.keep(up);
      this.keep(down);
    } else if (item.kind === 'volume') {
      const s = this.chart.addSeries(
        HistogramSeries,
        { priceScaleId: '', priceLineVisible: false, lastValueVisible: false },
        0,
      );
      this.chart.priceScale('', 0).applyOptions({
        visible: false,
        borderVisible: false,
        scaleMargins: { top: 0.78, bottom: 0.02 },
      });
      s.setData(
        data
          .filter((c) => Number.isFinite(c.volume) && c.volume >= 0 && Number.isFinite(c.time))
          .map((c) => ({
            time: c.time as UTCTimestamp,
            value: c.volume,
            color: c.close >= c.open ? 'rgba(38, 166, 154, 0.45)' : 'rgba(239, 83, 80, 0.45)',
          })),
      );
      this.keep(s);
      const period = p.period ?? 20;
      if ((p.ma ?? 'on') === 'on' && period >= 1) {
        const ma = this.chart.addSeries(
          LineSeries,
          { ...lineBase(color, width), priceScaleId: '', lastValueVisible: false },
          0,
        );
        ma.setData(asLine(smaVolume(data, period).filter((pt) => Number.isFinite(pt.value))));
        this.keep(ma);
      }
    }
  }

  private addOscillator(data: Candle[], item: IndicatorInstance, idx: number, color: string): void {
    const p = item.params;
    const width = strokeWidth(item);
    const dotted = { lineWidth: 1 as const, lineStyle: LineStyle.Dotted, axisLabelVisible: false };
    if (item.kind === 'rsi') {
      const plots = indicatorPlots(item, data, this.plotCtx());
      const s = this.chart.addSeries(LineSeries, { ...lineBase(color, width), lastValueVisible: true }, idx);
      s.setData(plots[0] ?? []);
      s.createPriceLine({ price: 70, color: '#6d5a78', title: '', ...dotted });
      s.createPriceLine({ price: 30, color: '#6d5a78', title: '', ...dotted });
      this.keep(s);
    } else if (item.kind === 'stoch') {
      const pts = stochastic(data, p.kPeriod ?? 14, p.dPeriod ?? 3);
      const k = this.chart.addSeries(LineSeries, { ...lineBase(color, width), lastValueVisible: true }, idx);
      const d = this.chart.addSeries(LineSeries, lineBase('#ef5350', width), idx);
      k.setData(asLine(pts.map((x) => ({ time: x.time, value: x.k }))));
      d.setData(asLine(pts.map((x) => ({ time: x.time, value: x.d }))));
      k.createPriceLine({ price: 80, color: '#6d5a78', title: '', ...dotted });
      k.createPriceLine({ price: 20, color: '#6d5a78', title: '', ...dotted });
      this.keep(k);
      this.keep(d);
    } else if (item.kind === 'atr') {
      const s = this.chart.addSeries(LineSeries, { ...lineBase(color, width), lastValueVisible: true }, idx);
      s.setData(asLine(atr(data, p.period ?? 14)));
      this.keep(s);
    } else if (item.kind === 'adx') {
      const pts = adx(data, p.period ?? 14);
      const line = this.chart.addSeries(LineSeries, { ...lineBase(color, width), lastValueVisible: true }, idx);
      const plus = this.chart.addSeries(LineSeries, lineBase('#26a69a', width), idx);
      const minus = this.chart.addSeries(LineSeries, lineBase('#ef5350', width), idx);
      line.setData(asLine(pts.map((x) => ({ time: x.time, value: x.adx }))));
      plus.setData(asLine(pts.map((x) => ({ time: x.time, value: x.pdi }))));
      minus.setData(asLine(pts.map((x) => ({ time: x.time, value: x.mdi }))));
      this.keep(line);
      this.keep(plus);
      this.keep(minus);
    } else if (item.kind === 'stochRsi') {
      const pts = stochRsi(data, p.period ?? 14, p.period ?? 14, p.kPeriod ?? 3, p.dPeriod ?? 3);
      const k = this.chart.addSeries(LineSeries, { ...lineBase(color, width), lastValueVisible: true }, idx);
      const d = this.chart.addSeries(LineSeries, lineBase('#ef5350', width), idx);
      k.setData(asLine(pts.map((x) => ({ time: x.time, value: x.k }))));
      d.setData(asLine(pts.map((x) => ({ time: x.time, value: x.d }))));
      k.createPriceLine({ price: 80, color: '#6d5a78', title: '', ...dotted });
      k.createPriceLine({ price: 20, color: '#6d5a78', title: '', ...dotted });
      this.keep(k);
      this.keep(d);
    } else if (item.kind === 'momentum') {
      const s = this.chart.addSeries(LineSeries, { ...lineBase(color, width), lastValueVisible: true }, idx);
      s.setData(asLine(momentum(data, p.period ?? 10)));
      s.createPriceLine({ price: 100, color: '#6d5a78', title: '', ...dotted });
      this.keep(s);
    } else if (item.kind === 'roc') {
      const s = this.chart.addSeries(LineSeries, { ...lineBase(color, width), lastValueVisible: true }, idx);
      s.setData(asLine(roc(data, p.period ?? 12)));
      s.createPriceLine({ price: 0, color: '#6d5a78', title: '', ...dotted });
      this.keep(s);
    } else if (item.kind === 'willr') {
      const s = this.chart.addSeries(LineSeries, { ...lineBase(color, width), lastValueVisible: true }, idx);
      s.setData(asLine(williamsR(data, p.period ?? 14)));
      s.createPriceLine({ price: -20, color: '#6d5a78', title: '', ...dotted });
      s.createPriceLine({ price: -80, color: '#6d5a78', title: '', ...dotted });
      this.keep(s);
    } else if (item.kind === 'cci') {
      const s = this.chart.addSeries(LineSeries, { ...lineBase(color, width), lastValueVisible: true }, idx);
      s.setData(asLine(cci(data, p.period ?? 20)));
      s.createPriceLine({ price: 100, color: '#6d5a78', title: '', ...dotted });
      s.createPriceLine({ price: -100, color: '#6d5a78', title: '', ...dotted });
      this.keep(s);
    } else if (item.kind === 'cmf') {
      const s = this.chart.addSeries(LineSeries, { ...lineBase(color, width), lastValueVisible: true }, idx);
      s.setData(asLine(cmf(data, p.period ?? 20)));
      s.createPriceLine({ price: 0, color: '#6d5a78', title: '', ...dotted });
      this.keep(s);
    } else if (item.kind === 'mfi') {
      const s = this.chart.addSeries(LineSeries, { ...lineBase(color, width), lastValueVisible: true }, idx);
      s.setData(asLine(mfi(data, p.period ?? 14)));
      s.createPriceLine({ price: 80, color: '#6d5a78', title: '', ...dotted });
      s.createPriceLine({ price: 20, color: '#6d5a78', title: '', ...dotted });
      this.keep(s);
    } else if (item.kind === 'obv') {
      const s = this.chart.addSeries(LineSeries, { ...lineBase(color, width), lastValueVisible: true }, idx);
      s.setData(asLine(obv(data)));
      this.keep(s);
    } else if (item.kind === 'aroon') {
      const pts = aroon(data, p.period ?? 25);
      const up = this.chart.addSeries(LineSeries, { ...lineBase('#26a69a', width), lastValueVisible: true }, idx);
      const down = this.chart.addSeries(LineSeries, lineBase('#ef5350', width), idx);
      up.setData(asLine(pts.map((x) => ({ time: x.time, value: x.up }))));
      down.setData(asLine(pts.map((x) => ({ time: x.time, value: x.down }))));
      this.keep(up);
      this.keep(down);
    } else if (item.kind === 'macd') {
      const plots = indicatorPlots(item, data, this.plotCtx());
      const hist = this.chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, idx);
      hist.setData(plots[0] ?? []);
      const line = this.chart.addSeries(LineSeries, lineBase(color, width), idx);
      const signal = this.chart.addSeries(LineSeries, lineBase('#ff9800', width), idx);
      line.setData(plots[1] ?? []);
      signal.setData(plots[2] ?? []);
      this.keep(hist);
      this.keep(line);
      this.keep(signal);
    } else if (item.kind === 'cvd') {
      this.addPlotLines(indicatorPlots(item, data, this.plotCtx()), color, width, idx, true);
    } else if (item.kind === 'maOf') {
      const plots = indicatorPlots(item, data, this.plotCtx());
      const base = this.chart.addSeries(LineSeries, { ...lineBase('#787b86', 1), lastValueVisible: false }, idx);
      const ma = this.chart.addSeries(LineSeries, { ...lineBase(color, width), lastValueVisible: true }, idx);
      base.setData(plots[0] ?? []);
      ma.setData(plots[1] ?? []);
      this.keep(base);
      this.keep(ma);
    }
  }

  private addPlotLines(plots: PlotPoint[][], color: string, width: 1 | 2 | 3 | 4, pane: number, lastValue = false): void {
    const palette = [color, '#26a69a', '#ef5350', '#66bb6a', '#ec407a', '#42a5f5', '#ab47bc', '#ffca28', '#8d6e63'];
    plots.forEach((pts, i) => {
      const s = this.chart.addSeries(
        LineSeries,
        { ...lineBase(palette[i % palette.length]!, i === 0 ? width : 1), lastValueVisible: lastValue && i === 0 },
        pane,
      );
      s.setData(pts);
      this.keep(s);
    });
  }

  private observePanes(): void {
    this.paneObs?.disconnect();
    this.paneObs = new ResizeObserver(() => {
      window.clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => {
        this.onPaneResize?.(this.getPaneStretches());
        this.paintProfiles();
      }, 120);
    });
    for (const pane of this.chart.panes()) {
      const el = pane.getHTMLElement();
      if (el) this.paneObs.observe(el);
    }
  }

  private paintProfiles(): void {
    const canvas = this.vpCanvas;
    if (!canvas) return;
    const wrap = this.wrap ?? canvas.parentElement;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    const paneH = this.safePaneSize(0)?.height ?? rect.height;
    if (!this.lastData.length) return;
    const visible = this.lastItems.filter((i) => i.visible && (i.kind === 'vpvr' || i.kind === 'vpfr'));
    for (const item of visible) {
      let from: number;
      let to: number;
      if (item.kind === 'vpfr') {
        const a = item.params.anchor;
        const b = item.params.end;
        if (typeof a === 'number' && typeof b === 'number') {
          from = Math.min(a, b);
          to = Math.max(a, b);
        } else {
          const slice = this.lastData.slice(-50);
          from = slice[0]!.time;
          to = slice[slice.length - 1]!.time;
        }
      } else {
        from = this.profileRange?.from ?? this.lastData[0]!.time;
        to = this.profileRange?.to ?? this.lastData[this.lastData.length - 1]!.time;
      }
      const profile = volumeProfile(this.lastData, from, to, item.params.rows ?? 24);
      if (!profile) continue;
      const color = strokeColor(item, this.color(item.kind, 0));
      const maxVol = Math.max(...profile.bins.map((bin) => bin.volume), 0);
      if (maxVol <= 0) continue;
      const xTo = item.kind === 'vpfr' ? this.chart.timeScale().timeToCoordinate(to as Time) : rect.width - 8;
      const xFrom = item.kind === 'vpfr' ? this.chart.timeScale().timeToCoordinate(from as Time) : null;
      const right = xTo ?? rect.width - 8;
      const leftBound = xFrom ?? Math.max(0, right - rect.width * 0.28);
      const maxW = Math.max(8, (right - leftBound) * (item.kind === 'vpfr' ? 1 : 1));
      if (item.kind === 'vpfr' && xFrom !== null && xTo !== null) {
        ctx.fillStyle = 'rgba(120, 123, 134, 0.08)';
        ctx.fillRect(xFrom, 0, Math.max(1, xTo - xFrom), paneH);
      }
      for (const bin of profile.bins) {
        const y1 = this.candles.priceToCoordinate(bin.high);
        const y2 = this.candles.priceToCoordinate(bin.low);
        if (y1 === null || y2 === null) continue;
        const top = Math.min(y1, y2);
        const h = Math.max(1, Math.abs(y2 - y1));
        if (top > paneH || top + h < 0) continue;
        const w = (bin.volume / maxVol) * Math.min(maxW, rect.width * 0.32);
        const isVa = bin.low >= profile.val - 1e-12 && bin.high <= profile.vah + 1e-12;
        const isPoc = Math.abs(bin.price - profile.poc) < 1e-8;
        ctx.globalAlpha = isPoc ? 0.85 : isVa ? 0.45 : 0.22;
        ctx.fillStyle = color;
        ctx.fillRect(right - w, top, w, h);
        ctx.globalAlpha = 1;
      }
    }
    this.paintStageOverlays(ctx, rect.width, paneH);
  }

  private paintStageOverlays(ctx: CanvasRenderingContext2D, width: number, paneH: number): void {
    const data = this.lastData;
    const ts = this.chart.timeScale();
    const xOf = (time: number): number | null => ts.timeToCoordinate(time as Time);
    for (const item of this.lastItems) {
      if (!item.visible) continue;
      if (item.kind === 'autoFib' || item.kind === 'autoTrend') {
        const swings = lastSwings(data, item.params.period ?? 5);
        if (!swings) continue;
        const a = { x: xOf(swings.first.time), y: this.candles.priceToCoordinate(swings.first.price) };
        const b = { x: xOf(swings.second.time), y: this.candles.priceToCoordinate(swings.second.price) };
        if (a.x === null || a.y === null || b.x === null || b.y === null) continue;
        ctx.strokeStyle = strokeColor(item, this.color(item.kind, 0));
        ctx.lineWidth = 1.2;
        ctx.setLineDash(item.kind === 'autoTrend' ? [] : [4, 3]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.setLineDash([]);
        if (item.kind === 'autoFib') {
          const p1 = { time: swings.first.time, price: swings.first.price };
          const p2 = { time: swings.second.time, price: swings.second.price };
          const left = Math.min(a.x, b.x);
          const right = width;
          const extend = item.params.extensions === 'on';
          const levels = extend
            ? [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618]
            : [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
          const ys: { k: number; y: number; price: number }[] = [];
          for (const k of levels) {
            const price = fibRetracementPrice(p1, p2, k);
            const y = this.candles.priceToCoordinate(price);
            if (y === null) continue;
            ys.push({ k, y, price });
          }
          for (let i = 0; i < ys.length - 1; i++) {
            const y1 = ys[i]!.y;
            const y2 = ys[i + 1]!.y;
            const top = Math.min(y1, y2);
            const h = Math.abs(y2 - y1);
            if (h < 1) continue;
            ctx.fillStyle = 'rgba(38, 166, 154, 0.04)';
            ctx.fillRect(left, top, Math.max(0, right - left), h);
          }
          for (const row of ys) {
            if (row.y < 0 || row.y > paneH) continue;
            const k = row.k;
            ctx.strokeStyle = k === 0 || k === 1 || k === 0.618 ? 'rgba(38, 166, 154, 0.85)' : 'rgba(120, 123, 134, 0.45)';
            ctx.lineWidth = k === 0 || k === 1 || k === 0.618 ? 1.3 : 1;
            ctx.beginPath();
            ctx.moveTo(left, row.y);
            ctx.lineTo(right, row.y);
            ctx.stroke();
            ctx.fillStyle = 'rgba(224, 227, 234, 0.9)';
            ctx.font = '10px system-ui, sans-serif';
            ctx.fillText(`${k}`, left + 4, row.y - 2);
          }
        }
      } else if (item.kind === 'footprint') {
        const last = data[data.length - 1];
        if (!last) continue;
        const bins = approximateFootprint(last, item.params.rows ?? 8);
        const x = xOf(last.time);
        if (x === null) continue;
        const maxSide = Math.max(...bins.map((b) => Math.max(b.buy, b.sell)), 1);
        const colW = 28;
        for (const bin of bins) {
          const y1 = this.candles.priceToCoordinate(bin.high);
          const y2 = this.candles.priceToCoordinate(bin.low);
          if (y1 === null || y2 === null) continue;
          const top = Math.min(y1, y2);
          const h = Math.max(1, Math.abs(y2 - y1));
          const buyW = (bin.buy / maxSide) * colW;
          const sellW = (bin.sell / maxSide) * colW;
          ctx.fillStyle = 'rgba(239, 83, 80, 0.55)';
          ctx.fillRect(x - sellW, top, sellW, h);
          ctx.fillStyle = 'rgba(38, 166, 154, 0.55)';
          ctx.fillRect(x, top, buyW, h);
        }
        ctx.fillStyle = 'rgba(224, 227, 234, 0.85)';
        ctx.font = '10px system-ui, sans-serif';
        ctx.fillText(t('ind.footprintHint'), Math.max(8, x - 80), 14);
      } else if ((item.kind === 'rsi' || item.kind === 'macd') && (item.params.divergences ?? 'off') === 'on') {
        const srcKind = item.kind;
        const ctxData = this.plotCtx();
        const plots = indicatorPlots(item, data, ctxData);
        const osc = (srcKind === 'macd' ? plots[1] : plots[0]) ?? [];
        const line = osc.map((pt) => ({ time: Number(pt.time), value: pt.value }));
        const hits = findDivergences(data, line);
        const bind = this.bindings.find((b) => b.id === item.id);
        const oscSeries = bind?.series[srcKind === 'macd' ? 1 : 0];
        const paneIdx = this.lastMap[item.id] ?? 1;
        const yOff = this.paneOffset(paneIdx);
        for (const hit of hits) {
          const x = xOf(hit.time);
          const yPrice = this.candles.priceToCoordinate(hit.price);
          if (x === null) continue;
          const bull = hit.kind.endsWith('bull');
          ctx.fillStyle = bull ? '#26a69a' : '#ef5350';
          if (yPrice !== null && yPrice >= 0 && yPrice <= paneH) {
            this.paintMark(ctx, x, yPrice, bull);
          }
          if (oscSeries) {
            const yOsc = oscSeries.priceToCoordinate(hit.indicator);
            if (yOsc !== null) this.paintMark(ctx, x, yOsc + yOff, bull);
          }
        }
      }
    }
  }

  private paintMark(ctx: CanvasRenderingContext2D, x: number, y: number, up: boolean): void {
    ctx.beginPath();
    if (up) {
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x + 5, y + 4);
      ctx.lineTo(x - 5, y + 4);
    } else {
      ctx.moveTo(x, y + 6);
      ctx.lineTo(x + 5, y - 4);
      ctx.lineTo(x - 5, y - 4);
    }
    ctx.closePath();
    ctx.fill();
  }
}
