// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import './storage';
import {
  CandlestickSeries,
  CrosshairMode,
  LineStyle,
  createChart,
} from 'lightweight-charts';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import { candleSeriesOptions, interactionOptions, themeChartOptions } from './chart-options';
import { getCachedCandles, setCachedCandles } from './candle-cache';
import { ohlcLegendHtml } from './ohlc-legend';
import { DrawingLayer } from './drawings';
import { IndicatorHost } from './indicators/host';
import type { PaneMap } from './indicators/host';
import { loadIndicatorSettings, saveIndicatorSettings } from './indicators/settings';
import { IndicatorHud, initIndicatorModal } from './indicators/ui';
import type { IndicatorInstance } from './indicators/types';
import { INTERVALS, formatPairLabel, getSource, sources } from './sources';
import type { Candle, IntervalId, PairId } from './sources';
import { initSymbolSearch } from './symbol-search';
import { initChartMenu } from './chart-menu';
import { initToolRail } from './tool-rail';
import { loadLayout, saveLayout } from './layout';
import { MiniChart } from './minichart';
import type { MiniState } from './minichart';
import { alertLabel, checkAlert, createAlert, loadAlerts, saveAlerts } from './alerts';
import type { PriceAlert } from './alerts';
import { KrakenLive, type LiveStatus } from './live/kraken-ws';
import { mergeLiveCandle } from './live/merge';
import { WatchlistPanel } from './watchlist';
import type { WatchState } from './watchlist';

const DEFAULT_SOURCE = 'kraken';
const DEFAULT_PAIR: PairId = 'XRPUSD';
const DEFAULT_INTERVAL: IntervalId = '1D';
const THEME_KEY = 'opencharts:theme';
const SIDEBAR_KEY = 'opencharts:sidebar';
const CURSOR_MODE_KEY = 'opencharts:cursor-mode';
const MAGNET_KEY = 'opencharts:magnet';
type CursorMode = 'cross' | 'dot' | 'arrow';
type ThemeName = 'dark' | 'light';

function loadTheme(): ThemeName {
  return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
}

let theme: ThemeName = loadTheme();

function applyTheme(name: ThemeName): void {
  theme = name;
  document.documentElement.dataset.theme = name;
  localStorage.setItem(THEME_KEY, name);
  persistLayout();
  const btn = document.querySelector<HTMLButtonElement>('#theme-btn');
  if (btn) btn.textContent = name === 'light' ? 'Dark theme' : 'Light theme';
}


const appEl = document.querySelector<HTMLDivElement>('#app')!;
appEl.dataset.sidebar = localStorage.getItem(SIDEBAR_KEY) !== 'off' ? 'on' : 'off';
const sourceEl = document.querySelector<HTMLSelectElement>('#source')!;
const pairEl = document.querySelector<HTMLSelectElement>('#pair')!;
const intervalsEl = document.querySelector<HTMLDivElement>('#intervals')!;
const statusEl = document.querySelector<HTMLDivElement>('#status')!;
const chartEl = document.querySelector<HTMLDivElement>('#chart')!;
const wrapEl = document.querySelector<HTMLDivElement>('#chart-wrap')!;
const overlayEl = document.querySelector<HTMLCanvasElement>('#draw-overlay')!;
const importFile = document.querySelector<HTMLInputElement>('#import-file')!;
let toolRail: ReturnType<typeof initToolRail> | null = null;

let sourceId = DEFAULT_SOURCE;
let pairId: PairId = DEFAULT_PAIR;
let intervalId: IntervalId = DEFAULT_INTERVAL;

let paneCount: 1 | 2 | 4 = 1;
const defaultExtras: MiniState[] = [
  { sourceId: 'kraken', pairId: 'BTCUSD', intervalId: '1D' },
  { sourceId: 'kraken', pairId: 'ETHUSD', intervalId: '1D' },
  { sourceId: 'kraken', pairId: 'XRPUSD', intervalId: '4h' },
];
let extras: MiniState[] = defaultExtras.map((e) => ({ ...e }));
const miniCharts: MiniChart[] = [];

function persistLayout(): void {
  saveLayout({ sourceId, pairId, intervalId, theme, paneCount, extras });
}

