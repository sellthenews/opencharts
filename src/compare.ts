// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { LineSeries } from 'lightweight-charts';
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import type { Candle, IntervalId, PairId } from './sources';
import { formatPairLabel, getSource } from './sources';
import { searchSymbols } from './sources/catalog';
import type { SymbolInfo } from './sources/catalog';
import { getCachedCandles, setCachedCandles } from './candle-cache';

export const COMPARE_KEY = 'opencharts:compare';
export const COMPARE_COLORS = ['#42a5f5', '#ab47bc', '#ff7043', '#26c6da', '#9ccc65', '#ec407a', '#ffa726', '#26a69a'];

export interface CompareItem {
  sourceId: string;
  pairId: PairId;
  color: string;
}

export function loadCompare(): CompareItem[] {
  try {
    const raw = localStorage.getItem(COMPARE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => x && typeof x.sourceId === 'string' && typeof x.pairId === 'string') as CompareItem[];
  } catch {
    return [];
  }
}

export function saveCompare(items: CompareItem[]): void {
  localStorage.setItem(COMPARE_KEY, JSON.stringify(items));
}

export function nextCompareColor(items: CompareItem[]): string {
  const used = new Set(items.map((i) => i.color));
  return COMPARE_COLORS.find((c) => !used.has(c)) ?? COMPARE_COLORS[items.length % COMPARE_COLORS.length]!;
}

export function toPercentSeries(candles: Candle[], fromTime: number): { time: UTCTimestamp; value: number }[] {
  const first = candles.find((c) => c.time >= fromTime) ?? candles[0];
  if (!first || !first.close) return [];
  const ref = first.close;
  return candles
    .filter((c) => c.time >= first.time)
    .map((c) => ({ time: c.time as UTCTimestamp, value: ((c.close / ref) - 1) * 100 }));
}

export async function fetchCompareCandles(sourceId: string, pairId: PairId, intervalId: IntervalId): Promise<Candle[]> {
  const cached = getCachedCandles(sourceId, pairId, intervalId);
  if (cached?.length) return cached;
  const src = getSource(sourceId);
  if (!src) return [];
  const candles = await src.fetchCandles(pairId, intervalId);
  if (candles.length) setCachedCandles(sourceId, pairId, intervalId, candles);
  return candles;
}

export class CompareOverlay {
  private series = new Map<string, ISeriesApi<'Line'>>();
  private data = new Map<string, Candle[]>();
  private items: CompareItem[] = [];
  private from = 0;

  constructor(
    private readonly chart: IChartApi,
    private readonly legend: HTMLElement,
  ) {}

  keyOf(item: CompareItem): string {
    return `${item.sourceId}:${item.pairId}`;
  }

  setItems(items: CompareItem[]): void {
    this.items = items;
    const keep = new Set(items.map((i) => this.keyOf(i)));
    for (const [key, s] of this.series) {
      if (keep.has(key)) continue;
      this.chart.removeSeries(s);
      this.series.delete(key);
      this.data.delete(key);
    }
    for (const item of items) {
      const key = this.keyOf(item);
      if (this.series.has(key)) {
        this.series.get(key)!.applyOptions({ color: item.color });
        continue;
      }
      const s = this.chart.addSeries(LineSeries, {
        color: item.color,
        lineWidth: 2,
        priceScaleId: 'left',
        lastValueVisible: true,
        priceLineVisible: false,
        title: formatPairLabel(item.sourceId, item.pairId),
        priceFormat: { type: 'percent', precision: 2, minMove: 0.01 },
      });
      this.series.set(key, s);
    }
    this.chart.priceScale('left').applyOptions({
      visible: items.length > 0,
      borderVisible: false,
      scaleMargins: { top: 0.05, bottom: 0.08 },
    });
    this.paint();
  }

  setCandles(item: CompareItem, candles: Candle[]): void {
    this.data.set(this.keyOf(item), candles);
    this.paint();
  }

  setVisibleFrom(from: number): void {
    if (from === this.from) {
      this.renderLegend();
      return;
    }
    this.from = from;
    this.paint();
  }

  private paint(): void {
    for (const item of this.items) {
      const key = this.keyOf(item);
      const s = this.series.get(key);
      const candles = this.data.get(key);
      if (!s) continue;
      s.setData(candles?.length ? toPercentSeries(candles, this.from) : []);
    }
    this.renderLegend();
  }

  lastPct(item: CompareItem): number | null {
    const candles = this.data.get(this.keyOf(item));
    if (!candles?.length) return null;
    const pts = toPercentSeries(candles, this.from);
    const last = pts[pts.length - 1];
    return last ? last.value : null;
  }

