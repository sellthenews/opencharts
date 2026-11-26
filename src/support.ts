// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { t } from './i18n';

export const SUPPORT_XRP_ADDRESS = 'rEo9s1W4u1R5STTB287JxhxffSxDftVkPJ';
export const SUPPORT_XAMAN_URL = `https://xaman.app/detect/request:${SUPPORT_XRP_ADDRESS}`;

function closeSettings(): void {
  const menu = document.querySelector<HTMLElement>('#settings-menu');
  if (menu) menu.hidden = true;
  document.querySelector('#settings-btn')?.setAttribute('aria-expanded', 'false');
}

async function copyAddress(btn: HTMLButtonElement, address: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(address);
  } catch {
    const field = document.createElement('textarea');
    field.value = address;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.left = '-9999px';
    document.body.appendChild(field);
    field.select();
    document.execCommand('copy');
    field.remove();
  }
  const prev = btn.textContent;
  btn.textContent = t('support.copied');
  window.setTimeout(() => {
    btn.textContent = t('support.copy');
    if (btn.textContent === 'support.copy') btn.textContent = prev;
  }, 1600);
}

export function initSupport(): void {
  const modal = document.querySelector<HTMLElement>('#support-modal');
  const box = modal?.querySelector<HTMLElement>('.support-box');
  const addressEl = document.querySelector<HTMLElement>('#support-address');
  const copyBtn = document.querySelector<HTMLButtonElement>('#support-copy');
  const xaman = document.querySelector<HTMLAnchorElement>('#support-xaman');
  if (!modal || !box || !addressEl || !copyBtn || !xaman) return;

  addressEl.textContent = SUPPORT_XRP_ADDRESS;
  xaman.href = SUPPORT_XAMAN_URL;

  function setOpen(open: boolean): void {
    modal!.hidden = !open;
    if (open) {
      closeSettings();
      box!.focus();
    }
  }

  for (const sel of ['#support-btn', '#settings-support']) {
    document.querySelector(sel)?.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      setOpen(true);
    });
  }
  document.querySelector('#support-close')?.addEventListener('click', () => setOpen(false));
  modal.querySelector('[data-support-dismiss]')?.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !modal.hidden) {
      ev.preventDefault();
      setOpen(false);
    }
  });
  copyBtn.addEventListener('click', () => {
    void copyAddress(copyBtn, SUPPORT_XRP_ADDRESS);
  });
}
