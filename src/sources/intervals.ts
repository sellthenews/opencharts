// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

export type IntervalGroup = 'minutes' | 'hours' | 'days';

export interface IntervalDef {
  id: string;
  /** Short label inside a group (1, 15, 1D). */
  short: string;
  group: IntervalGroup;
  /** Bucket size in seconds; 0 means a calendar month. */
  seconds: number;
}

export const BUILTIN_INTERVALS: IntervalDef[] = [
  { id: '1m', short: '1', group: 'minutes', seconds: 60 },
  { id: '3m', short: '3', group: 'minutes', seconds: 180 },
  { id: '5m', short: '5', group: 'minutes', seconds: 300 },
  { id: '15m', short: '15', group: 'minutes', seconds: 900 },
  { id: '30m', short: '30', group: 'minutes', seconds: 1800 },
  { id: '45m', short: '45', group: 'minutes', seconds: 2700 },
  { id: '1h', short: '1', group: 'hours', seconds: 3600 },
  { id: '2h', short: '2', group: 'hours', seconds: 7200 },
  { id: '3h', short: '3', group: 'hours', seconds: 10800 },
  { id: '4h', short: '4', group: 'hours', seconds: 14400 },
  { id: '1D', short: '1D', group: 'days', seconds: 86400 },
  { id: '2D', short: '2D', group: 'days', seconds: 172800 },
  { id: '3D', short: '3D', group: 'days', seconds: 259200 },
  { id: '1W', short: '1W', group: 'days', seconds: 604800 },
  { id: '1M', short: '1M', group: 'days', seconds: 0 },
];

const BY_ID = new Map(BUILTIN_INTERVALS.map((d) => [d.id, d]));

export const DEFAULT_INTERVAL_FAVORITES = ['15m', '1h', '4h', '1D'] as const;
export const INTERVAL_FAV_KEY = 'opencharts:interval-favorites';

export const INTERVALS: { id: string; label: string }[] = BUILTIN_INTERVALS.map((d) => ({
  id: d.id,
  label: intervalLabel(d.id),
}));

const CUSTOM_RE = /^(\d+(?:\.\d+)?)(m|h|d|w)$/i;

export function intervalSeconds(id: string): number | null {
  const builtin = BY_ID.get(id);
  if (builtin) return builtin.seconds;
  const m = CUSTOM_RE.exec(id.trim());
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const u = m[2]!.toLowerCase();
  if (u === 'm') return Math.round(n * 60);
  if (u === 'h') return Math.round(n * 3600);
  if (u === 'd') return Math.round(n * 86400);
  if (u === 'w') return Math.round(n * 604800);
  return null;
}

export function isIntervalId(id: unknown): id is string {
  if (typeof id !== 'string' || !id) return false;
  if (BY_ID.has(id) || id === '1M') return true;
  const sec = intervalSeconds(id);
  return sec !== null && sec >= 60;
}

export function intervalLabel(id: string): string {
  if (id === '1m' || id.endsWith('m') && !id.endsWith('M') && BY_ID.has(id)) return id;
  if (id === '1h') return '1H';
  if (id === '2h') return '2H';
  if (id === '3h') return '3H';
  if (id === '4h') return '4H';
  if (/^\d+[DWM]$/.test(id)) return id;
  const m = CUSTOM_RE.exec(id.trim());
  if (m) {
    const n = Number(m[1]);
    const u = m[2]!.toLowerCase();
    if (u === 'h') return `${n}H`;
    if (u === 'd') return `${n}D`;
    if (u === 'w') return `${n}W`;
    return `${n}m`;
  }
  return id;
}

/** Parse a typed interval such as `15`, `15m`, `1h`, `4H`, `1D`, or `6h`. */
export function parseIntervalId(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  const aliases: Record<string, string> = {
    '1': '1h',
    '60': '1h',
    h: '1h',
    '1h': '1h',
    '1hr': '1h',
    '2': '2h',
    '2h': '2h',
    '3': '3h',
    '3h': '3h',
    '4': '4h',
    '4h': '4h',
    '5': '5m',
    '5m': '5m',
    '15': '15m',
    '15m': '15m',
    '30': '30m',
    '30m': '30m',
    '45': '45m',
    '45m': '45m',
    '1m': '1m',
    '3m': '3m',
    d: '1D',
    '1d': '1D',
    day: '1D',
    w: '1W',
    '1w': '1W',
    week: '1W',
    mo: '1M',
    '1mo': '1M',
    month: '1M',
    '1M': '1M',
    '1D': '1D',
    '1W': '1W',
  };
  if (s === '1M' || s === '1D' || s === '1W') return s;
  if (lower in aliases) return aliases[lower]!;
  if (BY_ID.has(s) || BY_ID.has(lower)) return BY_ID.has(s) ? s : lower;
  const m = CUSTOM_RE.exec(lower);
  if (!m) return null;
  const n = Number(m[1]);
  const u = m[2]!.toLowerCase();
  const id = u === 'd' ? `${n}D` : `${n}${u}`;
  if (BY_ID.has(id)) return id;
  if (u === 'm' && n === 60) return '1h';
  if (u === 'm' && n === 240) return '4h';
  if (u === 'h' && n === 24) return '1D';
  if (u === 'd' && n === 1) return '1D';
  if (u === 'd' && n === 7) return '1W';
  return isIntervalId(id) ? id : null;
}

/** Largest native interval that can be aggregated into `target`. */
export function sourceIntervalFor(native: readonly string[], target: string): string | null {
  if (native.includes(target)) return target;
  const targetSec = target === '1M' ? Number.POSITIVE_INFINITY : intervalSeconds(target);
  if (targetSec === null) return null;
  let best: { id: string; seconds: number } | null = null;
  for (const id of native) {
    const sec = id === '1M' ? 0 : intervalSeconds(id);
    if (sec === null || sec <= 0) continue;
    if (target === '1M') {
      if (!best || sec > best.seconds) best = { id, seconds: sec };
      continue;
    }
    if (targetSec % sec !== 0) continue;
    if (sec > targetSec) continue;
    if (!best || sec > best.seconds) best = { id, seconds: sec };
  }
  return best?.id ?? null;
}

export function loadIntervalFavorites(): string[] {
  try {
    const raw = localStorage.getItem(INTERVAL_FAV_KEY);
    if (!raw) return [...DEFAULT_INTERVAL_FAVORITES];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_INTERVAL_FAVORITES];
    const ids = parsed.filter((x): x is string => isIntervalId(x));
    return ids.length ? unique(ids) : [...DEFAULT_INTERVAL_FAVORITES];
  } catch {
    return [...DEFAULT_INTERVAL_FAVORITES];
  }
}

export function saveIntervalFavorites(ids: string[]): void {
  const next = unique(ids.filter(isIntervalId));
  localStorage.setItem(INTERVAL_FAV_KEY, JSON.stringify(next));
}

function unique(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