const savedLayout = loadLayout();
if (savedLayout) {
  sourceId = savedLayout.sourceId;
  pairId = savedLayout.pairId;
  intervalId = savedLayout.intervalId;
  theme = savedLayout.theme;
  if (savedLayout.paneCount === 2 || savedLayout.paneCount === 4) paneCount = savedLayout.paneCount;
  if (savedLayout.extras?.length) {
    extras = defaultExtras.map((e, i) => ({ ...e, ...(savedLayout.extras?.[i] ?? {}) }));
  }
}
let loadSeq = 0;
let lastCandles: Candle[] = [];

let alerts: PriceAlert[] = loadAlerts();
const alertListEl = document.querySelector<HTMLDivElement>('#alert-list');
const alertForm = document.querySelector<HTMLFormElement>('#alert-form');
const alertToast = document.querySelector<HTMLDivElement>('#alert-toast');
let toastTimer: number | null = null;

function renderAlerts(): void {
  if (!alertListEl) return;
  if (!alerts.length) {
    alertListEl.innerHTML = '<p class="watch-empty">No alerts.</p>';
    return;
  }
  alertListEl.innerHTML = alerts
    .map((a) => {
      const src = getSource(a.sourceId);
      const fired = a.enabled ? '' : ' is-fired';
      return `<div class="alert-item${fired}" data-alert-id="${a.id}">
        <span>${alertLabel(a, src?.name ?? a.sourceId)}</span>
        <button type="button" data-alert-del="${a.id}" title="Remove alert">×</button>
      </div>`;
    })
    .join('');
}

function showAlertToast(text: string): void {
  if (!alertToast) return;
  alertToast.hidden = false;
  alertToast.textContent = text;
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    alertToast.hidden = true;
  }, 8000);
}

function evaluateAlerts(source: string, pair: PairId, last: number): void {
  let changed = false;
  for (const a of alerts) {
    if (a.sourceId !== source || a.pairId !== pair || !a.enabled) continue;
    if (!checkAlert(a, last)) continue;
    a.enabled = false;
    changed = true;
    const src = getSource(a.sourceId);
    showAlertToast(`Alert: ${alertLabel(a, src?.name ?? a.sourceId)}`);
    setStatus(`Alert: ${alertLabel(a, src?.name ?? a.sourceId)}`);
  }
  if (changed) {
    saveAlerts(alerts);
    renderAlerts();
  }
}
let indicatorItems = loadIndicatorSettings();
let paneMap: PaneMap = {};
let indicatorHud: IndicatorHud;
let watchlist: WatchlistPanel;
let symbolSearch: ReturnType<typeof initSymbolSearch> | undefined;

applyTheme(theme);

const chart: IChartApi = createChart(chartEl, {
  autoSize: true,
  ...themeChartOptions(theme === 'light'),
  ...interactionOptions(),
  localization: { locale: 'en-US' },
});

const series: ISeriesApi<'Candlestick'> = chart.addSeries(CandlestickSeries, candleSeriesOptions());

chart.subscribeCrosshairMove((param) => {
  if (!param.point || param.time === undefined) {
    showLastOhlc();
    return;
  }
  const raw = param.seriesData.get(series);
  if (raw && 'open' in raw && 'close' in raw) {
    const bar = raw as { open: number; high: number; low: number; close: number };
    const found = barAtTime(param.time);
    showOhlc(bar, found?.index ?? null);
    return;
  }
  showLastOhlc();
});

const drawings = new DrawingLayer(chart, series, overlayEl, wrapEl);
const indicators = new IndicatorHost(chart, series);

function isoDate(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

function priceFormatFor(price: number): { type: 'price'; precision: number; minMove: number } {
  if (price >= 1000) return { type: 'price', precision: 2, minMove: 0.01 };
  if (price >= 1) return { type: 'price', precision: 4, minMove: 0.0001 };
  return { type: 'price', precision: 6, minMove: 0.000001 };
}

function setStatus(text: string, error = false): void {
  statusEl.textContent = text;
  statusEl.classList.toggle('is-error', error);
}

function currentSource() {
  const src = getSource(sourceId) ?? sources[0];
  if (!src) throw new Error('No data sources');
  return src;
}

function fillSources(): void {
  sourceEl.innerHTML = sources
    .map((s) => `<option value="${s.id}"${s.id === sourceId ? ' selected' : ''}>${s.name}</option>`)
    .join('');
}

function ensurePairOption(id: string, label: string): void {
  if (![...pairEl.options].some((o) => o.value === id)) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = label;
    pairEl.append(opt);
  }
  pairEl.value = id;
}

