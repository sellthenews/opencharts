// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { onLangChange, t } from '../i18n';

import { clampParams, clampStyle, createInstance, loadIndicatorFavorites, toggleIndicatorFavorite } from './settings';
import {
  CATALOG_BY_KIND,
  INDICATOR_CATALOG,
  INDICATOR_GROUPS,
  formatIndicatorLabel,
  matchesIndicatorQuery,
} from './types';
import type { IndicatorInstance, IndicatorKind, IndicatorMeta, IndicatorParams, IndicatorStyle } from './types';
import type { PaneMap } from './host';


const FIELD_KEY: Record<string, string> = {
  Period: 'ind.field.period',
  Timeframe: 'ind.field.tf',
  Chart: 'ind.field.chart',
  Divergences: 'ind.field.divergences',
  'Moving average': 'ind.field.ma',
  'MA Period': 'ind.field.period',
  'Regular and hidden': 'ind.field.regularHidden',
  On: 'ind.field.on',
  Off: 'ind.field.off',
  Tenkan: 'ind.field.tenkan',
  Kijun: 'ind.field.kijun',
  'Senkou B': 'ind.field.senkou',
  Displacement: 'ind.field.shift',
  Multiplier: 'ind.field.multiplier',
  Type: 'ind.field.mode',
  Standard: 'ind.field.standard',
  Fibonacci: 'ind.field.fibonacci',
  Fast: 'ind.field.fast',
  Slow: 'ind.field.slow',
  Signal: 'ind.field.signal',
  'Bands (±σ)': 'ind.field.bands',
  'Session high/low': 'ind.field.highs',
  Rows: 'ind.field.rows',
  Source: 'ind.field.source',
  Close: 'ind.field.close',
  Volume: 'ind.field.volume',
  Method: 'ind.field.method',
  'ATR Period': 'ind.field.atrPeriod',
  Increment: 'ind.field.increment',
  Max: 'ind.field.max',
  Start: 'ind.field.start',
  StdDev: 'ind.field.std',
  '%K': 'ind.field.kPeriod',
  '%D': 'ind.field.dPeriod',
  'Pivot length': 'ind.field.pivotLength',
};

function fieldLabel(label: string, key?: string): string {
  const mapped = FIELD_KEY[label] ?? (key ? `ind.field.${key}` : '');
  if (!mapped) return label;
  const tr = t(mapped);
  return tr === mapped ? label : tr;
}

function optionLabel(label: string, value: string): string {
  if (FIELD_KEY[label]) return fieldLabel(label);
  if (value === 'chart') return t('ind.field.chart');
  if (value === 'on') return t('ind.field.on');
  if (value === 'off') return t('ind.field.off');
  if (value === 'standard') return t('ind.field.standard');
  if (value === 'fib') return t('ind.field.fibonacci');
  return label;
}

function rowHtml(m: IndicatorMeta, favs: Set<string>): string {
  const on = favs.has(m.kind);
  return (
    `<div class="ind-row">` +
    `<button type="button" class="ind-add" data-ind-add="${m.kind}"><span class="ind-add-short">${m.short}</span><span class="ind-add-name">${m.name}</span></button>` +
    `<button type="button" class="ind-fav${on ? ' is-on' : ''}" data-ind-fav="${m.kind}" title="${on ? t('ind.removeFav') : t('ind.addFav')}" aria-label="${on ? t('ind.removeFav') : t('ind.addFav')}" aria-pressed="${on ? 'true' : 'false'}">★</button>` +
    `</div>`
  );
}

