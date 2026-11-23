// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Wykresy contributors

import { clampParams, createInstance } from './settings';
import {
  CATALOG_BY_KIND,
  INDICATOR_CATALOG,
  INDICATOR_GROUPS,
  formatIndicatorLabel,
  matchesIndicatorQuery,
} from './types';
import type { IndicatorInstance, IndicatorKind, IndicatorParams } from './types';
import type { PaneMap } from './host';

export function renderIndicatorCatalog(catalogEl: HTMLElement, query: string): void {
  const parts: string[] = [];
  for (const group of INDICATOR_GROUPS) {
    const rows = INDICATOR_CATALOG.filter((m) => m.group === group.id && matchesIndicatorQuery(m, query));
    if (!rows.length) continue;
    parts.push(
      `<div class="ind-group"><h3>${group.label}</h3>${rows
        .map((m) => `<button type="button" class="ind-add" data-ind-add="${m.kind}"><span class="ind-add-short">${m.short}</span><span class="ind-add-name">${m.name}</span></button>`)
        .join('')}</div>`,
    );
  }
  catalogEl.innerHTML = parts.join('') || '<p class="ind-empty">Brak wyników</p>';
}

interface IndicatorModalEls {
  modal: HTMLElement;
  search: HTMLInputElement;
  catalog: HTMLElement;
  closeBtn: HTMLButtonElement;
}

let modalEls: IndicatorModalEls | null = null;
let modalAdd: ((kind: IndicatorKind) => void) | null = null;
let modalBound = false;

export function initIndicatorModal(els: IndicatorModalEls): void {
  modalEls = els;
  if (modalBound) return;
  modalBound = true;
  els.closeBtn.addEventListener('click', closeIndicatorModal);
  els.modal.querySelector('.ind-modal-backdrop')?.addEventListener('click', closeIndicatorModal);
  els.search.addEventListener('input', () => {
    if (modalEls) renderIndicatorCatalog(modalEls.catalog, modalEls.search.value);
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && modalEls && !modalEls.modal.hidden) {
      ev.preventDefault();
      closeIndicatorModal();
    }
  });
  els.catalog.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-ind-add]');
    if (!btn) return;
    modalAdd?.(btn.dataset.indAdd as IndicatorKind);
  });
}

export function closeIndicatorModal(): void {
  if (!modalEls) return;
  modalEls.modal.hidden = true;
}

export function openIndicatorModal(onAdd: (kind: IndicatorKind) => void): void {
  if (!modalEls) return;
  modalAdd = onAdd;
  modalEls.modal.hidden = false;
  modalEls.search.value = '';
  renderIndicatorCatalog(modalEls.catalog, '');
  modalEls.search.focus();
}

export class IndicatorHud {
  private paneMap: PaneMap = {};
  private openSettingsId: string | null = null;

  constructor(
    private items: IndicatorInstance[],
    private readonly hooks: {
      onChange: (items: IndicatorInstance[]) => void;
      paneOffset: (index: number) => number;
    },
    private readonly labelsRoot: HTMLElement,
    openBtn: HTMLButtonElement,
  ) {
    openBtn.addEventListener('click', () => openIndicatorModal((kind) => this.add(kind)));
    this.labelsRoot.addEventListener('click', (ev) => this.onLabelClick(ev));
    this.renderLabels();
  }

  add(kind: IndicatorKind): void {
    this.commit([...this.items, createInstance(kind)]);
  }

  setItems(items: IndicatorInstance[]): void {
    this.items = items;
    if (!this.openSettingsId) this.renderLabels();
  }

  setPaneMap(map: PaneMap): void {
    this.paneMap = map;
    if (!this.openSettingsId) this.renderLabels();
  }

  relayout(): void {
    if (this.openSettingsId) {
      for (const el of this.labelsRoot.querySelectorAll<HTMLElement>('.ind-label-stack')) {
        const pane = Number(el.dataset.pane ?? 0);
        el.style.top = `${this.hooks.paneOffset(pane) + 6}px`;
      }
      return;
    }
    this.renderLabels();
  }

  private commit(items: IndicatorInstance[]): void {
    this.items = items;
    this.hooks.onChange(items);
  }

