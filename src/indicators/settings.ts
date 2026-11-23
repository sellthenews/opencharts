// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Wykresy contributors

import { DEFAULT_INDICATORS, INDICATOR_STORAGE_KEY } from './types';
import type { IndicatorSettings } from './types';

function clamp(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function clampFloat(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizeSettings(raw: unknown): IndicatorSettings {
  const d = DEFAULT_INDICATORS;
  const r = raw && typeof raw === 'object' ? (raw as Partial<IndicatorSettings>) : {};
  return {
    sma: { on: Boolean(r.sma?.on), period: clamp(Number(r.sma?.period), 2, 400, d.sma.period) },
    ema: { on: Boolean(r.ema?.on), period: clamp(Number(r.ema?.period), 2, 400, d.ema.period) },
    wma: { on: Boolean(r.wma?.on), period: clamp(Number(r.wma?.period), 2, 400, d.wma.period) },
    bb: {
      on: Boolean(r.bb?.on),
      period: clamp(Number(r.bb?.period), 2, 400, d.bb.period),
      std: clampFloat(Number(r.bb?.std), 0.5, 6, d.bb.std),
    },
    volume: { on: r.volume?.on ?? d.volume.on },
    rsi: { on: Boolean(r.rsi?.on), period: clamp(Number(r.rsi?.period), 2, 400, d.rsi.period) },
    macd: {
      on: Boolean(r.macd?.on),
      fast: clamp(Number(r.macd?.fast), 2, 200, d.macd.fast),
      slow: clamp(Number(r.macd?.slow), 3, 400, d.macd.slow),
      signal: clamp(Number(r.macd?.signal), 2, 200, d.macd.signal),
    },
  };
}

export function loadIndicatorSettings(): IndicatorSettings {
  try {
    const raw = localStorage.getItem(INDICATOR_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_INDICATORS, sma: { ...DEFAULT_INDICATORS.sma }, ema: { ...DEFAULT_INDICATORS.ema }, bb: { ...DEFAULT_INDICATORS.bb }, volume: { ...DEFAULT_INDICATORS.volume }, rsi: { ...DEFAULT_INDICATORS.rsi }, macd: { ...DEFAULT_INDICATORS.macd } };
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return normalizeSettings(null);
  }
}

export function saveIndicatorSettings(settings: IndicatorSettings): void {
  localStorage.setItem(INDICATOR_STORAGE_KEY, JSON.stringify(settings));
}
