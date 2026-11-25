// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

/** Time axis zone. Stored in `opencharts:timezone`. */
export type ChartTimeZone = 'local' | 'America/New_York' | 'UTC';

/** VWAP session. `us-rth` is 09:30–16:00 America/New_York. */
export type SessionKind = 'utc-day' | 'us-rth';

const KEY = 'opencharts:timezone';
const RTH_OPEN = 9 * 60 + 30;
const RTH_CLOSE = 16 * 60;

let current: ChartTimeZone = 'local';

export function isChartTimeZone(value: unknown): value is ChartTimeZone {
  return value === 'local' || value === 'America/New_York' || value === 'UTC';
}

export function loadTimeZone(): ChartTimeZone {
  try {
    const raw = localStorage.getItem(KEY);
    if (isChartTimeZone(raw)) return raw;
  } catch {
    /* ignore */
  }
  return 'local';
}

/** Restore the saved zone into memory without writing storage. */
export function initChartTimeZone(): ChartTimeZone {
  current = loadTimeZone();
  return current;
}

export function chartTimeZone(): ChartTimeZone {
  return current;
}

export function setChartTimeZone(zone: ChartTimeZone): void {
  current = zone;
  try {
    localStorage.setItem(KEY, zone);
  } catch {
    /* quota */
  }
}

export function resolvedTimeZone(zone: ChartTimeZone = current): string {
  if (zone === 'UTC') return 'UTC';
  if (zone === 'America/New_York') return 'America/New_York';
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export interface NyClock {
  year: string;
  month: string;
  day: string;
  minutes: number;
}

export function nyClock(unix: number): NyClock | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(unix * 1000));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    const hour = Number(get('hour'));
    const minute = Number(get('minute'));
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return { year: get('year'), month: get('month'), day: get('day'), minutes: hour * 60 + minute };
  } catch {
    return null;
  }
}

export function nyDateId(unix: number): string | null {
  const clock = nyClock(unix);
  if (!clock) return null;
  return `${clock.year}-${clock.month}-${clock.day}`;
}

/** Session id while the regular US cash session is open, otherwise null. */
export function usRthSessionId(unix: number): string | null {
  const clock = nyClock(unix);
  if (!clock) return null;
  if (clock.minutes < RTH_OPEN || clock.minutes >= RTH_CLOSE) return null;
  return `${clock.year}-${clock.month}-${clock.day}`;
}

/** Calendar day (YYYY-MM-DD) of a unix time in the active chart zone. */
export function zonedDay(unix: number, zone: ChartTimeZone = current): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: resolvedTimeZone(zone),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(unix * 1000));
  } catch {
    return new Date(unix * 1000).toISOString().slice(0, 10);
  }
}
