// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { formatNumber, onLangChange, t } from './i18n';

import './storage';
import { getSource } from './sources';
import type { PairId, Ticker } from './sources';
import { formatPairLabel } from './sources';

export const WATCH_STORAGE_KEY = 'opencharts:watchlists';
export const TICKER_INTERVAL_MS = 60_000;

export interface WatchItem {
  sourceId: string;
  pairId: PairId;
}

export interface WatchSection {
  id: string;
  name: string;
  collapsed: boolean;
  items: WatchItem[];
}

export interface WatchList {
  id: string;
  name: string;
  items: WatchItem[];
  sections: WatchSection[];
}

export interface WatchState {
  lists: WatchList[];
  activeId: string;
}

export function defaultWatchState(): WatchState {
  return {
    activeId: 'moje',
    lists: [
      {
        id: 'moje',
        name: t('watch.myList'),
        items: [
          { sourceId: 'kraken', pairId: 'XRPUSD' },
          { sourceId: 'kraken', pairId: 'BTCUSD' },
          { sourceId: 'kraken', pairId: 'ETHUSD' },
        ],
        sections: [],
      },
      { id: 'krypto', name: t('sym.crypto'), items: [], sections: [] },
    ],
  };
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `w-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isPairId(value: string): value is PairId {
  return typeof value === 'string' && value.length > 0 && value.length < 48;
}

function normalizeItems(raw: unknown): WatchItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((i) => i && typeof i.sourceId === 'string' && isPairId(String(i.pairId)))
    .map((i) => ({ sourceId: (i as WatchItem).sourceId, pairId: (i as WatchItem).pairId as PairId }));
}

function normalizeSection(raw: unknown): WatchSection | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<WatchSection>;
  if (typeof r.id !== 'string' || !r.id) return null;
  const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim() : t('watch.section');
  return { id: r.id, name, collapsed: r.collapsed === true, items: normalizeItems(r.items) };
}

function normalizeList(raw: unknown): WatchList | null {
  if (!raw || typeof raw !== 'object') return null;
  const l = raw as Partial<WatchList> & { name?: string; id?: string };
  if (typeof l.id !== 'string' || typeof l.name !== 'string') return null;
  const trimmed = l.name.trim();
  const name = l.id === 'moje' || trimmed === 'Moje' ? t('watch.myList') : l.id === 'krypto' || trimmed === 'Krypto' ? t('sym.crypto') : trimmed || t('watch.list');
  const sections = Array.isArray(l.sections)
    ? l.sections.map(normalizeSection).filter((s): s is WatchSection => s !== null)
    : [];
  return { id: l.id, name, items: normalizeItems(l.items), sections };
}

export function loadWatchState(): WatchState {
  try {
    const raw = localStorage.getItem(WATCH_STORAGE_KEY);
    if (!raw) return defaultWatchState();
    const parsed = JSON.parse(raw) as Partial<WatchState>;
    if (!Array.isArray(parsed.lists) || parsed.lists.length === 0) return defaultWatchState();
    const lists = parsed.lists.map(normalizeList).filter((l): l is WatchList => l !== null);
    if (!lists.length) return defaultWatchState();
    const activeId = lists.some((l) => l.id === parsed.activeId) ? (parsed.activeId as string) : lists[0]!.id;
    return { lists, activeId };
  } catch {
    return defaultWatchState();
  }
}

export function saveWatchState(state: WatchState): void {
  localStorage.setItem(WATCH_STORAGE_KEY, JSON.stringify(state));
}

function itemKey(item: WatchItem): string {
  return `${item.sourceId}:${item.pairId}`;
}

export function allListItems(list: WatchList): WatchItem[] {
  return [...list.items, ...list.sections.flatMap((s) => s.items)];
}

function formatPrice(price: number): string {
  if (!Number.isFinite(price)) return '—';
  if (price >= 1000) return price.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  if (price >= 1) return price.toLocaleString('en-US', { maximumFractionDigits: 4 });
  return price.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

function formatPct(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return '—';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${formatNumber(pct, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%`;
}

