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
import { candleSeriesOptions, interactionOptions, isMagnetModifier, themeChartOptions } from './chart-options';
import { getCachedCandles, setCachedCandles } from './candle-cache';
import { ohlcLegendHtml } from './ohlc-legend';
import { DrawingLayer } from './drawings';
import { IndicatorHost } from './indicators/host';
import type { PaneMap } from './indicators/host';
import { createInstance, indicatorStorageKey, loadIndicatorSettings, saveIndicatorSettings } from './indicators/settings';
import { IndicatorHud, initIndicatorModal } from './indicators/ui';
import type { IndicatorInstance, IndicatorKind } from './indicators/types';
import { macd, rsi } from './indicators/math';
import { describeLoadError } from './load-error';
import { INTERVALS, formatPairLabel, getSource, sources } from './sources';
import { lookupSymbol } from './sources/catalog';
import type { Candle, IntervalId, PairId } from './sources';
import { initSymbolSearch } from './symbol-search';
import { initChartMenu } from './chart-menu';
import { initFibDialog } from './fib-dialog';
import { fibExtOptionsOf, fibOptionsOf } from './fib-settings';
import { initBackupUi } from './backup';
import { initTemplatesUi } from './templates';
import { fibExtensionPrice, fibRetracementPrice } from './drawings-math';
import { initToolRail } from './tool-rail';
import { loadLayout, saveLayout } from './layout';
import { MiniChart } from './minichart';
import type { MiniState } from './minichart';
import { alertLabel, checkAlert, createAlert, loadAlerts, notifyAlert, requestAlertPermission, saveAlerts, trendPriceAt } from './alerts';
import type { PriceAlert } from './alerts';
import { KrakenLive, type LiveStatus } from './live/kraken-ws';
import { mergeLiveCandle } from './live/merge';
import { WatchlistPanel } from './watchlist';
import type { WatchState } from './watchlist';
import { EditorHistory } from './history';
import { initShortcuts, parseIntervalInput } from './shortcuts';
import { initComparePanel } from './compare';
import { loadAllSymbols } from './sources/catalog';
import type { SymbolInfo } from './sources/catalog';
import type { Tool } from './drawings-types';
import { formatDate, formatNumber, initLang, localeOf, onLangChange, t } from './i18n';

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
  if (btn) btn.textContent = name === 'light' ? t('toolbar.darkTheme') : t('toolbar.lightTheme');
}


initLang();

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
let editingAlertId: string | null = null;

