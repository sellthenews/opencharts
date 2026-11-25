// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import '../storage';
import {
  CATALOG_BY_KIND,
  DEFAULT_INDICATORS,
  INDICATOR_STORAGE_KEY,
} from './types';
import type { IndicatorInstance, IndicatorKind, IndicatorParams, IndicatorSettings, IndicatorStyle } from './types';

export function indicatorStorageKey(sourceId: string, pairId: string): string {
  return `${INDICATOR_STORAGE_KEY}:${sourceId}:${pairId}`;
}

const FAVORITES_KEY = 'opencharts:indicator-favorites';

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
    if (field.type === 'select' || field.type === 'toggle') {
      const fallback = String(meta.defaults[field.key] ?? field.options?.[0]?.value ?? '');
      const raw = params[field.key] != null && params[field.key] !== '' ? String(params[field.key]) : fallback;
      const allowed = field.options?.some((o) => o.value === raw);
      (out as Record<string, string | number | undefined>)[field.key] = allowed ? raw : fallback;
      continue;
    }
    const raw = Number(params[field.key]);
    const fallback = Number(meta.defaults[field.key]);
    const min = field.min ?? 0;
    const max = field.max ?? 1e9;
    const step = field.step ?? 1;
    (out as Record<string, string | number | undefined>)[field.key] = step < 1
      ? clampFloat(raw, min, max, fallback)
      : clamp(raw, min, max, fallback);
  }
  if (typeof params.anchor === 'number' && Number.isFinite(params.anchor)) out.anchor = params.anchor;
  if (typeof params.end === 'number' && Number.isFinite(params.end)) out.end = params.end;
  return out;
}

export function clampStyle(style: IndicatorStyle | undefined): IndicatorStyle | undefined {
  if (!style) return undefined;
  const out: IndicatorStyle = {};
  if (typeof style.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(style.color)) out.color = style.color;
  if (typeof style.width === 'number' && style.width >= 1 && style.width <= 4) out.width = Math.round(style.width);
  return out.color || out.width ? out : undefined;
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
  return { id, kind, visible: r.visible !== false, params: clampParams(kind, r.params ?? {}), style: clampStyle(r.style) };
}

export interface StoredIndicators {
  items: IndicatorInstance[];
  panes?: number[];
}

function parseStored(raw: string): StoredIndicators | null {
  try {
    const parsed = JSON.parse(raw) as { v?: number; items?: unknown; panes?: unknown } | IndicatorSettings;
    if (parsed && typeof parsed === 'object' && (parsed as { v?: number }).v === 2 && Array.isArray((parsed as { items?: unknown }).items)) {
      const rec = parsed as { items: unknown[]; panes?: unknown };
      const items = rec.items.map(normalizeInstance).filter((x): x is IndicatorInstance => x !== null);
      const panes = Array.isArray(rec.panes)
        ? rec.panes.filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0)
        : undefined;
      return { items: items.length ? items : defaultItems(), panes };
    }
    return { items: fromLegacy(parsed) };
  } catch {
    return null;
  }
}

export function loadIndicatorFavorites(): IndicatorKind[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((k): k is IndicatorKind => typeof k === 'string' && k in CATALOG_BY_KIND);
  } catch {
    return [];
  }
}

export function saveIndicatorFavorites(kinds: IndicatorKind[]): void {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(kinds));
}

export function toggleIndicatorFavorite(kind: IndicatorKind): IndicatorKind[] {
  const cur = loadIndicatorFavorites();
  const next = cur.includes(kind) ? cur.filter((k) => k !== kind) : [...cur, kind];
  saveIndicatorFavorites(next);
  return next;
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

export function loadIndicatorSettings(sourceId?: string, pairId?: string): StoredIndicators {
  try {
    if (sourceId && pairId) {
      const raw = localStorage.getItem(indicatorStorageKey(sourceId, pairId));
      if (raw) {
        const parsed = parseStored(raw);
        if (parsed) return parsed;
      }
    }
    const raw = localStorage.getItem(INDICATOR_STORAGE_KEY);
    if (!raw) return { items: defaultItems() };
    return parseStored(raw) ?? { items: defaultItems() };
  } catch {
    return { items: defaultItems() };
  }
}

export function saveIndicatorSettings(
  items: IndicatorInstance[],
  sourceId?: string,
  pairId?: string,
  panes?: number[],
): void {
  const payload = JSON.stringify({ v: 2, items, panes });
  if (sourceId && pairId) localStorage.setItem(indicatorStorageKey(sourceId, pairId), payload);
  else localStorage.setItem(INDICATOR_STORAGE_KEY, payload);
}
