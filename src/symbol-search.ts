// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import {
  type CategoryFilter,
  type SourceFilter,
  type SymbolInfo,
  formatPairLabel,
  loadAllSymbols,
  searchSymbols,
} from './sources/catalog';
import { sources } from './sources';

const SOURCE_NAME: Record<string, string> = Object.fromEntries(sources.map((s) => [s.id, s.name]));

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
}): { open: (query?: string) => void; close: () => void; setCurrent: (sourceId: string, pairId: string) => void; ready: Promise<void> } {
  let items: SymbolInfo[] = [];
  let filter: SourceFilter = 'all';
  let category: CategoryFilter = 'all';
  let active = 0;
  let visible: SymbolInfo[] = [];
  let current = { sourceId: 'kraken', pairId: 'XRPUSD' };
  let open = false;

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
    opts.modal.hidden = true;
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
    close();
    opts.onSelect(item.sourceId, item.id);
  }

  function render(): void {
    visible = searchSymbols(opts.input.value, filter, items, 100, category);
    if (active >= visible.length) active = 0;
    if (!visible.length) {
      opts.results.innerHTML = `<p class="sym-empty">${items.length ? 'No results.' : 'Loading pairs…'}</p>`;
      return;
    }
    opts.results.innerHTML = visible
      .map((item, i) => {
        const currentCls = item.sourceId === current.sourceId && item.id === current.pairId ? ' is-current' : '';
        const activeCls = i === active ? ' is-active' : '';
        return `<button type="button" class="sym-row${currentCls}${activeCls}" data-sym-index="${i}">
          <span class="sym-label">${item.label}</span>
          <span class="sym-ex">${SOURCE_NAME[item.sourceId] ?? item.sourceId}</span>
        </button>`;
      })
      .join('');
  }

  function show(query?: string): void {
    open = true;
    opts.modal.hidden = false;
    if (query !== undefined) opts.input.value = query;
    active = 0;
    render();
    opts.input.focus();
    if (query) opts.input.setSelectionRange(query.length, query.length);
  }

  opts.pairBtn.addEventListener('click', () => show(''));
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
    if (ev.key.length !== 1 || !/[A-Za-z0-9]/.test(ev.key)) return;
    if (isTextField(ev.target)) return;
    ev.preventDefault();
    show(ev.key);
  });

  return { open: show, close, setCurrent, ready };
}

