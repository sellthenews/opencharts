// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Wykresy contributors

import { HistogramSeries, LineSeries, LineStyle } from 'lightweight-charts';
import type { IChartApi, IPriceLine, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import type { Candle } from '../sources/types';
import { adx, atr, bollinger, cci, donchian, ema, ichimoku, keltner, macd, mfi, obv, parabolicSar, pivotPoints, rsi, sma, stochRsi, stochastic, supertrend, vwap, wma } from './math';
import { CATALOG_BY_KIND, type IndicatorInstance, type LinePoint } from './types';

function lineBase(color: string) {
  return {
    color,
    lineWidth: 1 as const,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false,
  };
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
  volume: '#26a69a',
  pivots: '#787b86',
};

const PALETTE = ['#42a5f5', '#26a69a', '#ab47bc', '#ff9800', '#ef5350', '#f5d76e', '#66bb6a', '#ff7043', '#26c6da', '#9c27b0'];

export type PaneMap = Record<string, number>;

export class IndicatorHost {
  private series: (ISeriesApi<'Line'> | ISeriesApi<'Histogram'>)[] = [];
  private pivotLines: IPriceLine[] = [];

  constructor(
    private readonly chart: IChartApi,
    private readonly candles: ISeriesApi<'Candlestick'>,
  ) {}

  apply(data: Candle[], items: IndicatorInstance[]): PaneMap {
    this.clear();
    const map: PaneMap = {};
    const visible = items.filter((i) => i.visible);
    const kindCount: Record<string, number> = {};
    let hasVolume = false;

    for (const item of visible) {
      if (CATALOG_BY_KIND[item.kind].pane === 'osc') continue;
      const slot = kindCount[item.kind] ?? 0;
      kindCount[item.kind] = slot + 1;
      this.addOverlay(data, item, this.color(item.kind, slot));
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
      this.addOscillator(data, item, idx, this.color(item.kind, slot));
      map[item.id] = idx;
    }

    const panes = this.chart.panes();
    panes[0]?.setStretchFactor(3);
    for (let i = 1; i < panes.length; i++) panes[i]!.setStretchFactor(1);
    return map;
  }

  paneOffset(index: number): number {
    let y = 0;
    const n = this.chart.panes().length;
    for (let i = 0; i < index && i < n; i++) {
      y += this.chart.paneSize(i).height;
    }
    return y;
  }

  private color(kind: string, slot: number): string {
    if (slot === 0) return KIND_COLOR[kind] ?? PALETTE[0]!;
    return PALETTE[slot % PALETTE.length]!;
  }

  private keep(series: ISeriesApi<'Line'> | ISeriesApi<'Histogram'>): void {
    this.series.push(series);
  }

  private clear(): void {
    for (const line of this.pivotLines) this.candles.removePriceLine(line);
    this.pivotLines = [];
    for (const s of this.series) this.chart.removeSeries(s);
    this.series = [];
    const panes = this.chart.panes();
    for (let i = panes.length - 1; i >= 1; i--) this.chart.removePane(i);
  }

  private addOverlay(data: Candle[], item: IndicatorInstance, color: string): void {
    const p = item.params;
    if (item.kind === 'sma') {
      const s = this.chart.addSeries(LineSeries, lineBase(color), 0);
      s.setData(asLine(sma(data, p.period ?? 20)));
      this.keep(s);
    } else if (item.kind === 'ema') {
      const s = this.chart.addSeries(LineSeries, lineBase(color), 0);
      s.setData(asLine(ema(data, p.period ?? 20)));
      this.keep(s);
    } else if (item.kind === 'wma') {
      const s = this.chart.addSeries(LineSeries, lineBase(color), 0);
      s.setData(asLine(wma(data, p.period ?? 20)));
      this.keep(s);
    } else if (item.kind === 'vwap') {
      const s = this.chart.addSeries(LineSeries, lineBase(color), 0);
      s.setData(asLine(vwap(data)));
      this.keep(s);
    } else if (item.kind === 'bb') {
      const bands = bollinger(data, p.period ?? 20, p.std ?? 2);
      const mid = this.chart.addSeries(LineSeries, lineBase(color), 0);
      const up = this.chart.addSeries(LineSeries, lineBase(color), 0);
      const lo = this.chart.addSeries(LineSeries, lineBase(color), 0);
      mid.setData(asLine(bands.map((b) => ({ time: b.time, value: b.mid }))));
      up.setData(asLine(bands.map((b) => ({ time: b.time, value: b.upper }))));
      lo.setData(asLine(bands.map((b) => ({ time: b.time, value: b.lower }))));
      this.keep(mid);
      this.keep(up);
      this.keep(lo);
    } else if (item.kind === 'ichimoku') {
      const cloud = ichimoku(data);
      const tenkan = this.chart.addSeries(LineSeries, lineBase('#f44336'), 0);
      const kijun = this.chart.addSeries(LineSeries, lineBase('#2196f3'), 0);
      const spanA = this.chart.addSeries(LineSeries, lineBase('#26a69a'), 0);
      const spanB = this.chart.addSeries(LineSeries, lineBase('#ef5350'), 0);
      const chikou = this.chart.addSeries(LineSeries, lineBase('#9c27b0'), 0);
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
      const up = this.chart.addSeries(LineSeries, lineBase('#26a69a'), 0);
      const down = this.chart.addSeries(LineSeries, lineBase('#ef5350'), 0);
      up.setData(asLine(pts.filter((x) => x.dir === 1).map((x) => ({ time: x.time, value: x.value }))));
      down.setData(asLine(pts.filter((x) => x.dir === -1).map((x) => ({ time: x.time, value: x.value }))));
      this.keep(up);
      this.keep(down);
    } else if (item.kind === 'pivots') {
      const lv = pivotPoints(data);
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
      const mid = this.chart.addSeries(LineSeries, lineBase(color), 0);
      const up = this.chart.addSeries(LineSeries, lineBase(color), 0);
      const lo = this.chart.addSeries(LineSeries, lineBase(color), 0);
      mid.setData(asLine(bands.map((b) => ({ time: b.time, value: b.mid }))));
      up.setData(asLine(bands.map((b) => ({ time: b.time, value: b.upper }))));
      lo.setData(asLine(bands.map((b) => ({ time: b.time, value: b.lower }))));
      this.keep(mid);
      this.keep(up);
      this.keep(lo);
    } else if (item.kind === 'keltner') {
      const bands = keltner(data, p.period ?? 20, p.kPeriod ?? 10, p.multiplier ?? 2);
      const mid = this.chart.addSeries(LineSeries, lineBase(color), 0);
      const up = this.chart.addSeries(LineSeries, lineBase(color), 0);
      const lo = this.chart.addSeries(LineSeries, lineBase(color), 0);
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
        { ...lineBase('#26a69a'), lineVisible: false, pointMarkersVisible: true, lastValueVisible: false },
        0,
      );
      const down = this.chart.addSeries(
        LineSeries,
        { ...lineBase('#ef5350'), lineVisible: false, pointMarkersVisible: true, lastValueVisible: false },
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
    }
  }

  private addOscillator(data: Candle[], item: IndicatorInstance, idx: number, color: string): void {
    const p = item.params;
    const dotted = { lineWidth: 1 as const, lineStyle: LineStyle.Dotted, axisLabelVisible: false };
    if (item.kind === 'rsi') {
      const s = this.chart.addSeries(LineSeries, { ...lineBase(color), lastValueVisible: true }, idx);
      s.setData(asLine(rsi(data, p.period ?? 14)));
      s.createPriceLine({ price: 70, color: '#6d5a78', title: '', ...dotted });
      s.createPriceLine({ price: 30, color: '#6d5a78', title: '', ...dotted });
      this.keep(s);
    } else if (item.kind === 'stoch') {
      const pts = stochastic(data, p.kPeriod ?? 14, p.dPeriod ?? 3);
      const k = this.chart.addSeries(LineSeries, { ...lineBase(color), lastValueVisible: true }, idx);
      const d = this.chart.addSeries(LineSeries, lineBase('#ef5350'), idx);
      k.setData(asLine(pts.map((x) => ({ time: x.time, value: x.k }))));
      d.setData(asLine(pts.map((x) => ({ time: x.time, value: x.d }))));
      k.createPriceLine({ price: 80, color: '#6d5a78', title: '', ...dotted });
      k.createPriceLine({ price: 20, color: '#6d5a78', title: '', ...dotted });
      this.keep(k);
      this.keep(d);
    } else if (item.kind === 'atr') {
      const s = this.chart.addSeries(LineSeries, { ...lineBase(color), lastValueVisible: true }, idx);
      s.setData(asLine(atr(data, p.period ?? 14)));
      this.keep(s);
    } else if (item.kind === 'adx') {
      const pts = adx(data, p.period ?? 14);
      const line = this.chart.addSeries(LineSeries, { ...lineBase(color), lastValueVisible: true }, idx);
      const plus = this.chart.addSeries(LineSeries, lineBase('#26a69a'), idx);
      const minus = this.chart.addSeries(LineSeries, lineBase('#ef5350'), idx);
      line.setData(asLine(pts.map((x) => ({ time: x.time, value: x.adx }))));
      plus.setData(asLine(pts.map((x) => ({ time: x.time, value: x.pdi }))));
      minus.setData(asLine(pts.map((x) => ({ time: x.time, value: x.mdi }))));
      this.keep(line);
      this.keep(plus);
      this.keep(minus);
    } else if (item.kind === 'stochRsi') {
      const pts = stochRsi(data, p.period ?? 14, p.period ?? 14, p.kPeriod ?? 3, p.dPeriod ?? 3);
      const k = this.chart.addSeries(LineSeries, { ...lineBase(color), lastValueVisible: true }, idx);
      const d = this.chart.addSeries(LineSeries, lineBase('#ef5350'), idx);
      k.setData(asLine(pts.map((x) => ({ time: x.time, value: x.k }))));
      d.setData(asLine(pts.map((x) => ({ time: x.time, value: x.d }))));
      k.createPriceLine({ price: 80, color: '#6d5a78', title: '', ...dotted });
      k.createPriceLine({ price: 20, color: '#6d5a78', title: '', ...dotted });
      this.keep(k);
      this.keep(d);
    } else if (item.kind === 'cci') {
      const s = this.chart.addSeries(LineSeries, { ...lineBase(color), lastValueVisible: true }, idx);
      s.setData(asLine(cci(data, p.period ?? 20)));
      s.createPriceLine({ price: 100, color: '#6d5a78', title: '', ...dotted });
      s.createPriceLine({ price: -100, color: '#6d5a78', title: '', ...dotted });
      this.keep(s);
    } else if (item.kind === 'mfi') {
      const s = this.chart.addSeries(LineSeries, { ...lineBase(color), lastValueVisible: true }, idx);
      s.setData(asLine(mfi(data, p.period ?? 14)));
      s.createPriceLine({ price: 80, color: '#6d5a78', title: '', ...dotted });
      s.createPriceLine({ price: 20, color: '#6d5a78', title: '', ...dotted });
      this.keep(s);
    } else if (item.kind === 'obv') {
      const s = this.chart.addSeries(LineSeries, { ...lineBase(color), lastValueVisible: true }, idx);
      s.setData(asLine(obv(data)));
      this.keep(s);
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
      const line = this.chart.addSeries(LineSeries, lineBase(color), idx);
      const signal = this.chart.addSeries(LineSeries, lineBase('#ff9800'), idx);
      line.setData(asLine(pts.map((x) => ({ time: x.time, value: x.macd }))));
      signal.setData(asLine(pts.map((x) => ({ time: x.time, value: x.signal }))));
      this.keep(hist);
      this.keep(line);
      this.keep(signal);
    }
  }
}
