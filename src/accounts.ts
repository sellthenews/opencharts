// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { t } from './i18n';
import { getStocksProxyUrl } from './config';
import { applyBackup, collectBackupData } from './backup';

export const ACCOUNTS_UNAVAILABLE = 'Accounts are not available yet';

interface PublicUser {
  id: string;
  email: string | null;
  displayName: string | null;
  providers: string[];
}

interface SyncPayload {
  updatedAt: number | null;
  data: Record<string, string>;
  error?: string;
}

let user: PublicUser | null = null;
let lastUpdatedAt: number | null = null;
let onStatus: ((message: string, error?: boolean) => void) | null = null;

function apiBase(): string {
  return getStocksProxyUrl();
}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const base = apiBase();
  if (!base) throw new Error(ACCOUNTS_UNAVAILABLE);
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(`${base}${path}`, { ...init, headers, credentials: 'include' });
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    /* ignore */
  }
  if (res.status === 404 || res.status === 503) return t('account.unavailable');
  return `${res.status}`;
}

function displayName(u: PublicUser): string {
  return u.displayName || u.email || u.id;
}

function paint(): void {
  const signed = document.querySelector<HTMLElement>('#account-signed');
  const guest = document.querySelector<HTMLElement>('#account-guest');
  const who = document.querySelector<HTMLElement>('#account-who');
  if (signed) signed.hidden = !user;
  if (guest) guest.hidden = Boolean(user);
  if (who && user) who.textContent = t('account.signedInAs', { name: displayName(user) });
}

function setMsg(text: string, error = false): void {
  const el = document.querySelector<HTMLElement>('#account-msg');
  if (!el) return;
  el.textContent = text;
  el.hidden = !text;
  el.classList.toggle('is-error', error);
}

async function refreshMe(): Promise<void> {
  try {
    const res = await api('/auth/me');
    if (res.status === 401) {
      user = null;
      paint();
      return;
    }
    if (!res.ok) {
      user = null;
      paint();
      if (res.status === 404 || res.status === 503) setMsg(t('account.unavailable'), true);
      return;
    }
    const body = (await res.json()) as { user?: PublicUser };
    user = body.user ?? null;
    paint();
  } catch {
    user = null;
    paint();
  }
}

async function pullAndApply(): Promise<boolean> {
  const res = await api('/sync');
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as SyncPayload;
  lastUpdatedAt = body.updatedAt;
  const keys = Object.keys(body.data ?? {});
  if (!keys.length) return false;
  applyBackup(body.data, 'merge');
  return true;
}

async function pushLocal(force = false): Promise<void> {
  const data = collectBackupData();
  const res = await api('/sync', {
    method: 'PUT',
    body: JSON.stringify({ data, updatedAt: lastUpdatedAt, force }),
  });
  if (res.status === 409) {
    const body = (await res.json()) as SyncPayload;
    lastUpdatedAt = body.updatedAt ?? lastUpdatedAt;
    if (body.data) applyBackup(body.data, 'merge');
    throw new Error(body.error || 'Newer data is on the server');
  }
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as SyncPayload;
  lastUpdatedAt = body.updatedAt ?? lastUpdatedAt;
}

async function syncAfterLogin(): Promise<void> {
  const hadRemote = await pullAndApply();
  if (!hadRemote) await pushLocal(true);
  else await pushLocal(true);
  onStatus?.(t('account.synced'));
  if (hadRemote) window.location.reload();
}

export function initAccounts(opts: { onStatus: (message: string, error?: boolean) => void }): void {
  onStatus = opts.onStatus;
  const modal = document.querySelector<HTMLElement>('#account-modal');
  const openBtn = document.querySelector<HTMLButtonElement>('#settings-account');
  const closeBtn = document.querySelector<HTMLButtonElement>('#account-close');
  if (!modal || !openBtn) return;

  function open(): void {
    modal!.hidden = false;
    setMsg('');
    void refreshMe();
  }
  function close(): void {
    modal!.hidden = true;
  }

  openBtn.addEventListener('click', () => {
    document.querySelector<HTMLElement>('#settings-menu')!.hidden = true;
    document.querySelector('#settings-btn')?.setAttribute('aria-expanded', 'false');
    open();
  });
  closeBtn?.addEventListener('click', () => close());
  modal.querySelector('.fib-modal-backdrop')?.addEventListener('click', () => close());

  document.querySelector('#account-form')?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    void submitAuth('register');
  });
  document.querySelector('#account-register')?.addEventListener('click', (ev) => {
    ev.preventDefault();
    void submitAuth('register');
  });
  document.querySelector('#account-login')?.addEventListener('click', (ev) => {
    ev.preventDefault();
    void submitAuth('login');
  });
  document.querySelector('#account-logout')?.addEventListener('click', () => void signOut());
  document.querySelector('#account-sync')?.addEventListener('click', () => void syncNow());

  const github = document.querySelector<HTMLAnchorElement>('#account-github');
  const google = document.querySelector<HTMLAnchorElement>('#account-google');
  const base = apiBase();
  if (github) github.href = base ? `${base}/auth/github` : '#';
  if (google) google.href = base ? `${base}/auth/google` : '#';

  void refreshMe().then(() => {
    const flag = new URL(window.location.href).hash;
    if (flag.includes('account=ok')) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
      open();
      void syncAfterLogin().catch((err) => setMsg(t('account.syncFailed', { message: String(err instanceof Error ? err.message : err) }), true));
    } else if (flag.includes('account=oauth_failed')) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
      open();
      setMsg(t('account.oauthFailed'), true);
    }
  });
}

async function submitAuth(mode: 'login' | 'register'): Promise<void> {
  const email = document.querySelector<HTMLInputElement>('#account-email')?.value ?? '';
  const password = document.querySelector<HTMLInputElement>('#account-password')?.value ?? '';
  const confirm = document.querySelector<HTMLInputElement>('#account-confirm')?.value ?? '';
  if (!email.includes('@')) {
    setMsg(t('account.badEmail'), true);
    return;
  }
  if (password.length < 8) {
    setMsg(t('account.badPassword'), true);
    return;
  }
  if (mode === 'register' && password !== confirm) {
    setMsg(t('account.passwordMismatch'), true);
    return;
  }
  try {
    const res = await api(mode === 'register' ? '/auth/register' : '/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      setMsg(await readError(res), true);
      return;
    }
    const body = (await res.json()) as { user?: PublicUser };
    user = body.user ?? null;
    paint();
    setMsg('');
    await syncAfterLogin();
  } catch (err) {
    setMsg(t('account.error', { message: String(err instanceof Error ? err.message : err) }), true);
  }
}

async function signOut(): Promise<void> {
  try {
    await api('/auth/logout', { method: 'POST' });
  } catch {
    /* still clear locally */
  }
  user = null;
  lastUpdatedAt = null;
  paint();
  setMsg(t('account.logoutDone'));
  onStatus?.(t('account.logoutDone'));
}

async function syncNow(): Promise<void> {
  if (!user) return;
  try {
    const hadRemote = await pullAndApply();
    await pushLocal(true);
    setMsg(t('account.synced'));
    onStatus?.(t('account.synced'));
    if (hadRemote) window.location.reload();
  } catch (err) {
    const message = String(err instanceof Error ? err.message : err);
    setMsg(t('account.syncFailed', { message }), true);
    onStatus?.(t('account.syncFailed', { message }), true);
  }
}