function fillPairs(): void {
  const src = currentSource();
  pairEl.innerHTML = src.pairs
    .map((p) => `<option value="${p.id}"${p.id === pairId ? ' selected' : ''}>${p.label}</option>`)
    .join('');
  const label = src.pairs.find((p) => p.id === pairId)?.label ?? formatPairLabel(sourceId, pairId);
  ensurePairOption(pairId, label);
  symbolSearch?.setCurrent(sourceId, pairId);
}

function fillIntervals(): void {
  intervalsEl.innerHTML = INTERVALS.map(
    (i) =>
      `<button type="button" class="interval${i.id === intervalId ? ' is-active' : ''}" data-interval="${i.id}">${i.label}</button>`,
  ).join('');
}

function setReady(ready: boolean): void {
  appEl.dataset.ready = ready ? 'true' : 'false';
}

function applySelection(nextSource: string, nextPair: PairId, reload = true): void {
  sourceId = nextSource;
  pairId = nextPair;
  fillPairs();
  sourceEl.value = sourceId;
  pairEl.value = pairId;
  persistLayout();
  watchlist?.highlight(sourceId, pairId);
  if (reload) void loadChart();
}


document.querySelector<HTMLButtonElement>('#theme-btn')?.addEventListener('click', () => {
  applyTheme(theme === 'light' ? 'dark' : 'light');
  chart.applyOptions(themeChartOptions(theme === 'light'));
  applyCursorAppearance();
  miniCharts.forEach((m) => m?.setTheme(theme === 'light'));
});

alertForm?.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const price = Number(document.querySelector<HTMLInputElement>('#alert-price')?.value);
  const direction = document.querySelector<HTMLSelectElement>('#alert-dir')?.value === 'below' ? 'below' : 'above';
  if (!Number.isFinite(price) || price <= 0) return;
  alerts.push(createAlert(sourceId, pairId, price, direction));
  saveAlerts(alerts);
  renderAlerts();
  const input = document.querySelector<HTMLInputElement>('#alert-price');
  if (input) input.value = '';
});

alertListEl?.addEventListener('click', (ev) => {
  const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-alert-del]');
  if (!btn) return;
  const id = btn.getAttribute('data-alert-del');
  alerts = alerts.filter((a) => a.id !== id);
  saveAlerts(alerts);
  renderAlerts();
});

renderAlerts();

function visibleKinds(): Set<string> {
  return new Set(indicatorItems.filter((i) => i.visible).map((i) => i.kind));
}

function applyIndicators(): void {
  paneMap = indicators.apply(lastCandles, indicatorItems);
  const kinds = visibleKinds();
  appEl.dataset.rsi = kinds.has('rsi') ? 'on' : 'off';
  appEl.dataset.macd = kinds.has('macd') ? 'on' : 'off';
  indicatorHud?.setPaneMap(paneMap);
  indicatorHud?.setItems(indicatorItems);
  requestAnimationFrame(() => {
    drawings.syncSize();
    indicatorHud?.relayout();
    requestAnimationFrame(() => {
      drawings.syncSize();
      indicatorHud?.relayout();
    });
  });
}

function persistIndicators(items: IndicatorInstance[]): void {
  indicatorItems = items;
  saveIndicatorSettings(indicatorItems);
  applyIndicators();
}

function resizeCharts(): void {
  const r = wrapEl.getBoundingClientRect();
  if (r.width > 0 && r.height > 0) chart.resize(r.width, r.height);
  for (const mini of miniCharts) mini?.resize();
  indicatorHud?.setPaneMap(paneMap);
  requestAnimationFrame(() => {
    drawings.syncSize();
    indicatorHud?.relayout();
    const again = wrapEl.getBoundingClientRect();
    if (again.width > 0 && again.height > 0) chart.resize(again.width, again.height);
    for (const mini of miniCharts) mini?.resize();
    requestAnimationFrame(() => indicatorHud?.relayout());
  });
}

