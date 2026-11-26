// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

/**
 * Automatic account sync. Every change to a synced localStorage key is time-stamped and
 * uploaded a moment later; other devices pull on load, on focus and every minute while visible.
 */

import { SYNC_META_KEY, isSyncKey, mergeSync, parseMeta, type SyncMeta } from './sync-merge';

const DIRTY_KEY = 'swapwick-sync-dirty';
/** Local copy of the change times. Kept outside the `opencharts:` prefix so backups stay clean. */
const LOCAL_META_KEY = 'swapwick-sync-meta';
const PUSH_DELAY_MS = 1500;
const POLL_MS = 60_000;
const FOCUS_GAP_MS = 5_000;

export interface SyncOptions {
  api: (path: string, init?: RequestInit) => Promise<Response>;
  signedIn: () => boolean;
  /** Keys whose local value was replaced by newer account data. `first` = first sync after page load. */
  onRemoteChange: (keys: string[], first: boolean) => void;
  onError?: (message: string) => void;
}

let opts: SyncOptions | null = null;
let muted = 0;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let running: Promise<string[]> | null = null;
let again = false;
let lastRun = 0;
let firstDone = false;

const proto = Storage.prototype;
const rawGet = proto.getItem;
const rawSet = proto.setItem;
const rawRemove = proto.removeItem;

function isLocal(store: Storage): boolean {
  try {
    return store === window.localStorage;
  } catch {
    return false;
  }
}

let metaCache: SyncMeta | null = null;

function readMeta(): SyncMeta {
  if (!metaCache) metaCache = parseMeta(rawGet.call(localStorage, LOCAL_META_KEY));
  return metaCache;
}

function writeMeta(meta: SyncMeta): void {
  metaCache = meta;
  rawSet.call(localStorage, LOCAL_META_KEY, JSON.stringify(meta));
}

function touch(key: string, deleted: boolean): void {
  const meta = readMeta();
  const now = Date.now();
  if (deleted) {
    meta.del[key] = now;
    delete meta.ts[key];
  } else {
    meta.ts[key] = now;
    delete meta.del[key];
  }
  try {
    writeMeta(meta);
    rawSet.call(localStorage, DIRTY_KEY, '1');
  } catch {
    /* quota: the value itself is saved; sync catches up later */
  }
  schedulePush();
}

/** Patch localStorage once so every save is noticed, wherever in the app it happens. */
export function installChangeTracking(): void {
  if ((proto as { __swSync?: boolean }).__swSync) return;
  (proto as { __swSync?: boolean }).__swSync = true;
  proto.setItem = function (this: Storage, key: string, value: string): void {
    if (muted || !isLocal(this) || !isSyncKey(key)) return rawSet.call(this, key, value);
    const old = rawGet.call(this, key);
    rawSet.call(this, key, value);
    if (old !== String(value)) touch(key, false);
  };
  proto.removeItem = function (this: Storage, key: string): void {
    if (muted || !isLocal(this) || !isSyncKey(key)) return rawRemove.call(this, key);
    const existed = rawGet.call(this, key) !== null;
    rawRemove.call(this, key);
    if (existed) touch(key, true);
  };
}

function collectLocal(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !isSyncKey(key)) continue;
    const v = rawGet.call(localStorage, key);
    if (v != null) out[key] = v;
  }
  return out;
}

export function isDirty(): boolean {
  try {
    return rawGet.call(localStorage, DIRTY_KEY) === '1';
  } catch {
    return false;
  }
}

async function runOnce(): Promise<string[]> {
  if (!opts || !opts.signedIn()) return [];
  const changed = new Set<string>();
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await opts.api('/sync');
    if (!res.ok) throw new Error(`sync ${res.status}`);
    const body = (await res.json()) as { updatedAt: number | null; data?: Record<string, string> };
    const remote = body.data ?? {};
    const remoteMeta = parseMeta(remote[SYNC_META_KEY]);
    const dirtyBefore = isDirty();
    const result = mergeSync(collectLocal(), readMeta(), remote, remoteMeta);
    muted++;
    try {
      for (const key of result.changedLocal) {
        if (key in result.data) rawSet.call(localStorage, key, result.data[key]!);
        else rawRemove.call(localStorage, key);
        changed.add(key);
      }
      writeMeta(result.meta);
    } finally {
      muted--;
    }
    if (!result.needsPush && !dirtyBefore) return [...changed];
    const payload = { ...result.data, [SYNC_META_KEY]: JSON.stringify(result.meta) };
    const put = await opts.api('/sync', {
      method: 'PUT',
      body: JSON.stringify({ data: payload, updatedAt: body.updatedAt ?? 0, force: false }),
    });
    if (put.status === 409) continue; // someone else uploaded in between: merge again
    if (!put.ok) throw new Error(`sync ${put.status}`);
    try {
      rawRemove.call(localStorage, DIRTY_KEY);
    } catch {
      /* ignore */
    }
    return [...changed];
  }
  return [...changed];
}

/** Pull, merge, and upload if needed. Calls are serialised; a call during a run queues one more. */
export function syncNow(): Promise<string[]> {
  if (running) {
    again = true;
    return running;
  }
  lastRun = Date.now();
  running = runOnce()
    .then((keys) => {
      const first = !firstDone;
      firstDone = true;
      if (keys.length) opts?.onRemoteChange(keys, first);
      return keys;
    })
    .catch((err) => {
      opts?.onError?.(String(err instanceof Error ? err.message : err));
      return [] as string[];
    })
    .finally(() => {
      running = null;
      if (again) {
        again = false;
        void syncNow();
      }
    });
  return running;
}

function schedulePush(): void {
  if (!opts?.signedIn()) return;
  if (pushTimer !== undefined) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = undefined;
    void syncNow();
  }, PUSH_DELAY_MS);
}

export function startAutoSync(options: SyncOptions): void {
  opts = options;
  installChangeTracking();
  window.addEventListener('storage', (ev) => {
    if (ev.key === LOCAL_META_KEY || ev.key === null) metaCache = null;
  });
  const onVisible = (): void => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - lastRun < FOCUS_GAP_MS) return;
    void syncNow();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (pushTimer !== undefined && isDirty()) {
        clearTimeout(pushTimer);
        pushTimer = undefined;
        void syncNow();
      }
      return;
    }
    onVisible();
  });
  window.addEventListener('focus', onVisible);
  setInterval(() => {
    if (document.visibilityState === 'visible' && opts?.signedIn()) void syncNow();
  }, POLL_MS);
}

/** Forget the "first sync" state (after sign-in) so a reload can show account data. */
export function resetFirstSync(): void {
  firstDone = false;
}