function renderAlerts(): void {
  if (!alertListEl) return;
  if (!alerts.length) {
    alertListEl.innerHTML = `<p class="watch-empty">${t('alerts.none')}</p>`;
    return;
  }
  alertListEl.innerHTML = alerts
    .map((a) => {
      const src = getSource(a.sourceId);
      const fired = a.enabled ? '' : ' is-fired';
      return `<div class="alert-item${fired}" data-alert-id="${a.id}">
        <span>${alertLabel(a, src?.name ?? a.sourceId)}</span>
        <span class="alert-item-actions">
          <button type="button" data-alert-edit="${a.id}" title="${t('alerts.editTitle')}">${t('alerts.edit')}</button>
          <button type="button" data-alert-del="${a.id}" title="${t('alerts.removeTitle')}">×</button>
        </span>
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

function lineAlertContext(): NonNullable<Parameters<typeof checkAlert>[2]> {
  return {
    lines: drawings.getDrawings().map((d) => ({
      id: d.id,
      type: d.type,
      price: 'price' in d ? d.price : undefined,
      p1: 'p1' in d ? d.p1 : undefined,
      p2: 'p2' in d ? d.p2 : undefined,
    })),
  };
}

function evaluateAlerts(source: string, pair: PairId, last: number): void {
  let changed = false;
  const prev = lastCandles.length >= 2 ? lastCandles[lastCandles.length - 2] : undefined;
  const r = lastCandles.length ? rsi(lastCandles, 14) : [];
  const m = lastCandles.length ? macd(lastCandles, 12, 26, 9) : [];
  const ctx = {
    ...lineAlertContext(),
    time: lastCandles[lastCandles.length - 1]?.time,
    prev: prev?.close,
    prevTime: prev?.time,
    rsi: r.length >= 2 ? { prev: r[r.length - 2]!.value, last: r[r.length - 1]!.value } : undefined,
    macd:
      m.length >= 2
        ? {
            prev: m[m.length - 2]!.macd,
            last: m[m.length - 1]!.macd,
            prevSignal: m[m.length - 2]!.signal,
            lastSignal: m[m.length - 1]!.signal,
          }
        : undefined,
  };
  for (const a of alerts) {
    if (a.sourceId !== source || a.pairId !== pair || !a.enabled) continue;
    if (!checkAlert(a, last, ctx)) continue;
    a.enabled = false;
    changed = true;
    const src = getSource(a.sourceId);
    const label = t('alerts.toast', { label: alertLabel(a, src?.name ?? a.sourceId) });
    showAlertToast(label);
    setStatus(label);
    notifyAlert('OpenCharts alert', label);
  }
  if (changed) {
    saveAlerts(alerts);
    renderAlerts();
  }
}
const loadedIndicators = loadIndicatorSettings(sourceId, pairId);
let indicatorItems = loadedIndicators.items;
let paneStretches = loadedIndicators.panes;
let indicatorScope = `${sourceId}:${pairId}`;
let paneMap: PaneMap = {};
let indicatorHud: IndicatorHud;
let pendingAnchorId: string | null = null;
let pendingVpfr: { id: string; step: 0 | 1 } | null = null;
let watchlist: WatchlistPanel;
let symbolSearch: ReturnType<typeof initSymbolSearch> | undefined;

applyTheme(theme);

const chart: IChartApi = createChart(chartEl, {
  autoSize: true,
  ...themeChartOptions(theme === 'light'),
  ...interactionOptions(),
  localization: { locale: localeOf() },
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

type EditorSnap = {
  drawings: ReturnType<DrawingLayer['getDrawings']>;
  indicators: IndicatorInstance[];
  panes?: number[];
};
const editorHistory = new EditorHistory<EditorSnap>();
let historyReady = false;
let applyingHistory = false;
let comparePanel: ReturnType<typeof initComparePanel> | null = null;
let compareCatalog: SymbolInfo[] = [];

function currentSnap(): EditorSnap {
  return {
    drawings: drawings.getDrawings(),
    indicators: structuredClone(indicatorItems),
    panes: paneStretches ? [...paneStretches] : undefined,
  };
}

function applySnap(snap: EditorSnap): void {
  applyingHistory = true;
  drawings.replaceDrawings(snap.drawings);
  indicatorItems = structuredClone(snap.indicators);
  paneStretches = snap.panes;
  saveIndicatorSettings(indicatorItems, sourceId, pairId, paneStretches);
  applyIndicators();
  applyingHistory = false;
}

function recordHistory(): void {
  if (applyingHistory || !historyReady) return;
  editorHistory.record(currentSnap());
}

function resetHistory(): void {
  editorHistory.reset(currentSnap());
  historyReady = true;
}

function undoEditor(): boolean {
  const snap = editorHistory.undo();
  if (!snap) return false;
  applySnap(snap);
  setStatus(t('status.undo'));
  return true;
}

function redoEditor(): boolean {
  const snap = editorHistory.redo();
  if (!snap) return false;
  applySnap(snap);
  setStatus(t('status.redo'));
  return true;
}

function activateTool(tool: Tool): void {
  drawings.setTool(tool);
  toolRail?.setActive(tool);
  appEl.dataset.tool = tool;
}

function setChartInterval(id: IntervalId): void {
  if (id === intervalId) return;
  intervalId = id;
  persistLayout();
  fillIntervals();
  
function refreshLangChrome(): void {
  applyTheme(theme);
  const liveEl = document.querySelector<HTMLElement>('#live-status');
  const live = (liveEl?.dataset.live ?? appEl.dataset.live ?? 'off') as LiveStatus;
  setLiveStatus(live);
  chart.applyOptions({ localization: { locale: localeOf() } });
  document.querySelectorAll<HTMLOptionElement>('#draw-width option').forEach((opt) => {
    opt.textContent = t('draw.px', { n: opt.value });
  });
  placeDrawBar();
  renderAlerts();
  const submit = alertForm?.querySelector<HTMLButtonElement>('[type="submit"]');
  if (submit) submit.textContent = editingAlertId ? t('alerts.save') : t('alerts.add');
  if (lastCandles.length) {
    const src = currentSource();
    const aggregated = !src.nativeIntervals.includes(intervalId);
    setStatus(describeCandles(src.name, formatPairLabel(sourceId, pairId), lastCandles, aggregated));
  }
}

onLangChange(() => refreshLangChrome());

void loadChart();
}

drawings.setOnPersist(() => recordHistory());
const indicators = new IndicatorHost(chart, series);
indicators.setChartInterval(intervalId);
indicators.setPaneStretches(paneStretches);
const pendingHtf = new Set<string>();
indicators.setOnNeedTimeframe((tf) => {
  void loadHigherTf(tf);
});

async function loadHigherTf(tf: string): Promise<void> {
  if (!INTERVALS.some((row) => row.id === tf) || pendingHtf.has(`${sourceId}:${pairId}:${tf}`)) return;
  const interval = tf as IntervalId;
  const key = `${sourceId}:${pairId}:${interval}`;
  pendingHtf.add(key);
  try {
    const src = currentSource();
    const cached = getCachedCandles(sourceId, pairId, interval);
    if (cached?.length) {
      indicators.setHigherTf(interval, cached);
      applyIndicators();
    }
    const candles = await src.fetchCandles(pairId, interval);
    if (candles.length) {
      setCachedCandles(sourceId, pairId, interval, candles);
      indicators.setHigherTf(interval, candles);
      applyIndicators();
    }
  } catch (err) {
    console.error(err);
  } finally {
    pendingHtf.delete(key);
  }
}
const vpOverlay = document.querySelector<HTMLCanvasElement>('#vp-overlay');
if (vpOverlay) indicators.setOverlay(vpOverlay, wrapEl);
indicators.setOnPaneResize((stretches) => {
  const view = captureChartView();
  if (view.logical && view.barSpacing > 0) lastGoodView = view;
  paneStretches = stretches;
  requestAnimationFrame(() => {
    if (view.logical && view.barSpacing > 0) restoreChartView(view);
    drawings.syncSize();
    indicatorHud?.relayout();
  });
  if (localStorage.getItem(indicatorStorageKey(sourceId, pairId)) == null) return;
  saveIndicatorSettings(indicatorItems, sourceId, pairId, paneStretches);
});

function isoDate(ts: number): string {
  return formatDate(ts);
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

initBackupUi({ setStatus });

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

function selectedAlertSpec(): { kind: PriceAlert['kind']; price: number; direction: PriceAlert['direction']; indicatorKind?: string } | null {
  const type = document.querySelector<HTMLSelectElement>('#alert-kind')?.value ?? 'price';
  if (type === 'rsi-70' || type === 'rsi-30') {
    return { kind: 'indicator', price: type === 'rsi-70' ? 70 : 30, direction: 'cross', indicatorKind: 'rsi' };
  }
  if (type === 'macd-signal') {
    return { kind: 'indicator', price: 0, direction: 'cross', indicatorKind: 'macd' };
  }
  const price = Number(document.querySelector<HTMLInputElement>('#alert-price')?.value);
  const direction = document.querySelector<HTMLSelectElement>('#alert-dir')?.value === 'below' ? 'below' : 'above';
  if (!Number.isFinite(price) || price <= 0) return null;
  return { kind: 'price', price, direction };
}

alertForm?.addEventListener('submit', (ev) => {
  ev.preventDefault();
  requestAlertPermission();
  const spec = selectedAlertSpec();
  if (!spec) return;
  if (editingAlertId) {
    alerts = alerts.map((a) =>
      a.id === editingAlertId
        ? { ...a, price: spec.price, direction: spec.direction, kind: spec.kind, indicatorKind: spec.indicatorKind, enabled: true, drawingId: undefined, p1: undefined, p2: undefined }
        : a,
    );
    editingAlertId = null;
  } else {
    alerts.push(createAlert(sourceId, pairId, spec.price, spec.direction, { kind: spec.kind, indicatorKind: spec.indicatorKind }));
  }
  saveAlerts(alerts);
  renderAlerts();
  const input = document.querySelector<HTMLInputElement>('#alert-price');
  if (input) input.value = '';
  const submit = alertForm.querySelector('button[type="submit"]');
  if (submit) submit.textContent = t('alerts.add');
});

alertListEl?.addEventListener('click', (ev) => {
  const edit = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-alert-edit]');
  if (edit) {
    const id = edit.getAttribute('data-alert-edit');
    const item = alerts.find((a) => a.id === id);
    if (!item) return;
    editingAlertId = item.id;
    const priceEl = document.querySelector<HTMLInputElement>('#alert-price');
    const dirEl = document.querySelector<HTMLSelectElement>('#alert-dir');
    const kindEl = document.querySelector<HTMLSelectElement>('#alert-kind');
    if (priceEl) priceEl.value = String(item.price);
    if (dirEl) dirEl.value = item.direction === 'below' ? 'below' : 'above';
    if (kindEl) {
      kindEl.value =
        item.kind === 'indicator' && item.indicatorKind === 'macd'
          ? 'macd-signal'
          : item.kind === 'indicator' && item.indicatorKind === 'rsi' && item.price === 30
            ? 'rsi-30'
            : item.kind === 'indicator' && item.indicatorKind === 'rsi'
              ? 'rsi-70'
              : 'price';
    }
    const submit = alertForm?.querySelector('button[type="submit"]');
    if (submit) submit.textContent = t('alerts.save');
    priceEl?.focus();
    return;
  }
  const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-alert-del]');
  if (!btn) return;
  const id = btn.getAttribute('data-alert-del');
  alerts = alerts.filter((a) => a.id !== id);
  if (editingAlertId === id) editingAlertId = null;
  saveAlerts(alerts);
  renderAlerts();
});

document.querySelector('#alert-notify-btn')?.addEventListener('click', () => {
  requestAlertPermission();
  setStatus(
    typeof Notification === 'undefined'
      ? t('status.notificationsUnavailable')
      : Notification.permission === 'denied'
        ? t('status.notificationsBlocked')
        : t('status.notificationsEnabled'),
  );
});

renderAlerts();

function visibleKinds(): Set<string> {
  return new Set(indicatorItems.filter((i) => i.visible).map((i) => i.kind));
}

function applyIndicators(): void {
  try {
    indicators.setChartInterval(intervalId);
    indicators.setPaneStretches(paneStretches);
    paneMap = indicators.apply(lastCandles, indicatorItems);
  } catch (err) {
    console.error(err);
    return;
  }
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
  paneStretches = indicators.getPaneStretches();
  saveIndicatorSettings(indicatorItems, sourceId, pairId, paneStretches);
  applyIndicators();
  recordHistory();
}

function syncIndicatorContext(): void {
  const scope = `${sourceId}:${pairId}`;
  if (scope === indicatorScope) return;
  indicatorScope = scope;
  const loaded = loadIndicatorSettings(sourceId, pairId);
  indicatorItems = loaded.items;
  paneStretches = loaded.panes;
  indicators.clearHigherTf();
  indicators.setChartInterval(intervalId);
  indicators.setPaneStretches(paneStretches);
  pendingAnchorId = null;
  pendingVpfr = null;
  applyIndicators();
}

function onIndicatorAdded(item: IndicatorInstance): void {
  if (item.kind === 'vwapAnchor' && item.params.anchor == null) {
    pendingAnchorId = item.id;
    setStatus(t('status.clickVwapAnchor'));
  } else if (item.kind === 'vpfr' && (item.params.anchor == null || item.params.end == null)) {
    pendingVpfr = { id: item.id, step: 0 };
    setStatus(t('status.clickVpfrStart'));
  }
}

type ChartViewSnapshot = {
  logical: { from: number; to: number } | null;
  barSpacing: number;
  rightOffset: number;
  autoScale: boolean;
  price: { from: number; to: number } | null;
};

function captureChartView(): ChartViewSnapshot {
  const logical = chart.timeScale().getVisibleLogicalRange();
  const ts = chart.timeScale().options();
  const scale = series.priceScale();
  return {
    logical: logical ? { from: Number(logical.from), to: Number(logical.to) } : null,
    barSpacing: ts.barSpacing,
    rightOffset: ts.rightOffset,
    autoScale: scale.options().autoScale,
    price: scale.getVisibleRange(),
  };
}

let lastGoodView: ChartViewSnapshot | null = null;
let restoringView = false;

function rememberChartView(): void {
  if (restoringView) return;
  const view = captureChartView();
  if (view.logical && view.barSpacing > 0) lastGoodView = view;
}

function restoreChartView(view: ChartViewSnapshot): void {
  // Keep candle width and the right-edge offset. Restoring the
  // logical range would change the zoom when the wrap width changes.
  restoringView = true;
  chart.timeScale().applyOptions({ barSpacing: view.barSpacing, rightOffset: view.rightOffset });
  if (!view.autoScale && view.price) {
    series.priceScale().setAutoScale(false);
    series.priceScale().setVisibleRange(view.price);
  }
  restoringView = false;
}

function resizeCharts(): void {
  const view = lastGoodView;
  // autoSize already tracks #chart-wrap; a manual chart.resize() fights it and jumps the scale.
  for (const mini of miniCharts) mini?.resize();
  indicatorHud?.setPaneMap(paneMap);
  requestAnimationFrame(() => {
    if (view?.logical && view.barSpacing > 0) restoreChartView(view);
    drawings.syncSize();
    indicatorHud?.relayout();
    for (const mini of miniCharts) mini?.resize();
  });
}

function sidebarIsOn(): boolean {
  return localStorage.getItem(SIDEBAR_KEY) !== 'off';
}

function setSidebar(on: boolean): void {
  const view = captureChartView();
  if (view.logical && view.barSpacing > 0) lastGoodView = view;
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
    el.textContent = status === 'live' ? t('toolbar.live') : status === 'connecting' ? t('toolbar.connecting') : t('toolbar.offline');
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
  return t('status.candles', { source: srcName, pair: pairLabel, interval: intervalId, extra: aggregated ? t('status.aggregated') : '', count: formatNumber(candles.length), first, last });
}

async function loadChart(): Promise<void> {
  const seq = ++loadSeq;
  syncIndicatorContext();
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
    setStatus(t('status.loadingChart', { source: src.name, pair: pairLabel, interval: intervalId }));
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
    resetHistory();
    void comparePanel?.reload();
    requestAnimationFrame(() => drawings.syncSize());
  } catch (err) {
    if (seq !== loadSeq) return;
    if (!cached?.length) {
      applyPriceData([], false);
      drawings.setContext(src.id, pairId);
      setReady(false);
    }
    syncLiveChart();
    setStatus(describeLoadError(sourceId, src.name, err), true);
    setChartLoading('off');
  }
}

sourceEl.addEventListener('change', () => {
  sourceId = sourceEl.value;
  const src = getSource(sourceId);
  if (src && !src.pairs.some((p) => p.id === pairId) && !lookupSymbol(src.id, pairId)) {
    pairId = src.pairs[0]?.id ?? pairId;
  }
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
  if (!btn?.dataset.interval) return;
  setChartInterval(btn.dataset.interval as IntervalId);
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
    setStatus(t('status.drawingImportFailed', { message }), true);
  }
});

function extendSelectedFib(): void {
  const d = drawings.getSelected();
  if (drawings.toggleExtendRight()) {
    const on = d?.type === 'fib' ? (d.fib?.extendLines ?? true) : d?.type === 'fibext' ? (d as { extendRight?: boolean }).extendRight : true;
    setStatus(on ? t('status.fibExtended') : t('status.fibNotExtended'));
    return;
  }
  setStatus(t('status.selectFibExtend'));
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
  onAdd: (src, pair) => {
    const added = watchlist.addItem(src, pair);
    const label = formatPairLabel(src, pair);
    setStatus(added ? t('status.addedWatch', { name: label }) : t('status.alreadyWatch', { name: label }));
  },
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
  () => symbolSearch?.open('', 'add'),
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
    onAdded: onIndicatorAdded,
  },
  document.querySelector('#ind-labels')!,
  document.querySelector('#ind-btn')!,
);

setSidebar(sidebarIsOn());
document.querySelector('#sidebar-btn')?.addEventListener('click', () => setSidebar(!sidebarIsOn()));
window.addEventListener('resize', () => resizeCharts());

chart.timeScale().subscribeVisibleLogicalRangeChange(() => rememberChartView());
chart.timeScale().subscribeVisibleTimeRangeChange((range) => {
  if (!range) return;
  const from = typeof range.from === 'number' ? range.from : Number(range.from);
  const to = typeof range.to === 'number' ? range.to : Number(range.to);
  if (Number.isFinite(from) && Number.isFinite(to)) {
    indicators.setVisibleTimeRange(from, to);
    comparePanel?.setVisibleFrom(from);
  }
});

chart.subscribeClick((param) => {
  const time = typeof param.time === 'number' ? param.time : null;
  if (time === null) return;
  if (pendingAnchorId) {
    const id = pendingAnchorId;
    pendingAnchorId = null;
    indicatorItems = indicatorItems.map((item) =>
      item.id === id ? { ...item, params: { ...item.params, anchor: time } } : item,
    );
    persistIndicators(indicatorItems);
    setStatus(t('status.vwapSet'));
    return;
  }
  if (pendingVpfr) {
    const { id, step } = pendingVpfr;
    if (step === 0) {
      indicatorItems = indicatorItems.map((item) =>
        item.id === id ? { ...item, params: { ...item.params, anchor: time } } : item,
      );
      pendingVpfr = { id, step: 1 };
      persistIndicators(indicatorItems);
      setStatus(t('status.clickVpfrEnd'));
      return;
    }
    pendingVpfr = null;
    indicatorItems = indicatorItems.map((item) =>
      item.id === id ? { ...item, params: { ...item.params, end: time } } : item,
    );
    persistIndicators(indicatorItems);
    setStatus(t('status.vpfrSet'));
  }
});



declare global {
  interface Window {
    __opencharts: {
      getDrawings: () => ReturnType<DrawingLayer['getDrawings']>;
      getSelectedId: () => string | null;
      fibLevelPrice: (k: number) => number | null;
      fibExtensionLevelPrice: (k: number) => number | null;
      getAbcdScreen: () => ReturnType<DrawingLayer['getAbcdScreen']>;
      exportDrawings: () => string;
      importDrawings: (raw: string) => void;
      getIndicators: () => IndicatorInstance[];
      undo: () => boolean;
      redo: () => boolean;
      getInterval: () => IntervalId;
      getTool: () => Tool;
      getAlerts: () => PriceAlert[];
      lastApplyInfo: () => { mode: 'full' | 'patch'; ms: number };
      requestFullApply: () => void;
      tickLastCandle: () => void;
      seedIndicators: (kinds: string[]) => void;
      parseInterval: (raw: string) => IntervalId | null;
      checkAlert: typeof checkAlert;
      trendPriceAt: typeof trendPriceAt;
      getWatchState: () => WatchState;
      applySelection: (sourceId: string, pairId: PairId) => void;
      getVisibleLogicalRange: () => { from: number; to: number } | null;
      getCandles: () => { time: number; open: number; high: number; low: number; close: number }[];
      timePriceToPage: (time: number, price: number) => { x: number; y: number } | null;
      handlePage: (handle: string, drawingId?: string | null) => { x: number; y: number } | null;
      getPriceRange: () => { from: number; to: number } | null;
      getBarSpacing: () => number;
      getCrosshair: () => { time: number; price: number } | null;
      priceToCoordinate: (price: number) => number | null;
    };
  }
}

let openFibSettings: () => void = () => {};

let lastCrosshair: { time: number; price: number } | null = null;
chart.subscribeCrosshairMove((param) => {
  if (param.time === undefined || !param.point) {
    lastCrosshair = null;
    return;
  }
  const driven = drawings.getDrivenCrosshair();
  const price = driven?.price ?? series.coordinateToPrice(param.point.y);
  lastCrosshair = price === null ? null : { time: param.time as number, price };
});

window.__opencharts = {
  getDrawings: () => drawings.getDrawings(),
  getSelectedId: () => drawings.getSelectedId(),
  fibLevelPrice: (k) => {
    const list = drawings.getDrawings();
    const selected = drawings.getSelected();
    const d = selected?.type === 'fib' ? selected : list.find((x) => x.type === 'fib');
    if (!d || d.type !== 'fib') return null;
    return fibRetracementPrice(d.p1, d.p2, k, fibOptionsOf(d).reverse);
  },
  fibExtensionLevelPrice: (k) => {
    const list = drawings.getDrawings();
    const selected = drawings.getSelected();
    const d = selected?.type === 'fibext' ? selected : list.find((x) => x.type === 'fibext');
    if (!d || d.type !== 'fibext') return null;
    return fibExtensionPrice(d.a, d.b, d.c, k, fibExtOptionsOf(d).reverse);
  },
  getAbcdScreen: () => drawings.getAbcdScreen(),
  exportDrawings: () => drawings.exportJson(),
  importDrawings: (raw) => drawings.importJson(raw),
  getIndicators: () => indicatorItems,
  undo: () => undoEditor(),
  redo: () => redoEditor(),
  getInterval: () => intervalId,
  getTool: () => drawings.getTool(),
  getAlerts: () => alerts,
  lastApplyInfo: () => indicators.lastApplyInfo(),
  requestFullApply: () => indicators.requestFullApply(),
  tickLastCandle: () => {
    const last = lastCandles[lastCandles.length - 1];
    if (!last) return;
    const next = { ...last, close: last.close * 1.0001, high: Math.max(last.high, last.close * 1.0001) };
    lastCandles = [...lastCandles.slice(0, -1), next];
    applyIndicators();
  },
  seedIndicators: (kinds) => {
    persistIndicators(kinds.map((k) => createInstance(k as IndicatorKind)));
  },
  parseInterval: (raw) => parseIntervalInput(raw),
  checkAlert,
  trendPriceAt,
  getWatchState: () => watchlist.getState(),
  applySelection: (src, pair) => applySelection(src, pair, true),
  getVisibleLogicalRange: () => {
    const range = chart.timeScale().getVisibleLogicalRange();
    return range ? { from: range.from, to: range.to } : null;
  },
  getCandles: () => lastCandles.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })),
  timePriceToPage: (time, price) => {
    const x = chart.timeScale().timeToCoordinate(time as import('lightweight-charts').Time);
    const y = series.priceToCoordinate(price);
    if (x === null || y === null) return null;
    const rect = wrapEl.getBoundingClientRect();
    return { x: rect.left + x, y: rect.top + y };
  },
  handlePage: (handle, drawingId) => drawings.handlePage(handle, drawingId),
  getPriceRange: () => series.priceScale().getVisibleRange(),
  getBarSpacing: () => chart.timeScale().options().barSpacing,
  getCrosshair: () => {
    const driven = drawings.getDrivenCrosshair();
    if (driven) return driven;
    return lastCrosshair;
  },
  priceToCoordinate: (price) => drawings.priceToCoordinate(price),
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
      setStatus(t('status.chartReset'));
    },
    copyPrice: (price) => {
      const text = String(price);
      void navigator.clipboard?.writeText(text).then(
        () => setStatus(t('status.copiedPrice', { price: text })),
        () => setStatus(t('status.couldNotCopy', { price: text }), true),
      );
    },
    addAlert: (price) => {
      requestAlertPermission();
      const selected = drawings.getSelected();
      const last = lastCandles[lastCandles.length - 1]?.close;
      if (selected?.type === 'hline') {
        alerts.push(createAlert(sourceId, pairId, selected.price, 'cross', { kind: 'hline', drawingId: selected.id }));
        setStatus(t('status.alertHline', { price: selected.price }));
      } else if (selected?.type === 'trend') {
        alerts.push(
          createAlert(sourceId, pairId, selected.p2.price, 'cross', {
            kind: 'trend',
            drawingId: selected.id,
            p1: selected.p1,
            p2: selected.p2,
          }),
        );
        setStatus(t('status.alertTrend'));
      } else {
        const direction = last !== undefined && price < last ? 'below' : 'above';
        alerts.push(createAlert(sourceId, pairId, price, direction));
        setStatus(t('status.alertAt', { price }));
      }
      saveAlerts(alerts);
      renderAlerts();
    },
    alertMenuLabel: (price) => {
      const selected = drawings.getSelected();
      if (selected?.type === 'hline') return `Add alert on horizontal line (${selected.price})`;
      if (selected?.type === 'trend') return 'Add alert on trend line';
      if (price === null) return 'Add alert';
      const label = Math.abs(price) >= 1000 ? price.toFixed(2) : Math.abs(price) >= 1 ? price.toFixed(4) : price.toFixed(6);
      return `Add alert at ${label}`;
    },
    clearDrawings: () => {
      drawings.clearAll();
      setStatus(t('status.removedAll'));
    },
    exportDrawings: () => exportDrawingsFile(),
    importDrawings: () => importFile.click(),
    extendFib: () => extendSelectedFib(),
    canOpenSettings: () => {
      const t = drawings.getSelected()?.type;
      return t === 'fib' || t === 'fibext';
    },
    openSettings: () => openFibSettings(),
    canRemove: () => drawings.getSelected() !== null,
    removeDrawing: () => {
      if (drawings.deleteSelected()) setStatus(t('status.removedDrawing'));
    },
    watchlistLabel: () => formatPairLabel(sourceId, pairId),
    isOnWatchlist: () => watchlist.hasItem(sourceId, pairId),
    toggleWatchlist: () => {
      const label = formatPairLabel(sourceId, pairId);
      if (watchlist.hasItem(sourceId, pairId)) {
        watchlist.removeItem(sourceId, pairId);
        setStatus(t('status.removedWatch', { name: label }));
      } else {
        watchlist.addItem(sourceId, pairId);
        setStatus(t('status.addedWatch', { name: label }));
      }
    },
  },
);


type CursorModeState = CursorMode;

function loadCursorMode(): CursorMode {
  const v = localStorage.getItem(CURSOR_MODE_KEY);
  return v === 'dot' || v === 'arrow' || v === 'cross' ? v : 'cross';
}

let cursorMode: CursorMode = loadCursorMode();
let magnetOn = localStorage.getItem(MAGNET_KEY) === 'on';
let magnetModifierHeld = false;

const cursorDot = document.querySelector<HTMLElement>('#cursor-dot');
const drawBar = document.querySelector<HTMLElement>('#draw-bar');
const drawColor = document.querySelector<HTMLInputElement>('#draw-color');
const drawWidth = document.querySelector<HTMLSelectElement>('#draw-width');
const drawLineStyle = document.querySelector<HTMLSelectElement>('#draw-linestyle');
const drawLock = document.querySelector<HTMLButtonElement>('#draw-lock');
const drawSettings = document.querySelector<HTMLButtonElement>('#draw-settings');
const drawDelete = document.querySelector<HTMLButtonElement>('#draw-delete');

function applyCursorAppearance(): void {
  const light = theme === 'light';
  const line = light ? 'rgba(19, 23, 34, 0.45)' : 'rgba(209, 212, 220, 0.45)';
  const labelBg = light ? '#4c525e' : '#2a2e39';
  const magnetActive = magnetModifierHeld ? !magnetOn : magnetOn;
  const magnetMode = magnetActive ? CrosshairMode.MagnetOHLC : CrosshairMode.Normal;
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

function syncMagnetModifier(ev: Event): void {
  const held = ev instanceof KeyboardEvent ? isMagnetModifier(ev) : false;
  if (held === magnetModifierHeld) return;
  magnetModifierHeld = held;
  applyCursorAppearance();
}

window.addEventListener('keydown', syncMagnetModifier);
window.addEventListener('keyup', syncMagnetModifier);
window.addEventListener('blur', syncMagnetModifier);
wrapEl.addEventListener('mousedown', (ev) => {
  if (isMagnetModifier(ev)) ev.preventDefault();
});

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
  if (drawLock) {
    const locked = Boolean(d.style?.locked);
    drawLock.textContent = locked ? t('draw.unlock') : t('draw.lock');
    drawLock.title = drawLock.textContent;
  }
  if (drawSettings) drawSettings.hidden = d.type !== 'fib' && d.type !== 'fibext';
  drawBar.style.left = '8px';
  drawBar.style.top = '8px';
  drawBar.style.right = 'auto';
  drawBar.style.transform = 'none';
}

function activateCursorTool(): void {
  drawings.setTool('cursor');
  toolRail?.setActive('cursor');
  appEl.dataset.tool = 'cursor';
}

drawings.setOnToolDone(() => activateCursorTool());
drawings.setOnSelect(() => placeDrawBar());

const fibDialog = initFibDialog(document.querySelector('#fib-modal')!, {
  apply: (opts, persist) => {
    drawings.applyFibOptions(opts, persist);
  },
  onStatus: (text) => setStatus(text),
});

openFibSettings = (): void => {
  const d = drawings.getSelected();
  if (d?.type === 'fib') {
    fibDialog.open(fibOptionsOf(d), 'fib');
    return;
  }
  if (d?.type === 'fibext') {
    fibDialog.open(fibExtOptionsOf(d), 'fibext');
    return;
  }
  setStatus(t('status.selectFibSettings'));
};

drawings.setOnEdit((d) => {
  if (d.type === 'fib') fibDialog.open(fibOptionsOf(d), 'fib');
  else if (d.type === 'fibext') fibDialog.open(fibExtOptionsOf(d), 'fibext');
});

toolRail = initToolRail({
  rail: document.querySelector('#tool-rail')!,
  flyout: document.querySelector('#rail-flyout')!,
  favBar: document.querySelector('#fav-bar')!,
  onTool: (tool) => {
    activateTool(tool);
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
    if (window.confirm(t('menu.confirmRemoveAll'))) {
      drawings.clearAll();
      setStatus(t('status.removedAll'));
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
drawSettings?.addEventListener('click', () => openFibSettings());
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

const intervalHint = document.querySelector<HTMLElement>('#interval-hint');
if (intervalHint) {
  initShortcuts({
    hint: intervalHint,
    setTool: (tool) => activateTool(tool),
    undo: () => undoEditor(),
    redo: () => redoEditor(),
    applyInterval: (id) => {
      setChartInterval(id);
      setStatus(t('status.interval', { id }));
    },
  });
}

void loadAllSymbols().then((loaded) => {
  compareCatalog = loaded.items;
});
const compareBtn = document.querySelector<HTMLElement>('#compare-btn');
const comparePop = document.querySelector<HTMLElement>('#compare-pop');
const compareSearch = document.querySelector<HTMLInputElement>('#compare-search');
const compareResults = document.querySelector<HTMLElement>('#compare-results');
const compareList = document.querySelector<HTMLElement>('#compare-list');
const compareLegend = document.querySelector<HTMLElement>('#compare-legend');
if (compareBtn && comparePop && compareSearch && compareResults && compareList && compareLegend) {
  comparePanel = initComparePanel({
    btn: compareBtn,
    pop: comparePop,
    search: compareSearch,
    results: compareResults,
    list: compareList,
    legend: compareLegend,
    chart,
    getContext: () => ({ sourceId, pairId, intervalId }),
    getCatalog: () => compareCatalog,
  });
}


initTemplatesUi({
  getIndicators: () => indicatorItems,
  getPanes: () => paneStretches,
  applyIndicators: (items, panes) => {
    if (panes) paneStretches = panes;
    persistIndicators(items);
  },
  getLineStyle: () => drawings.getDefaultStyle(),
  setLineStyle: (style) => drawings.setDefaultStyle(style),
  setStatus,
});

void loadChart();

async function checkFreshBuild(): Promise<void> {
  if (!import.meta.env.PROD) return;
  try {
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const info = (await res.json()) as { js?: string };
    const current = document.querySelector<HTMLScriptElement>('script[src*="assets/index-"]')?.getAttribute('src') ?? '';
    if (!info.js || current.includes(info.js)) return;
    const key = 'opencharts:reloaded-build';
    if (sessionStorage.getItem(key) === info.js) return;
    sessionStorage.setItem(key, info.js);
    location.reload();
  } catch {
    /* offline or old host without version.json */
  }
}

void checkFreshBuild();
