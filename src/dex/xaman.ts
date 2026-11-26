// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

/**
 * Xaman sign-in and signing. Swapwick never sees keys: it hands plain transaction
 * JSON to Xaman, the user checks and signs it in the Xaman app.
 *
 * Only the public API key is used (the OAuth2 client id, PKCE flow). It comes from the
 * build env `VITE_XAMAN_API_KEY` or from the Worker `/xaman/config`. Without it the
 * connect button stays disabled. An API secret is never needed or accepted here.
 */

import { getStocksProxyUrl } from '../config';
import type { LedgerId, TxJson } from './tx';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SDK_URL = `${import.meta.env?.BASE_URL ?? '/'}vendor/xumm-1.8.1.min.js`;

export interface XamanState {
  configured: boolean;
  account: string | null;
  busy: boolean;
}

export interface SignResult {
  signed: boolean;
  txid?: string;
  network?: string;
}

interface XummLike {
  on(event: string, fn: (...args: unknown[]) => void): void;
  authorize(): Promise<unknown>;
  logout(): Promise<void>;
  user: { account: Promise<string | undefined> };
  payload?: {
    createAndSubscribe(
      body: unknown,
      cb: (ev: { data: Record<string, unknown> }) => unknown,
    ): Promise<{ created: { next: { always: string }; refs: { qr_png: string } }; resolved: Promise<unknown> }>;
  };
}

let apiKeyPromise: Promise<string | null> | null = null;
let sdk: XummLike | null = null;
const state: XamanState = { configured: false, account: null, busy: false };
const listeners = new Set<(s: XamanState) => void>();

function emit(): void {
  for (const fn of listeners) fn({ ...state });
}

export function onXamanChange(fn: (s: XamanState) => void): () => void {
  listeners.add(fn);
  fn({ ...state });
  return () => listeners.delete(fn);
}

export function xamanState(): XamanState {
  return { ...state };
}

/** Public API key only. Anything that does not look like a key is ignored. */
export function getXamanApiKey(): Promise<string | null> {
  if (apiKeyPromise) return apiKeyPromise;
  apiKeyPromise = (async () => {
    const fromBuild = String(import.meta.env?.VITE_XAMAN_API_KEY ?? '').trim();
    if (UUID_RE.test(fromBuild)) return fromBuild;
    const base = getStocksProxyUrl();
    if (!base) return null;
    try {
      const res = await fetch(`${base}/xaman/config`, { headers: { Accept: 'application/json' } });
      if (!res.ok) return null;
      const body = (await res.json()) as { apiKey?: unknown };
      return typeof body.apiKey === 'string' && UUID_RE.test(body.apiKey) ? body.apiKey : null;
    } catch {
      return null;
    }
  })();
  return apiKeyPromise;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error('Could not load the Xaman SDK'));
    document.head.appendChild(el);
  });
}

async function ensureSdk(): Promise<XummLike | null> {
  if (sdk) return sdk;
  const key = await getXamanApiKey();
  if (!key) return null;
  const w = window as unknown as { Xumm?: new (key: string) => XummLike };
  if (!w.Xumm) await loadScript(SDK_URL);
  if (!w.Xumm) return null;
  sdk = new w.Xumm(key);
  const refresh = async () => {
    state.account = (await sdk?.user.account) ?? null;
    emit();
  };
  sdk.on('success', () => void refresh());
  sdk.on('retrieved', () => void refresh());
  sdk.on('logout', () => {
    state.account = null;
    emit();
  });
  return sdk;
}

/** Check the key once at start; pick up a session kept from an earlier visit. */
export async function initXaman(): Promise<void> {
  const key = await getXamanApiKey();
  state.configured = Boolean(key);
  emit();
  if (key && localStorage.getItem('opencharts:xaman-used') === '1') {
    try {
      await ensureSdk();
    } catch {
      /* stays signed out */
    }
  }
}

export async function connectXaman(): Promise<void> {
  const s = await ensureSdk();
  if (!s) throw new Error('Xaman is not configured yet');
  state.busy = true;
  emit();
  try {
    await s.authorize();
    localStorage.setItem('opencharts:xaman-used', '1');
    state.account = (await s.user.account) ?? null;
  } finally {
    state.busy = false;
    emit();
  }
}

export async function disconnectXaman(): Promise<void> {
  await sdk?.logout();
  localStorage.removeItem('opencharts:xaman-used');
  state.account = null;
  emit();
}

/** Ask Xaman to sign. The forced network makes Xaman refuse to sign on the wrong ledger. */
export async function signWithXaman(ledger: LedgerId, tx: TxJson, instruction: string, onOpen?: (url: string, qr: string) => void): Promise<SignResult> {
  const s = await ensureSdk();
  if (!s?.payload) throw new Error('Xaman is not connected');
  const sub = await s.payload.createAndSubscribe(
    {
      txjson: tx,
      options: { force_network: ledger === 'xahau' ? 'XAHAU' : 'MAINNET' },
      custom_meta: { instruction: instruction.slice(0, 280) },
    },
    (ev) => {
      if (typeof ev.data.signed === 'boolean') return ev.data;
      return undefined;
    },
  );
  onOpen?.(sub.created.next.always, sub.created.refs.qr_png);
  const done = (await sub.resolved) as { signed?: boolean; txid?: string } | undefined;
  return { signed: Boolean(done?.signed), txid: done?.txid };
}
