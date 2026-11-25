// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

export const FIB_DEFAULTS_KEY = 'opencharts:fib-defaults';
export const FIBEXT_DEFAULTS_KEY = 'opencharts:fibext-defaults';

export const FIB_KEY_LEVELS = [0.5, 0.61, 0.786, 1, 1.618] as const;

const FIB_VISIBLE_DEFAULTS = [0, 0.236, 0.38, 0.5, 0.61, 0.786, 1] as const;

export const FIB_DEFAULT_VALUES = [
  0, 0.236, 0.278, 0.38, 0.44, 0.5, 0.577, 0.61, 0.667, 0.707, 0.77, 0.786, 0.8, 0.878, 0.941, 1, 1.13, 1.25, 1.414,
  1.618, 1.732, 2.058, 2.236, 2.618,
] as const;

/** Own palette: grey-blue → blue / turquoise / green (0–1), then gold / orange (>1). */
const DEFAULT_COLORS: Record<string, string> = {
  '0': '#8e98aa',
  '0.236': '#7d8fba',
  '0.278': '#6e8ac8',
  '0.38': '#4e8eef',
  '0.44': '#3aa0e0',
  '0.5': '#2bb3d6',
  '0.577': '#22c0c2',
  '0.61': '#1fbfa4',
  '0.667': '#2bb88a',
  '0.707': '#36bc72',
  '0.77': '#3fbe62',
  '0.786': '#3fc86a',
  '0.8': '#5cbc48',
  '0.878': '#7cbe3c',
  '0.941': '#a0c03a',
  '1': '#c9cfd8',
  '1.13': '#dcc46a',
  '1.25': '#e0b445',
  '1.414': '#e8a532',
  '1.618': '#f09b1a',
  '1.732': '#ee8a1c',
  '2.058': '#e47218',
  '2.236': '#dc5e14',
  '2.618': '#d04a10',
};

const COLOR_STOPS: ReadonlyArray<readonly [number, string]> = [
  [0, '#8e98aa'],
  [0.38, '#4e8eef'],
  [0.5, '#2bb3d6'],
  [0.61, '#1fbfa4'],
  [0.786, '#3fc86a'],
  [1, '#c9cfd8'],
  [1.618, '#f09b1a'],
  [2.618, '#d04a10'],
];

export interface FibLevel {
  value: number;
  visible: boolean;
  color: string;
}

export type FibLabelVAlign = 'top' | 'middle' | 'bottom';
export type FibTrendStyle = 'solid' | 'dashed' | 'dotted';
export type FibToolKind = 'fib' | 'fibext';
export type FibPreset = 'ours' | 'classic';

export interface FibOptions {
  preset?: FibPreset;
  levels: FibLevel[];
  background: boolean;
  backgroundOpacity: number;
  reverse: boolean;
  showPrices: boolean;
  showLevels: boolean;
  labels: 'left' | 'right';
  labelVAlign: FibLabelVAlign;
  extendLines: boolean;
  showTrend: boolean;
  trendStyle: FibTrendStyle;
}

export function nearlyEqual(a: number, b: number, eps = 1e-4): boolean {
  return Math.abs(a - b) <= eps;
}

export function isFibKeyLevel(value: number): boolean {
  return FIB_KEY_LEVELS.some((k) => nearlyEqual(value, k));
}

export function formatFibLevel(value: number): string {
  if (!Number.isFinite(value)) return '';
  const rounded = Math.round(value * 1000) / 1000;
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded);
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function colorForFibValue(value: number): string {
  const key = formatFibLevel(value);
  const named = DEFAULT_COLORS[key];
  if (named) return named;
  if (!Number.isFinite(value)) return '#8e98aa';
  if (value <= COLOR_STOPS[0]![0]) return COLOR_STOPS[0]![1];
  const last = COLOR_STOPS[COLOR_STOPS.length - 1]!;
  if (value >= last[0]) return last[1];
  for (let i = 1; i < COLOR_STOPS.length; i++) {
    const a = COLOR_STOPS[i - 1]!;
    const b = COLOR_STOPS[i]!;
    if (value <= b[0]) {
      const t = (value - a[0]) / (b[0] - a[0] || 1);
      const ca = hexToRgb(a[1]);
      const cb = hexToRgb(b[1]);
      if (!ca || !cb) return a[1];
      return rgbToHex(ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t);
    }
  }
  return last[1];
}

