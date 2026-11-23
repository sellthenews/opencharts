// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Wykresy contributors

import { HistogramSeries, LineSeries, LineStyle } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import type { Candle } from '../sources/types';
import { bollinger, ema, macd, rsi, sma, stochastic, vwap, wma } from './math';
import type { IndicatorSettings, LinePoint } from './types';

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

export class IndicatorHost {
  private smaSeries: ISeriesApi<'Line'> | null = null;
  private emaSeries: ISeriesApi<'Line'> | null = null;
  private wmaSeries: ISeriesApi<'Line'> | null = null;
  private vwapSeries: ISeriesApi<'Line'> | null = null;
  private bbMid: ISeriesApi<'Line'> | null = null;
  private bbUpper: ISeriesApi<'Line'> | null = null;
  private bbLower: ISeriesApi<'Line'> | null = null;
  private volumeSeries: ISeriesApi<'Histogram'> | null = null;
  private rsiSeries: ISeriesApi<'Line'> | null = null;
  private stochK: ISeriesApi<'Line'> | null = null;
  private stochD: ISeriesApi<'Line'> | null = null;
  private macdLine: ISeriesApi<'Line'> | null = null;
  private macdSignal: ISeriesApi<'Line'> | null = null;
  private macdHist: ISeriesApi<'Histogram'> | null = null;

  constructor(
    private readonly chart: IChartApi,
    private readonly candles: ISeriesApi<'Candlestick'>,
  ) {}

  apply(data: Candle[], settings: IndicatorSettings): void {
    this.applyOverlays(data, settings);
    this.applyOscillators(data, settings);
  }

  private drop<T>(series: T | null): null {
    if (series) this.chart.removeSeries(series as never);
    return null;
  }

  private applyOverlays(data: Candle[], settings: IndicatorSettings): void {
    if (settings.sma.on) {
      if (!this.smaSeries) this.smaSeries = this.chart.addSeries(LineSeries, lineBase('#f5d76e'), 0);
      this.smaSeries.setData(asLine(sma(data, settings.sma.period)));
    } else {
      this.smaSeries = this.drop(this.smaSeries);
    }

    if (settings.ema.on) {
      if (!this.emaSeries) this.emaSeries = this.chart.addSeries(LineSeries, lineBase('#42a5f5'), 0);
      this.emaSeries.setData(asLine(ema(data, settings.ema.period)));
    } else {
      this.emaSeries = this.drop(this.emaSeries);
    }

    if (settings.wma.on) {
      if (!this.wmaSeries) this.wmaSeries = this.chart.addSeries(LineSeries, lineBase('#66bb6a'), 0);
      this.wmaSeries.setData(asLine(wma(data, settings.wma.period)));
    } else {
      this.wmaSeries = this.drop(this.wmaSeries);
    }

    if (settings.bb.on) {
      if (!this.bbMid) this.bbMid = this.chart.addSeries(LineSeries, lineBase('#787b86'), 0);
      if (!this.bbUpper) this.bbUpper = this.chart.addSeries(LineSeries, lineBase('#787b86'), 0);
      if (!this.bbLower) this.bbLower = this.chart.addSeries(LineSeries, lineBase('#787b86'), 0);
      const bands = bollinger(data, settings.bb.period, settings.bb.std);
      this.bbMid.setData(asLine(bands.map((b) => ({ time: b.time, value: b.mid }))));
      this.bbUpper.setData(asLine(bands.map((b) => ({ time: b.time, value: b.upper }))));
      this.bbLower.setData(asLine(bands.map((b) => ({ time: b.time, value: b.lower }))));
    } else {
      this.bbMid = this.drop(this.bbMid);
      this.bbUpper = this.drop(this.bbUpper);
      this.bbLower = this.drop(this.bbLower);
    }

    if (settings.vwap.on) {
      if (!this.vwapSeries) this.vwapSeries = this.chart.addSeries(LineSeries, lineBase('#ff7043'), 0);
      this.vwapSeries.setData(asLine(vwap(data)));
    } else {
      this.vwapSeries = this.drop(this.vwapSeries);
    }

    if (settings.volume.on) {
      if (!this.volumeSeries) {
        this.volumeSeries = this.chart.addSeries(
          HistogramSeries,
          { priceScaleId: 'volume', priceLineVisible: false, lastValueVisible: false },
          0,
        );
        this.chart.priceScale('volume', 0).applyOptions({
          scaleMargins: { top: 0.8, bottom: 0 },
          borderVisible: false,
        });
      }
      this.volumeSeries.setData(
        data.map((c) => ({
          time: c.time as UTCTimestamp,
          value: c.volume,
          color: c.close >= c.open ? 'rgba(38, 166, 154, 0.45)' : 'rgba(239, 83, 80, 0.45)',
        })),
      );
    } else {
      this.volumeSeries = this.drop(this.volumeSeries);
    }

    this.candles.priceScale().applyOptions({
      scaleMargins: { top: 0.05, bottom: settings.volume.on ? 0.2 : 0.03 },
    });
  }

