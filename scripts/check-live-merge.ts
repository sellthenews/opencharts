import { isoToUnix, mergeLiveCandle } from '../src/live/merge.ts';
import type { Candle } from '../src/sources/types.ts';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

assert(isoToUnix('2026-11-14T00:00:00.000000000Z') === 1794614400, 'iso nanos');
assert(isoToUnix('2026-11-14T00:00:00.000Z') === 1794614400, 'iso ms');

const base: Candle[] = [
  { time: 100, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
];
const updated = mergeLiveCandle(base, { time: 100, open: 1, high: 2.2, low: 0.4, close: 1.8, volume: 12 }, '1D');
assert(updated.length === 1 && updated[0]!.high === 2.2 && updated[0]!.close === 1.8, 'replace last');

const appended = mergeLiveCandle(updated, { time: 200, open: 1.8, high: 2, low: 1.7, close: 1.9, volume: 3 }, '1D');
assert(appended.length === 2 && appended[1]!.time === 200, 'append new');

// 1M: week in same month updates last month bar
const jan = 1767225600; // 2026-01-01 approx check via monthStart
const monthCandles: Candle[] = [{ time: jan, open: 1, high: 2, low: 1, close: 1.5, volume: 10 }];
// Use a time that monthStartUtc will map; we'll just ensure merge doesn't throw and close updates when same bucket
const mid = mergeLiveCandle(
  monthCandles,
  { time: jan + 7 * 86400, open: 1.5, high: 3, low: 0.8, close: 2.1, volume: 4 },
  '1M',
);
assert(mid[0]!.high === 3 && mid[0]!.low === 0.8 && mid[0]!.close === 2.1, '1M fold into month');

console.log('live-merge ok');
