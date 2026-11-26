// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { t } from './i18n';

import { STORAGE_PREFIX } from './storage';
import { mergeWatchlists } from './watchlist-merge';
import { setThemePickerOpen } from './theme';

export const BACKUP_FORMAT = 'opencharts-backup';
export const BACKUP_VERSION = 1;
const MAX_BYTES = 2_000_000;

export interface SwapwickBackup {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  data: Record<string, string>;
}

export function collectBackupData(store: Storage = localStorage): Record<string, string> {
  const data: Record<string, string> = {};
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (!key?.startsWith(STORAGE_PREFIX)) continue;
    const value = store.getItem(key);
    if (value != null) data[key] = value;
  }
  return data;
}

export function backupFilename(at = new Date()): string {
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, '0');
  const d = String(at.getDate()).padStart(2, '0');
  return `opencharts-backup-${y}-${m}-${d}.json`;
}

export function buildBackup(store: Storage = localStorage, at = new Date()): SwapwickBackup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: at.toISOString(),
    data: collectBackupData(store),
  };
}

export function parseBackup(raw: string): { ok: true; backup: SwapwickBackup } | { ok: false; error: string } {
  if (raw.length > MAX_BYTES) return { ok: false, error: t('status.backupTooLarge') };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: t('status.backupNotJson') };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: t('status.backupInvalid') };
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.format !== BACKUP_FORMAT) return { ok: false, error: t('status.backupNotOpencharts') };
  if (obj.version !== BACKUP_VERSION) return { ok: false, error: t('status.backupVersion') };
  if (typeof obj.exportedAt !== 'string' || !obj.exportedAt) {
    return { ok: false, error: t('status.backupNoDate') };
  }
  if (!obj.data || typeof obj.data !== 'object' || Array.isArray(obj.data)) {
    return { ok: false, error: t('status.backupNoData') };
  }
  const data: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj.data as Record<string, unknown>)) {
    if (!key.startsWith(STORAGE_PREFIX)) {
      return { ok: false, error: t('status.backupBadKeys') };
    }
    if (typeof value !== 'string') {
      return { ok: false, error: t('status.backupBadValues') };
    }
    data[key] = value;
  }
  return { ok: true, backup: { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: obj.exportedAt, data } };
}

export function applyBackup(data: Record<string, string>, mode: 'replace' | 'merge', store: Storage = localStorage): void {
  if (mode === 'replace') {
    const remove: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) remove.push(key);
    }
    for (const key of remove) store.removeItem(key);
  }
  for (const [key, value] of Object.entries(data)) {
    if (!key.startsWith(STORAGE_PREFIX)) continue;
    store.setItem(key, mode === 'merge' && key === WATCHLISTS_KEY ? mergeWatchlists(store.getItem(key), value) : value);
  }
}

const WATCHLISTS_KEY = `${STORAGE_PREFIX}watchlists`;

export function initBackupUi(opts: { setStatus: (text: string, error?: boolean) => void }): void {
  const btn = document.querySelector<HTMLButtonElement>('#settings-btn');
  const menu = document.querySelector<HTMLElement>('#settings-menu');
  const exportBtn = document.querySelector<HTMLButtonElement>('#settings-export');
  const importBtn = document.querySelector<HTMLButtonElement>('#settings-import');
  const fileInput = document.querySelector<HTMLInputElement>('#backup-file');
  const modal = document.querySelector<HTMLElement>('#backup-modal');
  const replaceBtn = document.querySelector<HTMLButtonElement>('#backup-replace');
  const mergeBtn = document.querySelector<HTMLButtonElement>('#backup-merge');
  const cancelBtn = document.querySelector<HTMLButtonElement>('#backup-cancel');
  if (!btn || !menu || !exportBtn || !importBtn || !fileInput || !modal || !replaceBtn || !mergeBtn || !cancelBtn) return;

  let pending: SwapwickBackup | null = null;

  function setMenu(open: boolean): void {
    menu!.hidden = !open;
    btn!.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (!open) setThemePickerOpen(false);
  }

  function closeModal(): void {
    pending = null;
    modal!.hidden = true;
    fileInput!.value = '';
  }

  function finish(mode: 'replace' | 'merge'): void {
    if (!pending) return;
    try {
      applyBackup(pending.data, mode);
    } catch {
      opts.setStatus(t('status.backupWriteFailed'), true);
      closeModal();
      return;
    }
    location.reload();
  }

  btn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    setMenu(menu.hidden);
  });
  document.querySelector('#settings-close')?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    setMenu(false);
  });

  exportBtn.addEventListener('click', () => {
    setMenu(false);
    const backup = buildBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFilename();
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    opts.setStatus(t('status.settingsExported'));
  });

  importBtn.addEventListener('click', () => {
    setMenu(false);
    fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    if (file.size > MAX_BYTES) {
      opts.setStatus(t('status.backupTooLarge'), true);
      return;
    }
    const raw = await file.text();
    const parsed = parseBackup(raw);
    if (!parsed.ok) {
      opts.setStatus(parsed.error, true);
      return;
    }
    pending = parsed.backup;
    modal.hidden = false;
    replaceBtn.focus();
  });

  replaceBtn.addEventListener('click', () => finish('replace'));
  mergeBtn.addEventListener('click', () => finish('merge'));
  cancelBtn.addEventListener('click', () => closeModal());
  modal.querySelector('.fib-modal-backdrop')?.addEventListener('click', () => closeModal());

  document.addEventListener('click', (ev) => {
    if (!menu.hidden && ev.target instanceof Node && !menu.contains(ev.target) && ev.target !== btn) {
      setMenu(false);
    }
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (!modal.hidden) {
      ev.preventDefault();
      closeModal();
      return;
    }
    if (!menu.hidden) setMenu(false);
  });
}