function sidebarIsOn(): boolean {
  return localStorage.getItem(SIDEBAR_KEY) !== 'off';
}

function setSidebar(on: boolean): void {
  localStorage.setItem(SIDEBAR_KEY, on ? 'on' : 'off');
  appEl.dataset.sidebar = on ? 'on' : 'off';
  const btn = document.querySelector<HTMLButtonElement>('#sidebar-btn');
  if (btn) {
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.title = on ? 'Hide watchlist panel' : 'Show watchlist panel';
  }
  resizeCharts();
}


function barAtTime(time: unknown): { open: number; high: number; low: number; close: number; index: number } | null {
  let ts: number | null = null;
  if (typeof time === 'number') ts = time;
  else if (time && typeof time === 'object' && 'year' in (time as object)) {
    const d = time as { year: number; month: number; day: number };
    ts = Date.UTC(d.year, d.month - 1, d.day) / 1000;
  }
  if (ts === null) return null;
  const index = lastCandles.findIndex((c) => c.time === ts);
  if (index < 0) return null;
  const c = lastCandles[index]!;
  return { open: c.open, high: c.high, low: c.low, close: c.close, index };
}

function showOhlc(bar: { open: number; high: number; low: number; close: number }, index: number | null): void {
  const el = document.querySelector<HTMLElement>('#ohlc-legend');
  if (!el) return;
  const prev = index !== null && index > 0 ? lastCandles[index - 1]!.close : lastCandles.length > 1 ? lastCandles[lastCandles.length - 2]!.close : null;
  el.innerHTML = ohlcLegendHtml(bar, prev);
  el.hidden = false;
}

function showLastOhlc(): void {
  const last = lastCandles[lastCandles.length - 1];
  if (!last) {
    const el = document.querySelector<HTMLElement>('#ohlc-legend');
    if (el) el.hidden = true;
    return;
  }
  showOhlc(last, lastCandles.length - 1);
}

function applyPriceData(candles: Candle[], fit: boolean): void {
  const range = !fit ? chart.timeScale().getVisibleLogicalRange() : null;
  lastCandles = candles;
  if (!candles.length) {
    series.setData([]);
    applyIndicators();
    return;
  }
  const mid = candles[Math.floor(candles.length / 2)]!;
  series.applyOptions({ priceFormat: priceFormatFor(mid.close) });
  series.setData(
    candles.map((c) => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    })),
  );
  applyIndicators();
  const step = candles.length >= 2 ? candles[candles.length - 1]!.time - candles[candles.length - 2]!.time : 86400;
  drawings.setTimeInfo(candles[candles.length - 1]!.time, step);
  drawings.setPriceData(candles.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })));
  if (fit) chart.timeScale().fitContent();
  else if (range) chart.timeScale().setVisibleLogicalRange(range);
  evaluateAlerts(sourceId, pairId, candles[candles.length - 1]!.close);
  showLastOhlc();
}

type LoaderMode = 'off' | 'full' | 'refresh';

function setChartLoading(mode: LoaderMode): void {
  wrapEl.dataset.loading = mode;
  const loader = document.querySelector<HTMLElement>('#chart-loader');
  if (loader) loader.hidden = mode === 'off';
}

function setLiveStatus(status: LiveStatus): void {
  const el = document.querySelector<HTMLElement>('#live-status');
  if (el) {
    el.dataset.live = status;
    el.textContent = status === 'live' ? 'Live' : status === 'connecting' ? 'Connecting…' : 'Offline';
  }
  appEl.dataset.live = status;
}

const live = new KrakenLive(
  (pair, _srcInterval, candle) => {
    if (sourceId !== 'kraken' || pair !== pairId) return;
    const merged = mergeLiveCandle(lastCandles, candle, intervalId);
    lastCandles = merged;
    const last = merged[merged.length - 1];
    if (last) {
      series.update({
        time: last.time as UTCTimestamp,
        open: last.open,
        high: last.high,
        low: last.low,
        close: last.close,
      });
      applyIndicators();
      evaluateAlerts('kraken', pair, last.close);
    }
  },
  (pair, ticker) => {
    watchlist?.updateQuote('kraken', pair, ticker);
    evaluateAlerts('kraken', pair, ticker.last);
  },
  (status) => setLiveStatus(status),
);

