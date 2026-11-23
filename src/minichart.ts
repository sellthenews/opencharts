// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Wykresy contributors

import { CandlestickSeries, ColorType, createChart } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import { INTERVALS, getSource } from './sources';
import type { IntervalId, PairId } from './sources';

export interface MiniState {
  sourceId: string;
  pairId: PairId;
  intervalId: IntervalId;
}

function chartColors(light: boolean) {
  return light
    ? { bg: '#ffffff', text: '#131722', grid: '#e0e3eb', border: '#d1d4dc' }
    : { bg: '#131722', text: '#d1d4dc', grid: '#1e222d', border: '#2a2e39' };
}

export class MiniChart {
  private chart: IChartApi;
  private series: ISeriesApi<'Candlestick'>;
  private sourceEl: HTMLSelectElement;
  private pairEl: HTMLSelectElement;
  private intervalEl: HTMLSelectElement;
  private statusEl: HTMLDivElement;
  private loadSeq = 0;
  state: MiniState;

  constructor(
    root: HTMLElement,
    initial: MiniState,
    private readonly sources: { id: string; name: string }[],
    private readonly onChange: (state: MiniState) => void,
  ) {
    this.state = { ...initial };
    root.innerHTML = `<div class="extra-bar">
      <select data-mini="source"></select>
      <select data-mini="pair"></select>
      <select data-mini="interval"></select>
    </div>
    <div class="extra-status"></div>
    <div class="extra-plot"></div>`;
    this.sourceEl = root.querySelector('select[data-mini="source"]')!;
    this.pairEl = root.querySelector('select[data-mini="pair"]')!;
    this.intervalEl = root.querySelector('select[data-mini="interval"]')!;
    this.statusEl = root.querySelector('.extra-status')!;
    const plot = root.querySelector<HTMLElement>('.extra-plot')!;
    const c = chartColors(document.documentElement.dataset.theme === 'light');
    this.chart = createChart(plot, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: c.bg }, textColor: c.text, fontSize: 10 },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      rightPriceScale: { borderColor: c.border },
      timeScale: { borderColor: c.border, timeVisible: true, secondsVisible: false },
      localization: { locale: 'pl-PL' },
    });
    this.series = this.chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });
    this.fill();
    this.sourceEl.addEventListener('change', () => {
      this.state.sourceId = this.sourceEl.value;
      this.fillPairs();
      this.emit();
      void this.reload();
    });
    this.pairEl.addEventListener('change', () => {
      this.state.pairId = this.pairEl.value as PairId;
      this.emit();
      void this.reload();
    });
    this.intervalEl.addEventListener('change', () => {
      this.state.intervalId = this.intervalEl.value as IntervalId;
      this.emit();
      void this.reload();
    });
    void this.reload();
  }

  setTheme(light: boolean): void {
    const c = chartColors(light);
    this.chart.applyOptions({
      layout: { background: { type: ColorType.Solid, color: c.bg }, textColor: c.text },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      rightPriceScale: { borderColor: c.border },
      timeScale: { borderColor: c.border },
    });
  }

  private emit(): void {
    this.onChange({ ...this.state });
  }

  private fill(): void {
    this.sourceEl.innerHTML = this.sources.map((s) => `<option value="${s.id}"${s.id === this.state.sourceId ? ' selected' : ''}>${s.name}</option>`).join('');
    this.fillPairs();
    this.intervalEl.innerHTML = INTERVALS.map((i) => `<option value="${i.id}"${i.id === this.state.intervalId ? ' selected' : ''}>${i.label}</option>`).join('');
  }

  private fillPairs(): void {
    const src = getSource(this.state.sourceId);
    const pairs = src?.pairs ?? [];
    if (!pairs.some((p) => p.id === this.state.pairId) && pairs[0]) this.state.pairId = pairs[0].id;
    this.pairEl.innerHTML = pairs.map((p) => `<option value="${p.id}"${p.id === this.state.pairId ? ' selected' : ''}>${p.label}</option>`).join('');
  }

  private async reload(): Promise<void> {
    const seq = ++this.loadSeq;
    const src = getSource(this.state.sourceId);
    this.statusEl.textContent = '…';
    try {
      if (!src) throw new Error('Brak źródła');
      const candles = await src.fetchCandles(this.state.pairId, this.state.intervalId);
      if (seq !== this.loadSeq) return;
      this.series.setData(
        candles.map((c) => ({
          time: c.time as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        })),
      );
      this.chart.timeScale().fitContent();
      this.statusEl.textContent = `${src.name} · ${this.state.pairId} · ${candles.length}`;
    } catch (err) {
      if (seq !== this.loadSeq) return;
      this.series.setData([]);
      this.statusEl.textContent = err instanceof Error ? err.message : 'Błąd';
    }
  }
}
