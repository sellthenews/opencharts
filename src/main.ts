// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Wykresy contributors

import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
} from 'lightweight-charts';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import { DrawingLayer } from './drawings';
import type { Tool } from './drawings';
import { IndicatorHost } from './indicators/host';
import { loadIndicatorSettings, saveIndicatorSettings } from './indicators/settings';
import type { IndicatorSettings } from './indicators/types';
import { INTERVALS, getSource, sources } from './sources';
import type { Candle, IntervalId, PairId } from './sources';
import { loadLayout, saveLayout } from './layout';
import { alertLabel, checkAlert, createAlert, loadAlerts, saveAlerts } from './alerts';
import type { PriceAlert } from './alerts';
import { KrakenLive, type LiveStatus } from './live/kraken-ws';
import { mergeLiveCandle } from './live/merge';
import { WatchlistPanel } from './watchlist';
import type { WatchState } from './watchlist';

const DEFAULT_SOURCE = 'kraken';
const DEFAULT_PAIR: PairId = 'XRPUSD';
const DEFAULT_INTERVAL: IntervalId = '1D';
const THEME_KEY = 'wykresy:theme';
type ThemeName = 'dark' | 'light';

function loadTheme(): ThemeName {
  return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
}

let theme: ThemeName = loadTheme();

function chartThemeOptions(name: ThemeName) {
  if (name === 'light') {
    return {
      layout: { background: { type: ColorType.Solid, color: '#ffffff' }, textColor: '#131722' },
      grid: { vertLines: { color: '#e0e3eb' }, horzLines: { color: '#e0e3eb' } },
      rightPriceScale: { borderColor: '#d1d4dc' },
      timeScale: { borderColor: '#d1d4dc', timeVisible: true, secondsVisible: false },
    };
  }
  return {
    layout: { background: { type: ColorType.Solid, color: '#131722' }, textColor: '#d1d4dc' },
    grid: { vertLines: { color: '#1e222d' }, horzLines: { color: '#1e222d' } },
    rightPriceScale: { borderColor: '#2a2e39' },
    timeScale: { borderColor: '#2a2e39', timeVisible: true, secondsVisible: false },
  };
}

function applyTheme(name: ThemeName): void {
  theme = name;
  document.documentElement.dataset.theme = name;
  localStorage.setItem(THEME_KEY, name);
  persistLayout();
  const btn = document.querySelector<HTMLButtonElement>('#theme-btn');
  if (btn) btn.textContent = name === 'light' ? 'Motyw ciemny' : 'Motyw jasny';
}


const appEl = document.querySelector<HTMLDivElement>('#app')!;
const sourceEl = document.querySelector<HTMLSelectElement>('#source')!;
const pairEl = document.querySelector<HTMLSelectElement>('#pair')!;
const intervalsEl = document.querySelector<HTMLDivElement>('#intervals')!;
const statusEl = document.querySelector<HTMLDivElement>('#status')!;
const chartEl = document.querySelector<HTMLDivElement>('#chart')!;
const wrapEl = document.querySelector<HTMLDivElement>('#chart-wrap')!;
const overlayEl = document.querySelector<HTMLCanvasElement>('#draw-overlay')!;
const deleteBtn = document.querySelector<HTMLButtonElement>('#delete-btn')!;
const clearBtn = document.querySelector<HTMLButtonElement>('#clear-btn')!;
const exportBtn = document.querySelector<HTMLButtonElement>('#export-btn')!;
const importBtn = document.querySelector<HTMLButtonElement>('#import-btn')!;
const importFile = document.querySelector<HTMLInputElement>('#import-file')!;
const extendRightBtn = document.querySelector<HTMLButtonElement>('#extend-right-btn')!;
const indicatorsBar = document.querySelector<HTMLDivElement>('#indicators-bar')!;