function syncLiveChart(): void {
  if (sourceId === 'kraken') live.setChart(pairId, intervalId);
  else live.setChart(null, null);
}

function describeCandles(srcName: string, pairLabel: string, candles: Candle[], aggregated: boolean): string {
  const first = isoDate(candles[0]!.time);
  const last = isoDate(candles[candles.length - 1]!.time);
  return `${srcName} · ${pairLabel} · ${intervalId}${aggregated ? ' · aggregated' : ''} · ${candles.length} candles · ${first} – ${last}`;
}

async function loadChart(): Promise<void> {
  const seq = ++loadSeq;
  const src = currentSource();
  const pairLabel = formatPairLabel(sourceId, pairId);
  const aggregated = !src.nativeIntervals.includes(intervalId);
  const hadData = lastCandles.length > 0;
  const cached = getCachedCandles(sourceId, pairId, intervalId);

  if (cached?.length) {
    applyPriceData(cached, !hadData);
    drawings.setContext(src.id, pairId);
    setStatus(describeCandles(src.name, pairLabel, cached, aggregated));
    setReady(true);
    setChartLoading('refresh');
  } else {
    setChartLoading('full');
    if (!hadData) setReady(false);
    setStatus(`Loading ${src.name} · ${pairLabel} · ${intervalId}…`);
  }

  try {
    const candles = await src.fetchCandles(pairId, intervalId);
    if (seq !== loadSeq) return;
    if (!candles.length) throw new Error('No candles in the API response');
    setCachedCandles(sourceId, pairId, intervalId, candles);
    applyPriceData(candles, !(cached?.length || hadData));
    drawings.setContext(src.id, pairId);
    syncLiveChart();
    setStatus(describeCandles(src.name, pairLabel, candles, aggregated));
    setReady(true);
    setChartLoading('off');
    watchlist?.highlight(sourceId, pairId);
    requestAnimationFrame(() => drawings.syncSize());
  } catch (err) {
    if (seq !== loadSeq) return;
    if (!cached?.length) {
      applyPriceData([], false);
      drawings.setContext(src.id, pairId);
      setReady(false);
    }
    syncLiveChart();
    const message = err instanceof Error ? err.message : String(err);
    setStatus(`Failed to load data from ${src.name}: ${message}`, true);
    setChartLoading('off');
  }
}

sourceEl.addEventListener('change', () => {
  sourceId = sourceEl.value;
  fillPairs();
  persistLayout();
  watchlist?.highlight(sourceId, pairId);
  void loadChart();
});

pairEl.addEventListener('change', () => {
  pairId = pairEl.value as PairId;
  persistLayout();
  watchlist?.highlight(sourceId, pairId);
  void loadChart();
});

intervalsEl.addEventListener('click', (ev) => {
  const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-interval]');
  if (!btn) return;
  intervalId = btn.dataset.interval as IntervalId;
  persistLayout();
  intervalsEl.querySelectorAll('.interval').forEach((el) => {
    el.classList.toggle('is-active', el === btn);
  });
  void loadChart();
});