export class WatchlistPanel {
  private state: WatchState;
  private quotes = new Map<string, Ticker>();
  private timer: number | null = null;
  private inflight = 0;
  private menu: HTMLElement | null = null;
  private dragging: { kind: 'item' | 'section'; id: string } | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly onOpen: (sourceId: string, pairId: PairId) => void,
    private readonly onKrakenPairs?: (pairs: PairId[]) => void,
    private readonly onRequestAdd?: () => void,
  ) {
    this.state = loadWatchState();
    this.root.addEventListener('click', (ev) => this.onClick(ev));
    this.root.addEventListener('change', (ev) => this.onChange(ev));
    this.root.addEventListener('submit', (ev) => this.onSubmit(ev));
    this.root.addEventListener('contextmenu', (ev) => this.onContext(ev));
    this.root.addEventListener('dblclick', (ev) => this.onDblClick(ev));
    this.root.addEventListener('dragstart', (ev) => this.onDragStart(ev));
    this.root.addEventListener('dragover', (ev) => this.onDragOver(ev));
    this.root.addEventListener('drop', (ev) => this.onDrop(ev));
    this.root.addEventListener('dragend', () => {
      this.dragging = null;
      this.clearDragOver();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.refreshQuotes();
    });
    document.addEventListener('click', () => this.hideMenu());
    this.render();
    onLangChange(() => this.render());
    void this.refreshQuotes();
    this.startTimer();
    this.notifyKrakenPairs();
  }

  refresh(): void {
    this.render();
  }

  private notifyKrakenPairs(): void {
    const pairs = allListItems(this.activeList())
      .filter((i) => i.sourceId === 'kraken')
      .map((i) => i.pairId);
    this.onKrakenPairs?.([...new Set(pairs)]);
  }

  getState(): WatchState {
    return {
      activeId: this.state.activeId,
      lists: this.state.lists.map((l) => ({
        ...l,
        items: l.items.map((i) => ({ ...i })),
        sections: l.sections.map((s) => ({ ...s, items: s.items.map((i) => ({ ...i })) })),
      })),
    };
  }

  activeList(): WatchList {
    return this.state.lists.find((l) => l.id === this.state.activeId) ?? this.state.lists[0]!;
  }

  hasItem(sourceId: string, pairId: PairId): boolean {
    return allListItems(this.activeList()).some((i) => i.sourceId === sourceId && i.pairId === pairId);
  }

  addItem(sourceId: string, pairId: PairId): boolean {
    if (!isPairId(String(pairId))) return false;
    const list = this.activeList();
    if (allListItems(list).some((i) => i.sourceId === sourceId && i.pairId === pairId)) return false;
    list.items.push({ sourceId, pairId });
    this.persist();
    this.render();
    void this.refreshQuotes();
    return true;
  }

  removeItem(sourceId: string, pairId: PairId): boolean {
    const list = this.activeList();
    const key = `${sourceId}:${pairId}`;
    const before = allListItems(list).length;
    list.items = list.items.filter((i) => itemKey(i) !== key);
    for (const s of list.sections) s.items = s.items.filter((i) => itemKey(i) !== key);
    if (allListItems(list).length === before) return false;
    this.persist();
    this.render();
    return true;
  }

  /** Live quote hook (Kraken WebSocket ticker, later). */
  updateQuote(sourceId: string, pairId: PairId, ticker: Ticker): void {
    this.quotes.set(`${sourceId}:${pairId}`, ticker);
    const row = this.root.querySelector<HTMLElement>(`[data-watch-key="${sourceId}:${pairId}"]`);
    if (row) this.paintRow(row, ticker);
  }

  highlight(sourceId: string, pairId: PairId): void {
    this.root.querySelectorAll('.watch-row').forEach((el) => {
      el.classList.toggle('is-active', el.getAttribute('data-watch-key') === `${sourceId}:${pairId}`);
    });
  }

  startTimer(): void {
    this.stopTimer();
    this.timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void this.refreshQuotes();
    }, TICKER_INTERVAL_MS);
  }

  stopTimer(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private persist(): void {
    saveWatchState(this.state);
  }

  private async refreshQuotes(): Promise<void> {
    const items = allListItems(this.activeList());
    const seq = ++this.inflight;
    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (cursor < items.length) {
        const item = items[cursor]!;
        cursor += 1;
        const src = getSource(item.sourceId);
        if (!src) continue;
        try {
          const ticker = await src.fetchTicker(item.pairId);
          if (seq !== this.inflight) return;
          this.quotes.set(itemKey(item), ticker);
          const row = this.root.querySelector<HTMLElement>(`[data-watch-key="${itemKey(item)}"]`);
          if (row) this.paintRow(row, ticker);
        } catch {
          /* leave last known quote */
        }
      }
    };
    const n = Math.min(4, items.length);
    await Promise.all(Array.from({ length: n }, () => worker()));
  }

  private paintRow(row: HTMLElement, ticker: Ticker): void {
    const lastEl = row.querySelector('.watch-last');
    const chEl = row.querySelector('.watch-chg');
    if (lastEl) lastEl.textContent = formatPrice(ticker.last);
    if (chEl) {
      chEl.textContent = formatPct(ticker.change24hPct);
      chEl.classList.remove('up', 'down');
      if (ticker.change24hPct !== null) {
        if (ticker.change24hPct > 0) chEl.classList.add('up');
        else if (ticker.change24hPct < 0) chEl.classList.add('down');
      }
    }
  }

  private addSection(): void {
    const list = this.activeList();
    list.sections.push({ id: newId(), name: t('watch.section'), collapsed: false, items: [] });
    this.persist();
    this.render();
  }

  private removeSection(id: string): void {
    const list = this.activeList();
    const sec = list.sections.find((s) => s.id === id);
    if (!sec) return;
    if (!window.confirm(t('watch.deleteSectionConfirm', { name: sec.name }))) return;
    list.items.push(...sec.items);
    list.sections = list.sections.filter((s) => s.id !== id);
    this.persist();
    this.render();
  }

  private hideMenu(): void {
    this.menu?.remove();
    this.menu = null;
  }

  private showMenu(x: number, y: number): void {
    this.hideMenu();
    const menu = document.createElement('div');
    menu.className = 'watch-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = `<button type="button" role="menuitem" data-watch-action="add-section">${t('watch.addSection')}</button>`;
    menu.style.left = `${Math.min(x, window.innerWidth - 160)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - 48)}px`;
    document.body.append(menu);
    this.menu = menu;
    menu.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const act = (ev.target as HTMLElement).closest<HTMLElement>('[data-watch-action]')?.dataset.watchAction;
      this.hideMenu();
      if (act === 'add-section') this.addSection();
    });
  }

  private onContext(ev: MouseEvent): void {
    ev.preventDefault();
    this.showMenu(ev.clientX, ev.clientY);
  }

  private onDblClick(ev: Event): void {
    const nameEl = (ev.target as HTMLElement).closest<HTMLElement>('[data-watch-section-name]');
    if (!nameEl) return;
    ev.preventDefault();
    const id = nameEl.dataset.watchSectionName;
    const sec = this.activeList().sections.find((s) => s.id === id);
    if (!sec) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'watch-sec-input';
    input.value = sec.name;
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    const commit = (): void => {
      const next = input.value.trim() || t('watch.section');
      sec.name = next;
      this.persist();
      this.render();
    };
    input.addEventListener('blur', commit, { once: true });
    input.addEventListener('keydown', (ke) => {
      if (ke.key === 'Enter') input.blur();
      if (ke.key === 'Escape') {
        input.removeEventListener('blur', commit);
        this.render();
      }
    });
  }

  private onDragStart(ev: DragEvent): void {
    const handleSec = (ev.target as HTMLElement).closest<HTMLElement>('[data-watch-section-drag]');
    const row = (ev.target as HTMLElement).closest<HTMLElement>('.watch-row');
    const dt = ev.dataTransfer;
    if (!dt) return;
    if (handleSec) {
      this.dragging = { kind: 'section', id: handleSec.dataset.watchSectionDrag ?? '' };
      dt.setData('text/plain', `section:${this.dragging.id}`);
      dt.effectAllowed = 'move';
      ev.stopPropagation();
      return;
    }
    if (row?.dataset.watchKey) {
      this.dragging = { kind: 'item', id: row.dataset.watchKey };
      dt.setData('text/plain', `item:${row.dataset.watchKey}`);
      dt.effectAllowed = 'move';
    }
  }

  private onDragOver(ev: DragEvent): void {
    if (!this.dragging) return;
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
    this.clearDragOver();
    const target =
      this.dragging.kind === 'section'
        ? (ev.target as HTMLElement).closest('.watch-section')
        : (ev.target as HTMLElement).closest('.watch-row, .watch-section, .watch-loose');
    target?.classList.add('is-drag-over');
  }

  private clearDragOver(): void {
    this.root.querySelectorAll('.is-drag-over').forEach((el) => el.classList.remove('is-drag-over'));
  }

  private takeItem(key: string): WatchItem | null {
    const list = this.activeList();
    const fromLoose = list.items.findIndex((i) => itemKey(i) === key);
    if (fromLoose >= 0) {
      const [item] = list.items.splice(fromLoose, 1);
      return item ?? null;
    }
    for (const s of list.sections) {
      const idx = s.items.findIndex((i) => itemKey(i) === key);
      if (idx >= 0) {
        const [item] = s.items.splice(idx, 1);
        return item ?? null;
      }
    }
    return null;
  }

  private onDrop(ev: DragEvent): void {
    ev.preventDefault();
    this.clearDragOver();
    const list = this.activeList();
    const drag = this.dragging;
    this.dragging = null;
    const text = ev.dataTransfer?.getData('text/plain') ?? '';
    const sectionId = drag?.kind === 'section' ? drag.id : text.startsWith('section:') ? text.slice(8) : '';
    const itemKeyData = drag?.kind === 'item' ? drag.id : text.startsWith('item:') ? text.slice(5) : '';
    if (sectionId) {
      const target = (ev.target as HTMLElement).closest<HTMLElement>('.watch-section');
      const toId = target?.dataset.watchSection;
      const from = list.sections.findIndex((s) => s.id === sectionId);
      if (from < 0) return;
      let to = toId ? list.sections.findIndex((s) => s.id === toId) : list.sections.length - 1;
      if (to < 0) to = list.sections.length - 1;
      if (from === to) return;
      const [moved] = list.sections.splice(from, 1);
      if (!moved) return;
      if (from < to) to -= 1;
      list.sections.splice(to, 0, moved);
      this.persist();
      this.render();
      return;
    }
    if (!itemKeyData) return;
    const item = this.takeItem(itemKeyData);
    if (!item) return;
    const row = (ev.target as HTMLElement).closest<HTMLElement>('.watch-row');
    const sectionEl = (ev.target as HTMLElement).closest<HTMLElement>('.watch-section');
    if (row?.dataset.watchKey) {
      const destSection = row.dataset.section || '';
      const dest = destSection ? list.sections.find((s) => s.id === destSection)?.items : list.items;
      if (!dest) {
        list.items.push(item);
      } else {
        const idx = dest.findIndex((i) => itemKey(i) === row.dataset.watchKey);
        dest.splice(idx >= 0 ? idx : dest.length, 0, item);
      }
    } else if (sectionEl?.dataset.watchSection) {
      const sec = list.sections.find((s) => s.id === sectionEl.dataset.watchSection);
      (sec?.items ?? list.items).push(item);
    } else {
      list.items.push(item);
    }
    this.persist();
    this.render();
  }

  private onClick(ev: Event): void {
    const el = ev.target as HTMLElement;
    const menuBtn = el.closest<HTMLButtonElement>('[data-watch-action="list-menu"]');
    if (menuBtn) {
      ev.stopPropagation();
      const rect = menuBtn.getBoundingClientRect();
      this.showMenu(rect.left, rect.bottom + 4);
      return;
    }
    const addSection = el.closest<HTMLButtonElement>('[data-watch-action="add-section"]');
    if (addSection) {
      this.addSection();
      return;
    }
    const toggle = el.closest<HTMLButtonElement>('[data-watch-action="toggle-section"]');
    if (toggle) {
      ev.preventDefault();
      ev.stopPropagation();
      const id = toggle.dataset.watchSectionId;
      const sec = this.activeList().sections.find((s) => s.id === id);
      if (sec) {
        sec.collapsed = !sec.collapsed;
        this.persist();
        this.render();
      }
      return;
    }
    const delSec = el.closest<HTMLButtonElement>('[data-watch-action="remove-section"]');
    if (delSec) {
      ev.preventDefault();
      ev.stopPropagation();
      if (delSec.dataset.watchSectionId) this.removeSection(delSec.dataset.watchSectionId);
      return;
    }
    const removeList = el.closest<HTMLButtonElement>('[data-watch-action="remove-list"]');
    if (removeList) {
      if (this.state.lists.length <= 1) return;
      const id = this.state.activeId;
      this.state.lists = this.state.lists.filter((l) => l.id !== id);
      this.state.activeId = this.state.lists[0]!.id;
      this.persist();
      this.render();
      void this.refreshQuotes();
      return;
    }
    const addSymbol = el.closest<HTMLButtonElement>('[data-watch-action="add-symbol"]');
    if (addSymbol) {
      this.onRequestAdd?.();
      return;
    }
    const addList = el.closest<HTMLButtonElement>('[data-watch-action="add-list"]');
    if (addList) {
      const name = window.prompt(t('watch.newListName'), t('watch.newListDefault'));
      if (!name || !name.trim()) return;
      const list: WatchList = { id: newId(), name: name.trim(), items: [], sections: [] };
      this.state.lists.push(list);
      this.state.activeId = list.id;
      this.persist();
      this.render();
      return;
    }
    const del = el.closest<HTMLElement>('[data-watch-remove]');
    if (del) {
      ev.preventDefault();
      ev.stopPropagation();
      const key = del.getAttribute('data-watch-remove');
      if (!key) return;
      const [sourceId, pairId] = key.split(':');
      if (sourceId && pairId) this.removeItem(sourceId, pairId as PairId);
      return;
    }
    const row = el.closest<HTMLElement>('.watch-row');
    if (row) {
      const sourceId = row.dataset.source;
      const pairId = row.dataset.pair as PairId | undefined;
      if (sourceId && pairId) this.onOpen(sourceId, pairId);
    }
  }

  private onChange(ev: Event): void {
    const sel = ev.target as HTMLSelectElement;
    if (sel.id === 'watch-list-select') {
      this.state.activeId = sel.value;
      this.persist();
      this.render();
      void this.refreshQuotes();
    }
  }

  private onSubmit(ev: Event): void {
    ev.preventDefault();
  }

  private rowHtml(item: WatchItem, sectionId: string): string {
    const src = getSource(item.sourceId);
    const quote = this.quotes.get(itemKey(item));
    const label = formatPairLabel(item.sourceId, item.pairId);
    const exch = src?.name ?? item.sourceId;
    const last = quote ? formatPrice(quote.last) : '…';
    const chg = quote ? formatPct(quote.change24hPct) : '…';
    const chgClass =
      quote && quote.change24hPct !== null && quote.change24hPct !== 0 ? (quote.change24hPct > 0 ? ' up' : ' down') : '';
    const key = itemKey(item);
    return `<button type="button" class="watch-row" draggable="true" data-watch-key="${key}" data-section="${sectionId}" data-source="${item.sourceId}" data-pair="${item.pairId}">
      <span class="watch-handle" aria-hidden="true"></span>
      <span class="watch-sym">${escapeHtml(label)}</span>
      <span class="watch-ex">${escapeHtml(exch)}</span>
      <span class="watch-last">${last}</span>
      <span class="watch-chg${chgClass}">${chg}</span>
      <span class="watch-del btn-danger" data-watch-remove="${key}" title="${t('watch.removeFromList')}" role="button">×</span>
    </button>`;
  }

  private render(): void {
    const list = this.activeList();
    const canDeleteList = this.state.lists.length > 1;
    const listOpts = this.state.lists
      .map((l) => `<option value="${l.id}"${l.id === list.id ? ' selected' : ''}>${escapeHtml(l.name)}</option>`)
      .join('');
    const loose = list.items.map((item) => this.rowHtml(item, '')).join('');
    const sections = list.sections
      .map((sec) => {
        const rows = sec.collapsed ? '' : sec.items.map((item) => this.rowHtml(item, sec.id)).join('');
        const empty = !sec.collapsed && !sec.items.length ? `<p class="watch-empty watch-sec-empty">${t('watch.dropHere')}</p>` : '';
        return `<div class="watch-section" data-watch-section="${sec.id}">
          <div class="watch-sec-head" data-watch-section-drag="${sec.id}" draggable="true">
            <button type="button" class="watch-sec-toggle" data-watch-action="toggle-section" data-watch-section-id="${sec.id}" title="${sec.collapsed ? t('watch.expand') : t('watch.collapse')}" aria-expanded="${sec.collapsed ? 'false' : 'true'}">${sec.collapsed ? '▸' : '▾'}</button>
            <span class="watch-sec-name" data-watch-section-name="${sec.id}">${escapeHtml(sec.name)}</span>
            <span class="watch-sec-count">${sec.items.length}</span>
            <button type="button" class="watch-sec-del btn-danger" data-watch-action="remove-section" data-watch-section-id="${sec.id}" title="${t('watch.deleteSection')}" aria-label="${t('watch.deleteSection')}">×</button>
          </div>
          ${rows}${empty}
        </div>`;
      })
      .join('');
    const body = `${loose || (!list.sections.length ? `<p class="watch-empty">${t('watch.empty')}</p>` : '')}<div class="watch-loose"></div>${sections}`;
    this.notifyKrakenPairs();
    this.root.innerHTML = `
      <div class="watch-head">
        <h2>${t('watch.title')}</h2>
        <div class="watch-lists">
          <select id="watch-list-select" title="${t('watch.list')}" aria-label="${t('watch.lists')}">${listOpts}</select>
          <button type="button" data-watch-action="add-symbol" title="${t('watch.addSymbol')}" aria-label="${t('watch.addSymbol')}">+</button>
          <button type="button" data-watch-action="add-list" title="${t('watch.newList')}" aria-label="${t('watch.newList')}">${t('watch.newList')}</button>
          <button type="button" data-watch-action="list-menu" title="${t('watch.listMenu')}" aria-label="${t('watch.listMenu')}" aria-haspopup="menu">⋯</button>
          <button type="button" class="btn-danger" data-watch-action="remove-list" title="${t('watch.removeList')}" aria-label="${t('watch.removeList')}" ${canDeleteList ? '' : 'disabled'}>−</button>
        </div>
      </div>
      <div class="watch-body">${body}</div>
    `;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}
