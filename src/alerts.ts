// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { t } from './i18n';

import './storage';
import type { PairId } from './sources';
import { PAIR_LABELS } from './sources';

export const ALERTS_KEY = 'opencharts:alerts';

export interface LineAnchor {
  time: number;
  price: number;
}

export type AlertKind = 'price' | 'hline' | 'trend' | 'indicator';

export interface PriceAlert {
  id: string;
  sourceId: string;
  pairId: PairId;
  kind: AlertKind;
  price: number;
  direction: 'above' | 'below' | 'cross';
  enabled: boolean;
  drawingId?: string;
  p1?: LineAnchor;
  p2?: LineAnchor;
  indicatorKind?: string;
}

export interface AlertCheckContext {
  time?: number;
  prev?: number;
  prevTime?: number;
  lines?: { id: string; type: string; price?: number; p1?: LineAnchor; p2?: LineAnchor }[];
  rsi?: { prev: number; last: number };
  macd?: { prev: number; last: number; prevSignal: number; lastSignal: number };
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `a-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function asKind(raw: unknown): AlertKind {
  return raw === 'hline' || raw === 'trend' || raw === 'indicator' ? raw : 'price';
}

function asDirection(raw: unknown): PriceAlert['direction'] {
  if (raw === 'below' || raw === 'cross') return raw;
  return 'above';
}

export function loadAlerts(): PriceAlert[] {
  try {
    const raw = localStorage.getItem(ALERTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((a) => a && typeof a === 'object' && typeof (a as PriceAlert).price === 'number')
      .map((a) => {
        const row = a as PriceAlert;
        return {
          id: typeof row.id === 'string' ? row.id : newId(),
          sourceId: String(row.sourceId ?? 'kraken'),
          pairId: String(row.pairId ?? 'XRPUSD'),
          kind: asKind(row.kind),
          price: row.price,
          direction: asDirection(row.direction),
          enabled: row.enabled !== false,
          drawingId: row.drawingId,
          p1: row.p1,
          p2: row.p2,
          indicatorKind: typeof row.indicatorKind === 'string' ? row.indicatorKind : undefined,
        };
      });
  } catch {
    return [];
  }
}

export function saveAlerts(alerts: PriceAlert[]): void {
  localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
}

export function createAlert(
  sourceId: string,
  pairId: PairId,
  price: number,
  direction: 'above' | 'below' | 'cross',
  extra?: Partial<Pick<PriceAlert, 'kind' | 'drawingId' | 'p1' | 'p2' | 'indicatorKind'>>,
): PriceAlert {
  return {
    id: newId(),
    sourceId,
    pairId,
    kind: extra?.kind ?? 'price',
    price,
    direction,
    enabled: true,
    drawingId: extra?.drawingId,
    p1: extra?.p1,
    p2: extra?.p2,
    indicatorKind: extra?.indicatorKind,
  };
}

export function trendPriceAt(p1: LineAnchor, p2: LineAnchor, time: number): number | null {
  if (p2.time === p1.time) return p1.price;
  const t = (time - p1.time) / (p2.time - p1.time);
  return p1.price + t * (p2.price - p1.price);
}

function resolveLine(alert: PriceAlert, ctx?: AlertCheckContext): { price: (time: number) => number | null } | null {
  const live = ctx?.lines?.find((l) => l.id === alert.drawingId);
  if (alert.kind === 'hline') {
    const price = live?.type === 'hline' && typeof live.price === 'number' ? live.price : alert.price;
    return { price: () => price };
  }
  if (alert.kind === 'trend') {
    const p1 = live?.type === 'trend' && live.p1 ? live.p1 : alert.p1;
    const p2 = live?.type === 'trend' && live.p2 ? live.p2 : alert.p2;
    if (!p1 || !p2) return null;
    return { price: (time) => trendPriceAt(p1, p2, time) };
  }
  return null;
}

function crossed(prevPrice: number, prevLine: number, lastPrice: number, lastLine: number): boolean {
  const a = prevPrice - prevLine;
  const b = lastPrice - lastLine;
  return a === 0 || b === 0 || a * b < 0;
}

export function checkAlert(alert: PriceAlert, last: number, ctx?: AlertCheckContext): boolean {
  if (!alert.enabled) return false;
  if (alert.kind === 'indicator') {
    if (alert.indicatorKind === 'macd' && ctx?.macd) {
      return crossed(ctx.macd.prev, ctx.macd.prevSignal, ctx.macd.last, ctx.macd.lastSignal);
    }
    if (alert.indicatorKind === 'rsi' && ctx?.rsi) {
      return crossed(ctx.rsi.prev, alert.price, ctx.rsi.last, alert.price);
    }
    return false;
  }
  if (!Number.isFinite(last)) return false;
  const line = resolveLine(alert, ctx);
  if (!line) {
    if (alert.direction === 'below') return last <= alert.price;
    if (alert.direction === 'above') return last >= alert.price;
    return false;
  }
  const time = ctx?.time;
  const lastLine = line.price(typeof time === 'number' ? time : 0);
  if (lastLine === null || !Number.isFinite(lastLine)) return false;
  if (alert.direction !== 'cross' && alert.kind === 'hline') {
    return alert.direction === 'below' ? last <= lastLine : last >= lastLine;
  }
  const prev = ctx?.prev;
  const prevTime = ctx?.prevTime;
  if (prev === undefined || !Number.isFinite(prev)) return false;
  const prevLine = line.price(typeof prevTime === 'number' ? prevTime : (typeof time === 'number' ? time : 0));
  if (prevLine === null || !Number.isFinite(prevLine)) return false;
  return crossed(prev, prevLine, last, lastLine);
}

export function alertLabel(alert: PriceAlert, sourceName: string): string {
  const pair = PAIR_LABELS[alert.pairId] ?? alert.pairId;
  if (alert.kind === 'indicator' && alert.indicatorKind === 'macd') return t('alerts.macdCross', { pair, source: sourceName });
  if (alert.kind === 'indicator' && alert.indicatorKind === 'rsi') return t('alerts.rsiCross', { pair, source: sourceName, price: alert.price });
  if (alert.kind === 'trend') return t('alerts.trendCross', { pair, source: sourceName });
  if (alert.kind === 'hline') return t('alerts.hline', { pair, source: sourceName, price: alert.price });
  const dir = alert.direction === 'below' ? '≤' : '≥';
  return t('alerts.priceDir', { pair, source: sourceName, dir, price: alert.price });
}

let audioCtx: AudioContext | null = null;

export function requestAlertPermission(): void {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    void Notification.requestPermission();
  }
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (Ctx && !audioCtx) audioCtx = new Ctx();
  void audioCtx?.resume();
}

export function notifyAlert(title: string, body: string): void {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    if (audioCtx) {
      void audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.35);
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body, silent: true });
    }
  } catch {
    /* ignore */
  }
}
