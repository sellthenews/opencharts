// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

/** Pure merge rules for account sync (no DOM, unit-tested). */

export const SYNC_META_KEY = 'opencharts:sync-meta';
export const WATCH_KEY = 'opencharts:watchlists';

/** Device-only or rebuildable keys that never go to the account. */
const SKIP_PREFIXES = [
  'opencharts:sync-',
  'opencharts:symbols:',
  'opencharts:candles:',
  'opencharts:asset-icons',
  'opencharts:gt-pools',
  'opencharts:dominance',
  'opencharts:reloaded-build',
  'opencharts:xaman-used',
  'opencharts:stocks-proxy',
  'opencharts:pre-dex',
  'opencharts:test-',
];

export function isSyncKey(key: string): boolean {
  return key.startsWith('opencharts:') && !SKIP_PREFIXES.some((p) => key.startsWith(p));
}

export interface SyncMeta {
  /** Last local change per key (ms). Missing = unknown (data from before timestamps existed). */
  ts: Record<string, number>;
  /** Deletion time per key (ms). */
  del: Record<string, number>;
}

export function emptyMeta(): SyncMeta {
  return { ts: {}, del: {} };
}

export function parseMeta(raw: string | null | undefined): SyncMeta {
  try {
    const m = raw ? (JSON.parse(raw) as Partial<SyncMeta>) : null;
    return { ts: { ...(m?.ts ?? {}) }, del: { ...(m?.del ?? {}) } };
  } catch {
    return emptyMeta();
  }
}

export function isEmptyValue(v: string | undefined): boolean {
  if (v === undefined) return true;
  const s = v.trim();
  return s === '' || s === '[]' || s === '{}' || s === 'null';
}

type Item = { sourceId?: string; pairId?: string };
type List = { id?: string; items?: Item[]; sections?: { items?: Item[] }[] };
type State = { lists?: List[]; activeId?: string };

function countItems(l: List): number {
  return (l.items?.length ?? 0) + (l.sections ?? []).reduce((n, s) => n + (s.items?.length ?? 0) + 1, 0);
}

/** Lists are merged by id: lists that exist on only one side are kept; the newer side wins a shared id. */
export function mergeWatchState(local: string | undefined, remote: string | undefined, prefer: 'local' | 'remote' | 'tie'): string | undefined {
  if (local === undefined) return remote;
  if (remote === undefined) return local;
  let a: State;
  let b: State;
  try {
    a = JSON.parse(local) as State;
    b = JSON.parse(remote) as State;
  } catch {
    return prefer === 'remote' ? remote : local;
  }
  if (!Array.isArray(a.lists)) return remote;
  if (!Array.isArray(b.lists)) return local;
  const order: string[] = [];
  const pick = new Map<string, List>();
  const add = (l: List, side: 'local' | 'remote'): void => {
    const id = String(l?.id ?? '');
    if (!id) return;
    const prev = pick.get(id);
    if (!prev) {
      order.push(id);
      pick.set(id, l);
      return;
    }
    let useNew: boolean;
    if (prefer === 'tie') useNew = countItems(l) > countItems(prev);
    else useNew = side === prefer;
    // never replace a non-empty list with an empty copy when the times are unknown
    if (useNew && prefer === 'tie' && countItems(l) === 0) useNew = false;
    if (useNew) pick.set(id, l);
  };
  for (const l of a.lists) add(l, 'local');
  for (const l of b.lists) add(l, 'remote');
  const lists = order.map((id) => pick.get(id)!);
  const activeId = prefer === 'remote' ? (b.activeId ?? a.activeId) : (a.activeId ?? b.activeId);
  return JSON.stringify({ ...a, lists, activeId: lists.some((l) => l.id === activeId) ? activeId : lists[0]?.id });
}

/** On unknown times, drawings are united by id so nothing drawn on either device is lost. */
function unionById(local: string, remote: string): string {
  try {
    const a = JSON.parse(local) as { id?: string }[];
    const b = JSON.parse(remote) as { id?: string }[];
    if (!Array.isArray(a) || !Array.isArray(b)) return local;
    const ids = new Set(a.map((d) => d?.id));
    return JSON.stringify([...a, ...b.filter((d) => !ids.has(d?.id))]);
  } catch {
    return local;
  }
}

export interface MergeResult {
  data: Record<string, string>;
  meta: SyncMeta;
  /** Keys whose local value changed (or were removed). */
  changedLocal: string[];
  /** True when the merged state differs from the server copy and must be uploaded. */
  needsPush: boolean;
}

export function mergeSync(
  local: Record<string, string>,
  localMeta: SyncMeta,
  remote: Record<string, string>,
  remoteMeta: SyncMeta,
): MergeResult {
  const keys = new Set<string>();
  for (const k of [...Object.keys(local), ...Object.keys(remote), ...Object.keys(localMeta.del), ...Object.keys(remoteMeta.del)]) {
    if (isSyncKey(k)) keys.add(k);
  }
  const data: Record<string, string> = {};
  const meta = emptyMeta();
  const changedLocal: string[] = [];
  let needsPush = false;
  const remoteEmpty = !Object.keys(remote).some(isSyncKey);

  for (const key of keys) {
    const lv = local[key];
    const rv = remote[key];
    const lt = Math.max(localMeta.ts[key] ?? 0, localMeta.del[key] ?? 0);
    const rt = Math.max(remoteMeta.ts[key] ?? 0, remoteMeta.del[key] ?? 0);
    const lDeleted = (localMeta.del[key] ?? 0) > (localMeta.ts[key] ?? 0) && lv === undefined;
    const rDeleted = (remoteMeta.del[key] ?? 0) > (remoteMeta.ts[key] ?? 0) && rv === undefined;
    const prefer: 'local' | 'remote' | 'tie' = lt > rt ? 'local' : rt > lt ? 'remote' : 'tie';

    let out: string | undefined;
    let deleted = false;
    if (remoteEmpty) {
      out = lv;
      deleted = lDeleted;
    } else if (key === WATCH_KEY) {
      if (prefer === 'remote' && rDeleted) deleted = true;
      else if (prefer === 'local' && lDeleted) deleted = true;
      else out = mergeWatchState(lv, rv, prefer);
    } else if (prefer === 'local') {
      out = lv;
      deleted = lDeleted;
    } else if (prefer === 'remote') {
      out = rv;
      deleted = rDeleted;
    } else {
      // Unknown times on both sides: never lose data.
      if (lv === undefined) out = rv;
      else if (rv === undefined) out = lv;
      else if (key.startsWith('opencharts:drawings:')) out = unionById(lv, rv);
      else if (isEmptyValue(lv) && !isEmptyValue(rv)) out = rv;
      else out = lv;
    }
    if (out === undefined) deleted = true;

    const t = Math.max(lt, rt);
    if (deleted) {
      if (t) meta.del[key] = t;
      if (lv !== undefined) changedLocal.push(key);
      if (rv !== undefined) needsPush = true;
      continue;
    }
    data[key] = out!;
    if (t) meta.ts[key] = t;
    if (out !== lv) changedLocal.push(key);
    if (out !== rv) needsPush = true;
  }
  return { data, meta, changedLocal, needsPush };
}
