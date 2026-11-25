// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sessionVwapProfile } from '../src/indicators/math';
import { usRthSessionId } from '../src/timezone';

const MIN = 60;

function bar(time: number, close: number, volume = 10) {
  return { time, open: close, high: close, low: close, close, volume };
}

test('US regular session is 09:30–16:00 New York', () => {
  const open = Date.parse('2024-01-02T14:30:00Z') / 1000;
  const before = open - 60;
  const midday = Date.parse('2024-01-02T18:00:00Z') / 1000;
  const close = Date.parse('2024-01-02T21:00:00Z') / 1000;
  assert.equal(usRthSessionId(before), null);
  assert.equal(usRthSessionId(open), '2024-01-02');
  assert.equal(usRthSessionId(midday), '2024-01-02');
  assert.equal(usRthSessionId(close), null);
});

test('stock session VWAP ignores pre-market and resets the next New York session', () => {
  const day1 = Date.parse('2024-01-02T14:30:00Z') / 1000;
  const pre = day1 - 30 * MIN;
  const day2 = Date.parse('2024-01-03T14:30:00Z') / 1000;
  const candles = [bar(pre, 10, 100), bar(day1, 20, 10), bar(day1 + 30 * MIN, 30, 10), bar(day2, 40, 10)];
  const profile = sessionVwapProfile(candles, 'us-rth');
  assert.deepEqual(profile.map((p) => p.time), [day1, day1 + 30 * MIN, day2]);
  assert.equal(profile[0]!.vwap, 20);
  assert.equal(profile[1]!.vwap, 25);
  assert.equal(profile[2]!.vwap, 40);
});

test('crypto session VWAP still resets on the UTC day', () => {
  const t0 = Date.parse('2024-01-02T23:00:00Z') / 1000;
  const t1 = Date.parse('2024-01-03T01:00:00Z') / 1000;
  const profile = sessionVwapProfile([bar(t0, 10, 10), bar(t1, 30, 10)], 'utc-day');
  assert.equal(profile[0]!.vwap, 10);
  assert.equal(profile[1]!.vwap, 30);
});
