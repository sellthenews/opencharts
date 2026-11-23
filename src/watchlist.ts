// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Wykresy contributors

import { getSource, sources } from './sources';
import type { PairId, Ticker } from './sources';
import { PAIR_IDS, PAIR_LABELS } from './sources';

export const WATCH_STORAGE_KEY = 'wykresy:watchlists';
export const TICKER_INTERVAL_MS = 45_000;

export interface WatchItem {
  sourceId: string;
  pairId: PairId;
}

export interface WatchList {
  id: string;
  name: string;
  items: WatchItem[];
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
        name: 'Moje',
        items: [
          { sourceId: 'kraken', pairId: 'XRPUSD' },
          { sourceId: 'kraken', pairId: 'BTCUSD' },
          { sourceId: 'kraken', pairId: 'ETHUSD' },
        ],
      },
      { id: 'krypto', name: 'Krypto', items: [] },
    ],
  };
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `w-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isPairId(value: string): value is PairId {
  return (PAIR_IDS as readonly string[]).includes(value);
}

export function loadWatchState(): WatchState {
  try {
    const raw = localStorage.getItem(WATCH_STORAGE_KEY);
    if (!raw) return defaultWatchState();
    const parsed = JSON.parse(raw) as Partial<WatchState>;
    if (!Array.isArray(parsed.lists) || parsed.lists.length === 0) return defaultWatchState();
    const lists: WatchList[] = parsed.lists
      .filter((l) => l && typeof l.id === 'string' && typeof l.name === 'string')
      .map((l) => ({
        id: l.id,
        name: l.name.trim() || 'Lista',
        items: Array.isArray(l.items)
          ? l.items.filter((i) => i && typeof i.sourceId === 'string' && isPairId(String(i.pairId))).map((i) => ({
              sourceId: i.sourceId,
              pairId: i.pairId as PairId,
            }))
          : [],
      }));
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

function formatPrice(price: number): string {
  if (!Number.isFinite(price)) return '—';
  if (price >= 1000) return price.toLocaleString('pl-PL', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  if (price >= 1) return price.toLocaleString('pl-PL', { maximumFractionDigits: 4 });
  return price.toLocaleString('pl-PL', { maximumFractionDigits: 6 });
}

function formatPct(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return '—';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toLocaleString('pl-PL', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%`;
}