export function renderIndicatorCatalog(catalogEl: HTMLElement, query: string, favorites?: IndicatorKind[]): void {
  const favs = new Set(favorites ?? loadIndicatorFavorites());
  const parts: string[] = [];
  const favRows = INDICATOR_CATALOG.filter((m) => favs.has(m.kind) && matchesIndicatorQuery(m, query));
  if (favRows.length) {
    parts.push(`<div class="ind-group"><h3>${t('ind.favorites')}</h3>${favRows.map((m) => rowHtml(m, favs)).join('')}</div>`);
  }
  for (const group of INDICATOR_GROUPS) {
    const rows = INDICATOR_CATALOG.filter((m) => m.group === group.id && matchesIndicatorQuery(m, query));
    if (!rows.length) continue;
    parts.push(`<div class="ind-group"><h3>${t(`ind.group.${group.id}`)}</h3>${rows.map((m) => rowHtml(m, favs)).join('')}</div>`);
  }
  catalogEl.innerHTML = parts.join('') || `<p class="ind-empty">${t('ind.noResults')}</p>`;
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
  onLangChange(() => {
    if (modalEls && !modalEls.modal.hidden) renderIndicatorCatalog(modalEls.catalog, modalEls.search.value);
  });
  els.catalog.addEventListener('click', (ev) => {
    const favBtn = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-ind-fav]');
    if (favBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      const kind = favBtn.dataset.indFav as IndicatorKind;
      toggleIndicatorFavorite(kind);
      renderIndicatorCatalog(els.catalog, els.search.value);
      return;
    }
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
  private popoverLocked = false;
  private openSettingsId: string | null = null;
  private lastValues: Record<string, string> = {};

  constructor(
    private items: IndicatorInstance[],
    private readonly hooks: {
      onChange: (items: IndicatorInstance[]) => void;
      paneOffset: (index: number) => number;
      onAdded?: (item: IndicatorInstance) => void;
    },
    private readonly labelsRoot: HTMLElement,
    openBtn: HTMLButtonElement,
  ) {
    openBtn.addEventListener('click', () => openIndicatorModal((kind) => this.add(kind)));
    this.labelsRoot.addEventListener('click', (ev) => this.onLabelClick(ev));
    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape' || !this.openSettingsId) return;
      this.openSettingsId = null;
      this.labelsRoot.querySelector('.ind-popover')?.remove();
    });
    this.renderLabels();
    onLangChange(() => this.renderLabels());
    document.addEventListener('pointerdown', (ev) => {
      if (!this.openSettingsId) return;
      const pop = this.labelsRoot.querySelector('.ind-popover');
      if (!pop) return;
      const target = ev.target as HTMLElement | null;
      if (pop.contains(target)) return;
      if (target?.closest('[data-ind-act="settings"]')) return;
      this.popoverLocked = true;
      this.openSettingsId = null;
      pop.remove();
      this.popoverLocked = false;
    });
  }

  add(kind: IndicatorKind): void {
    const item = createInstance(kind);
    if (kind === 'sma' || kind === 'ema') {
      const used = this.items.filter((i) => i.kind === kind);
      const periods = [20, 50, 200];
      const period = periods.find((n) => !used.some((i) => i.params.period === n)) ?? 20;
      const colors =
        kind === 'ema' ? ['#42a5f5', '#7e57c2', '#ffa726'] : ['#f5d76e', '#26a69a', '#ef5350'];
      item.params = { ...item.params, period };
      item.style = { ...item.style, color: colors[used.length % colors.length] };
    }
    this.commit([...this.items, item]);
    this.hooks.onAdded?.(item);
  }

  setValues(values: Record<string, string>): void {
    this.lastValues = values;
    this.applyValues();
  }

  private applyValues(): void {
    for (const el of this.labelsRoot.querySelectorAll<HTMLElement>('.ind-label')) {
      const id = el.dataset.indId;
      const span = el.querySelector('.ind-value');
      if (!span || !id) continue;
      const value = this.lastValues[id];
      span.textContent = value ? ` ${value}` : '';
    }
  }

  setItems(items: IndicatorInstance[]): void {
    this.items = items;
    if (this.openSettingsId && !items.some((i) => i.id === this.openSettingsId)) this.openSettingsId = null;
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
        const label = formatIndicatorLabel(item);
        const vis = item.visible ? 'on' : 'off';
        const gear = `<button type="button" class="ind-ico" data-ind-act="settings" data-ind-id="${item.id}" title="${t('ind.settings')}" aria-label="${t('ind.settings')}">⚙</button>`;
        const eyeTitle = item.visible ? t('ind.hide') : t('ind.show');
        html.push(
          `<div class="ind-label" data-ind-id="${item.id}" data-kind="${item.kind}" data-visible="${vis}">` +
            `<span class="ind-label-text">${label}</span><span class="ind-value"></span>` +
            gear +
            `<button type="button" class="ind-ico" data-ind-act="toggle" data-ind-id="${item.id}" title="${eyeTitle}" aria-label="${eyeTitle}">${item.visible ? '◉' : '○'}</button>` +
            `<button type="button" class="ind-ico" data-ind-act="remove" data-ind-id="${item.id}" title="${t('ind.remove')}" aria-label="${t('ind.remove')}">×</button>` +
            `</div>`,
        );
      }
      html.push('</div>');
    }
    this.labelsRoot.innerHTML = html.join('');
    this.applyValues();
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
    this.openSettingsId = id;
    const params = { ...meta.defaults, ...item.params };
    const color = item.style?.color ?? '';
    const width = item.style?.width ?? 1;
    const labelEl = this.labelsRoot.querySelector(`.ind-label[data-ind-id="${id}"]`);
    const pop = document.createElement('div');
    pop.className = 'ind-popover';
    const fieldHtml = meta.fields
      .map((f) => {
        if (f.type === 'toggle') {
          const on = String(params[f.key] ?? 'off') === 'on';
          return `<label class="ind-toggle"><input type="checkbox" data-ind-field="${f.key}" data-ind-toggle="1"${on ? ' checked' : ''} /> ${fieldLabel(f.label, f.key)}</label>`;
        }
        if (f.type === 'select') {
          const val = String(params[f.key] ?? '');
          const opts = (f.options ?? []).map((o) => `<option value="${o.value}"${o.value === val ? ' selected' : ''}>${optionLabel(o.label, o.value)}</option>`).join('');
          return `<label>${fieldLabel(f.label, f.key)}<select data-ind-field="${f.key}">${opts}</select></label>`;
        }
        const val = params[f.key] ?? '';
        return `<label>${fieldLabel(f.label, f.key)}<input type="number" data-ind-field="${f.key}" min="${f.min ?? ''}" max="${f.max ?? ''}" step="${f.step ?? 1}" value="${val}" /></label>`;
      })
      .join('');
    pop.innerHTML =
      `<label>${item.kind === 'volume' ? t('ind.maColor') : t('ind.color')}<input type="color" data-ind-style="color" value="${color || '#5b9cf6'}" /></label>` +
      `<label>${t('ind.width')}<select data-ind-style="width">${[1, 2, 3, 4].map((w) => `<option value="${w}"${w === width ? ' selected' : ''}>${t('draw.px', { n: w })}</option>`).join('')}</select></label>` +
      fieldHtml;
    if (labelEl) labelEl.append(pop);
    else this.labelsRoot.append(pop);
    const applyForm = (): void => {
      if (this.popoverLocked || !pop.isConnected) return;
      const next: IndicatorParams = { ...item.params };
      for (const input of pop.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-ind-field]')) {
        const key = input.dataset.indField as keyof IndicatorParams;
        const field = meta.fields.find((f) => f.key === key);
        if (input instanceof HTMLInputElement && input.dataset.indToggle === '1') {
          (next as Record<string, string | number | undefined>)[key] = input.checked ? 'on' : 'off';
        } else {
          (next as Record<string, string | number | undefined>)[key] = field?.type === 'select' ? input.value : Number(input.value);
        }
      }
      const style: IndicatorStyle = { ...item.style };
      const colorEl = pop.querySelector<HTMLInputElement>('[data-ind-style="color"]');
      const widthEl = pop.querySelector<HTMLSelectElement>('[data-ind-style="width"]');
      if (colorEl) style.color = colorEl.value;
      if (widthEl) style.width = Number(widthEl.value);
      const clamped = clampParams(item.kind, next);
      const nextStyle = clampStyle(style);
      this.items = this.items.map((i) => (i.id === id ? { ...i, params: clamped, style: nextStyle } : i));
      const current = this.items.find((i) => i.id === id)!;
      const text = this.labelsRoot.querySelector(`.ind-label[data-ind-id="${id}"] .ind-label-text`);
      if (text) text.textContent = formatIndicatorLabel(current);
      this.hooks.onChange(this.items);
    };
    pop.addEventListener('input', applyForm);
    pop.addEventListener('change', applyForm);
  }
}