  private renderLegend(): void {
    if (!this.items.length) {
      this.legend.hidden = true;
      this.legend.innerHTML = '';
      return;
    }
    this.legend.hidden = false;
    this.legend.innerHTML = this.items
      .map((item) => {
        const pct = this.lastPct(item);
        const text = pct === null ? '…' : `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
        const label = formatPairLabel(item.sourceId, item.pairId);
        return `<span class="compare-leg-item" data-compare-key="${this.keyOf(item)}">
          <i style="background:${item.color}"></i>${label} ${text}
          <button type="button" data-compare-remove="${this.keyOf(item)}" title="Remove" aria-label="Remove ${label}">×</button>
        </span>`;
      })
      .join('');
  }
}

export function filterCompareResults(query: string, catalog: SymbolInfo[], current: { sourceId: string; pairId: string }, already: CompareItem[]): SymbolInfo[] {
  const taken = new Set(already.map((i) => `${i.sourceId}:${i.pairId}`));
  taken.add(`${current.sourceId}:${current.pairId}`);
  const hits = searchSymbols(query, 'all', catalog, 12);
  return hits.filter((s) => !taken.has(`${s.sourceId}:${s.id}`));
}

export function initComparePanel(opts: {
  btn: HTMLElement;
  pop: HTMLElement;
  search: HTMLInputElement;
  results: HTMLElement;
  list: HTMLElement;
  legend: HTMLElement;
  chart: IChartApi;
  getContext: () => { sourceId: string; pairId: PairId; intervalId: IntervalId };
  getCatalog: () => SymbolInfo[];
}): {
  overlay: CompareOverlay;
  reload: () => Promise<void>;
  setVisibleFrom: (from: number) => void;
  getItems: () => CompareItem[];
} {
  const overlay = new CompareOverlay(opts.chart, opts.legend);
  let items = loadCompare();

  function persist(): void {
    saveCompare(items);
    overlay.setItems(items);
    renderList();
    void reload();
  }

  function renderList(): void {
    opts.btn.classList.toggle('is-on', items.length > 0);
    opts.list.innerHTML = items
      .map((item) => {
        const label = formatPairLabel(item.sourceId, item.pairId);
        return `<div class="compare-list-row">
          <span class="compare-swatch" style="background:${item.color}"></span>
          <span>${label}</span>
          <button type="button" data-compare-remove="${item.sourceId}:${item.pairId}" title="Remove" aria-label="Remove ${label}">×</button>
        </div>`;
      })
      .join('');
  }

  function renderResults(): void {
    const ctx = opts.getContext();
    const taken = new Set(items.map((i) => `${i.sourceId}:${i.pairId}`));
    taken.add(`${ctx.sourceId}:${ctx.pairId}`);
    const catalog = opts.getCatalog();
    const listed = getSource(ctx.sourceId)?.pairs.map((p) => ({
      sourceId: ctx.sourceId,
      id: p.id,
      label: p.label,
    })) ?? [];
    const hits = filterCompareResults(opts.search.value, catalog, ctx, items);
    const seen = new Set(hits.map((s) => `${s.sourceId}:${s.id}`));
    const extras = listed.filter((p) => !taken.has(`${p.sourceId}:${p.id}`) && !seen.has(`${p.sourceId}:${p.id}`) && (!opts.search.value.trim() || `${p.id} ${p.label}`.toLowerCase().includes(opts.search.value.trim().toLowerCase())));
    const rows = [
      ...extras.map((p) => ({ sourceId: p.sourceId, id: p.id, title: `${p.label} · ${p.sourceId}` })),
      ...hits.map((s) => ({ sourceId: s.sourceId, id: s.id, title: `${formatPairLabel(s.sourceId, s.id)} · ${s.sourceId}` })),
    ];
    opts.results.innerHTML = rows
      .map((s) => `<button type="button" data-compare-add="${s.sourceId}:${s.id}">${s.title}</button>`)
      .join('');
  }

  function add(sourceId: string, pairId: string): void {
    const ctx = opts.getContext();
    if (sourceId === ctx.sourceId && pairId === ctx.pairId) return;
    if (items.some((i) => i.sourceId === sourceId && i.pairId === pairId)) return;
    items = [...items, { sourceId, pairId, color: nextCompareColor(items) }];
    persist();
    renderResults();
  }

  function remove(key: string): void {
    items = items.filter((i) => `${i.sourceId}:${i.pairId}` !== key);
    persist();
    renderResults();
  }

  async function reload(): Promise<void> {
    const { intervalId } = opts.getContext();
    overlay.setItems(items);
    await Promise.all(
      items.map(async (item) => {
        const candles = await fetchCompareCandles(item.sourceId, item.pairId, intervalId);
        overlay.setCandles(item, candles);
      }),
    );
  }

  opts.btn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const open = opts.pop.hidden;
    opts.pop.hidden = !open;
    opts.btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      renderResults();
      opts.search.focus();
    }
  });
  opts.search.addEventListener('input', () => renderResults());
  opts.results.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLElement>('[data-compare-add]');
    if (!btn) return;
    const [sourceId, pairId] = (btn.getAttribute('data-compare-add') ?? '').split(':');
    if (sourceId && pairId) add(sourceId, pairId);
  });
  const onRemove = (ev: Event) => {
    const btn = (ev.target as HTMLElement).closest<HTMLElement>('[data-compare-remove]');
    if (!btn) return;
    ev.preventDefault();
    ev.stopPropagation();
    const key = btn.getAttribute('data-compare-remove');
    if (key) remove(key);
  };
  opts.list.addEventListener('click', onRemove);
  opts.legend.addEventListener('click', onRemove);
  document.addEventListener('mousedown', (ev) => {
    if (opts.pop.hidden) return;
    const t = ev.target as Node;
    if (opts.pop.contains(t) || opts.btn.contains(t)) return;
    opts.pop.hidden = true;
    opts.btn.setAttribute('aria-expanded', 'false');
  });

  renderList();
  overlay.setItems(items);
  return {
    overlay,
    reload,
    setVisibleFrom: (from) => overlay.setVisibleFrom(from),
    getItems: () => items,
  };
}