function exportDrawingsFile(): void {
  const blob = new Blob([drawings.exportJson()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `opencharts-drawings-${sourceId}-${pairId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

importFile.addEventListener('change', async () => {
  const file = importFile.files?.[0];
  importFile.value = '';
  if (!file) return;
  try {
    drawings.importJson(await file.text());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus(`Drawing import failed: ${message}`, true);
  }
});

function extendSelectedFib(): void {
  if (!drawings.toggleExtendRight()) {
    setStatus('Select a trend-based Fib extension, then click Extend right.');
  }
}

fillSources();
fillPairs();
fillIntervals();
drawings.setContext(sourceId, pairId);

symbolSearch = initSymbolSearch({
  modal: document.querySelector('#sym-modal')!,
  input: document.querySelector('#sym-search')!,
  results: document.querySelector('#sym-results')!,
  filters: document.querySelector('#sym-filters')!,
  pairBtn: document.querySelector('#pair-btn')!,
  closeBtn: document.querySelector('#sym-modal-close')!,
  onSelect: (src, pair) => applySelection(src, pair, true),
});
symbolSearch.setCurrent(sourceId, pairId);
void symbolSearch.ready.then(() => symbolSearch?.setCurrent(sourceId, pairId));

const watchRoot = document.querySelector<HTMLElement>('#watchlist')!;
watchlist = new WatchlistPanel(
  watchRoot,
  (src, pair) => {
    applySelection(src, pair, true);
  },
  (pairs) => live.setTickers(pairs),
);
watchlist.highlight(sourceId, pairId);
live.start();
syncLiveChart();

function setPaneCount(count: 1 | 2 | 4): void {
  paneCount = count;
  const grid = document.querySelector<HTMLElement>('#charts');
  if (grid) grid.dataset.panes = String(count);
  document.querySelectorAll('#layout-btns [data-panes]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-panes') === String(count));
  });
  persistLayout();
  ensureMiniCharts();
  resizeCharts();
}

document.querySelector('#layout-btns')?.addEventListener('click', (ev) => {
  const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-panes]');
  if (!btn) return;
  const n = Number(btn.dataset.panes);
  if (n === 1 || n === 2 || n === 4) setPaneCount(n);
});

function ensureMiniCharts(): void {
  const needed = paneCount === 4 ? 3 : paneCount === 2 ? 1 : 0;
  document.querySelectorAll<HTMLElement>('.extra-cell').forEach((cell, i) => {
    if (i >= needed) return;
    if (miniCharts[i]) return;
    miniCharts[i] = new MiniChart(
      cell,
      extras[i] ?? defaultExtras[i]!,
      sources.map((s) => ({ id: s.id, name: s.name })),
      (state) => {
        extras[i] = state;
        persistLayout();
      },
    );
  });
}

setPaneCount(paneCount);

initIndicatorModal({
  modal: document.querySelector('#ind-modal')!,
  search: document.querySelector('#ind-search')!,
  catalog: document.querySelector('#ind-catalog')!,
  closeBtn: document.querySelector('#ind-modal-close')!,
});
indicatorHud = new IndicatorHud(
  indicatorItems,
  {
    onChange: persistIndicators,
    paneOffset: (index) => indicators.paneOffset(index),
  },
  document.querySelector('#ind-labels')!,
  document.querySelector('#ind-btn')!,
);

setSidebar(sidebarIsOn());
document.querySelector('#sidebar-btn')?.addEventListener('click', () => setSidebar(!sidebarIsOn()));
window.addEventListener('resize', () => resizeCharts());



declare global {
  interface Window {
    __opencharts: {
      getDrawings: () => ReturnType<DrawingLayer['getDrawings']>;
      getSelectedId: () => string | null;
      getAbcdScreen: () => ReturnType<DrawingLayer['getAbcdScreen']>;
      exportDrawings: () => string;
      importDrawings: (raw: string) => void;
      getIndicators: () => IndicatorInstance[];
      getWatchState: () => WatchState;
      applySelection: (sourceId: string, pairId: PairId) => void;
    };
  }
}

window.__opencharts = {
  getDrawings: () => drawings.getDrawings(),
  getSelectedId: () => drawings.getSelectedId(),
  getAbcdScreen: () => drawings.getAbcdScreen(),
  exportDrawings: () => drawings.exportJson(),
  importDrawings: (raw) => drawings.importJson(raw),
  getIndicators: () => indicatorItems,
  getWatchState: () => watchlist.getState(),
  applySelection: (src, pair) => applySelection(src, pair, true),
};

initChartMenu(
  wrapEl,
  document.querySelector('#chart-menu')!,
  (_x, y) => {
    const rect = wrapEl.getBoundingClientRect();
    return series.coordinateToPrice(y - rect.top);
  },
  {
    resetView: () => {
      chart.timeScale().applyOptions({ rightOffset: 6, barSpacing: 8 });
      chart.timeScale().fitContent();
      chart.timeScale().scrollToRealTime();
      series.priceScale().applyOptions({ autoScale: true });
      setStatus('Chart view reset.');
    },
    copyPrice: (price) => {
      const text = String(price);
      void navigator.clipboard?.writeText(text).then(
        () => setStatus(`Copied price ${text}`),
        () => setStatus(`Could not copy price ${text}`, true),
      );
    },
    addAlert: (price) => {
      const last = lastCandles[lastCandles.length - 1]?.close;
      const direction = last !== undefined && price < last ? 'below' : 'above';
      alerts.push(createAlert(sourceId, pairId, price, direction));
      saveAlerts(alerts);
      renderAlerts();
      setStatus(`Added alert at ${price}`);
    },
    clearDrawings: () => {
      drawings.clearAll();
      setStatus('Removed all drawings.');
    },
    exportDrawings: () => exportDrawingsFile(),
    importDrawings: () => importFile.click(),
    extendFib: () => extendSelectedFib(),
  },
);


type CursorModeState = CursorMode;

function loadCursorMode(): CursorMode {
  const v = localStorage.getItem(CURSOR_MODE_KEY);
  return v === 'dot' || v === 'arrow' || v === 'cross' ? v : 'cross';
}

let cursorMode: CursorMode = loadCursorMode();
let magnetOn = localStorage.getItem(MAGNET_KEY) === 'on';

const cursorDot = document.querySelector<HTMLElement>('#cursor-dot');
const drawBar = document.querySelector<HTMLElement>('#draw-bar');
const drawColor = document.querySelector<HTMLInputElement>('#draw-color');
const drawWidth = document.querySelector<HTMLSelectElement>('#draw-width');
const drawLineStyle = document.querySelector<HTMLSelectElement>('#draw-linestyle');
const drawLock = document.querySelector<HTMLButtonElement>('#draw-lock');
const drawDelete = document.querySelector<HTMLButtonElement>('#draw-delete');

function applyCursorAppearance(): void {
  const light = theme === 'light';
  const line = light ? 'rgba(19, 23, 34, 0.45)' : 'rgba(209, 212, 220, 0.45)';
  const labelBg = light ? '#4c525e' : '#2a2e39';
  const magnetMode = magnetOn ? CrosshairMode.MagnetOHLC : CrosshairMode.Normal;
  if (cursorMode === 'arrow') {
    chart.applyOptions({
      crosshair: {
        mode: CrosshairMode.Hidden,
        vertLine: { visible: false, labelVisible: false },
        horzLine: { visible: false, labelVisible: false },
      },
    });
    if (cursorDot) cursorDot.hidden = true;
  } else if (cursorMode === 'dot') {
    chart.applyOptions({
      crosshair: {
        mode: magnetMode,
        vertLine: { visible: false, labelVisible: true, labelBackgroundColor: labelBg, color: line, style: LineStyle.Dashed, width: 1 },
        horzLine: { visible: false, labelVisible: true, labelBackgroundColor: labelBg, color: line, style: LineStyle.Dashed, width: 1 },
      },
    });
  } else {
    chart.applyOptions({
      crosshair: {
        mode: magnetMode,
        vertLine: { visible: true, labelVisible: true, labelBackgroundColor: labelBg, color: line, style: LineStyle.Dashed, width: 1 },
        horzLine: { visible: true, labelVisible: true, labelBackgroundColor: labelBg, color: line, style: LineStyle.Dashed, width: 1 },
      },
    });
    if (cursorDot) cursorDot.hidden = true;
  }
  drawings.setMagnet(magnetOn);
  toolRail?.refreshActions();
  localStorage.setItem(CURSOR_MODE_KEY, cursorMode);
  localStorage.setItem(MAGNET_KEY, magnetOn ? 'on' : 'off');
}

function setCursorMode(mode: CursorModeState): void {
  cursorMode = mode;
  applyCursorAppearance();
}

function placeDrawBar(): void {
  if (!drawBar) return;
  const d = drawings.getSelected();
  if (!d) {
    drawBar.hidden = true;
    return;
  }
  drawBar.hidden = false;
  const color = d.style?.color ?? '#5b9cf6';
  if (drawColor) drawColor.value = color.length === 7 ? color : '#5b9cf6';
  if (drawWidth) drawWidth.value = String(d.style?.width ?? 1);
  if (drawLineStyle) drawLineStyle.value = d.style?.lineStyle ?? 'solid';
  if (drawLock) drawLock.textContent = d.style?.locked ? 'Unlock' : 'Lock';
  const anchor = drawings.selectionAnchor();
  if (anchor) {
    const top = Math.max(8, anchor.y - 40);
    const left = Math.min(Math.max(8, anchor.x), wrapEl.clientWidth - 8);
    drawBar.style.left = `${left}px`;
    drawBar.style.top = `${top}px`;
    drawBar.style.transform = 'translateX(-50%)';
  } else {
    drawBar.style.left = '50%';
    drawBar.style.top = '8px';
    drawBar.style.transform = 'translateX(-50%)';
  }
}

function activateCursorTool(): void {
  drawings.setTool('cursor');
  toolRail?.setActive('cursor');
}

drawings.setOnToolDone(() => activateCursorTool());
drawings.setOnSelect(() => placeDrawBar());

toolRail = initToolRail({
  rail: document.querySelector('#tool-rail')!,
  flyout: document.querySelector('#rail-flyout')!,
  favBar: document.querySelector('#fav-bar')!,
  onTool: (tool) => {
    drawings.setTool(tool);
    toolRail?.setActive(tool);
  },
  getCursorMode: () => cursorMode,
  setCursorMode: (mode) => setCursorMode(mode),
  getMagnet: () => magnetOn,
  setMagnet: (on) => {
    magnetOn = on;
    applyCursorAppearance();
  },
  onLockAll: () => {
    drawings.setAllLocked(!drawings.areAllLocked());
    toolRail?.refreshActions();
  },
  onHideAll: () => {
    drawings.setHidden(!drawings.isHidden());
    toolRail?.refreshActions();
  },
  onClearAll: () => {
    if (window.confirm('Remove all drawings from this chart?')) {
      drawings.clearAll();
      setStatus('Removed all drawings.');
    }
  },
  onZoomIn: () => {
    const ts = chart.timeScale();
    const current = ts.options().barSpacing ?? 8;
    ts.applyOptions({ barSpacing: Math.min(48, current * 1.25) });
  },
  onZoomOut: () => {
    const ts = chart.timeScale();
    const current = ts.options().barSpacing ?? 8;
    ts.applyOptions({ barSpacing: Math.max(2, current / 1.25) });
  },
  onFit: () => {
    chart.timeScale().fitContent();
    series.priceScale().applyOptions({ autoScale: true });
  },
  isLockedAll: () => drawings.areAllLocked(),
  isHidden: () => drawings.isHidden(),
});

drawColor?.addEventListener('input', () => {
  if (drawColor) drawings.patchStyle({ color: drawColor.value });
});
drawWidth?.addEventListener('change', () => {
  if (drawWidth) drawings.patchStyle({ width: Number(drawWidth.value) });
});
drawLineStyle?.addEventListener('change', () => {
  if (drawLineStyle) drawings.patchStyle({ lineStyle: drawLineStyle.value as 'solid' | 'dashed' | 'dotted' });
});
drawLock?.addEventListener('click', () => {
  const d = drawings.getSelected();
  drawings.patchStyle({ locked: !d?.style?.locked });
});
drawDelete?.addEventListener('click', () => {
  drawings.deleteSelected();
});

let drawBarDrag: { x: number; y: number; left: number; top: number } | null = null;
drawBar?.addEventListener('mousedown', (ev) => {
  if ((ev.target as HTMLElement).closest('input, select, button')) return;
  if (!drawBar) return;
  ev.preventDefault();
  drawBarDrag = { x: ev.clientX, y: ev.clientY, left: drawBar.offsetLeft, top: drawBar.offsetTop };
});
window.addEventListener('mousemove', (ev) => {
  if (!drawBarDrag || !drawBar) return;
  drawBar.style.transform = 'none';
  drawBar.style.left = `${drawBarDrag.left + ev.clientX - drawBarDrag.x}px`;
  drawBar.style.top = `${drawBarDrag.top + ev.clientY - drawBarDrag.y}px`;
});
window.addEventListener('mouseup', () => {
  drawBarDrag = null;
});

chart.subscribeCrosshairMove((param) => {
  if (cursorMode === 'dot' && cursorDot && param.point) {
    cursorDot.hidden = false;
    cursorDot.style.left = `${param.point.x}px`;
    cursorDot.style.top = `${param.point.y}px`;
  } else if (cursorDot && cursorMode !== 'dot') {
    cursorDot.hidden = true;
  } else if (cursorDot && !param.point) {
    cursorDot.hidden = true;
  }
});

applyCursorAppearance();

void loadChart();
