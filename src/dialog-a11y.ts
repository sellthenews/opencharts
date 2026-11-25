// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function visibleDialogs(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].filter((el) => {
    if (el.hidden || el.closest('[hidden]')) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
}

function focusable(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    if (el.hidden || el.closest('[hidden]')) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    return el.tabIndex !== -1;
  });
}

/** Keep Tab inside the topmost open dialog. Esc is handled by each dialog. */
export function initDialogA11y(): void {
  document.addEventListener(
    'keydown',
    (ev) => {
      if (ev.key !== 'Tab') return;
      const dialogs = visibleDialogs();
      const dialog = dialogs[dialogs.length - 1];
      if (!dialog) return;
      const items = focusable(dialog);
      if (!items.length) {
        ev.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const inside = active ? dialog.contains(active) : false;
      if (ev.shiftKey) {
        if (!inside || active === first) {
          ev.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        ev.preventDefault();
        first.focus();
      }
    },
    true,
  );
}
