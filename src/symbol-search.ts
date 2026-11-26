// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { assetIconHtml, hydrateAssetIcons } from './asset-icon';
import { coinName } from './coin-names';
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
import { DEX_NETWORKS, loadDexNetworkId } from './sources/dex-networks';
import { exchangeMeta } from './sources/exchange-meta';
import { lookupDexPair } from './sources/dex';


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


export type SymbolTab = 'all' | 'crypto' | 'stocks' | 'dex' | 'xrpl' | 'xahau';

const RECENT_KEY = 'opencharts:sym-recent';
const RECENT_MAX = 8;

function readRecent(): SymbolInfo[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as SymbolInfo[];
    return Array.isArray(raw) ? raw.filter((r) => r && typeof r.id === 'string' && typeof r.sourceId === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function writeRecent(list: SymbolInfo[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {
    /* private mode or quota */
  }
}

function highlight(text: string, query: string): string {
  const needle = query.trim();
  if (!needle) return escapeHtml(text);
  const at = text.toLowerCase().indexOf(needle.toLowerCase());
  if (at < 0) return escapeHtml(text);
  return `${escapeHtml(text.slice(0, at))}<mark>${escapeHtml(text.slice(at, at + needle.length))}</mark>${escapeHtml(text.slice(at + needle.length))}`;
}

/** Fixed starting points shown when nothing is typed yet. */
const POPULAR: Array<{ sourceId: string; base: string; quote?: string }> = [
  { sourceId: 'kraken', base: 'XRP', quote: 'USD' },
  { sourceId: 'kraken', base: 'BTC', quote: 'USD' },
  { sourceId: 'kraken', base: 'ETH', quote: 'USD' },
  { sourceId: 'kraken', base: 'SOL', quote: 'USD' },
  { sourceId: 'yahoo', base: 'XRPN' },
  { sourceId: 'yahoo', base: 'AAPL' },
  { sourceId: 'yahoo', base: 'NVDA' },
  { sourceId: 'yahoo', base: 'MSTR' },
];

export function initSymbolSearch(opts: {
  modal: HTMLElement;
  input: HTMLInputElement;
  results: HTMLElement;
  tabs: HTMLElement;
  source: HTMLSelectElement;
  clearBtn: HTMLButtonElement;
  pairBtn: HTMLButtonElement;
  pairSrc?: HTMLElement | null;
  closeBtn: HTMLButtonElement;
  onSelect: (sourceId: string, pairId: string) => void;
  onAdd?: (sourceId: string, pairId: string) => void;
}): { open: (query?: string, mode?: 'chart' | 'add') => void; close: () => void; setCurrent: (sourceId: string, pairId: string) => void; ready: Promise<void> } {
  let items: SymbolInfo[] = [];
  let tab: SymbolTab = 'all';
  let src = 'all';
  let active = 0;
  let visible: SymbolInfo[] = [];
  let current = { sourceId: 'kraken', pairId: 'XRPUSD' };
  let open = false;
  let mode: 'chart' | 'add' = 'chart';

  /* ---- tab and source state ---- */

  function dexNetworkId(): string {
    if (src.startsWith('dex:')) return src.slice(4);
    return loadDexNetworkId();
  }

  function effective(): { filter: SourceFilter; category: CategoryFilter } {
    if (tab === 'dex' || tab === 'xrpl' || tab === 'xahau') return { filter: 'dex', category: 'all' };
    const filter = (src.startsWith('dex:') ? 'all' : src) as SourceFilter;
    return { filter, category: tab === 'crypto' ? 'crypto' : tab === 'stocks' ? 'stocks' : 'all' };
  }

  function paintControls(): void {
    opts.tabs.querySelectorAll<HTMLElement>('[data-sym-cat]').forEach((el) => {
      const on = el.dataset.symCat === tab;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    opts.source.value = src;
  }

  function setTab(next: SymbolTab): void {
    tab = next;
    if (next === 'xrpl') src = 'dex:xrpl';
    else if (next === 'xahau') src = 'dex:xahau';
    else if (next === 'dex') src = src.startsWith('dex:') ? src : `dex:${loadDexNetworkId()}`;
    else if (src.startsWith('dex:')) src = 'all';
    paintControls();
  }

  function setSource(next: string): void {
    src = next;
    if (next === 'dex:xrpl') tab = 'xrpl';
    else if (next === 'dex:xahau') tab = 'xahau';
    else if (next.startsWith('dex:')) tab = 'dex';
    else if (tab === 'dex' || tab === 'xrpl' || tab === 'xahau') tab = 'all';
    else if (next === 'yahoo') tab = 'stocks';
    else if (next !== 'all' && tab === 'stocks') tab = 'crypto';
    paintControls();
  }

  function fillSourceOptions(): void {
    const dex = DEX_NETWORKS.map((n) => `<option value="dex:${n.id}">${escapeHtml(n.name)}</option>`).join('');
    opts.source.innerHTML =
      `<option value="all">${escapeHtml(t('sym.allSources'))}</option>` +
      `<option value="kraken">Kraken</option><option value="binance">Binance</option>` +
      `<option value="coinbase">Coinbase</option><option value="bitstamp">Bitstamp</option>` +
      `<option value="yahoo">Yahoo Finance</option>` +
      `<optgroup label="DEX">${dex}</optgroup>`;
    opts.source.value = src;
  }
  fillSourceOptions();

  function currentMeta(sourceId: string, pairId: string): { name: string; networkId?: string } {
    const networkId = sourceId === 'dex' ? lookupDexPair(pairId)?.networkId ?? loadDexNetworkId() : undefined;
    return { name: exchangeMeta(sourceId, networkId).name, networkId };
  }

  function setCurrent(sourceId: string, pairId: string): void {
    current = { sourceId, pairId };
    const label = formatPairLabel(sourceId, pairId);
    const meta = currentMeta(sourceId, pairId);
    opts.pairBtn.textContent = label;
    opts.pairBtn.title = `${label} · ${meta.name}`;
    if (opts.pairSrc) opts.pairSrc.textContent = meta.name;
    syncPlaceholder();
  }

  function syncPlaceholder(): void {
    const dex = tab === 'dex' || tab === 'xrpl' || tab === 'xahau' || current.sourceId === 'dex';
    opts.input.placeholder = t(dex ? 'sym.placeholderDex' : 'sym.placeholder');
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
    opts.input.blur();
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
      if (i === active) opts.input.setAttribute('aria-activedescendant', el.id);
    });
  }

  function remember(item: SymbolInfo): void {
    const rest = readRecent().filter((r) => !(r.sourceId === item.sourceId && r.id === item.id));
    writeRecent([item, ...rest]);
  }

  function choose(index = active): void {
    const item = visible[index];
    if (!item) return;
    const add = mode === 'add';
    remember(item);
    close();
    if (add && opts.onAdd) opts.onAdd(item.sourceId, item.id);
    else opts.onSelect(item.sourceId, item.id);
  }

  /* ---- remote search (Yahoo, DEX) ---- */

  let yahooHits: SymbolInfo[] = [];
  let yahooTimer: ReturnType<typeof setTimeout> | undefined;
  let yahooAbort: AbortController | null = null;
  let yahooFor = '';
  let dexHits: SymbolInfo[] = [];
  let dexTimer: ReturnType<typeof setTimeout> | undefined;
  let dexAbort: AbortController | null = null;
  let dexFor = '';
  let dexNet = '';

  function needsProxyHint(): boolean {
    const { filter, category } = effective();
    return !getStocksProxyUrl() && (category === 'stocks' || filter === 'yahoo');
  }

  function yahooSearchEnabled(): boolean {
    if (!getStocksProxyUrl()) return false;
    const { filter, category } = effective();
    if (category !== 'stocks' && filter !== 'yahoo' && !(filter === 'all' && category === 'all' && opts.input.value.trim().length >= 2)) return false;
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
    } catch {
      if (ac.signal.aborted) return;
      yahooHits = [];
      yahooFor = q;
    }
    if (open && opts.input.value.trim() === q) renderResults();
  }

  function dexSearchEnabled(): boolean {
    const { filter, category } = effective();
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
    }, 400);
  }

  async function runDexSearch(q: string): Promise<void> {
    dexAbort?.abort();
    const ac = new AbortController();
    dexAbort = ac;
    const networkId = dexNetworkId();
    try {
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
      dexNet = networkId;
    } catch {
      if (ac.signal.aborted) return;
      dexHits = [];
      dexFor = q;
      dexNet = networkId;
    }
    if (open && opts.input.value.trim() === q) renderResults();
  }

  /* ---- rendering ---- */

  function render(): void {
    if (!yahooSearchEnabled()) {
      yahooHits = [];
      yahooFor = '';
    }
    opts.clearBtn.hidden = opts.input.value.length === 0;
    syncPlaceholder();
    renderResults();
    scheduleYahooSearch();
    scheduleDexSearch();
  }

  function popularItems(): SymbolInfo[] {
    const out: SymbolInfo[] = [];
    for (const want of POPULAR) {
      const hit = items.find(
        (s) =>
          s.sourceId === want.sourceId &&
          (s.base.toUpperCase() === want.base || s.base.toUpperCase() === (want.base === 'BTC' ? 'XBT' : want.base) || s.id.toUpperCase() === want.base) &&
          (!want.quote || s.quote.toUpperCase() === want.quote),
      );
      if (hit) out.push(hit);
    }
    return out;
  }

  function typeOf(item: SymbolInfo): { key: string; label: string } {
    if (item.sourceId === 'dex') return { key: 'dex', label: t('sym.typeDex') };
    if (item.kind === 'stock') return { key: 'stock', label: t('sym.typeStock') };
    return { key: 'spot', label: t('sym.typeSpot') };
  }

  function rowHtml(item: SymbolInfo, i: number, query: string): string {
    const currentCls = item.sourceId === current.sourceId && item.id === current.pairId ? ' is-current' : '';
    const activeCls = i === active ? ' is-active' : '';
    const networkId = item.sourceId === 'dex' ? item.name ?? loadDexNetworkId() : undefined;
    const ex = exchangeMeta(item.sourceId, networkId);
    const type = typeOf(item);
    const fullName = item.sourceId === 'dex' || item.kind !== 'stock' ? coinName(item.base) ?? '' : item.name ?? coinName(item.base) ?? '';
    const name = fullName && fullName.toLowerCase() !== item.base.toLowerCase() ? `<span class="sym-name">${highlight(fullName, query)}</span>` : '';
    return `<button type="button" class="sym-row${currentCls}${activeCls}" role="option" id="sym-opt-${i}" data-sym-index="${i}">
          ${assetIconHtml(item.sourceId, item.id, item.label)}
          <span class="sym-label"><span class="sym-ticker">${highlight(item.label, query)}</span>${name}</span>
          <span class="sym-type" data-type="${type.key}">${escapeHtml(type.label)}</span>
          <span class="sym-ex"><span class="sym-ex-name">${escapeHtml(ex.name)}</span><span class="ex-badge" data-ex="${ex.key}" aria-hidden="true">${escapeHtml(ex.badge)}</span></span>
        </button>`;
  }

  function renderResults(): void {
    const q = opts.input.value.trim();
    const { filter, category } = effective();
    const net = effective().filter === 'dex' ? dexNetworkId() : '';
    const local = searchSymbols(opts.input.value, filter, items, 100, category).filter((s) => !net || s.sourceId !== 'dex' || s.name === net);
    const loaded = items.length > 0;
    const remoteYahoo = loaded && yahooFor === q ? yahooHits : [];
    const remoteDex = loaded && dexFor === q && dexNet === dexNetworkId() ? dexHits : [];
    const banner = needsProxyHint() ? `<p class="sym-banner" role="status">${STOCKS_PROXY_UNCONFIGURED}</p>` : '';

    let html = banner;
    if (!q && tab === 'all' && src === 'all') {
      const recent = readRecent();
      const popular = popularItems().filter((p) => !recent.some((r) => r.sourceId === p.sourceId && r.id === p.id));
      visible = [...recent, ...popular];
      if (active >= visible.length) active = 0;
      if (recent.length) {
        html += `<div class="sym-section"><span>${escapeHtml(t('sym.recent'))}</span><button type="button" class="sym-clear-recent" data-sym-clear-recent>${escapeHtml(t('sym.clearRecent'))}</button></div>`;
        html += recent.map((item, i) => rowHtml(item, i, '')).join('');
      }
      if (popular.length) {
        html += `<div class="sym-section"><span>${escapeHtml(t('sym.popular'))}</span></div>`;
        html += popular.map((item, i) => rowHtml(item, recent.length + i, '')).join('');
      }
      if (!visible.length) html += `<p class="sym-empty">${escapeHtml(items.length ? t('sym.noResults') : t('sym.loading'))}</p>`;
      opts.results.innerHTML = html;
      hydrateAssetIcons(opts.results);
      return;
    }

    visible = mergeHits(local, [...remoteYahoo, ...remoteDex]);
    if (active >= visible.length) active = 0;
    if (!visible.length) {
      opts.results.innerHTML = `${banner}<p class="sym-empty">${escapeHtml(items.length ? t('sym.noResults') : t('sym.loading'))}</p>`;
      return;
    }
    opts.results.innerHTML = banner + visible.map((item, i) => rowHtml(item, i, q)).join('');
    hydrateAssetIcons(opts.results);
  }

  function show(query?: string, nextMode: 'chart' | 'add' = 'chart'): void {
    open = true;
    mode = nextMode;
    opts.modal.hidden = false;
    const title = opts.modal.querySelector('#sym-modal-title');
    if (title) title.textContent = nextMode === 'add' ? t('sym.addToWatch') : t('sym.title');
    if (query !== undefined) opts.input.value = query;
    // Start from a clean view each time, like a fresh search.
    tab = 'all';
    src = 'all';
    paintControls();
    syncPlaceholder();
    active = 0;
    render();
    opts.input.focus();
    if (query) opts.input.setSelectionRange(query.length, query.length);
  }

  /* ---- events ---- */

  opts.pairBtn.addEventListener('click', () => show('', 'chart'));
  opts.closeBtn.addEventListener('click', () => close());
  opts.modal.querySelector('.sym-modal-backdrop')?.addEventListener('click', () => close());

  opts.tabs.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-sym-cat]');
    if (!btn) return;
    setTab((btn.dataset.symCat as SymbolTab) ?? 'all');
    active = 0;
    render();
    opts.input.focus();
  });

  opts.source.addEventListener('change', () => {
    setSource(opts.source.value);
    active = 0;
    render();
    opts.input.focus();
  });

  opts.clearBtn.addEventListener('click', () => {
    opts.input.value = '';
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
    const target = ev.target as HTMLElement;
    if (target.closest('[data-sym-clear-recent]')) {
      writeRecent([]);
      renderResults();
      return;
    }
    const row = target.closest<HTMLElement>('[data-sym-index]');
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
    fillSourceOptions();
    if (open) {
      const title = opts.modal.querySelector('#sym-modal-title');
      if (title) title.textContent = mode === 'add' ? t('sym.addToWatch') : t('sym.title');
      syncPlaceholder();
      renderResults();
    }
  });
  return { open: show, close, setCurrent, ready };
}
