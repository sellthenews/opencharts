// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { localeOf, onLangChange, t } from './i18n';

import { CandlestickSeries, createChart } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import { INTERVALS, getSource } from './sources';
import type { Candle, IntervalId, PairId } from './sources';
import { candleSeriesOptions, interactionOptions, themeChartOptions } from './chart-options';
import { getCachedCandles, setCachedCandles } from './candle-cache';
import { IndicatorHost } from './indicators/host';
import { IndicatorHud } from './indicators/ui';
import { createInstance } from './indicators/settings';
import type { IndicatorInstance } from './indicators/types';

export interface MiniState {
  sourceId: string;
  pairId: PairId;
  intervalId: IntervalId;
  indicators?: IndicatorInstance[];
}

function copyIndicators(items: IndicatorInstance[] | undefined): IndicatorInstance[] {
  if (!items?.length) return [createInstance('volume')];
  return items.map((i) => ({ ...i, params: { ...i.params } }));
}

export class MiniChart {
  private chart: IChartApi;
  private series: ISeriesApi<'Candlestick'>;
  private sourceEl: HTMLSelectElement;
  private pairEl: HTMLSelectElement;
  private intervalEl: HTMLSelectElement;
  private statusEl: HTMLDivElement;
  private host: IndicatorHost;
  private hud: IndicatorHud;
  private candles: Candle[] = [];
  private loadSeq = 0;
  state: MiniState;

  constructor(
    private readonly root: HTMLElement,
    initial: MiniState,
    private readonly sources: { id: string; name: string }[],
    private readonly onChange: (state: MiniState) => void,
  ) {
    this.state = {
      sourceId: initial.sourceId,
      pairId: initial.pairId,
      intervalId: initial.intervalId,
      indicators: copyIndicators(initial.indicators),
    };
    root.innerHTML = `<div class="extra-bar">
      <select data-mini="source"></select>
      <select data-mini="pair"></select>
      <select data-mini="interval"></select>
      <button type="button" class="mini-fx" title="${t('toolbar.indicatorsTitle')}" aria-label="${t('toolbar.indicatorsTitle')}">fx</button>
    </div>
    <div class="extra-status"></div>
    <div class="extra-plot">
      <div class="mini-chart"></div>
      <div class="ind-labels"></div>
    </div>`;
    this.sourceEl = root.querySelector('select[data-mini="source"]')!;
    this.pairEl = root.querySelector('select[data-mini="pair"]')!;
    this.intervalEl = root.querySelector('select[data-mini="interval"]')!;
    this.statusEl = root.querySelector('.extra-status')!;
    const plot = root.querySelector<HTMLElement>('.mini-chart')!;
    const light = document.documentElement.dataset.theme === 'light';
    this.chart = createChart(plot, {
      autoSize: true,
      ...themeChartOptions(light),
      ...interactionOptions(),
      layout: { ...themeChartOptions(light).layout, fontSize: 10 },
      localization: { locale: localeOf() },
    });
    this.series = this.chart.addSeries(CandlestickSeries, candleSeriesOptions());
    onLangChange(() => {
      this.chart.applyOptions({ localization: { locale: localeOf() } });
      const fx = root.querySelector<HTMLElement>('.mini-fx');
      if (fx) {
        fx.title = t('toolbar.indicatorsTitle');
        fx.setAttribute('aria-label', t('toolbar.indicatorsTitle'));
      }
    });
    this.host = new IndicatorHost(this.chart, this.series);
    this.hud = new IndicatorHud(
      this.state.indicators!,
      {
        onChange: (items) => {
          this.state.indicators = items;
          this.applyIndicators();
          this.emit();
        },
        paneOffset: (index) => this.host.paneOffset(index),
      },
      root.querySelector('.ind-labels')!,
      root.querySelector('.mini-fx')!,
    );
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

  resize(): void {
    const plot = this.root.querySelector<HTMLElement>('.mini-chart');
    if (!plot) return;
    const w = plot.clientWidth;
    const h = plot.clientHeight;
    if (w > 0 && h > 0) this.chart.resize(w, h);
    requestAnimationFrame(() => this.hud.relayout());
  }

  setTheme(light: boolean): void {
    this.chart.applyOptions(themeChartOptions(light));
  }

  private emit(): void {
    this.onChange({
      sourceId: this.state.sourceId,
      pairId: this.state.pairId,
      intervalId: this.state.intervalId,
      indicators: this.state.indicators,
    });
  }

  private applyIndicators(): void {
    const map = this.host.apply(this.candles, this.state.indicators ?? []);
    this.hud.setPaneMap(map);
    this.hud.setItems(this.state.indicators ?? []);
    requestAnimationFrame(() => this.hud.relayout());
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

  private paint(candles: Candle[], fit: boolean): void {
    const range = !fit ? this.chart.timeScale().getVisibleLogicalRange() : null;
    this.candles = candles;
    this.series.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );
    this.applyIndicators();
    if (fit) this.chart.timeScale().fitContent();
    else if (range) this.chart.timeScale().setVisibleLogicalRange(range);
  }

  private async reload(): Promise<void> {
    const seq = ++this.loadSeq;
    const src = getSource(this.state.sourceId);
    const cached = getCachedCandles(this.state.sourceId, this.state.pairId, this.state.intervalId);
    const had = this.candles.length > 0;
    if (cached?.length) {
      this.paint(cached, !had);
      this.statusEl.textContent = `${src?.name ?? this.state.sourceId} · ${this.state.pairId} · ${cached.length}`;
    } else {
      this.statusEl.textContent = '…';
    }
    try {
      if (!src) throw new Error('No source');
      const candles = await src.fetchCandles(this.state.pairId, this.state.intervalId);
      if (seq !== this.loadSeq) return;
      setCachedCandles(this.state.sourceId, this.state.pairId, this.state.intervalId, candles);
      this.paint(candles, !(cached?.length || had));
      this.statusEl.textContent = `${src.name} · ${this.state.pairId} · ${candles.length}`;
    } catch (err) {
      if (seq !== this.loadSeq) return;
      if (!cached?.length) {
        this.candles = [];
        this.series.setData([]);
        this.applyIndicators();
      }
      this.statusEl.textContent = err instanceof Error ? err.message : 'Error';
    }
  }
}
