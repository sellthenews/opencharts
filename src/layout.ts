// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Wykresy contributors

import type { IntervalId, PairId } from './sources';
import { PAIR_IDS } from './sources';

export const LAYOUT_KEY = 'wykresy:layout';

export interface LayoutState {
  sourceId: string;
  pairId: PairId;
  intervalId: IntervalId;
  theme: 'dark' | 'light';
}

const INTERVALS: IntervalId[] = ['1h', '4h', '1D', '1W', '1M'];

export function loadLayout(): LayoutState | null {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<LayoutState>;
    if (typeof p.sourceId !== 'string' || !p.sourceId) return null;
    if (!PAIR_IDS.includes(p.pairId as PairId)) return null;
    if (!INTERVALS.includes(p.intervalId as IntervalId)) return null;
    if (p.theme !== 'light' && p.theme !== 'dark') return null;
    return { sourceId: p.sourceId, pairId: p.pairId as PairId, intervalId: p.intervalId as IntervalId, theme: p.theme };
  } catch {
    return null;
  }
}

export function saveLayout(state: LayoutState): void {
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(state));
}
