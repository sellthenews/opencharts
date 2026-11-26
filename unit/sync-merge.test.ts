// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyMeta, isSyncKey, mergeSync, mergeWatchState } from '../src/sync-merge.ts';

const W = 'opencharts:watchlists';
const list = (id: string, n: number) => ({ id, name: id, items: Array.from({ length: n }, (_, i) => ({ sourceId: 'kraken', pairId: `P${i}` })), sections: [] });
const ws = (lists: unknown[], activeId = 'moje') => JSON.stringify({ activeId, lists });

test('caches and device keys are not synced', () => {
  assert.equal(isSyncKey('opencharts:symbols:kraken'), false);
  assert.equal(isSyncKey('opencharts:sync-meta'), false);
  assert.equal(isSyncKey('opencharts:drawings:kraken:XRPUSD'), true);
  assert.equal(isSyncKey(W), true);
});

test('a list imported before timestamps existed is uploaded and reaches the other device', () => {
  const desktop = { [W]: ws([list('moje', 4), list('mateusz', 20)], 'mateusz') };
  const server = { 'opencharts:theme': 'dark' };
  const up = mergeSync(desktop, emptyMeta(), server, emptyMeta());
  assert.equal(up.needsPush, true);
  assert.ok(up.data[W]!.includes('mateusz'));
  const phone = { [W]: ws([list('moje', 4)]) };
  const down = mergeSync(phone, emptyMeta(), up.data, up.meta);
  assert.ok(down.changedLocal.includes(W));
  assert.deepEqual(JSON.parse(down.data[W]!).lists.map((l: { id: string }) => l.id), ['moje', 'mateusz']);
});

test('newer change wins per key; older device does not overwrite it', () => {
  const r = mergeSync({ 'opencharts:theme': 'light' }, { ts: { 'opencharts:theme': 100 }, del: {} }, { 'opencharts:theme': 'dark' }, { ts: { 'opencharts:theme': 200 }, del: {} });
  assert.equal(r.data['opencharts:theme'], 'dark');
  assert.deepEqual(r.changedLocal, ['opencharts:theme']);
  assert.equal(r.needsPush, false);
});

test('a newer deletion removes the key; an empty server never wipes local data', () => {
  const k = 'opencharts:drawings:kraken:XRPUSD';
  const del = mergeSync({ [k]: '[{"id":"a"}]' }, { ts: { [k]: 100 }, del: {} }, { 'opencharts:theme': 'x' }, { ts: {}, del: { [k]: 300 } });
  assert.equal(k in del.data, false);
  assert.ok(del.changedLocal.includes(k));
  const empty = mergeSync({ [k]: '[{"id":"a"}]' }, emptyMeta(), {}, emptyMeta());
  assert.equal(empty.data[k], '[{"id":"a"}]');
  assert.equal(empty.changedLocal.length, 0);
});

test('unknown times: drawings are united, empty values do not replace data', () => {
  const k = 'opencharts:drawings:kraken:BTCUSD';
  const r = mergeSync({ [k]: '[{"id":"a"}]', 'opencharts:indicators': '[]' }, emptyMeta(), { [k]: '[{"id":"b"}]', 'opencharts:indicators': '[{"id":"rsi"}]' }, emptyMeta());
  assert.deepEqual(JSON.parse(r.data[k]!).map((d: { id: string }) => d.id), ['a', 'b']);
  assert.equal(r.data['opencharts:indicators'], '[{"id":"rsi"}]');
});

test('watch lists merge per list id; newer side wins a shared list', () => {
  const out = JSON.parse(mergeWatchState(ws([list('moje', 1), list('a', 1)]), ws([list('moje', 3), list('b', 2)], 'b'), 'remote')!);
  assert.deepEqual(out.lists.map((l: { id: string }) => l.id), ['moje', 'a', 'b']);
  assert.equal(out.lists[0].items.length, 3);
  assert.equal(out.activeId, 'b');
  const tie = JSON.parse(mergeWatchState(ws([list('moje', 5)]), ws([list('moje', 0)]), 'tie')!);
  assert.equal(tie.lists[0].items.length, 5);
});