export class WatchlistPanel {
  private state: WatchState;
  private quotes = new Map<string, Ticker>();
  private timer: number | null = null;
  private inflight = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly onOpen: (sourceId: string, pairId: PairId) => void,
    private readonly onKrakenPairs?: (pairs: PairId[]) => void,
  ) {
    this.state = loadWatchState();
    this.root.addEventListener('click', (ev) => this.onClick(ev));
    this.root.addEventListener('change', (ev) => this.onChange(ev));
    this.root.addEventListener('submit', (ev) => this.onSubmit(ev));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.refreshQuotes();
    });
    this.render();
    void this.refreshQuotes();
    this.startTimer();
    this.notifyKrakenPairs();
  }

  private notifyKrakenPairs(): void {
    const pairs = this.activeList()
      .items.filter((i) => i.sourceId === 'kraken')
      .map((i) => i.pairId);
    this.onKrakenPairs?.([...new Set(pairs)]);
  }

  getState(): WatchState {
    return {
      activeId: this.state.activeId,
      lists: this.state.lists.map((l) => ({ ...l, items: l.items.map((i) => ({ ...i })) })),
    };
  }

  activeList(): WatchList {
    return this.state.lists.find((l) => l.id === this.state.activeId) ?? this.state.lists[0]!;
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
    const items = this.activeList().items;
    const seq = ++this.inflight;
    await Promise.all(
      items.map(async (item) => {
        const src = getSource(item.sourceId);
        if (!src) return;
        try {
          const ticker = await src.fetchTicker(item.pairId);
          if (seq !== this.inflight) return;
          this.quotes.set(itemKey(item), ticker);
          const row = this.root.querySelector<HTMLElement>(`[data-watch-key="${itemKey(item)}"]`);
          if (row) this.paintRow(row, ticker);
        } catch {
          /* leave last known quote */
        }
      }),
    );
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

  private onClick(ev: Event): void {
    const t = ev.target as HTMLElement;
    const removeList = t.closest<HTMLButtonElement>('[data-watch-action="remove-list"]');
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
    const addList = t.closest<HTMLButtonElement>('[data-watch-action="add-list"]');
    if (addList) {
      const name = window.prompt('Nazwa nowej listy', 'Nowa lista');
      if (!name || !name.trim()) return;
      const list: WatchList = { id: newId(), name: name.trim(), items: [] };
      this.state.lists.push(list);
      this.state.activeId = list.id;
      this.persist();
      this.render();
      return;
    }
    const del = t.closest<HTMLButtonElement>('[data-watch-remove]');
    if (del) {
      ev.preventDefault();
      ev.stopPropagation();
      const key = del.getAttribute('data-watch-remove');
      const list = this.activeList();
      list.items = list.items.filter((i) => itemKey(i) !== key);
      this.persist();
      this.render();
      return;
    }
    const row = t.closest<HTMLElement>('.watch-row');
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
    const form = ev.target as HTMLFormElement;
    if (form.id !== 'watch-add-form') return;
    ev.preventDefault();
    const sourceId = form.querySelector<HTMLSelectElement>('#watch-add-source')?.value;
    const pairIdRaw = form.querySelector<HTMLSelectElement>('#watch-add-pair')?.value;
    if (!sourceId || !pairIdRaw || !isPairId(pairIdRaw)) return;
    const list = this.activeList();
    if (list.items.some((i) => i.sourceId === sourceId && i.pairId === pairIdRaw)) return;
    list.items.push({ sourceId, pairId: pairIdRaw });
    this.persist();
    this.render();
    void this.refreshQuotes();
  }

  private render(): void {
    const list = this.activeList();
    const canDeleteList = this.state.lists.length > 1;
    const listOpts = this.state.lists
      .map((l) => `<option value="${l.id}"${l.id === list.id ? ' selected' : ''}>${escapeHtml(l.name)}</option>`)
      .join('');
    const sourceOpts = sources
      .map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`)
      .join('');
    const pairOpts = PAIR_IDS.map((id) => `<option value="${id}">${PAIR_LABELS[id]}</option>`).join('');
    const rows = list.items
      .map((item) => {
        const src = getSource(item.sourceId);
        const quote = this.quotes.get(itemKey(item));
        const label = PAIR_LABELS[item.pairId];
        const exch = src?.name ?? item.sourceId;
        const last = quote ? formatPrice(quote.last) : '…';
        const chg = quote ? formatPct(quote.change24hPct) : '…';
        const chgClass =
          quote && quote.change24hPct !== null && quote.change24hPct !== 0
            ? quote.change24hPct > 0
              ? ' up'
              : ' down'
            : '';
        const key = itemKey(item);
        return `<button type="button" class="watch-row" data-watch-key="${key}" data-source="${item.sourceId}" data-pair="${item.pairId}">
          <span class="watch-sym">${escapeHtml(label)}</span>
          <span class="watch-ex">${escapeHtml(exch)}</span>
          <span class="watch-last">${last}</span>
          <span class="watch-chg${chgClass}">${chg}</span>
          <span class="watch-del" data-watch-remove="${key}" title="Usuń z listy" role="button">×</span>
        </button>`;
      })
      .join('');
    this.notifyKrakenPairs();
    this.root.innerHTML = `
      <div class="watch-head">
        <h2>Obserwowane</h2>
        <div class="watch-lists">
          <select id="watch-list-select" title="Lista" aria-label="Lista obserwowanych">${listOpts}</select>
          <button type="button" data-watch-action="add-list" title="Nowa lista">+</button>
          <button type="button" data-watch-action="remove-list" title="Usuń listę" ${canDeleteList ? '' : 'disabled'}>−</button>
        </div>
      </div>
      <div class="watch-body">${rows || '<p class="watch-empty">Lista jest pusta.</p>'}</div>
      <form id="watch-add-form" class="watch-add">
        <select id="watch-add-source" aria-label="Giełda">${sourceOpts}</select>
        <select id="watch-add-pair" aria-label="Para">${pairOpts}</select>
        <button type="submit">Dodaj</button>
      </form>
    `;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}
