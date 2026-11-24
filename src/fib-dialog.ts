// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import type { FibOptions, FibToolKind } from './fib-settings';
import {
  builtInOf,
  cloneFibOptions,
  colorForFibExtValue,
  colorForFibValue,
  formatFibLevel,
  saveFibDefaults,
  saveFibExtDefaults,
  sanitizeFibOptions,
} from './fib-settings';

export interface FibDialogHandlers {
  apply: (opts: FibOptions, persist: boolean) => void;
  onStatus?: (text: string) => void;
}

export function initFibDialog(
  root: HTMLElement,
  handlers: FibDialogHandlers,
): { open: (opts: FibOptions, kind?: FibToolKind) => void; close: (revert?: boolean) => void; isOpen: () => boolean } {
  const title = root.querySelector('#fib-modal-title')!;
  const list = root.querySelector('#fib-levels')!;
  const bg = root.querySelector<HTMLInputElement>('#fib-bg')!;
  const bgOpacity = root.querySelector<HTMLInputElement>('#fib-bg-opacity')!;
  const bgOpacityVal = root.querySelector('#fib-bg-opacity-val')!;
  const reverse = root.querySelector<HTMLInputElement>('#fib-reverse')!;
  const prices = root.querySelector<HTMLInputElement>('#fib-prices')!;
  const showLevels = root.querySelector<HTMLInputElement>('#fib-show-levels')!;
  const labels = root.querySelector<HTMLSelectElement>('#fib-labels')!;
  const labelVAlign = root.querySelector<HTMLSelectElement>('#fib-label-valign')!;
  const trend = root.querySelector<HTMLInputElement>('#fib-trend')!;
  const trendStyle = root.querySelector<HTMLSelectElement>('#fib-trend-style')!;
  const extend = root.querySelector<HTMLInputElement>('#fib-extend')!;
  const savedNote = root.querySelector('#fib-saved-note')!;

  let snapshot: FibOptions | null = null;
  let current: FibOptions = builtInOf('fib');
  let kind: FibToolKind = 'fib';
  let applying = false;

  function colorOf(value: number): string {
    return kind === 'fibext' ? colorForFibExtValue(value) : colorForFibValue(value);
  }

  function emit(persist: boolean): void {
    handlers.apply(cloneFibOptions(current), persist);
  }

  function readForm(): void {
    if (applying) return;
    current.background = bg.checked;
    current.backgroundOpacity = Number(bgOpacity.value) / 100;
    current.reverse = reverse.checked;
    current.showPrices = prices.checked;
    current.showLevels = showLevels.checked;
    current.labels = labels.value === 'left' ? 'left' : 'right';
    current.labelVAlign = labelVAlign.value === 'top' || labelVAlign.value === 'bottom' ? labelVAlign.value : 'middle';
    current.showTrend = trend.checked;
    current.trendStyle = trendStyle.value === 'dashed' || trendStyle.value === 'dotted' ? trendStyle.value : 'solid';
    current.extendLines = extend.checked;
    current.levels = [...list.querySelectorAll<HTMLElement>('.fib-level-row')].flatMap((row) => {
      const value = Number(row.querySelector<HTMLInputElement>('.fib-level-value')?.value);
      if (!Number.isFinite(value)) return [];
      const visible = row.querySelector<HTMLInputElement>('.fib-level-on')?.checked !== false;
      const color = row.querySelector<HTMLInputElement>('.fib-level-color')?.value || colorOf(value);
      return [{ value, visible, color }];
    });
    bgOpacityVal.textContent = `${Math.round(current.backgroundOpacity * 100)}%`;
    emit(false);
  }

  function renderLevels(): void {
    list.innerHTML = current.levels
      .map((level, i) => {
        const val = formatFibLevel(level.value);
        return `<div class="fib-level-row" data-index="${i}">
          <input type="checkbox" class="fib-level-on" ${level.visible ? 'checked' : ''} aria-label="Show level ${val}" />
          <input type="number" class="fib-level-value" step="any" value="${val}" aria-label="Level value" />
          <input type="color" class="fib-level-color" value="${level.color}" aria-label="Level color" />
          <button type="button" class="fib-level-remove" data-remove="${i}" title="Remove level" aria-label="Remove level">×</button>
        </div>`;
      })
      .join('');
  }

  function fillForm(opts: FibOptions): void {
    applying = true;
    current = cloneFibOptions(sanitizeFibOptions(opts, builtInOf(kind)));
    bg.checked = current.background;
    bgOpacity.value = String(Math.round(current.backgroundOpacity * 100));
    bgOpacityVal.textContent = `${Math.round(current.backgroundOpacity * 100)}%`;
    reverse.checked = current.reverse;
    prices.checked = current.showPrices;
    showLevels.checked = current.showLevels;
    labels.value = current.labels;
    labelVAlign.value = current.labelVAlign;
    trend.checked = current.showTrend;
    trendStyle.value = current.trendStyle;
    extend.checked = current.extendLines;
    renderLevels();
    applying = false;
  }

  function open(opts: FibOptions, nextKind: FibToolKind = 'fib'): void {
    kind = nextKind;
    title.textContent = kind === 'fibext' ? 'Trend-Based Fib Extension' : 'Fib Retracement';
    snapshot = cloneFibOptions(sanitizeFibOptions(opts, builtInOf(kind)));
    savedNote.textContent = '';
    fillForm(snapshot);
    root.hidden = false;
    root.querySelector<HTMLElement>('.fib-modal-box')?.focus();
  }

  function close(revert = false): void {
    if (root.hidden) return;
    if (revert && snapshot) {
      current = cloneFibOptions(snapshot);
      emit(false);
    }
    snapshot = null;
    root.hidden = true;
  }

  list.addEventListener('input', () => readForm());
  list.addEventListener('change', () => readForm());
  list.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-remove]');
    if (!btn) return;
    const i = Number(btn.dataset.remove);
    if (!Number.isInteger(i)) return;
    current.levels.splice(i, 1);
    renderLevels();
    emit(false);
  });

  for (const el of [bg, bgOpacity, reverse, prices, showLevels, labels, labelVAlign, trend, trendStyle, extend]) {
    el.addEventListener('input', () => readForm());
    el.addEventListener('change', () => readForm());
  }

  root.querySelector('#fib-add-level')?.addEventListener('click', () => {
    const last = current.levels[current.levels.length - 1];
    const value = last ? Math.round((last.value + 0.1) * 1000) / 1000 : 0;
    current.levels.push({ value, visible: true, color: colorOf(value) });
    current.levels.sort((a, b) => a.value - b.value);
    renderLevels();
    emit(false);
  });

  root.querySelector('#fib-reset')?.addEventListener('click', () => {
    fillForm(builtInOf(kind));
    savedNote.textContent = '';
    emit(false);
  });

  root.querySelector('#fib-save-default')?.addEventListener('click', () => {
    readForm();
    if (kind === 'fibext') saveFibExtDefaults(current);
    else saveFibDefaults(current);
    savedNote.textContent = 'Saved as default for new drawings.';
    handlers.onStatus?.(kind === 'fibext' ? 'Saved Fib extension defaults for new drawings.' : 'Saved Fib defaults for new drawings.');
  });

  root.querySelector('#fib-ok')?.addEventListener('click', () => {
    readForm();
    emit(true);
    snapshot = null;
    close(false);
  });

  root.querySelector('#fib-cancel')?.addEventListener('click', () => close(true));
  root.querySelector('#fib-modal-close')?.addEventListener('click', () => close(true));
  root.querySelector('.fib-modal-backdrop')?.addEventListener('click', () => close(true));

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !root.hidden) {
      ev.preventDefault();
      close(true);
    }
  });

  return { open, close, isOpen: () => !root.hidden };
}