export function builtInFibOptions(): FibOptions {
  return {
    preset: 'ours',
    levels: FIB_DEFAULT_VALUES.map((value) => ({
      value,
      visible: FIB_VISIBLE_DEFAULTS.some((v) => nearlyEqual(v, value)),
      color: colorForFibValue(value),
    })),
    background: true,
    backgroundOpacity: 0.04,
    // false = default order (level 1 at the first point, 0 at the second).
    reverse: false,
    showPrices: true,
    showLevels: true,
    labels: 'right',
    labelVAlign: 'middle',
    extendLines: false,
    showTrend: true,
    trendStyle: 'dashed',
  };
}

/** Previous full retracement set: all catalog levels visible, stronger fill, extensions off. */
export function classicFibOptions(): FibOptions {
  return {
    preset: 'classic',
    levels: FIB_DEFAULT_VALUES.map((value) => ({
      value,
      visible: true,
      color: colorForFibValue(value),
    })),
    background: true,
    backgroundOpacity: 0.08,
    reverse: false,
    showPrices: true,
    showLevels: true,
    labels: 'right',
    labelVAlign: 'middle',
    extendLines: false,
    showTrend: true,
    trendStyle: 'dashed',
  };
}

export function cloneFibOptions(opts: FibOptions): FibOptions {
  return {
    ...opts,
    levels: opts.levels.map((level) => ({ ...level })),
  };
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asLabelSide(value: unknown, fallback: FibOptions['labels']): FibOptions['labels'] {
  return value === 'left' || value === 'right' ? value : fallback;
}

export function sanitizeFibLevel(raw: unknown, fallbackColor = '#8e98aa'): FibLevel | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Partial<FibLevel>;
  const value = typeof row.value === 'number' ? row.value : Number(row.value);
  if (!Number.isFinite(value)) return null;
  const color = typeof row.color === 'string' && /^#[0-9a-f]{6}$/i.test(row.color) ? row.color.toLowerCase() : fallbackColor;
  return { value, visible: row.visible !== false, color };
}

export function sanitizeFibOptions(raw: unknown, fallback: FibOptions = builtInFibOptions()): FibOptions {
  if (!raw || typeof raw !== 'object') return cloneFibOptions(fallback);
  const o = raw as Partial<FibOptions>;
  const levels = Array.isArray(o.levels)
    ? o.levels
        .map((row) => sanitizeFibLevel(row))
        .filter((row): row is FibLevel => !!row)
        .sort((a, b) => a.value - b.value)
    : [];
  const opacity =
    typeof o.backgroundOpacity === 'number' && Number.isFinite(o.backgroundOpacity)
      ? Math.min(0.4, Math.max(0.02, o.backgroundOpacity))
      : fallback.backgroundOpacity;
  const preset: FibPreset | undefined = o.preset === 'ours' || o.preset === 'classic' ? o.preset : undefined;
  return {
    preset,
    levels: levels.length ? levels : cloneFibOptions(fallback).levels,
    background: asBoolean(o.background, fallback.background),
    backgroundOpacity: opacity,
    reverse: asBoolean(o.reverse, fallback.reverse),
    showPrices: asBoolean(o.showPrices, fallback.showPrices),
    showLevels: asBoolean(o.showLevels, fallback.showLevels),
    labels: asLabelSide(o.labels, fallback.labels),
    labelVAlign: o.labelVAlign === 'top' || o.labelVAlign === 'bottom' || o.labelVAlign === 'middle' ? o.labelVAlign : fallback.labelVAlign,
    extendLines: asBoolean(o.extendLines, fallback.extendLines),
    showTrend: asBoolean(o.showTrend, fallback.showTrend),
    trendStyle: o.trendStyle === 'solid' || o.trendStyle === 'dashed' || o.trendStyle === 'dotted' ? o.trendStyle : fallback.trendStyle,
  };
}

export function loadFibDefaults(): FibOptions {
  try {
    const raw = localStorage.getItem(FIB_DEFAULTS_KEY);
    if (!raw) return builtInFibOptions();
    return sanitizeFibOptions(JSON.parse(raw), builtInFibOptions());
  } catch {
    return builtInFibOptions();
  }
}

export function saveFibDefaults(opts: FibOptions): void {
  try {
    localStorage.setItem(FIB_DEFAULTS_KEY, JSON.stringify(sanitizeFibOptions(opts)));
  } catch {
    /* quota */
  }
}