  renderLabels(): void {
    const keepOpen = this.openSettingsId;
    const groups = new Map<number, IndicatorInstance[]>();
    for (const item of this.items) {
      const pane = this.paneMap[item.id] ?? 0;
      const list = groups.get(pane) ?? [];
      list.push(item);
      groups.set(pane, list);
    }
    const html: string[] = [];
    for (const [pane, list] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
      const top = this.hooks.paneOffset(pane);
      html.push(`<div class="ind-label-stack" data-pane="${pane}" style="top:${top + 6}px">`);
      for (const item of list) {
        const meta = CATALOG_BY_KIND[item.kind];
        const label = formatIndicatorLabel(item);
        const vis = item.visible ? 'on' : 'off';
        const gear = meta.fields.length
          ? `<button type="button" class="ind-ico" data-ind-act="settings" data-ind-id="${item.id}" title="Ustawienia" aria-label="Ustawienia">⚙</button>`
          : '';
        const eyeTitle = item.visible ? 'Ukryj' : 'Pokaż';
        html.push(
          `<div class="ind-label" data-ind-id="${item.id}" data-kind="${item.kind}" data-visible="${vis}">` +
            `<span class="ind-label-text">${label}</span>` +
            gear +
            `<button type="button" class="ind-ico" data-ind-act="toggle" data-ind-id="${item.id}" title="${eyeTitle}" aria-label="${eyeTitle}">${item.visible ? '◉' : '○'}</button>` +
            `<button type="button" class="ind-ico" data-ind-act="remove" data-ind-id="${item.id}" title="Usuń" aria-label="Usuń">×</button>` +
            `</div>`,
        );
      }
      html.push('</div>');
    }
    this.labelsRoot.innerHTML = html.join('');
    if (keepOpen && this.items.some((i) => i.id === keepOpen)) this.showPopover(keepOpen);
  }

  private onLabelClick(ev: MouseEvent): void {
    const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-ind-act]');
    if (!btn) return;
    const id = btn.dataset.indId;
    const act = btn.dataset.indAct;
    if (!id || !act) return;
    if (act === 'remove') {
      this.openSettingsId = null;
      this.commit(this.items.filter((i) => i.id !== id));
      this.renderLabels();
      return;
    }
    if (act === 'toggle') {
      this.openSettingsId = null;
      this.commit(this.items.map((i) => (i.id === id ? { ...i, visible: !i.visible } : i)));
      this.renderLabels();
      return;
    }
    if (act === 'settings') {
      if (this.openSettingsId === id) {
        this.openSettingsId = null;
        this.labelsRoot.querySelector('.ind-popover')?.remove();
        return;
      }
      this.showPopover(id);
    }
  }

  private showPopover(id: string): void {
    this.labelsRoot.querySelector('.ind-popover')?.remove();
    const item = this.items.find((i) => i.id === id);
    if (!item) return;
    const meta = CATALOG_BY_KIND[item.kind];
    if (!meta.fields.length) return;
    this.openSettingsId = id;
    const params = { ...meta.defaults, ...item.params };
    const labelEl = this.labelsRoot.querySelector(`.ind-label[data-ind-id="${id}"]`);
    const pop = document.createElement('div');
    pop.className = 'ind-popover';
    pop.innerHTML = meta.fields
      .map((f) => {
        const val = params[f.key] ?? '';
        return `<label>${f.label}<input type="number" data-ind-field="${f.key}" min="${f.min}" max="${f.max}" step="${f.step}" value="${val}" /></label>`;
      })
      .join('');
    if (labelEl) labelEl.append(pop);
    else this.labelsRoot.append(pop);
    pop.addEventListener('input', () => {
      const next: IndicatorParams = { ...item.params };
      for (const input of pop.querySelectorAll<HTMLInputElement>('[data-ind-field]')) {
        const key = input.dataset.indField as keyof IndicatorParams;
        next[key] = Number(input.value);
      }
      const clamped = clampParams(item.kind, next);
      this.items = this.items.map((i) => (i.id === id ? { ...i, params: clamped } : i));
      const text = this.labelsRoot.querySelector(`.ind-label[data-ind-id="${id}"] .ind-label-text`);
      if (text) text.textContent = formatIndicatorLabel({ ...item, params: clamped });
      this.hooks.onChange(this.items);
    });
  }
}
