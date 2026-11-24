// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { bitstamp } from './bitstamp';
import { binance } from './binance';
import { coinbase } from './coinbase';
import { kraken } from './kraken';
import type { DataSource } from './types';

/**
 * Register a new exchange by adding its module and one line here.
 * Only include sources that allow public, key-free browser (CORS) access.
 */
export const sources: DataSource[] = [kraken, binance, coinbase, bitstamp];

export function getSource(id: string): DataSource | undefined {
  return sources.find((s) => s.id === id);
}

export type { Candle, DataSource, IntervalId, PairDef, PairId, Ticker } from './types';
export { INTERVALS, PAIR_IDS, PAIR_LABELS } from './types';

export { formatPairLabel, nativeSymbol, loadAllSymbols, cachedCounts } from './catalog';
