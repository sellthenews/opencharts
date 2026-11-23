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

/** Legacy checkbox settings, used only to migrate localStorage. */
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
  supertrend: { on: boolean; period: number; multiplier: number };
  pivots: { on: boolean };
  ichimoku: { on: boolean };
  adx: { on: boolean; period: number };
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
  supertrend: { on: false, period: 10, multiplier: 3 },
  pivots: { on: false },
  ichimoku: { on: false },
  adx: { on: false, period: 14 },
  macd: { on: false, fast: 12, slow: 26, signal: 9 },
};

export const INDICATOR_STORAGE_KEY = 'wykresy:indicators';

export type IndicatorKind =
  | 'sma'
  | 'ema'
  | 'wma'
  | 'ichimoku'
  | 'supertrend'
  | 'pivots'
  | 'adx'
  | 'rsi'
  | 'macd'
  | 'stoch'
  | 'bb'
  | 'atr'
  | 'volume'
  | 'vwap';

export type IndicatorGroupId = 'trend' | 'momentum' | 'volatility' | 'volume';

export interface IndicatorParams {
  period?: number;
  std?: number;
  kPeriod?: number;
  dPeriod?: number;
  multiplier?: number;
  fast?: number;
  slow?: number;
  signal?: number;
}

export interface IndicatorInstance {
  id: string;
  kind: IndicatorKind;
  visible: boolean;
  params: IndicatorParams;
}

export type IndicatorFieldKey = keyof IndicatorParams;

export interface IndicatorField {
  key: IndicatorFieldKey;
  label: string;
  min: number;
  max: number;
  step: number;
}

export interface IndicatorMeta {
  kind: IndicatorKind;
  name: string;
  short: string;
  aliases: string[];
  group: IndicatorGroupId;
  defaults: IndicatorParams;
  fields: IndicatorField[];
  pane: 'price' | 'osc';
}

export const INDICATOR_GROUPS: { id: IndicatorGroupId; label: string }[] = [
  { id: 'trend', label: 'Trend' },
  { id: 'momentum', label: 'Momentum' },
  { id: 'volatility', label: 'Zmienność' },
  { id: 'volume', label: 'Wolumen' },
];

function periodField(label = 'Okres'): IndicatorField {
  return { key: 'period', label, min: 2, max: 400, step: 1 };
}

