// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { bitstamp } from './bitstamp';
import { binance } from './binance';
import { coinbase } from './coinbase';
import { kraken } from './kraken';
import { yahoo } from './yahoo';
import { dex } from './dex';
import type { DataSource } from './types';

/**
 * Register a new exchange by adding its module and one line here.
 * Only include sources that allow public, key-free browser (CORS) access.
 */
export const sources: DataSource[] = [kraken, binance, coinbase, bitstamp, yahoo, dex];

export function getSource(id: string): DataSource | undefined {
  return sources.find((s) => s.id === id);
}

export type { Candle, CandleQuery, DataSource, IntervalId, PairDef, PairId, Ticker } from './types';
export { HISTORY_PAGE, INTERVALS, MAX_HISTORY, PAIR_IDS, PAIR_LABELS, isIntervalId } from './types';
export { BUILTIN_INTERVALS, DEFAULT_INTERVAL_FAVORITES, INTERVAL_FAV_KEY, intervalLabel, intervalSeconds, loadIntervalFavorites, parseIntervalId, saveIntervalFavorites, sourceIntervalFor } from './intervals';

export { formatPairLabel, nativeSymbol, loadAllSymbols, cachedCounts } from './catalog';