/** Legacy drawings without stored levels use the built-in 24-level set, not the user's later "Save as default". */
export function fibOptionsOf(drawing: { fib?: unknown }): FibOptions {
  if (drawing.fib && typeof drawing.fib === 'object' && Array.isArray((drawing.fib as { levels?: unknown }).levels)) {
    const levels = (drawing.fib as { levels: unknown[] }).levels;
    if (levels.length) return sanitizeFibOptions(drawing.fib);
  }
  return builtInFibOptions();
}

/** Unique levels from the agreed default list (duplicate 1.061 / 1.414 rows omitted). 2.618 and 4.236 were not on that list. */
export const FIBEXT_DEFAULT_LEVELS: ReadonlyArray<{ value: number; visible: boolean }> = [
  { value: 0, visible: true },
  { value: 0.5, visible: false },
  { value: 0.618, visible: false },
  { value: 0.9, visible: true },
  { value: 1, visible: true },
  { value: 1.061, visible: true },
  { value: 1.155, visible: true },
  { value: 1.21, visible: false },
  { value: 1.272, visible: true },
  { value: 1.414, visible: true },
  { value: 1.618, visible: true },
  { value: 2, visible: false },
  { value: 2.414, visible: false },
  { value: 3, visible: false },
  { value: 3.272, visible: false },
  { value: 3.414, visible: false },
  { value: 3.618, visible: false },
  { value: 4, visible: false },
  { value: 4.272, visible: false },
  { value: 4.414, visible: false },
  { value: 4.618, visible: false },
  { value: 4.764, visible: false },
];

const FIBEXT_COLORS: Record<string, string> = {
  '0': '#7d889c',
  '0.5': '#6286b0',
  '0.618': '#4b90c4',
  '0.9': '#2ab0c8',
  '1': '#3a8af0',
  '1.061': '#6aa8c0',
  '1.155': '#2dbe88',
  '1.21': '#4a8ad0',
  '1.272': '#26c070',
  '1.414': '#1cb8a4',
  '1.618': '#e59a18',
  '2': '#e08624',
  '2.414': '#d47020',
  '3': '#cc5c28',
  '3.272': '#c45440',
  '3.414': '#bc4860',
  '3.618': '#a44c88',
  '4': '#9450a0',
  '4.272': '#8450a8',
  '4.414': '#b06050',
  '4.618': '#c47830',
  '4.764': '#d09028',
};

const FIBEXT_STOPS: ReadonlyArray<readonly [number, string]> = [
  [0, '#7d889c'],
  [0.9, '#2ab0c8'],
  [1, '#3a8af0'],
  [1.272, '#26c070'],
  [1.618, '#e59a18'],
  [2.414, '#d47020'],
  [3.618, '#a44c88'],
  [4.764, '#d09028'],
];

export function isFibExtKeyLevel(value: number): boolean {
  return nearlyEqual(value, 1) || nearlyEqual(value, 1.618);
}

