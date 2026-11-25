// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { onLangChange, t } from './i18n';

import { STOCKS_PROXY_UNCONFIGURED, getStocksProxyUrl } from './config';
import {
  type CategoryFilter,
  type SourceFilter,
  type SymbolInfo,
  formatPairLabel,
  loadAllSymbols,
  searchSymbols,
  symbolFromYahooQuote,
} from './sources/catalog';
import { searchYahooQuotes } from './sources/yahoo';
import { searchDexSymbols } from './sources/dex';
import { loadDexNetworkId } from './sources/dex-networks';
import { sources } from './sources';

const SOURCE_NAME: Record<string, string> = Object.fromEntries(sources.map((s) => [s.id, s.name]));

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isTextField(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return Boolean(el.closest('input, textarea, select, [contenteditable="true"]'));
}

export function initSymbolSearch(opts: {
  modal: HTMLElement;
  input: HTMLInputElement;
  results: HTMLElement;
  filters: HTMLElement;
  pairBtn: HTMLButtonElement;
  closeBtn: HTMLButtonElement;
  onSelect: (sourceId: string, pairId: string) => void;
  onAdd?: (sourceId: string, pairId: string) => void;
}): { open: (query?: string, mode?: 'chart' | 'add') => void; close: () => void; setCurrent: (sourceId: string, pairId: string) => void; ready: Promise<void> } {
  let items: SymbolInfo[] = [];
  let filter: SourceFilter = 'all';
  let category: CategoryFilter = 'all';
  let active = 0;
  let visible: SymbolInfo[] = [];
  let current = { sourceId: 'kraken', pairId: 'XRPUSD' };
  let open = false;
  let mode: 'chart' | 'add' = 'chart';

  function setCurrent(sourceId: string, pairId: string): void {
    current = { sourceId, pairId };
    opts.pairBtn.textContent = formatPairLabel(sourceId, pairId);
    opts.pairBtn.title = `${formatPairLabel(sourceId, pairId)} · ${SOURCE_NAME[sourceId] ?? sourceId}`;
  }

  const ready = loadAllSymbols().then((loaded) => {
    items = loaded.items;
    if (open) render();
  });

  function close(): void {
    if (!open) return;
    open = false;
    mode = 'chart';
    opts.modal.hidden = true;
    const title = opts.modal.querySelector('#sym-modal-title');
    if (title) title.textContent = t('sym.title');
  }

  function moveActive(delta: number): void {
    if (!visible.length) return;
    active = (active + delta + visible.length) % visible.length;
    paintActive();
    visibleRow(active)?.scrollIntoView({ block: 'nearest' });
  }

  function visibleRow(index: number): HTMLElement | null {
    return opts.results.querySelectorAll<HTMLElement>('[data-sym-index]')[index] ?? null;
  }

  function paintActive(): void {
    opts.results.querySelectorAll<HTMLElement>('[data-sym-index]').forEach((el, i) => {
      el.classList.toggle('is-active', i === active);
    });
  }

  function choose(index = active): void {
    const item = visible[index];
    if (!item) return;
    const add = mode === 'add';
    close();
    if (add && opts.onAdd) opts.onAdd(item.sourceId, item.id);
    else opts.onSelect(item.sourceId, item.id);
  }

  let yahooHits: SymbolInfo[] = [];
  let yahooTimer: ReturnType<typeof setTimeout> | undefined;
  let yahooAbort: AbortController | null = null;
  let yahooFor = '';
  let dexHits: SymbolInfo[] = [];
  let dexTimer: ReturnType<typeof setTimeout> | undefined;
  let dexAbort: AbortController | null = null;
  let dexFor = '';

  function needsProxyHint(): boolean {
    return !getStocksProxyUrl() && (category === 'stocks' || filter === 'yahoo');
  }

  function yahooSearchEnabled(): boolean {
    if (!getStocksProxyUrl()) return false;
    if (category !== 'stocks' && filter !== 'yahoo') return false;
    return opts.input.value.trim().length >= 1;
  }

  function mergeHits(local: SymbolInfo[], remote: SymbolInfo[]): SymbolInfo[] {
    const seen = new Set(local.map((s) => `${s.sourceId}:${s.id.toLowerCase()}`));
    const extra: SymbolInfo[] = [];
    for (const item of remote) {
      const key = `${item.sourceId}:${item.id.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      extra.push(item);
    }
    return [...local, ...extra].slice(0, 100);
  }

  function scheduleYahooSearch(): void {
    if (yahooTimer !== undefined) clearTimeout(yahooTimer);
    yahooAbort?.abort();
    yahooAbort = null;
    if (!yahooSearchEnabled()) {
      yahooHits = [];
      yahooFor = '';
      return;
    }
    const q = opts.input.value.trim();
    yahooTimer = setTimeout(() => {
      void runYahooSearch(q);
    }, 300);
  }

  async function runYahooSearch(q: string): Promise<void> {
    yahooAbort?.abort();
    const ac = new AbortController();
    yahooAbort = ac;
    try {
      const quotes = await searchYahooQuotes(q);
      if (ac.signal.aborted) return;
      yahooHits = quotes
        .filter((row) => row.symbol)
        .map((row) => symbolFromYahooQuote(row.symbol!, row.shortname || row.longname));
      yahooFor = q;
      if (open && opts.input.value.trim() === q) renderResults();
    } catch {
      if (ac.signal.aborted) return;
      yahooHits = [];
      yahooFor = q;
      if (open && opts.input.value.trim() === q) renderResults();
    }
  }


  function dexSearchEnabled(): boolean {
    if (category === 'stocks') return false;
    return filter === 'dex' || filter === 'all';
  }

  function scheduleDexSearch(): void {
    if (dexTimer !== undefined) clearTimeout(dexTimer);
    dexAbort?.abort();
    dexAbort = null;
    if (!dexSearchEnabled()) {
      dexHits = [];
      dexFor = '';
      return;
    }
    const q = opts.input.value.trim();
    dexTimer = setTimeout(() => {
      void runDexSearch(q);
    }, 250);
  }

  async function runDexSearch(q: string): Promise<void> {
    dexAbort?.abort();
    const ac = new AbortController();
    dexAbort = ac;
    try {
      const networkId = loadDexNetworkId();
      const refs = await searchDexSymbols(networkId, q);
      if (ac.signal.aborted) return;
      dexHits = refs.map((ref) => ({
        sourceId: 'dex',
        id: ref.id,
        native: ref.native,
        base: ref.base,
        quote: ref.quote,
        label: ref.label,
        kind: 'crypto' as const,
        search: `${ref.label} ${ref.id} ${ref.native} ${ref.base} ${ref.quote} ${ref.networkId}`.toLowerCase(),
        name: ref.networkId,
      }));
      dexFor = q;
    } catch {
      if (ac.signal.aborted) return;
      dexHits = [];
      dexFor = q;
    }
    if (open && opts.input.value.trim() === q) renderResults();
  }

  function render(): void {
    if (!yahooSearchEnabled()) {
      yahooHits = [];
      yahooFor = '';
    }
    renderResults();
    scheduleYahooSearch();
    scheduleDexSearch();
  }

  function renderResults(): void {
    const local = searchSymbols(opts.input.value, filter, items, 100, category);
    const remoteYahoo = yahooFor === opts.input.value.trim() ? yahooHits : [];
    const remoteDex = dexFor === opts.input.value.trim() ? dexHits : [];
    visible = mergeHits(local, [...remoteYahoo, ...remoteDex]);
    if (active >= visible.length) active = 0;
    const banner = needsProxyHint() ? `<p class="sym-banner" role="status">${STOCKS_PROXY_UNCONFIGURED}</p>` : '';
    if (!visible.length) {
      opts.results.innerHTML = `${banner}<p class="sym-empty">${items.length ? 'No results.' : 'Loading pairs…'}</p>`;
      return;
    }
    opts.results.innerHTML =
      banner +
      visible
        .map((item, i) => {
          const currentCls = item.sourceId === current.sourceId && item.id === current.pairId ? ' is-current' : '';
          const activeCls = i === active ? ' is-active' : '';
          const sourceLabel =
            item.sourceId === 'yahoo'
              ? 'Yahoo'
              : item.sourceId === 'dex'
                ? `DEX · ${item.name ?? loadDexNetworkId()}`
                : (SOURCE_NAME[item.sourceId] ?? item.sourceId);
          const name = item.name ? `<span class="sym-name">${escapeHtml(item.name)}</span>` : '';
          return `<button type="button" class="sym-row${currentCls}${activeCls}" data-sym-index="${i}">
          <span class="sym-label">${escapeHtml(item.label)}${name}</span>
          <span class="sym-ex">${escapeHtml(sourceLabel)}</span>
        </button>`;
        })
        .join('');
  }

  function show(query?: string, nextMode: 'chart' | 'add' = 'chart'): void {
    open = true;
    mode = nextMode;
    opts.modal.hidden = false;
    const title = opts.modal.querySelector('#sym-modal-title');
    if (title) title.textContent = nextMode === 'add' ? t('sym.addToWatch') : t('sym.title');
    if (query !== undefined) opts.input.value = query;
    active = 0;
    render();
    opts.input.focus();
    if (query) opts.input.setSelectionRange(query.length, query.length);
  }

  opts.pairBtn.addEventListener('click', () => show('', 'chart'));
  opts.closeBtn.addEventListener('click', () => close());
  opts.modal.querySelector('.sym-modal-backdrop')?.addEventListener('click', () => close());

  opts.filters.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-sym-filter]');
    if (!btn) return;
    filter = (btn.dataset.symFilter as SourceFilter) ?? 'all';
    opts.filters.querySelectorAll('[data-sym-filter]').forEach((el) => {
      el.classList.toggle('is-active', el === btn);
    });
    active = 0;
    render();
    opts.input.focus();
  });

  opts.modal.querySelector('#sym-cats')?.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-sym-cat]');
    if (!btn) return;
    category = (btn.dataset.symCat as CategoryFilter) ?? 'all';
    opts.modal.querySelectorAll('[data-sym-cat]').forEach((el) => {
      el.classList.toggle('is-active', el === btn);
    });
    active = 0;
    render();
    opts.input.focus();
  });

  opts.input.addEventListener('input', () => {
    active = 0;
    render();
  });

  opts.input.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      moveActive(1);
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      moveActive(-1);
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      choose();
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      close();
    }
  });

  opts.results.addEventListener('click', (ev) => {
    const row = (ev.target as HTMLElement).closest<HTMLElement>('[data-sym-index]');
    if (!row) return;
    choose(Number(row.dataset.symIndex));
  });

  opts.results.addEventListener('mousemove', (ev) => {
    const row = (ev.target as HTMLElement).closest<HTMLElement>('[data-sym-index]');
    if (!row) return;
    const index = Number(row.dataset.symIndex);
    if (index !== active) {
      active = index;
      paintActive();
    }
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && open) {
      ev.preventDefault();
      close();
      return;
    }
    if (open) return;
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key.length !== 1 || !/[A-Za-z]/.test(ev.key)) return;
    if (isTextField(ev.target)) return;
    ev.preventDefault();
    show(ev.key);
  });


  onLangChange(() => {
    if (!open) return;
    const title = opts.modal.querySelector('#sym-modal-title');
    if (title) title.textContent = mode === 'add' ? t('sym.addToWatch') : t('sym.title');
  });
  return { open: show, close, setCurrent, ready };
}

