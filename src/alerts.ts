// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Wykresy contributors

import type { PairId } from './sources';
import { PAIR_LABELS } from './sources';

export const ALERTS_KEY = 'wykresy:alerts';

export interface PriceAlert {
  id: string;
  sourceId: string;
  pairId: PairId;
  price: number;
  direction: 'above' | 'below';
  enabled: boolean;
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `a-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function loadAlerts(): PriceAlert[] {
  try {
    const raw = localStorage.getItem(ALERTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((a) => a && typeof a.price === 'number' && (a.direction === 'above' || a.direction === 'below')) as PriceAlert[];
  } catch {
    return [];
  }
}

export function saveAlerts(alerts: PriceAlert[]): void {
  localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
}

export function createAlert(sourceId: string, pairId: PairId, price: number, direction: 'above' | 'below'): PriceAlert {
  return { id: newId(), sourceId, pairId, price, direction, enabled: true };
}

export function checkAlert(alert: PriceAlert, last: number): boolean {
  if (!alert.enabled || !Number.isFinite(last)) return false;
  return alert.direction === 'above' ? last >= alert.price : last <= alert.price;
}

export function alertLabel(alert: PriceAlert, sourceName: string): string {
  const dir = alert.direction === 'above' ? '≥' : '≤';
  return `${PAIR_LABELS[alert.pairId] ?? alert.pairId} ${sourceName} ${dir} ${alert.price}`;
}