function lerpHex(a: string, b: string, t: number): string {
  const parse = (hex: string): [number, number, number] | null => {
    const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return null;
    const n = Number.parseInt(m[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const ca = parse(a);
  const cb = parse(b);
  if (!ca || !cb) return a;
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${h(ca[0] + (cb[0] - ca[0]) * t)}${h(ca[1] + (cb[1] - ca[1]) * t)}${h(ca[2] + (cb[2] - ca[2]) * t)}`;
}

export function colorForFibExtValue(value: number): string {
  const key = formatFibLevel(value);
  const named = FIBEXT_COLORS[key];
  if (named) return named;
  if (!Number.isFinite(value)) return '#7d889c';
  if (value <= FIBEXT_STOPS[0]![0]) return FIBEXT_STOPS[0]![1];
  const last = FIBEXT_STOPS[FIBEXT_STOPS.length - 1]!;
  if (value >= last[0]) return last[1];
  for (let i = 1; i < FIBEXT_STOPS.length; i++) {
    const a = FIBEXT_STOPS[i - 1]!;
    const b = FIBEXT_STOPS[i]!;
    if (value <= b[0]) return lerpHex(a[1], b[1], (value - a[0]) / (b[0] - a[0] || 1));
  }
  return last[1];
}

const FIBEXT_OURS_VISIBLE = [0, 0.618, 1, 1.272, 1.618, 2, 3.618] as const;

export function builtInFibExtOptions(): FibOptions {
  return {
    preset: 'ours',
    levels: FIBEXT_DEFAULT_LEVELS.map((row) => ({
      value: row.value,
      visible: FIBEXT_OURS_VISIBLE.some((v) => nearlyEqual(v, row.value)),
      color: colorForFibExtValue(row.value),
    })),
    background: true,
    backgroundOpacity: 0.04,
    reverse: false,
    showPrices: false,
    showLevels: true,
    labels: 'left',
    labelVAlign: 'middle',
    extendLines: true,
    showTrend: true,
    trendStyle: 'dotted',
  };
}

/** Previous extension catalog: original visibility, stronger fill, lines extended. */
export function classicFibExtOptions(): FibOptions {
  return {
    preset: 'classic',
    levels: FIBEXT_DEFAULT_LEVELS.map((row) => ({
      value: row.value,
      visible: row.visible,
      color: colorForFibExtValue(row.value),
    })),
    background: true,
    backgroundOpacity: 0.08,
    reverse: false,
    showPrices: false,
    showLevels: true,
    labels: 'left',
    labelVAlign: 'middle',
    extendLines: true,
    showTrend: true,
    trendStyle: 'dotted',
  };
}

export function fibPresetOptions(kind: FibToolKind, preset: FibPreset): FibOptions {
  if (kind === 'fibext') return preset === 'classic' ? classicFibExtOptions() : builtInFibExtOptions();
  return preset === 'classic' ? classicFibOptions() : builtInFibOptions();
}

function visibleLevelValues(opts: FibOptions): number[] {
  return opts.levels.filter((level) => level.visible).map((level) => level.value);
}

function sameVisibleValues(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, i) => nearlyEqual(value, b[i]!));
}

export function detectFibPreset(opts: FibOptions, kind: FibToolKind): FibPreset | null {
  const visible = visibleLevelValues(opts);
  if (sameVisibleValues(visible, visibleLevelValues(fibPresetOptions(kind, 'ours')))) return 'ours';
  if (sameVisibleValues(visible, visibleLevelValues(fibPresetOptions(kind, 'classic')))) return 'classic';
  return null;
}

/** Swap the level catalog and preset fill / extend flags; keep the user's label and trend choices. */
export function applyFibPreset(current: FibOptions, kind: FibToolKind, preset: FibPreset): FibOptions {
  const base = fibPresetOptions(kind, preset);
  return {
    ...cloneFibOptions(current),
    preset,
    levels: cloneFibOptions(base).levels,
    background: base.background,
    backgroundOpacity: base.backgroundOpacity,
    extendLines: base.extendLines,
  };
}

export function loadFibExtDefaults(): FibOptions {
  try {
    const raw = localStorage.getItem(FIBEXT_DEFAULTS_KEY);
    if (!raw) return builtInFibExtOptions();
    return sanitizeFibOptions(JSON.parse(raw), builtInFibExtOptions());
  } catch {
    return builtInFibExtOptions();
  }
}

export function saveFibExtDefaults(opts: FibOptions): void {
  try {
    localStorage.setItem(FIBEXT_DEFAULTS_KEY, JSON.stringify(sanitizeFibOptions(opts, builtInFibExtOptions())));
  } catch {
    /* quota */
  }
}

/** Legacy extensions without stored levels use the built-in default set, not a later "Save as default". */
export function fibExtOptionsOf(drawing: { fib?: unknown; extendRight?: boolean }): FibOptions {
  const fallback = builtInFibExtOptions();
  if (drawing.fib && typeof drawing.fib === 'object' && Array.isArray((drawing.fib as { levels?: unknown }).levels)) {
    const levels = (drawing.fib as { levels: unknown[] }).levels;
    if (levels.length) return sanitizeFibOptions(drawing.fib, fallback);
  }
  const opts = cloneFibOptions(fallback);
  if (drawing.extendRight === false) opts.extendLines = false;
  return opts;
}

export function defaultsOf(kind: FibToolKind): FibOptions {
  return kind === 'fibext' ? loadFibExtDefaults() : loadFibDefaults();
}

export function builtInOf(kind: FibToolKind): FibOptions {
  return kind === 'fibext' ? builtInFibExtOptions() : builtInFibOptions();
}
