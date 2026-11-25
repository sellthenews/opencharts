// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { onLangChange, t } from './i18n';

import './storage';
import type { DrawStyle } from './drawings-types';
import type { FibOptions } from './fib-settings';
import { builtInFibOptions, loadFibDefaults, loadFibExtDefaults, looksLikeFibExtLevelSet, sanitizeFibOptions, saveFibDefaults, saveFibExtDefaults } from './fib-settings';
import type { IndicatorInstance } from './indicators/types';
import { clampParams, clampStyle, newIndicatorId } from './indicators/settings';
import { CATALOG_BY_KIND } from './indicators/types';

export const TEMPLATES_KEY = 'opencharts:templates';
export const LINE_DEFAULTS_KEY = 'opencharts:line-defaults';

export interface ChartTemplate {
  id: string;
  name: string;
  indicators: IndicatorInstance[];
  panes?: number[];
  styles: {
    fib: FibOptions;
    fibext: FibOptions;
    line: DrawStyle;
  };
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `t-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

export function sanitizeLineStyle(raw: unknown): DrawStyle {
  const r = raw && typeof raw === 'object' ? (raw as DrawStyle) : {};
  const out: DrawStyle = {};
  if (typeof r.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.color)) out.color = r.color;
  if (typeof r.width === 'number' && r.width >= 1 && r.width <= 4) out.width = Math.round(r.width);
  if (r.lineStyle === 'solid' || r.lineStyle === 'dashed' || r.lineStyle === 'dotted') out.lineStyle = r.lineStyle;
  return out;
}

export function loadLineDefaults(): DrawStyle {
  try {
    const raw = localStorage.getItem(LINE_DEFAULTS_KEY);
    if (!raw) return {};
    return sanitizeLineStyle(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function saveLineDefaults(style: DrawStyle): void {
  localStorage.setItem(LINE_DEFAULTS_KEY, JSON.stringify(sanitizeLineStyle(style)));
}

function cloneIndicators(items: IndicatorInstance[]): IndicatorInstance[] {
  return items
    .filter((item) => item && item.kind in CATALOG_BY_KIND)
    .map((item) => ({
      id: newIndicatorId(),
      kind: item.kind,
      visible: item.visible !== false,
      params: clampParams(item.kind, item.params ?? {}),
      style: clampStyle(item.style),
    }));
}

function healRetracementStyle(opts: FibOptions): FibOptions {
  return looksLikeFibExtLevelSet(opts) ? builtInFibOptions() : opts;
}

function normalizeTemplate(raw: unknown): ChartTemplate | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<ChartTemplate> & { styles?: Partial<ChartTemplate['styles']> };
  if (typeof r.name !== 'string' || !r.name.trim()) return null;
  const indicators = Array.isArray(r.indicators) ? cloneIndicators(r.indicators as IndicatorInstance[]) : [];
  return {
    id: typeof r.id === 'string' && r.id ? r.id : newId(),
    name: r.name.trim().slice(0, 80),
    indicators,
    panes: Array.isArray(r.panes) ? r.panes.filter((n): n is number => typeof n === 'number' && Number.isFinite(n)) : undefined,
    styles: {
      fib: healRetracementStyle(sanitizeFibOptions(r.styles?.fib ?? {}, loadFibDefaults())),
      fibext: sanitizeFibOptions(r.styles?.fibext ?? {}, loadFibExtDefaults()),
      line: sanitizeLineStyle(r.styles?.line),
    },
  };
}

export function loadTemplates(): ChartTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { v?: number; items?: unknown } | unknown;
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { items?: unknown }).items)
        ? (parsed as { items: unknown[] }).items
        : [];
    return list.map(normalizeTemplate).filter((t): t is ChartTemplate => t !== null);
  } catch {
    return [];
  }
}

export function saveTemplates(items: ChartTemplate[]): void {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify({ v: 1, items }));
}

export function snapshotTemplate(name: string, indicators: IndicatorInstance[], panes: number[] | undefined, line: DrawStyle): ChartTemplate {
  return {
    id: newId(),
    name: name.trim().slice(0, 80),
    indicators: cloneIndicators(indicators),
    panes: panes && panes.length ? [...panes] : undefined,
    styles: {
      fib: loadFibDefaults(),
      fibext: loadFibExtDefaults(),
      line: sanitizeLineStyle(line),
    },
  };
}

export function applyTemplateStyles(template: ChartTemplate): void {
  saveFibDefaults(template.styles.fib);
  saveFibExtDefaults(template.styles.fibext);
  saveLineDefaults(template.styles.line);
}

export function initTemplatesUi(opts: {
  getIndicators: () => IndicatorInstance[];
  getPanes: () => number[] | undefined;
  applyIndicators: (items: IndicatorInstance[], panes?: number[]) => void;
  getLineStyle: () => DrawStyle;
  setLineStyle: (style: DrawStyle) => void;
  setStatus: (text: string, error?: boolean) => void;
}): { render: () => void } {
  const listEl = document.querySelector<HTMLElement>('#settings-templates');
  const saveBtn = document.querySelector<HTMLButtonElement>('#settings-save-template');

  function render(): void {
    if (!listEl) return;
    const items = loadTemplates();
    if (!items.length) {
      listEl.innerHTML = `<p class="settings-templates-empty">${t('tpl.empty')}</p>`;
      return;
    }
    listEl.innerHTML = items
      .map(
        (tpl) => `<div class="settings-template-row">
          <button type="button" role="menuitem" data-template-load="${tpl.id}">${escapeHtml(tpl.name)}</button>
          <button type="button" class="btn-danger" data-template-del="${tpl.id}" title="${t('tpl.delete')}" aria-label="${t('tpl.delete')} ${escapeHtml(tpl.name)}">×</button>
        </div>`,
      )
      .join('');
  }

  function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  saveBtn?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const name = window.prompt(t('status.templateName'), t('status.templateDefault'));
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed) {
      opts.setStatus(t('status.enterTemplateName'), true);
      return;
    }
    const items = loadTemplates();
    items.push(snapshotTemplate(trimmed, opts.getIndicators(), opts.getPanes(), opts.getLineStyle()));
    saveTemplates(items);
    render();
    opts.setStatus(t('status.savedTemplate', { name: trimmed }));
  });

  listEl?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const del = (ev.target as HTMLElement).closest<HTMLElement>('[data-template-del]');
    if (del) {
      const id = del.getAttribute('data-template-del');
      const items = loadTemplates();
      const hit = items.find((t) => t.id === id);
      if (!hit) return;
      if (!window.confirm(t('status.deleteTemplateConfirm', { name: hit.name }))) return;
      saveTemplates(items.filter((t) => t.id !== id));
      render();
      opts.setStatus(t('status.deletedTemplate', { name: hit.name }));
      return;
    }
    const loadBtn = (ev.target as HTMLElement).closest<HTMLElement>('[data-template-load]');
    if (!loadBtn) return;
    const id = loadBtn.getAttribute('data-template-load');
    const hit = loadTemplates().find((t) => t.id === id);
    if (!hit) return;
    applyTemplateStyles(hit);
    opts.setLineStyle(hit.styles.line);
    opts.applyIndicators(cloneIndicators(hit.indicators), hit.panes);
    opts.setStatus(t('status.loadedTemplate', { name: hit.name }));
  });

  document.querySelector('#settings-btn')?.addEventListener('click', () => render());
  onLangChange(() => render());
  render();
  return { render };
}