export const INDICATOR_CATALOG: IndicatorMeta[] = [
  { kind: 'sma', name: 'Średnia krocząca prosta', short: 'SMA', aliases: ['ma', 'sma'], group: 'trend', defaults: { period: 20 }, fields: [periodField()], pane: 'price' },
  { kind: 'ema', name: 'Średnia wykładnicza', short: 'EMA', aliases: ['ema'], group: 'trend', defaults: { period: 20 }, fields: [periodField()], pane: 'price' },
  { kind: 'wma', name: 'Średnia ważona', short: 'WMA', aliases: ['wma'], group: 'trend', defaults: { period: 20 }, fields: [periodField()], pane: 'price' },
  { kind: 'ichimoku', name: 'Ichimoku', short: 'Ichimoku', aliases: ['cloud', 'kumo', 'ichimoku'], group: 'trend', defaults: {}, fields: [], pane: 'price' },
  {
    kind: 'supertrend',
    name: 'Supertrend',
    short: 'Supertrend',
    aliases: ['st', 'supertrend'],
    group: 'trend',
    defaults: { period: 10, multiplier: 3 },
    fields: [periodField('Okres ATR'), { key: 'multiplier', label: 'Mnożnik', min: 0.5, max: 10, step: 0.1 }],
    pane: 'price',
  },
  { kind: 'pivots', name: 'Pivot Points', short: 'Pivot Points', aliases: ['pivot', 'pp', 'pivots'], group: 'trend', defaults: {}, fields: [], pane: 'price' },
  { kind: 'adx', name: 'ADX/DMI', short: 'ADX', aliases: ['dmi', 'adx'], group: 'trend', defaults: { period: 14 }, fields: [periodField()], pane: 'osc' },
  { kind: 'rsi', name: 'RSI', short: 'RSI', aliases: ['rsi'], group: 'momentum', defaults: { period: 14 }, fields: [periodField()], pane: 'osc' },
  {
    kind: 'macd',
    name: 'MACD',
    short: 'MACD',
    aliases: ['macd'],
    group: 'momentum',
    defaults: { fast: 12, slow: 26, signal: 9 },
    fields: [
      { key: 'fast', label: 'Szybka', min: 2, max: 200, step: 1 },
      { key: 'slow', label: 'Wolna', min: 3, max: 400, step: 1 },
      { key: 'signal', label: 'Sygnał', min: 2, max: 200, step: 1 },
    ],
    pane: 'osc',
  },
  {
    kind: 'stoch',
    name: 'Stochastic',
    short: 'Stochastic',
    aliases: ['stoch', 'stochastic'],
    group: 'momentum',
    defaults: { kPeriod: 14, dPeriod: 3 },
    fields: [
      { key: 'kPeriod', label: '%K', min: 2, max: 400, step: 1 },
      { key: 'dPeriod', label: '%D', min: 1, max: 100, step: 1 },
    ],
    pane: 'osc',
  },
  {
    kind: 'bb',
    name: 'Bollinger Bands',
    short: 'Bollinger',
    aliases: ['bb', 'bollinger', 'bands'],
    group: 'volatility',
    defaults: { period: 20, std: 2 },
    fields: [periodField(), { key: 'std', label: 'Odch. std.', min: 0.5, max: 6, step: 0.1 }],
    pane: 'price',
  },
  { kind: 'atr', name: 'ATR', short: 'ATR', aliases: ['atr'], group: 'volatility', defaults: { period: 14 }, fields: [periodField()], pane: 'osc' },
  { kind: 'volume', name: 'Wolumen', short: 'Wolumen', aliases: ['volume', 'vol', 'wolumen'], group: 'volume', defaults: {}, fields: [], pane: 'price' },
  { kind: 'vwap', name: 'VWAP', short: 'VWAP', aliases: ['vwap'], group: 'volume', defaults: {}, fields: [], pane: 'price' },
];

export const CATALOG_BY_KIND: Record<IndicatorKind, IndicatorMeta> = Object.fromEntries(
  INDICATOR_CATALOG.map((m) => [m.kind, m]),
) as Record<IndicatorKind, IndicatorMeta>;

function fmtNum(value: number | undefined, fallback: number): string {
  const x = value ?? fallback;
  return Number.isInteger(x) ? String(x) : String(Number(x.toFixed(2)));
}

export function formatIndicatorLabel(item: IndicatorInstance): string {
  const meta = CATALOG_BY_KIND[item.kind];
  const p = { ...meta.defaults, ...item.params };
  switch (item.kind) {
    case 'sma':
    case 'ema':
    case 'wma':
    case 'rsi':
    case 'atr':
    case 'adx':
      return `${meta.short} ${fmtNum(p.period, 0)}`;
    case 'bb':
      return `Bollinger ${fmtNum(p.period, 20)} ${fmtNum(p.std, 2)}`;
    case 'stoch':
      return `Stochastic ${fmtNum(p.kPeriod, 14)} ${fmtNum(p.dPeriod, 3)}`;
    case 'macd':
      return `MACD ${fmtNum(p.fast, 12)} ${fmtNum(p.slow, 26)} ${fmtNum(p.signal, 9)}`;
    case 'supertrend':
      return `Supertrend ${fmtNum(p.period, 10)} ${fmtNum(p.multiplier, 3)}`;
    default:
      return meta.short;
  }
}

export function matchesIndicatorQuery(meta: IndicatorMeta, query: string): boolean {
  const s = query.trim().toLowerCase();
  if (!s) return true;
  return [meta.name, meta.short, meta.kind, ...meta.aliases].some((v) => v.toLowerCase().includes(s));
}
