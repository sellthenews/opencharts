// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

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

export const INDICATOR_STORAGE_KEY = 'opencharts:indicators';

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
  | 'vwap'
  | 'vwapAnchor'
  | 'vpvr'
  | 'vpfr'
  | 'stochRsi'
  | 'cci'
  | 'sar'
  | 'keltner'
  | 'donchian'
  | 'obv'
  | 'mfi'
  | 'willr'
  | 'roc'
  | 'momentum'
  | 'cmf'
  | 'aroon'
  | 'autoFib'
  | 'autoTrend'
  | 'maOf'
  | 'cvd'
  | 'footprint';

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
  start?: number;
  max?: number;
  mode?: string;
  anchor?: number;
  end?: number;
  rows?: number;
  tenkan?: number;
  kijun?: number;
  senkou?: number;
  shift?: number;
  bands?: number;
  highs?: string;
  divergences?: string;
  tf?: string;
  source?: string;
}

export interface IndicatorStyle {
  color?: string;
  width?: number;
}

export interface IndicatorInstance {
  id: string;
  kind: IndicatorKind;
  visible: boolean;
  params: IndicatorParams;
  style?: IndicatorStyle;
}

export type IndicatorFieldKey = keyof IndicatorParams;

export interface IndicatorField {
  key: IndicatorFieldKey;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  type?: 'number' | 'select';
  options?: { value: string; label: string }[];
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
  { id: 'volatility', label: 'Volatility' },
  { id: 'volume', label: 'Volume' },
];

function periodField(label = 'Period'): IndicatorField {
  return { key: 'period', label, min: 2, max: 400, step: 1 };
}

const TF_FIELD: IndicatorField = {
  key: 'tf',
  label: 'Timeframe',
  type: 'select',
  options: [
    { value: 'chart', label: 'Chart' },
    { value: '4h', label: '4h' },
    { value: '1D', label: '1D' },
    { value: '1W', label: '1W' },
    { value: '1M', label: '1M' },
  ],
};

const DIV_FIELD: IndicatorField = {
  key: 'divergences',
  label: 'Divergences',
  type: 'select',
  options: [
    { value: 'on', label: 'Regular and hidden' },
    { value: 'off', label: 'Off' },
  ],
};

