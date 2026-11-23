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

const DEFAULT_SOURCE = 'kraken';
const DEFAULT_PAIR: PairId = 'XRPUSD';
const DEFAULT_INTERVAL: IntervalId = '1D';

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
const indicatorsBar = document.querySelector<HTMLDivElement>('#indicators-bar')!;

let sourceId = DEFAULT_SOURCE;
let pairId: PairId = DEFAULT_PAIR;
let intervalId: IntervalId = DEFAULT_INTERVAL;
let loadSeq = 0;
let lastCandles: Candle[] = [];
let indicatorSettings = loadIndicatorSettings();

const chart: IChartApi = createChart(chartEl, {
  autoSize: true,
  layout: {
    background: { type: ColorType.Solid, color: '#131722' },
    textColor: '#d1d4dc',
    fontFamily: 'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  grid: {
    vertLines: { color: '#1e222d' },
    horzLines: { color: '#1e222d' },
  },
  crosshair: { mode: CrosshairMode.Normal },
  rightPriceScale: { borderColor: '#2a2e39' },
  timeScale: {
    borderColor: '#2a2e39',
    timeVisible: true,
    secondsVisible: false,
  },
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
  setOn('bb', s.bb.on);
  setOn('volume', s.volume.on);
  setOn('rsi', s.rsi.on);
  setOn('macd', s.macd.on);
  numInput('[data-ind-period="sma"]', s.sma.period);
  numInput('[data-ind-period="ema"]', s.ema.period);
  numInput('[data-ind-period="bb"]', s.bb.period);
  numInput('[data-ind-std="bb"]', s.bb.std);
  numInput('[data-ind-period="rsi"]', s.rsi.period);
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
    bb: { on: on('bb'), period: num('[data-ind-period="bb"]', d.bb.period), std: num('[data-ind-std="bb"]', d.bb.std) },
    volume: { on: on('volume') },
    rsi: { on: on('rsi'), period: num('[data-ind-period="rsi"]', d.rsi.period) },
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
    lastCandles = candles;

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
    chart.timeScale().fitContent();
    drawings.setContext(src.id, pairId);

    const first = isoDate(candles[0]!.time);
    const last = isoDate(candles[candles.length - 1]!.time);
    const native = pair?.native ?? pairId;
    const aggregated = src.nativeIntervals.includes(intervalId) ? '' : ' · agregacja';
    setStatus(`${src.name} · ${native} · ${intervalId}${aggregated} · ${candles.length} świec · ${first} – ${last}`);
    setReady(true);
    requestAnimationFrame(() => drawings.syncSize());
  } catch (err) {
    if (seq !== loadSeq) return;
    lastCandles = [];
    series.setData([]);
    applyIndicators();
    drawings.setContext(src.id, pairId);
    const message = err instanceof Error ? err.message : String(err);
    setStatus(`Nie udało się pobrać danych z ${src.name}: ${message}`, true);
    setReady(false);
  }
}

sourceEl.addEventListener('change', () => {
  sourceId = sourceEl.value;
  fillPairs();
  void loadChart();
});

pairEl.addEventListener('change', () => {
  pairId = pairEl.value as PairId;
  void loadChart();
});

intervalsEl.addEventListener('click', (ev) => {
  const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-interval]');
  if (!btn) return;
  intervalId = btn.dataset.interval as IntervalId;
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

indicatorsBar.addEventListener('change', () => persistIndicatorsFromUi());

fillSources();
fillPairs();
fillIntervals();
syncIndicatorUi();
drawings.setContext(sourceId, pairId);

declare global {
  interface Window {
    __wykresy: {
      getDrawings: () => ReturnType<DrawingLayer['getDrawings']>;
      getSelectedId: () => string | null;
      getIndicatorSettings: () => IndicatorSettings;
      setIndicator: (patch: Partial<IndicatorSettings>) => void;
    };
  }
}

window.__wykresy = {
  getDrawings: () => drawings.getDrawings(),
  getSelectedId: () => drawings.getSelectedId(),
  getIndicatorSettings: () => indicatorSettings,
  setIndicator: (patch) => {
    indicatorSettings = { ...indicatorSettings, ...patch };
    saveIndicatorSettings(indicatorSettings);
    syncIndicatorUi();
    applyIndicators();
  },
};

void loadChart();
