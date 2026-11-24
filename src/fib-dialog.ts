// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import type { FibOptions } from './fib-settings';
import {
  builtInFibOptions,
  cloneFibOptions,
  colorForFibValue,
  formatFibLevel,
  saveFibDefaults,
  sanitizeFibOptions,
} from './fib-settings';

export interface FibDialogHandlers {
  apply: (opts: FibOptions, persist: boolean) => void;
  onStatus?: (text: string) => void;
}

export function initFibDialog(
  root: HTMLElement,
  handlers: FibDialogHandlers,
): { open: (opts: FibOptions) => void; close: (revert?: boolean) => void; isOpen: () => boolean } {
  const list = root.querySelector('#fib-levels')!;
  const bg = root.querySelector<HTMLInputElement>('#fib-bg')!;
  const bgOpacity = root.querySelector<HTMLInputElement>('#fib-bg-opacity')!;
  const bgOpacityVal = root.querySelector('#fib-bg-opacity-val')!;
  const reverse = root.querySelector<HTMLInputElement>('#fib-reverse')!;
  const prices = root.querySelector<HTMLInputElement>('#fib-prices')!;
  const showLevels = root.querySelector<HTMLInputElement>('#fib-show-levels')!;
  const labels = root.querySelector<HTMLSelectElement>('#fib-labels')!;
  const extend = root.querySelector<HTMLInputElement>('#fib-extend')!;
  const savedNote = root.querySelector('#fib-saved-note')!;

  let snapshot: FibOptions | null = null;
  let current: FibOptions = builtInFibOptions();
  let applying = false;

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
    current.extendLines = extend.checked;
    current.levels = [...list.querySelectorAll<HTMLElement>('.fib-level-row')].flatMap((row) => {
      const value = Number(row.querySelector<HTMLInputElement>('.fib-level-value')?.value);
      if (!Number.isFinite(value)) return [];
      const visible = row.querySelector<HTMLInputElement>('.fib-level-on')?.checked !== false;
      const color = row.querySelector<HTMLInputElement>('.fib-level-color')?.value || colorForFibValue(value);
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
    current = cloneFibOptions(sanitizeFibOptions(opts));
    bg.checked = current.background;
    bgOpacity.value = String(Math.round(current.backgroundOpacity * 100));
    bgOpacityVal.textContent = `${Math.round(current.backgroundOpacity * 100)}%`;
    reverse.checked = current.reverse;
    prices.checked = current.showPrices;
    showLevels.checked = current.showLevels;
    labels.value = current.labels;
    extend.checked = current.extendLines;
    renderLevels();
    applying = false;
  }

  function open(opts: FibOptions): void {
    snapshot = cloneFibOptions(sanitizeFibOptions(opts));
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

  for (const el of [bg, bgOpacity, reverse, prices, showLevels, labels, extend]) {
    el.addEventListener('input', () => readForm());
    el.addEventListener('change', () => readForm());
  }

  root.querySelector('#fib-add-level')?.addEventListener('click', () => {
    const last = current.levels[current.levels.length - 1];
    const value = last ? Math.round((last.value + 0.1) * 1000) / 1000 : 0;
    current.levels.push({ value, visible: true, color: colorForFibValue(value) });
    current.levels.sort((a, b) => a.value - b.value);
    renderLevels();
    emit(false);
  });

  root.querySelector('#fib-reset')?.addEventListener('click', () => {
    fillForm(builtInFibOptions());
    savedNote.textContent = '';
    emit(false);
  });

  root.querySelector('#fib-save-default')?.addEventListener('click', () => {
    readForm();
    saveFibDefaults(current);
    savedNote.textContent = 'Saved as default for new drawings.';
    handlers.onStatus?.('Saved Fib defaults for new drawings.');
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
