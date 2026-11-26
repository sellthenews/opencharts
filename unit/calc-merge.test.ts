// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import assert from 'node:assert/strict';
import test from 'node:test';
import { bucketSamples, parseGlobal, ratioCandles } from '../src/sources/calc-math.ts';
import { mergeWatchlists } from '../src/watchlist-merge.ts';

test('parseGlobal reads BTC and XRP dominance', () => {
  const d = parseGlobal({ data: { market_cap_percentage: { btc: 57.9, xrp: 2.87 } } }, 1_700_000_000_000);
  assert.deepEqual(d, { t: 1_700_000_000, btc: 57.9, xrp: 2.87 });
  assert.throws(() => parseGlobal({ data: { market_cap_percentage: { btc: 50 } } }));
});

test('bucketSamples builds OHLC candles from samples', () => {
  const c = bucketSamples(
    [
      { t: 3600, btc: 50, xrp: 2 },
      { t: 3700, btc: 52, xrp: 2 },
      { t: 3800, btc: 49, xrp: 2 },
      { t: 7300, btc: 51, xrp: 2 },
    ],
    (s) => s.btc,
    3600,
  );
  assert.equal(c.length, 2);
  assert.deepEqual([c[0]!.open, c[0]!.high, c[0]!.low, c[0]!.close], [50, 52, 49, 49]);
  assert.equal(c[1]!.time, 7200);
});

test('ratioCandles divides two series on matching times', () => {
  const mk = (time: number, o: number, c: number) => ({ time, open: o, high: Math.max(o, c), low: Math.min(o, c), close: c, volume: 1 });
  const r = ratioCandles([mk(1, 0.12, 0.13), mk(2, 0.13, 0.14)], [mk(1, 0.6, 0.65)]);
  assert.equal(r.length, 1);
  assert.ok(Math.abs(r[0]!.open - 0.2) < 1e-9);
  assert.ok(Math.abs(r[0]!.close - 0.2) < 1e-9);
});

test('mergeWatchlists keeps existing lists and replaces same ids', () => {
  const cur = JSON.stringify({ activeId: 'moje', lists: [{ id: 'moje', name: 'A', items: [], sections: [] }, { id: 'x', name: 'X', items: [], sections: [] }] });
  const inc = JSON.stringify({ activeId: 'm', lists: [{ id: 'x', name: 'X2', items: [], sections: [] }, { id: 'm', name: 'M', items: [], sections: [] }] });
  const out = JSON.parse(mergeWatchlists(cur, inc));
  assert.deepEqual(out.lists.map((l: { id: string }) => l.id), ['moje', 'x', 'm']);
  assert.equal(out.lists[1].name, 'X2');
  assert.equal(out.activeId, 'm');
  assert.equal(mergeWatchlists(null, inc), inc);
});
