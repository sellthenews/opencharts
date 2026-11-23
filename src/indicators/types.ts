// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Wykresy contributors

import type { Candle } from '../sources/types';

export type { Candle };

export interface LinePoint {
  time: number;
  value: number;
}

export interface BandPoint {
  time: number;
  mid: number;
  upper: number;
  lower: number;
}

export interface MacdPoint {
  time: number;
  macd: number;
  signal: number;
  histogram: number;
}

export interface IndicatorSettings {
  sma: { on: boolean; period: number };
  ema: { on: boolean; period: number };
  wma: { on: boolean; period: number };
  bb: { on: boolean; period: number; std: number };
  volume: { on: boolean };
  vwap: { on: boolean };
  rsi: { on: boolean; period: number };
  stoch: { on: boolean; kPeriod: number; dPeriod: number };
  atr: { on: boolean; period: number };
  macd: { on: boolean; fast: number; slow: number; signal: number };
}

export const DEFAULT_INDICATORS: IndicatorSettings = {
  sma: { on: false, period: 20 },
  ema: { on: false, period: 20 },
  wma: { on: false, period: 20 },
  bb: { on: false, period: 20, std: 2 },
  volume: { on: true },
  vwap: { on: false },
  rsi: { on: false, period: 14 },
  stoch: { on: false, kPeriod: 14, dPeriod: 3 },
  atr: { on: false, period: 14 },
  macd: { on: false, fast: 12, slow: 26, signal: 9 },
};

export const INDICATOR_STORAGE_KEY = 'wykresy:indicators';