  private applyOscillators(data: Candle[], settings: IndicatorSettings): void {
    this.rsiSeries = this.drop(this.rsiSeries);
    this.stochK = this.drop(this.stochK);
    this.stochD = this.drop(this.stochD);
    this.macdLine = this.drop(this.macdLine);
    this.macdSignal = this.drop(this.macdSignal);
    this.macdHist = this.drop(this.macdHist);
    const panes = this.chart.panes();
    for (let i = panes.length - 1; i >= 1; i--) this.chart.removePane(i);

    if (settings.rsi.on) {
      this.chart.addPane();
      const idx = this.chart.panes().length - 1;
      this.rsiSeries = this.chart.addSeries(
        LineSeries,
        { ...lineBase('#ab47bc'), lastValueVisible: true },
        idx,
      );
      this.rsiSeries.setData(asLine(rsi(data, settings.rsi.period)));
      const line = { lineWidth: 1 as const, lineStyle: LineStyle.Dotted, axisLabelVisible: false };
      this.rsiSeries.createPriceLine({ price: 70, color: '#6d5a78', title: '', ...line });
      this.rsiSeries.createPriceLine({ price: 30, color: '#6d5a78', title: '', ...line });
    }

    if (settings.stoch.on) {
      this.chart.addPane();
      const idx = this.chart.panes().length - 1;
      const pts = stochastic(data, settings.stoch.kPeriod, settings.stoch.dPeriod);
      this.stochK = this.chart.addSeries(LineSeries, { ...lineBase('#26a69a'), lastValueVisible: true }, idx);
      this.stochD = this.chart.addSeries(LineSeries, lineBase('#ef5350'), idx);
      this.stochK.setData(asLine(pts.map((p) => ({ time: p.time, value: p.k }))));
      this.stochD.setData(asLine(pts.map((p) => ({ time: p.time, value: p.d }))));
      const line = { lineWidth: 1 as const, lineStyle: LineStyle.Dotted, axisLabelVisible: false };
      this.stochK.createPriceLine({ price: 80, color: '#6d5a78', title: '', ...line });
      this.stochK.createPriceLine({ price: 20, color: '#6d5a78', title: '', ...line });
    }

    if (settings.macd.on) {
      this.chart.addPane();
      const idx = this.chart.panes().length - 1;
      const pts = macd(data, settings.macd.fast, settings.macd.slow, settings.macd.signal);
      this.macdHist = this.chart.addSeries(
        HistogramSeries,
        { priceLineVisible: false, lastValueVisible: false },
        idx,
      );
      this.macdHist.setData(
        pts.map((p) => ({
          time: p.time as UTCTimestamp,
          value: p.histogram,
          color: p.histogram >= 0 ? 'rgba(38, 166, 154, 0.6)' : 'rgba(239, 83, 80, 0.6)',
        })),
      );
      this.macdLine = this.chart.addSeries(LineSeries, lineBase('#26c6da'), idx);
      this.macdLine.setData(asLine(pts.map((p) => ({ time: p.time, value: p.macd }))));
      this.macdSignal = this.chart.addSeries(LineSeries, lineBase('#ff9800'), idx);
      this.macdSignal.setData(asLine(pts.map((p) => ({ time: p.time, value: p.signal }))));
    }

    const all = this.chart.panes();
    all[0]?.setStretchFactor(3);
    for (let i = 1; i < all.length; i++) all[i]!.setStretchFactor(1);
  }
}
