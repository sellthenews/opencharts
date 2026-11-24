// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { t } from './i18n';

import type { IntervalId } from './sources';
import { parseIntervalId } from './sources';
import type { Tool } from './drawings-types';

const TOOL_KEYS: Record<string, Tool> = {
  t: 'trend',
  h: 'hline',
  v: 'vline',
  f: 'fib',
};


export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

export function isModalOpen(): boolean {
  return Boolean(
    document.querySelector(
      '#fib-modal:not([hidden]), #ind-modal:not([hidden]), #sym-modal:not([hidden]), #backup-modal:not([hidden])',
    ),
  );
}

export function parseIntervalInput(raw: string): IntervalId | null {
  return parseIntervalId(raw);
}

export function initShortcuts(opts: {
  hint: HTMLElement;
  setTool: (tool: Tool) => void;
  undo: () => boolean;
  redo: () => boolean;
  applyInterval: (id: IntervalId) => void;
}): { clearBuffer: () => void } {
  let buffer = '';
  let hideTimer: number | null = null;

  function showHint(): void {
    opts.hint.hidden = buffer.length === 0;
    opts.hint.textContent = buffer ? t('hint.interval', { buffer }) : '';
    if (hideTimer !== null) window.clearTimeout(hideTimer);
    if (buffer) {
      hideTimer = window.setTimeout(() => {
        buffer = '';
        opts.hint.hidden = true;
      }, 4000);
    }
  }

  function clearBuffer(): void {
    buffer = '';
    opts.hint.hidden = true;
    if (hideTimer !== null) window.clearTimeout(hideTimer);
  }

  window.addEventListener(
    'keydown',
    (ev) => {
      if (isTypingTarget(ev.target) || isModalOpen()) return;

      const take = (): void => {
        ev.preventDefault();
        ev.stopImmediatePropagation();
      };

      if (ev.altKey && !ev.ctrlKey && !ev.metaKey && ev.key.length === 1) {
        const tool = TOOL_KEYS[ev.key.toLowerCase()];
        if (tool) {
          take();
          clearBuffer();
          opts.setTool(tool);
          return;
        }
      }

      const mod = ev.ctrlKey || ev.metaKey;
      if (mod && !ev.altKey && ev.key.toLowerCase() === 'z') {
        take();
        clearBuffer();
        if (ev.shiftKey) opts.redo();
        else opts.undo();
        return;
      }
      if (mod && !ev.altKey && ev.key.toLowerCase() === 'y') {
        take();
        clearBuffer();
        opts.redo();
        return;
      }

      if (ev.key === 'Escape') {
        if (buffer) {
          take();
          clearBuffer();
        }
        return;
      }

      if (ev.key === 'Enter' && buffer) {
        take();
        const id = parseIntervalInput(buffer);
        clearBuffer();
        if (id) opts.applyInterval(id);
        return;
      }

      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (ev.key === 'Backspace' && buffer) {
        take();
        buffer = buffer.slice(0, -1);
        showHint();
        return;
      }
      if (ev.key.length === 1 && /[0-9]/i.test(ev.key)) {
        take();
        buffer += ev.key;
        showHint();
        return;
      }
      if (buffer && ev.key.length === 1 && /[hHdDwWmM]/.test(ev.key)) {
        take();
        buffer += ev.key;
        showHint();
      }
    },
    true,
  );

  return { clearBuffer };
}
