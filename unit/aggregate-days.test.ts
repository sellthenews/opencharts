// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aggregateCandles, bucketStart, isValidCandle } from '../src/sources/aggregate';
import { BUILTIN_INTERVALS, parseIntervalId, sourceIntervalFor } from '../src/sources/intervals';

const DAY = 86_400;

function candle(dayOffset: number, open: number, high: number, low: number, close: number, volume: number) {
  return { time: dayOffset * DAY, open, high, low, close, volume };
}

test('Days group lists 2D, 3D, 1W, and 1M', () => {
  const days = BUILTIN_INTERVALS.filter((d) => d.group === 'days').map((d) => d.id);
  assert.deepEqual(days, ['1D', '2D', '3D', '1W', '1M']);
});

test('custom multi-day values such as 5D parse canonically', () => {
  assert.equal(parseIntervalId('5D'), '5D');
  assert.equal(parseIntervalId('5d'), '5D');
  assert.equal(parseIntervalId('2d'), '2D');
  assert.equal(parseIntervalId('3D'), '3D');
  assert.equal(sourceIntervalFor(['1m', '1h', '1D', '1W'], '5D'), '1D');
  assert.equal(sourceIntervalFor(['1m', '1h', '1D', '1W'], '3D'), '1D');
});

test('5D aggregates daily candles on UTC windows', () => {
  const candles = [
    candle(0, 10, 12, 9, 11, 1),
    candle(1, 11, 15, 10, 14, 2),
    candle(2, 14, 16, 13, 13, 3),
    candle(3, 13, 13, 7, 9, 4),
    candle(4, 9, 10, 6, 8, 5),
    candle(5, 8, 20, 8, 19, 6),
  ];
  const out = aggregateCandles(candles, '5D');
  assert.equal(bucketStart(0, '5D'), 0);
  assert.equal(bucketStart(4 * DAY, '5D'), 0);
  assert.equal(bucketStart(5 * DAY, '5D'), 5 * DAY);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { time: 0, open: 10, high: 16, low: 6, close: 8, volume: 15 });
  assert.deepEqual(out[1], { time: 5 * DAY, open: 8, high: 20, low: 8, close: 19, volume: 6 });
});

test('3D aggregates daily candles on UTC windows', () => {
  const candles = [
    candle(0, 1, 3, 1, 2, 10),
    candle(1, 2, 4, 0.5, 3, 20),
    candle(2, 3, 3.5, 2, 2.5, 30),
    candle(3, 2.5, 5, 2, 4, 40),
  ];
  const out = aggregateCandles(candles, '3D');
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { time: 0, open: 1, high: 4, low: 0.5, close: 2.5, volume: 60 });
  assert.deepEqual(out[1], { time: 3 * DAY, open: 2.5, high: 5, low: 2, close: 4, volume: 40 });
});

test('aggregation drops non-finite, zero, and negative bars', () => {
  const candles = [
    candle(0, 10, 12, 9, 11, 1),
    { time: DAY, open: 0, high: 0, low: 0, close: 0, volume: 10 },
    { time: 2 * DAY, open: NaN, high: 2, low: 1, close: 2, volume: 1 },
    { time: 3 * DAY, open: -1, high: 1, low: -2, close: 0.5, volume: 1 },
    candle(4, 9, 10, 8, 8.5, 2),
  ];
  const out = aggregateCandles(candles, '1D');
  assert.equal(out.length, 2);
  assert.equal(out[0]!.open, 10);
  assert.equal(out[1]!.close, 8.5);
  assert.equal(isValidCandle(candles[1]!), false);
});
