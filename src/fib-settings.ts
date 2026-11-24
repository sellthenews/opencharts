// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

export const FIB_DEFAULTS_KEY = 'opencharts:fib-defaults';

export const FIB_KEY_LEVELS = [0.5, 0.61, 0.786, 1, 1.618] as const;

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

export interface FibOptions {
  levels: FibLevel[];
  background: boolean;
  backgroundOpacity: number;
  reverse: boolean;
  showPrices: boolean;
  showLevels: boolean;
  labels: 'left' | 'right';
  extendLines: boolean;
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
    extendLines: false,
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
  return {
    levels: levels.length ? levels : cloneFibOptions(fallback).levels,
    background: asBoolean(o.background, fallback.background),
    backgroundOpacity: opacity,
    reverse: asBoolean(o.reverse, fallback.reverse),
    showPrices: asBoolean(o.showPrices, fallback.showPrices),
    showLevels: asBoolean(o.showLevels, fallback.showLevels),
    labels: asLabelSide(o.labels, fallback.labels),
    extendLines: asBoolean(o.extendLines, fallback.extendLines),
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
