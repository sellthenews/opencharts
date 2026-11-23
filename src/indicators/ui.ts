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
    private readonly modal: HTMLElement,
    private readonly search: HTMLInputElement,
    private readonly catalogEl: HTMLElement,
    openBtn: HTMLButtonElement,
    closeBtn: HTMLButtonElement,
  ) {
    openBtn.addEventListener('click', () => this.open());
    closeBtn.addEventListener('click', () => this.close());
    this.modal.querySelector('.ind-modal-backdrop')?.addEventListener('click', () => this.close());
    this.search.addEventListener('input', () => this.renderCatalog());
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && !this.modal.hidden) {
        ev.preventDefault();
        this.close();
      }
    });
    this.catalogEl.addEventListener('click', (ev) => {
      const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-ind-add]');
      if (!btn) return;
      this.add(btn.dataset.indAdd as IndicatorKind);
    });
    this.labelsRoot.addEventListener('click', (ev) => this.onLabelClick(ev));
    this.renderCatalog();
    this.renderLabels();
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

  open(): void {
    this.modal.hidden = false;
    this.search.value = '';
    this.renderCatalog();
    this.search.focus();
  }

  close(): void {
    this.modal.hidden = true;
  }

  private commit(items: IndicatorInstance[]): void {
    this.items = items;
    this.hooks.onChange(items);
  }

  private add(kind: IndicatorKind): void {
    this.commit([...this.items, createInstance(kind)]);
  }

  private renderCatalog(): void {
    const q = this.search.value;
    const parts: string[] = [];
    for (const group of INDICATOR_GROUPS) {
      const rows = INDICATOR_CATALOG.filter((m) => m.group === group.id && matchesIndicatorQuery(m, q));
      if (!rows.length) continue;
      parts.push(
        `<div class="ind-group"><h3>${group.label}</h3>${rows
          .map((m) => `<button type="button" class="ind-add" data-ind-add="${m.kind}"><span class="ind-add-short">${m.short}</span><span class="ind-add-name">${m.name}</span></button>`)
          .join('')}</div>`,
      );
    }
    this.catalogEl.innerHTML = parts.join('') || '<p class="ind-empty">Brak wyników</p>';
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
