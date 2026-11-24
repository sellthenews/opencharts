// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import '../storage';
import {
  CATALOG_BY_KIND,
  DEFAULT_INDICATORS,
  INDICATOR_STORAGE_KEY,
} from './types';
import type { IndicatorInstance, IndicatorKind, IndicatorParams, IndicatorSettings } from './types';

function clamp(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function clampFloat(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function newIndicatorId(): string {
  return `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function clampParams(kind: IndicatorKind, params: IndicatorParams): IndicatorParams {
  const meta = CATALOG_BY_KIND[kind];
  const out: IndicatorParams = { ...meta.defaults };
  for (const field of meta.fields) {
    const raw = Number(params[field.key]);
    const fallback = Number(meta.defaults[field.key]);
    out[field.key] = field.step < 1 ? clampFloat(raw, field.min, field.max, fallback) : clamp(raw, field.min, field.max, fallback);
  }
  return out;
}

export function createInstance(kind: IndicatorKind, params?: IndicatorParams, visible = true): IndicatorInstance {
  return { id: newIndicatorId(), kind, visible, params: clampParams(kind, params ?? {}) };
}

function normalizeInstance(raw: unknown): IndicatorInstance | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<IndicatorInstance>;
  if (!r.kind || !(r.kind in CATALOG_BY_KIND)) return null;
  const kind = r.kind;
  const id = typeof r.id === 'string' && r.id ? r.id : newIndicatorId();
  return { id, kind, visible: r.visible !== false, params: clampParams(kind, r.params ?? {}) };
}

function normalizeLegacy(raw: unknown): IndicatorSettings {
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
    vwap: { on: Boolean(r.vwap?.on) },
    rsi: { on: Boolean(r.rsi?.on), period: clamp(Number(r.rsi?.period), 2, 400, d.rsi.period) },
    stoch: { on: Boolean(r.stoch?.on), kPeriod: clamp(Number(r.stoch?.kPeriod), 2, 400, d.stoch.kPeriod), dPeriod: clamp(Number(r.stoch?.dPeriod), 1, 100, d.stoch.dPeriod) },
    atr: { on: Boolean(r.atr?.on), period: clamp(Number(r.atr?.period), 2, 400, d.atr.period) },
    supertrend: { on: Boolean(r.supertrend?.on), period: clamp(Number(r.supertrend?.period), 2, 400, d.supertrend.period), multiplier: clampFloat(Number(r.supertrend?.multiplier), 0.5, 10, d.supertrend.multiplier) },
    pivots: { on: Boolean(r.pivots?.on) },
    ichimoku: { on: Boolean(r.ichimoku?.on) },
    adx: { on: Boolean(r.adx?.on), period: clamp(Number(r.adx?.period), 2, 400, d.adx.period) },
    macd: {
      on: Boolean(r.macd?.on),
      fast: clamp(Number(r.macd?.fast), 2, 200, d.macd.fast),
      slow: clamp(Number(r.macd?.slow), 3, 400, d.macd.slow),
      signal: clamp(Number(r.macd?.signal), 2, 200, d.macd.signal),
    },
  };
}

function fromLegacy(raw: unknown): IndicatorInstance[] {
  const s = normalizeLegacy(raw);
  const items: IndicatorInstance[] = [];
  const add = (kind: IndicatorKind, on: boolean, params?: IndicatorParams) => {
    if (on) items.push(createInstance(kind, params));
  };
  add('sma', s.sma.on, { period: s.sma.period });
  add('ema', s.ema.on, { period: s.ema.period });
  add('wma', s.wma.on, { period: s.wma.period });
  add('bb', s.bb.on, { period: s.bb.period, std: s.bb.std });
  add('volume', s.volume.on);
  add('vwap', s.vwap.on);
  add('rsi', s.rsi.on, { period: s.rsi.period });
  add('stoch', s.stoch.on, { kPeriod: s.stoch.kPeriod, dPeriod: s.stoch.dPeriod });
  add('atr', s.atr.on, { period: s.atr.period });
  add('supertrend', s.supertrend.on, { period: s.supertrend.period, multiplier: s.supertrend.multiplier });
  add('pivots', s.pivots.on);
  add('ichimoku', s.ichimoku.on);
  add('adx', s.adx.on, { period: s.adx.period });
  add('macd', s.macd.on, { fast: s.macd.fast, slow: s.macd.slow, signal: s.macd.signal });
  return items.length ? items : [createInstance('volume')];
}

function defaultItems(): IndicatorInstance[] {
  return [createInstance('volume')];
}

export function loadIndicatorSettings(): IndicatorInstance[] {
  try {
    const raw = localStorage.getItem(INDICATOR_STORAGE_KEY);
    if (!raw) return defaultItems();
    const parsed = JSON.parse(raw) as { v?: number; items?: unknown } | IndicatorSettings;
    if (parsed && typeof parsed === 'object' && (parsed as { v?: number }).v === 2 && Array.isArray((parsed as { items?: unknown }).items)) {
      const items = (parsed as { items: unknown[] }).items.map(normalizeInstance).filter((x): x is IndicatorInstance => x !== null);
      return items.length ? items : defaultItems();
    }
    return fromLegacy(parsed);
  } catch {
    return defaultItems();
  }
}

export function saveIndicatorSettings(items: IndicatorInstance[]): void {
  localStorage.setItem(INDICATOR_STORAGE_KEY, JSON.stringify({ v: 2, items }));
}
