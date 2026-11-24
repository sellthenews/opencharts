// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import './storage';
import type { IntervalId, PairId } from './sources';
import { isIntervalId } from './sources';
import type { MiniState } from './minichart';

export const LAYOUT_KEY = 'opencharts:layout';

export interface LayoutState {
  sourceId: string;
  pairId: PairId;
  intervalId: IntervalId;
  theme: 'dark' | 'light';
  paneCount?: 1 | 2 | 4;
  extras?: MiniState[];
}

export function loadLayout(): LayoutState | null {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<LayoutState>;
    if (typeof p.sourceId !== 'string' || !p.sourceId) return null;
    if (typeof p.pairId !== 'string' || !p.pairId) return null;
    if (!isIntervalId(p.intervalId)) return null;
    if (p.theme !== 'light' && p.theme !== 'dark') return null;
    const paneCount = p.paneCount === 2 || p.paneCount === 4 ? p.paneCount : 1;
    const extras = Array.isArray(p.extras) ? p.extras : undefined;
    return { sourceId: p.sourceId, pairId: p.pairId as PairId, intervalId: p.intervalId as IntervalId, theme: p.theme, paneCount, extras };
  } catch {
    return null;
  }
}

export function saveLayout(state: LayoutState): void {
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(state));
}
