// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { t } from './i18n';

export function askConfirm(message: string, okLabel?: string): Promise<boolean> {
  const modal = document.querySelector<HTMLElement>('#confirm-modal');
  const title = document.querySelector<HTMLElement>('#confirm-title');
  const okBtn = document.querySelector<HTMLButtonElement>('#confirm-ok');
  const cancelBtn = document.querySelector<HTMLButtonElement>('#confirm-cancel');
  if (!modal || !title || !okBtn || !cancelBtn) return Promise.resolve(false);

  title.textContent = message;
  okBtn.textContent = okLabel ?? t('menu.remove');
  cancelBtn.textContent = t('confirm.cancel');
  modal.hidden = false;
  okBtn.focus();

  return new Promise((resolve) => {
    const finish = (ok: boolean): void => {
      modal.hidden = true;
      modal.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
      resolve(ok);
    };
    const onClick = (ev: MouseEvent): void => {
      const target = ev.target as HTMLElement;
      if (target.closest('#confirm-ok')) finish(true);
      else if (target.closest('#confirm-cancel') || target.classList.contains('confirm-backdrop')) finish(false);
    };
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        finish(false);
      } else if (ev.key === 'Enter' && ev.target === okBtn) {
        ev.preventDefault();
        finish(true);
      }
    };
    modal.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
  });
}