export const INDICATOR_CATALOG: IndicatorMeta[] = [
  { kind: 'sma', name: 'Simple Moving Average', short: 'SMA', aliases: ['ma', 'sma'], group: 'trend', defaults: { period: 20, tf: 'chart' }, fields: [periodField(), TF_FIELD], pane: 'price' },
  { kind: 'ema', name: 'Exponential Moving Average', short: 'EMA', aliases: ['ema'], group: 'trend', defaults: { period: 20, tf: 'chart' }, fields: [periodField(), TF_FIELD], pane: 'price' },
  { kind: 'wma', name: 'Weighted Moving Average', short: 'WMA', aliases: ['wma'], group: 'trend', defaults: { period: 20 }, fields: [periodField()], pane: 'price' },
  {
    kind: 'ichimoku',
    name: 'Ichimoku',
    short: 'Ichimoku',
    aliases: ['cloud', 'kumo', 'ichimoku'],
    group: 'trend',
    defaults: { tenkan: 9, kijun: 26, senkou: 52, shift: 26 },
    fields: [
      { key: 'tenkan', label: 'Tenkan', min: 2, max: 200, step: 1 },
      { key: 'kijun', label: 'Kijun', min: 2, max: 200, step: 1 },
      { key: 'senkou', label: 'Senkou B', min: 2, max: 400, step: 1 },
      { key: 'shift', label: 'Displacement', min: 1, max: 200, step: 1 },
    ],
    pane: 'price',
  },
  {
    kind: 'supertrend',
    name: 'Supertrend',
    short: 'Supertrend',
    aliases: ['st', 'supertrend'],
    group: 'trend',
    defaults: { period: 10, multiplier: 3 },
    fields: [periodField('ATR Period'), { key: 'multiplier', label: 'Multiplier', min: 0.5, max: 10, step: 0.1 }],
    pane: 'price',
  },
  {
    kind: 'pivots',
    name: 'Pivot Points',
    short: 'Pivot Points',
    aliases: ['pivot', 'pp', 'pivots', 'fib pivot'],
    group: 'trend',
    defaults: { mode: 'standard' },
    fields: [{ key: 'mode', label: 'Type', type: 'select', options: [
      { value: 'standard', label: 'Standard' },
      { value: 'fib', label: 'Fibonacci' },
    ] }],
    pane: 'price',
  },
  { kind: 'aroon', name: 'Aroon', short: 'Aroon', aliases: ['aroon'], group: 'trend', defaults: { period: 25 }, fields: [periodField()], pane: 'osc' },
  { kind: 'adx', name: 'ADX/DMI', short: 'ADX', aliases: ['dmi', 'adx'], group: 'trend', defaults: { period: 14 }, fields: [periodField()], pane: 'osc' },
  { kind: 'rsi', name: 'RSI', short: 'RSI', aliases: ['rsi'], group: 'momentum', defaults: { period: 14, divergences: 'on', tf: 'chart' }, fields: [periodField(), DIV_FIELD, TF_FIELD], pane: 'osc' },
  {
    kind: 'macd',
    name: 'MACD',
    short: 'MACD',
    aliases: ['macd'],
    group: 'momentum',
    defaults: { fast: 12, slow: 26, signal: 9, divergences: 'on', tf: 'chart' },
    fields: [
      { key: 'fast', label: 'Fast', min: 2, max: 200, step: 1 },
      { key: 'slow', label: 'Slow', min: 3, max: 400, step: 1 },
      { key: 'signal', label: 'Signal', min: 2, max: 200, step: 1 },
      DIV_FIELD,
      TF_FIELD,
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
    fields: [periodField(), { key: 'std', label: 'StdDev', min: 0.5, max: 6, step: 0.1 }],
    pane: 'price',
  },
  {
    kind: 'stochRsi',
    name: 'Stochastic RSI',
    short: 'StochRSI',
    aliases: ['stochrsi', 'stoch rsi', 'srsi'],
    group: 'momentum',
    defaults: { period: 14, kPeriod: 3, dPeriod: 3 },
    fields: [
      periodField('RSI Period'),
      { key: 'kPeriod', label: '%K', min: 1, max: 100, step: 1 },
      { key: 'dPeriod', label: '%D', min: 1, max: 100, step: 1 },
    ],
    pane: 'osc',
  },
  {
    kind: 'sar',
    name: 'Parabolic SAR',
    short: 'SAR',
    aliases: ['psar', 'parabolic', 'sar'],
    group: 'trend',
    defaults: { start: 0.02, multiplier: 0.02, max: 0.2 },
    fields: [
      { key: 'start', label: 'Start', min: 0.001, max: 1, step: 0.01 },
      { key: 'multiplier', label: 'Increment', min: 0.001, max: 1, step: 0.01 },
      { key: 'max', label: 'Max', min: 0.01, max: 1, step: 0.01 },
    ],
    pane: 'price',
  },
  { kind: 'momentum', name: 'Momentum', short: 'Momentum', aliases: ['momentum', 'mom'], group: 'momentum', defaults: { period: 10 }, fields: [periodField()], pane: 'osc' },
  { kind: 'roc', name: 'Rate of Change', short: 'ROC', aliases: ['roc', 'rate of change'], group: 'momentum', defaults: { period: 12 }, fields: [periodField()], pane: 'osc' },
  { kind: 'willr', name: 'Williams %R', short: '%R', aliases: ['williams', '%r', 'willr', 'wpr'], group: 'momentum', defaults: { period: 14 }, fields: [periodField()], pane: 'osc' },
  { kind: 'cci', name: 'CCI', short: 'CCI', aliases: ['cci', 'commodity'], group: 'momentum', defaults: { period: 20 }, fields: [periodField()], pane: 'osc' },
  {
    kind: 'keltner',
    name: 'Keltner Channels',
    short: 'Keltner',
    aliases: ['keltner', 'kc'],
    group: 'volatility',
    defaults: { period: 20, kPeriod: 10, multiplier: 2 },
    fields: [
      periodField('EMA Period'),
      { key: 'kPeriod', label: 'ATR Period', min: 2, max: 400, step: 1 },
      { key: 'multiplier', label: 'Multiplier', min: 0.5, max: 10, step: 0.1 },
    ],
    pane: 'price',
  },
  { kind: 'donchian', name: 'Donchian Channels', short: 'Donchian', aliases: ['donchian', 'dc'], group: 'volatility', defaults: { period: 20 }, fields: [periodField()], pane: 'price' },
  { kind: 'atr', name: 'ATR', short: 'ATR', aliases: ['atr'], group: 'volatility', defaults: { period: 14 }, fields: [periodField()], pane: 'osc' },
  { kind: 'volume', name: 'Volume', short: 'Volume', aliases: ['volume', 'vol', 'wolumen', 'volume ma'], group: 'volume', defaults: { period: 20 }, fields: [periodField('MA Period')], pane: 'price' },
  { kind: 'cmf', name: 'Chaikin Money Flow', short: 'CMF', aliases: ['cmf', 'chaikin'], group: 'volume', defaults: { period: 20 }, fields: [periodField()], pane: 'osc' },
  { kind: 'mfi', name: 'Money Flow Index', short: 'MFI', aliases: ['mfi', 'money flow'], group: 'volume', defaults: { period: 14 }, fields: [periodField()], pane: 'osc' },
  { kind: 'obv', name: 'On-Balance Volume', short: 'OBV', aliases: ['obv', 'on balance'], group: 'volume', defaults: {}, fields: [], pane: 'osc' },
  { kind: 'vwap', name: 'VWAP', short: 'VWAP', aliases: ['vwap', 'session vwap', 'vwap bands'], group: 'volume', defaults: { bands: 3, highs: 'on', tf: 'chart' }, fields: [
      { key: 'bands', label: 'Bands (±σ)', min: 0, max: 3, step: 1 },
      { key: 'highs', label: 'Session high/low', type: 'select', options: [{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }] },
      TF_FIELD,
    ], pane: 'price' },
  { kind: 'vwapAnchor', name: 'Anchored VWAP', short: 'Anchored VWAP', aliases: ['avwap', 'anchored vwap'], group: 'volume', defaults: {}, fields: [], pane: 'price' },
  {
    kind: 'vpvr',
    name: 'Volume Profile Visible Range',
    short: 'VPVR',
    aliases: ['vpvr', 'volume profile', 'visible range'],
    group: 'volume',
    defaults: { rows: 24 },
    fields: [{ key: 'rows', label: 'Rows', min: 8, max: 100, step: 1 }],
    pane: 'price',
  },
  {
    kind: 'vpfr',
    name: 'Volume Profile Fixed Range',
    short: 'VPFR',
    aliases: ['vpfr', 'fixed range', 'volume profile'],
    group: 'volume',
    defaults: { rows: 24 },
    fields: [{ key: 'rows', label: 'Rows', min: 8, max: 100, step: 1 }],
    pane: 'price',
  },
  { kind: 'autoFib', name: 'Auto Fib Retracement', short: 'Auto Fib', aliases: ['auto fib', 'autofib'], group: 'trend', defaults: { period: 5 }, fields: [periodField('Pivot length')], pane: 'price' },
  { kind: 'autoTrend', name: 'Auto Trend', short: 'Auto Trend', aliases: ['auto trend', 'autotrend'], group: 'trend', defaults: { period: 5 }, fields: [periodField('Pivot length')], pane: 'price' },
  {
    kind: 'maOf',
    name: 'Moving Average of Indicator',
    short: 'MA of',
    aliases: ['sma of rsi', 'indicator on indicator', 'ma of'],
    group: 'momentum',
    defaults: { period: 14, source: 'rsi', mode: 'sma' },
    fields: [
      { key: 'source', label: 'Source', type: 'select', options: [
        { value: 'rsi', label: 'RSI' },
        { value: 'macd', label: 'MACD' },
        { value: 'close', label: 'Close' },
        { value: 'cvd', label: 'CVD' },
        { value: 'volume', label: 'Volume' },
        { value: 'vwap', label: 'VWAP' },
      ] },
      { key: 'mode', label: 'Method', type: 'select', options: [{ value: 'sma', label: 'SMA' }, { value: 'ema', label: 'EMA' }] },
      periodField(),
    ],
    pane: 'osc',
  },
  { kind: 'cvd', name: 'CVD (approx. from OHLCV)', short: 'CVD', aliases: ['cvd', 'cumulative volume delta', 'delta'], group: 'volume', defaults: {}, fields: [], pane: 'osc' },
  { kind: 'footprint', name: 'Footprint (approx. from OHLCV)', short: 'Footprint', aliases: ['footprint', 'cluster'], group: 'volume', defaults: { rows: 8 }, fields: [{ key: 'rows', label: 'Rows', min: 4, max: 24, step: 1 }], pane: 'price' },
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
  const tf = p.tf && p.tf !== 'chart' ? ` ${p.tf}` : '';
  switch (item.kind) {
    case 'sma':
    case 'ema':
    case 'wma':
    case 'rsi':
    case 'atr':
    case 'adx':
      return `${meta.short} ${fmtNum(p.period, 0)}${tf}`;
    case 'bb':
      return `Bollinger ${fmtNum(p.period, 20)} ${fmtNum(p.std, 2)}`;
    case 'stoch':
      return `Stochastic ${fmtNum(p.kPeriod, 14)} ${fmtNum(p.dPeriod, 3)}`;
    case 'macd':
      return `MACD ${fmtNum(p.fast, 12)} ${fmtNum(p.slow, 26)} ${fmtNum(p.signal, 9)}${tf}`;
    case 'supertrend':
      return `Supertrend ${fmtNum(p.period, 10)} ${fmtNum(p.multiplier, 3)}`;
    case 'stochRsi':
      return `StochRSI ${fmtNum(p.period, 14)} ${fmtNum(p.kPeriod, 3)} ${fmtNum(p.dPeriod, 3)}`;
    case 'cci':
      return `CCI ${fmtNum(p.period, 20)}`;
    case 'sar':
      return `SAR ${fmtNum(p.start, 0.02)} ${fmtNum(p.max, 0.2)}`;
    case 'keltner':
      return `Keltner ${fmtNum(p.period, 20)} ${fmtNum(p.kPeriod, 10)} ${fmtNum(p.multiplier, 2)}`;
    case 'donchian':
      return `Donchian ${fmtNum(p.period, 20)}`;
    case 'obv':
      return 'OBV';
    case 'vwapAnchor':
      return 'Anchored VWAP';
    case 'vpvr':
      return `VPVR ${fmtNum(p.rows, 24)}`;
    case 'vpfr':
      return `VPFR ${fmtNum(p.rows, 24)}`;
    case 'volume':
      return `Volume ${fmtNum(p.period, 20)}`;
    case 'pivots':
      return p.mode === 'fib' ? 'Pivots Fib' : 'Pivots';
    case 'ichimoku':
      return `Ichimoku ${fmtNum(p.tenkan, 9)} ${fmtNum(p.kijun, 26)} ${fmtNum(p.senkou, 52)}`;
    case 'mfi':
      return `MFI ${fmtNum(p.period, 14)}`;
    case 'willr':
      return `%R ${fmtNum(p.period, 14)}`;
    case 'roc':
      return `ROC ${fmtNum(p.period, 12)}`;
    case 'momentum':
      return `Momentum ${fmtNum(p.period, 10)}`;
    case 'cmf':
      return `CMF ${fmtNum(p.period, 20)}`;
    case 'aroon':
      return `Aroon ${fmtNum(p.period, 25)}`;
    case 'vwap':
      return ((p.bands ?? 0) > 0 ? `VWAP ±${fmtNum(p.bands, 3)}` : 'VWAP') + tf;
    case 'autoFib':
      return `Auto Fib ${fmtNum(p.period, 5)}`;
    case 'autoTrend':
      return `Auto Trend ${fmtNum(p.period, 5)}`;
    case 'maOf':
      return `MA of ${p.source ?? 'rsi'} ${fmtNum(p.period, 14)}`;
    case 'cvd':
      return 'CVD';
    case 'footprint':
      return `Footprint ${fmtNum(p.rows, 8)}`;
    default:
      return meta.short;
  }
}

export function matchesIndicatorQuery(meta: IndicatorMeta, query: string): boolean {
  const s = query.trim().toLowerCase();
  if (!s) return true;
  return [meta.name, meta.short, meta.kind, ...meta.aliases].some((v) => v.toLowerCase().includes(s));
}