let sourceId = DEFAULT_SOURCE;
let pairId: PairId = DEFAULT_PAIR;
let intervalId: IntervalId = DEFAULT_INTERVAL;

function persistLayout(): void {
  saveLayout({ sourceId, pairId, intervalId, theme });
}

const savedLayout = loadLayout();
if (savedLayout) {
  sourceId = savedLayout.sourceId;
  pairId = savedLayout.pairId;
  intervalId = savedLayout.intervalId;
  theme = savedLayout.theme;
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
    alertListEl.innerHTML = '<p class="watch-empty">Brak alertów.</p>';
    return;
  }
  alertListEl.innerHTML = alerts
    .map((a) => {
      const src = getSource(a.sourceId);
      const fired = a.enabled ? '' : ' is-fired';
      return `<div class="alert-item${fired}" data-alert-id="${a.id}">
        <span>${alertLabel(a, src?.name ?? a.sourceId)}</span>
        <button type="button" data-alert-del="${a.id}" title="Usuń alert">×</button>
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
let indicatorSettings = loadIndicatorSettings();
let watchlist: WatchlistPanel;

applyTheme(theme);

const chart: IChartApi = createChart(chartEl, {
  autoSize: true,
  ...chartThemeOptions(theme),
  layout: {
    ...chartThemeOptions(theme).layout,
    fontFamily: 'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  crosshair: { mode: CrosshairMode.Normal },
  localization: { locale: 'pl-PL' },
});

const series: ISeriesApi<'Candlestick'> = chart.addSeries(CandlestickSeries, {
  upColor: '#26a69a',
  downColor: '#ef5350',
  borderVisible: false,
  wickUpColor: '#26a69a',
  wickDownColor: '#ef5350',
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
  if (!src) throw new Error('Brak źródeł danych');
  return src;
}

function fillSources(): void {
  sourceEl.innerHTML = sources
    .map((s) => `<option value="${s.id}"${s.id === sourceId ? ' selected' : ''}>${s.name}</option>`)
    .join('');
}

function fillPairs(): void {
  const src = currentSource();
  if (!src.pairs.some((p) => p.id === pairId)) pairId = src.pairs[0]?.id ?? DEFAULT_PAIR;
  pairEl.innerHTML = src.pairs
    .map((p) => `<option value="${p.id}"${p.id === pairId ? ' selected' : ''}>${p.label}</option>`)
    .join('');
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
  
document.querySelector<HTMLButtonElement>('#theme-btn')?.addEventListener('click', () => {
  applyTheme(theme === 'light' ? 'dark' : 'light');
  chart.applyOptions({
    ...chartThemeOptions(theme),
    layout: {
      ...chartThemeOptions(theme).layout,
      fontFamily: 'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    },
  });
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

fillSources();
renderAlerts();

  fillPairs();
  sourceEl.value = sourceId;
  pairEl.value = pairId;
  watchlist.highlight(sourceId, pairId);
  if (reload) void loadChart();
}

function numInput(selector: string, value: number): void {
  const el = indicatorsBar.querySelector<HTMLInputElement>(selector);
  if (el) el.value = String(value);
}

function syncIndicatorUi(): void {
  const s = indicatorSettings;
  const setOn = (id: string, on: boolean) => {
    const el = indicatorsBar.querySelector<HTMLInputElement>(`input[data-ind="${id}"]`);
    if (el) el.checked = on;
  };
  setOn('sma', s.sma.on);
  setOn('ema', s.ema.on);
  setOn('wma', s.wma.on);
  setOn('bb', s.bb.on);
  setOn('volume', s.volume.on);
  setOn('vwap', s.vwap.on);
  setOn('rsi', s.rsi.on);
  setOn('stoch', s.stoch.on);
  setOn('atr', s.atr.on);
  setOn('macd', s.macd.on);
  numInput('[data-ind-period="sma"]', s.sma.period);
  numInput('[data-ind-period="ema"]', s.ema.period);
  numInput('[data-ind-period="wma"]', s.wma.period);
  numInput('[data-ind-period="bb"]', s.bb.period);
  numInput('[data-ind-std="bb"]', s.bb.std);
  numInput('[data-ind-period="rsi"]', s.rsi.period);
  numInput('[data-ind-stoch="k"]', s.stoch.kPeriod);
  numInput('[data-ind-stoch="d"]', s.stoch.dPeriod);
  numInput('[data-ind-period="atr"]', s.atr.period);
  numInput('[data-ind-macd="fast"]', s.macd.fast);
  numInput('[data-ind-macd="slow"]', s.macd.slow);
  numInput('[data-ind-macd="signal"]', s.macd.signal);
  appEl.dataset.rsi = s.rsi.on ? 'on' : 'off';
  appEl.dataset.macd = s.macd.on ? 'on' : 'off';
}

function readIndicatorUi(): IndicatorSettings {
  const on = (id: string) => Boolean(indicatorsBar.querySelector<HTMLInputElement>(`input[data-ind="${id}"]`)?.checked);
  const num = (sel: string, fallback: number) => {
    const v = Number(indicatorsBar.querySelector<HTMLInputElement>(sel)?.value);
    return Number.isFinite(v) ? v : fallback;
  };
  const d = indicatorSettings;
  return {
    sma: { on: on('sma'), period: num('[data-ind-period="sma"]', d.sma.period) },
    ema: { on: on('ema'), period: num('[data-ind-period="ema"]', d.ema.period) },
    wma: { on: on('wma'), period: num('[data-ind-period="wma"]', d.wma.period) },
    bb: { on: on('bb'), period: num('[data-ind-period="bb"]', d.bb.period), std: num('[data-ind-std="bb"]', d.bb.std) },
    volume: { on: on('volume') },
    vwap: { on: on('vwap') },
    rsi: { on: on('rsi'), period: num('[data-ind-period="rsi"]', d.rsi.period) },
    stoch: { on: on('stoch'), kPeriod: num('[data-ind-stoch="k"]', d.stoch.kPeriod), dPeriod: num('[data-ind-stoch="d"]', d.stoch.dPeriod) },
    atr: { on: on('atr'), period: num('[data-ind-period="atr"]', d.atr.period) },
    macd: {
      on: on('macd'),
      fast: num('[data-ind-macd="fast"]', d.macd.fast),
      slow: num('[data-ind-macd="slow"]', d.macd.slow),
      signal: num('[data-ind-macd="signal"]', d.macd.signal),
    },
  };
}

function applyIndicators(): void {
  indicators.apply(lastCandles, indicatorSettings);
  appEl.dataset.rsi = indicatorSettings.rsi.on ? 'on' : 'off';
  appEl.dataset.macd = indicatorSettings.macd.on ? 'on' : 'off';
  requestAnimationFrame(() => {
    drawings.syncSize();
    requestAnimationFrame(() => drawings.syncSize());
  });
}

function persistIndicatorsFromUi(): void {
  indicatorSettings = readIndicatorUi();
  saveIndicatorSettings(indicatorSettings);
  syncIndicatorUi();
  applyIndicators();
}


function applyPriceData(candles: Candle[], fit: boolean): void {
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
  if (fit) chart.timeScale().fitContent();
  evaluateAlerts(sourceId, pairId, candles[candles.length - 1]!.close);
}

function setLiveStatus(status: LiveStatus): void {
  const el = document.querySelector<HTMLElement>('#live-status');
  if (el) {
    el.dataset.live = status;
    el.textContent = status === 'live' ? 'Na żywo' : status === 'connecting' ? 'Łączenie…' : 'Offline';
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

async function loadChart(): Promise<void> {
  const seq = ++loadSeq;
  const src = currentSource();
  const pair = src.pairs.find((p) => p.id === pairId);
  setReady(false);
  setStatus(`Ładowanie ${src.name} · ${pair?.label ?? pairId} · ${intervalId}…`);

  try {
    const candles = await src.fetchCandles(pairId, intervalId);
    if (seq !== loadSeq) return;
    if (!candles.length) throw new Error('Brak świec w odpowiedzi API');
    applyPriceData(candles, true);
    drawings.setContext(src.id, pairId);
    syncLiveChart();

    const first = isoDate(candles[0]!.time);
    const last = isoDate(candles[candles.length - 1]!.time);
    const native = pair?.native ?? pairId;
    const aggregated = src.nativeIntervals.includes(intervalId) ? '' : ' · agregacja';
    setStatus(`${src.name} · ${native} · ${intervalId}${aggregated} · ${candles.length} świec · ${first} – ${last}`);
    setReady(true);
    watchlist?.highlight(sourceId, pairId);
    requestAnimationFrame(() => drawings.syncSize());
  } catch (err) {
    if (seq !== loadSeq) return;
    applyPriceData([], false);
    drawings.setContext(src.id, pairId);
    syncLiveChart();
    const message = err instanceof Error ? err.message : String(err);
    setStatus(`Nie udało się pobrać danych z ${src.name}: ${message}`, true);
    setReady(false);
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

document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const tool = btn.dataset.tool as Tool;
    drawings.setTool(tool);
    document.querySelectorAll('[data-tool]').forEach((el) => {
      el.classList.toggle('is-active', el === btn);
    });
  });
});

deleteBtn.addEventListener('click', () => {
  if (!drawings.deleteSelected()) {
    setStatus('Zaznacz rysunek kursorem, potem kliknij Usuń (albo Delete).');
  }
});

clearBtn.addEventListener('click', () => {
  drawings.clearAll();
});

exportBtn.addEventListener('click', () => {
  const blob = new Blob([drawings.exportJson()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `wykresy-rysunki-${sourceId}-${pairId}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

importBtn.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async () => {
  const file = importFile.files?.[0];
  importFile.value = '';
  if (!file) return;
  try {
    drawings.importJson(await file.text());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus(`Import rysunków nie powiódł się: ${message}`, true);
  }
});

extendRightBtn.addEventListener('click', () => {
  if (!drawings.toggleExtendRight()) {
    setStatus('Zaznacz Fibo rozszerzenie, potem kliknij Przedłuż w prawo.');
  }
});

indicatorsBar.addEventListener('change', () => persistIndicatorsFromUi());

fillSources();
fillPairs();
fillIntervals();
syncIndicatorUi();
drawings.setContext(sourceId, pairId);

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

declare global {
  interface Window {
    __wykresy: {
      getDrawings: () => ReturnType<DrawingLayer['getDrawings']>;
      getSelectedId: () => string | null;
      getAbcdScreen: () => ReturnType<DrawingLayer['getAbcdScreen']>;
      exportDrawings: () => string;
      importDrawings: (raw: string) => void;
      getIndicatorSettings: () => IndicatorSettings;
      setIndicator: (patch: Partial<IndicatorSettings>) => void;
      getWatchState: () => WatchState;
      applySelection: (sourceId: string, pairId: PairId) => void;
    };
  }
}

window.__wykresy = {
  getDrawings: () => drawings.getDrawings(),
  getSelectedId: () => drawings.getSelectedId(),
  getAbcdScreen: () => drawings.getAbcdScreen(),
  exportDrawings: () => drawings.exportJson(),
  importDrawings: (raw) => drawings.importJson(raw),
  getIndicatorSettings: () => indicatorSettings,
  setIndicator: (patch) => {
    indicatorSettings = { ...indicatorSettings, ...patch };
    saveIndicatorSettings(indicatorSettings);
    syncIndicatorUi();
    applyIndicators();
  },
  getWatchState: () => watchlist.getState(),
  applySelection: (src, pair) => applySelection(src, pair, true),
};

void loadChart();
