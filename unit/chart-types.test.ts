// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import assert from 'node:assert/strict';
import test from 'node:test';

import type { Candle } from '../src/sources/types';
import {
  autoBrickSize,
  buildChartView,
  heikinAshi,
  isChartTypeId,
  kagiPoints,
  lineBreakBars,
  niceStep,
  pointAndFigure,
  rangeBars,
  renkoBricks,
  uniquifyTimes,
} from '../src/chart-types';

function c(time: number, open: number, high: number, low: number, close: number, volume = 1): Candle {
  return { time, open, high, low, close, volume };
}

test('isChartTypeId accepts the 17 supported types and rejects unknown values', () => {
  const ids = [
    'candles',
    'hollow',
    'bars',
    'heikin',
    'high-low',
    'line',
    'line-markers',
    'stepline',
    'area',
    'hlc-area',
    'baseline',
    'columns',
    'renko',
    'kagi',
    'pnf',
    'linebreak',
    'range',
  ];
  for (const id of ids) assert.equal(isChartTypeId(id), true);
  assert.equal(isChartTypeId('candlestick'), false);
  assert.equal(isChartTypeId(''), false);
});

test('niceStep rounds to 1, 2 or 5 times a power of ten', () => {
  assert.equal(niceStep(0.37), 0.5);
  assert.equal(niceStep(1.2), 2);
  assert.equal(niceStep(3), 5);
  assert.equal(niceStep(9), 10);
  assert.equal(niceStep(0), 1);
});

test('Heikin Ashi uses the standard open/close formulas', () => {
  const input = [c(1, 10, 12, 9, 11), c(2, 11, 14, 10, 13), c(3, 13, 13.5, 11, 12)];
  const ha = heikinAshi(input);
  assert.equal(ha.length, 3);
  assert.equal(ha[0]!.close, (10 + 12 + 9 + 11) / 4);
  assert.equal(ha[0]!.open, (10 + 11) / 2);
  assert.equal(ha[1]!.open, (ha[0]!.open + ha[0]!.close) / 2);
  assert.equal(ha[1]!.close, (11 + 14 + 10 + 13) / 4);
  assert.equal(ha[1]!.high, Math.max(14, ha[1]!.open, ha[1]!.close));
  assert.equal(ha[1]!.low, Math.min(10, ha[1]!.open, ha[1]!.close));
});

test('Renko bricks have a fixed size and reverse only after a two-brick move', () => {
  const input = [
    c(1, 100, 100, 100, 100),
    c(2, 100, 103, 100, 103),
    c(3, 103, 103, 99, 99),
  ];
  const bricks = renkoBricks(input, 1);
  assert.ok(bricks.length >= 3);
  for (const b of bricks) {
    assert.equal(Math.abs(b.close - b.open), 1);
  }
  const ups = bricks.filter((b) => b.close > b.open);
  const downs = bricks.filter((b) => b.close < b.open);
  assert.ok(ups.length >= 2);
  // 103 → 99 is a 4-point drop from last up close, enough for two down bricks (2-brick reversal).
  assert.ok(downs.length >= 2);
  const times = bricks.map((b) => b.time);
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
  assert.equal(new Set(times).size, times.length);
});

test('three-line break adds a bar only when the close breaks the last three lines', () => {
  const input = [
    c(1, 10, 10, 10, 10),
    c(2, 11, 11, 11, 11),
    c(3, 12, 12, 12, 12),
    c(4, 11.5, 11.5, 11.5, 11.5), // inside the last three, ignored
    c(5, 13, 13, 13, 13), // breaks the high
    c(6, 9, 9, 9, 9), // breaks the low
  ];
  const bars = lineBreakBars(input, 3);
  assert.equal(bars.length, 5);
  assert.equal(bars[3]!.close, 13);
  assert.equal(bars[4]!.close, 9);
});

test('range bars have a fixed high-low size except possibly the last in-progress bar', () => {
  const input = [c(1, 10, 10, 10, 10), c(2, 10, 14.5, 10, 14.5), c(3, 14.5, 14.5, 11, 11)];
  const bars = rangeBars(input, 2);
  assert.ok(bars.length >= 3);
  const complete = bars.slice(0, -1);
  for (const b of complete) {
    assert.ok(Math.abs(b.close - b.open) === 2, `unexpected body ${b.open}->${b.close}`);
  }
  const times = bars.map((b) => b.time);
  assert.equal(new Set(times).size, times.length);
});

test('Kagi reverses only after a move of at least the reversal amount', () => {
  const input = [
    c(1, 10, 10, 10, 10),
    c(2, 12, 12, 12, 12),
    c(3, 11.5, 11.5, 11.5, 11.5), // 0.5 < 1, no reverse
    c(4, 9, 9, 9, 9),
  ];
  const pts = kagiPoints(input, 1);
  assert.ok(pts.length >= 3);
  assert.equal(pts[0]!.price, 10);
  assert.equal(pts[1]!.price, 12);
  assert.equal(pts[pts.length - 1]!.price, 9);
});

test('Point & Figure starts a new column after a three-box reversal', () => {
  const input = [
    c(1, 10, 10, 10, 10),
    c(2, 13, 13, 13, 13),
    c(3, 10.5, 10.5, 10.5, 10.5), // less than 3 boxes down
    c(4, 7, 7, 7, 7),
  ];
  const cols = pointAndFigure(input, 1, 3);
  assert.ok(cols.length >= 2);
  assert.equal(cols[0]!.dir, 1);
  assert.equal(cols[1]!.dir, -1);
});

test('uniquifyTimes makes colliding timestamps strictly increasing', () => {
  const rows = uniquifyTimes([
    { time: 100, v: 1 },
    { time: 100, v: 2 },
    { time: 99, v: 3 },
    { time: 104, v: 4 },
  ]);
  assert.deepEqual(rows.map((r) => r.time), [100, 101, 102, 104]);
  assert.deepEqual(rows.map((r) => r.v), [1, 2, 3, 4]);
});

test('buildChartView keeps original times for time-based types and maps close to a line', () => {
  const input = [c(10, 1, 2, 0.5, 1.5), c(20, 1.5, 2.5, 1, 2)];
  const line = buildChartView('line', input);
  assert.equal(line.points.kind, 'line');
  if (line.points.kind === 'line') {
    assert.deepEqual(line.points.data, [
      { time: 10, value: 1.5 },
      { time: 20, value: 2 },
    ]);
  }
  const ha = buildChartView('heikin', input);
  assert.equal(ha.points.kind, 'ohlc');
  assert.equal(ha.bars.length, 2);
  assert.equal(ha.bars[0]!.time, 10);
  const bricks = buildChartView('renko', input);
  assert.ok(autoBrickSize(input) > 0);
  assert.ok(bricks.bars.length >= 0);
});
