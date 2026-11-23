import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
} from 'lightweight-charts';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import { DrawingLayer } from './drawings';
import type { Tool } from './drawings';
import { INTERVALS, getSource, sources } from './sources';
import type { IntervalId, PairId } from './sources';

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

let sourceId = DEFAULT_SOURCE;
let pairId: PairId = DEFAULT_PAIR;
let intervalId: IntervalId = DEFAULT_INTERVAL;
let loadSeq = 0;

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
    chart.timeScale().fitContent();
    drawings.setContext(src.id, pairId);

    const first = isoDate(candles[0]!.time);
    const last = isoDate(candles[candles.length - 1]!.time);
    const native = pair?.native ?? pairId;
    const aggregated = src.nativeIntervals.includes(intervalId) ? '' : ' · agregacja';
    setStatus(`${src.name} · ${native} · ${intervalId}${aggregated} · ${candles.length} świec · ${first} – ${last}`);
    setReady(true);
  } catch (err) {
    if (seq !== loadSeq) return;
    series.setData([]);
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

fillSources();
fillPairs();
fillIntervals();
drawings.setContext(sourceId, pairId);

declare global {
  interface Window {
    __wykresy: {
      getDrawings: () => ReturnType<DrawingLayer['getDrawings']>;
      getSelectedId: () => string | null;
    };
  }
}

window.__wykresy = {
  getDrawings: () => drawings.getDrawings(),
  getSelectedId: () => drawings.getSelectedId(),
};

void loadChart();
