// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { HistogramSeries, LineSeries, LineStyle } from 'lightweight-charts';
import type { IChartApi, IPriceLine, ISeriesApi, Time, UTCTimestamp } from 'lightweight-charts';
import type { Candle } from '../sources/types';
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
  williamsR,
  wma,
} from './math';
import { CATALOG_BY_KIND, type IndicatorInstance, type LinePoint } from './types';
import { canPatchCandles, indicatorPlots, plotsFromTail, type PlotPoint } from './plot';

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

  constructor(
    private readonly chart: IChartApi,
    private readonly candles: ISeriesApi<'Candlestick'>,
  ) {}

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

  getPaneStretches(): number[] {
    return this.chart.panes().map((pane) => pane.getStretchFactor());
  }

  lastApplyInfo(): ApplyTiming {
    return { ...this.lastApply };
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
    const visible = items.filter((i) => i.visible);
    const kindCount: Record<string, number> = {};
    let hasVolume = false;

    for (const item of visible) {
      if (CATALOG_BY_KIND[item.kind].pane === 'osc') continue;
      const slot = kindCount[item.kind] ?? 0;
      kindCount[item.kind] = slot + 1;
      this.currentBind = [];
      this.addOverlay(data, item, strokeColor(item, this.color(item.kind, slot)));
      this.bindings.push({ id: item.id, series: this.currentBind });
      this.lastPlots.set(item.id, indicatorPlots(item, data));
      this.currentBind = null;
      map[item.id] = 0;
      if (item.kind === 'volume') hasVolume = true;
    }

    this.candles.priceScale().applyOptions({
      scaleMargins: { top: 0.05, bottom: hasVolume ? 0.2 : 0.03 },
    });

    for (const item of visible) {
      if (CATALOG_BY_KIND[item.kind].pane !== 'osc') continue;
      this.chart.addPane();
      const idx = this.chart.panes().length - 1;
      const slot = kindCount[item.kind] ?? 0;
      kindCount[item.kind] = slot + 1;
      this.currentBind = [];
      this.addOscillator(data, item, idx, strokeColor(item, this.color(item.kind, slot)));
      this.bindings.push({ id: item.id, series: this.currentBind });
      this.lastPlots.set(item.id, indicatorPlots(item, data));
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
    const visible = items.filter((i) => i.visible);
    for (const item of visible) {
      if (item.kind === 'vpvr' || item.kind === 'vpfr') continue;
      if (item.kind === 'pivots') {
        this.patchPivots(data, item);
        continue;
      }
      const bind = this.bindings.find((b) => b.id === item.id);
      const prev = this.lastPlots.get(item.id) ?? [];
      const plots = plotsFromTail(item, data, this.lastData, prev);
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

  private color(kind: string, slot: number): string {
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
    if (item.kind === 'sma') {
      const s = this.chart.addSeries(LineSeries, lineBase(color, width), 0);
      s.setData(asLine(sma(data, p.period ?? 20)));
      this.keep(s);
    } else if (item.kind === 'ema') {
      const s = this.chart.addSeries(LineSeries, lineBase(color, width), 0);
      s.setData(asLine(ema(data, p.period ?? 20)));
      this.keep(s);
    } else if (item.kind === 'wma') {
      const s = this.chart.addSeries(LineSeries, lineBase(color, width), 0);
      s.setData(asLine(wma(data, p.period ?? 20)));
      this.keep(s);
    } else if (item.kind === 'vwap') {
      const s = this.chart.addSeries(LineSeries, lineBase(color, width), 0);
      s.setData(asLine(sessionVwap(data)));
      this.keep(s);
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
        { priceScaleId: 'volume', priceLineVisible: false, lastValueVisible: false },
        0,
      );
      this.chart.priceScale('volume', 0).applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
        borderVisible: false,
      });
      s.setData(
        data.map((c) => ({
          time: c.time as UTCTimestamp,
          value: c.volume,
          color: c.close >= c.open ? 'rgba(38, 166, 154, 0.45)' : 'rgba(239, 83, 80, 0.45)',
        })),
      );
      this.keep(s);
      const period = p.period ?? 20;
      if (period >= 1) {
        const ma = this.chart.addSeries(
          LineSeries,
          { ...lineBase(color, width), priceScaleId: 'volume', lastValueVisible: false },
          0,
        );
        ma.setData(asLine(smaVolume(data, period)));
        this.keep(ma);
      }
    }
  }

  private addOscillator(data: Candle[], item: IndicatorInstance, idx: number, color: string): void {
    const p = item.params;
    const width = strokeWidth(item);
    const dotted = { lineWidth: 1 as const, lineStyle: LineStyle.Dotted, axisLabelVisible: false };
    if (item.kind === 'rsi') {
      const s = this.chart.addSeries(LineSeries, { ...lineBase(color, width), lastValueVisible: true }, idx);
      s.setData(asLine(rsi(data, p.period ?? 14)));
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
      const pts = macd(data, p.fast ?? 12, p.slow ?? 26, p.signal ?? 9);
      const hist = this.chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, idx);
      hist.setData(
        pts.map((x) => ({
          time: x.time as UTCTimestamp,
          value: x.histogram,
          color: x.histogram >= 0 ? 'rgba(38, 166, 154, 0.6)' : 'rgba(239, 83, 80, 0.6)',
        })),
      );
      const line = this.chart.addSeries(LineSeries, lineBase(color, width), idx);
      const signal = this.chart.addSeries(LineSeries, lineBase('#ff9800', width), idx);
      line.setData(asLine(pts.map((x) => ({ time: x.time, value: x.macd }))));
      signal.setData(asLine(pts.map((x) => ({ time: x.time, value: x.signal }))));
      this.keep(hist);
      this.keep(line);
      this.keep(signal);
    }
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
    const visible = this.lastItems.filter((i) => i.visible && (i.kind === 'vpvr' || i.kind === 'vpfr'));
    if (!visible.length || !this.lastData.length) return;
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
  }
}
