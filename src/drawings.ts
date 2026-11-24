// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import './storage';
import type { IChartApi, ISeriesApi, Logical, SeriesType, Time } from 'lightweight-charts';
import {
  ABCD_PROJECTIONS,
  FIB_RETRACEMENT,
  abcdPointD,
  abcdProject,
  fibExtensionPrice,
  fibRetracementPrice,
} from './drawings-math';
import { TOOLS_POINTS } from './drawings-types';
import type { Drawing, Point, Tool } from './drawings-types';
import { interactionOptions, isMagnetModifier } from './chart-options';
import type { FibOptions } from './fib-settings';
import { cloneFibOptions, fibExtOptionsOf, fibOptionsOf, isFibKeyLevel, isFibExtKeyLevel, loadFibDefaults, loadFibExtDefaults } from './fib-settings';
import { loadLineDefaults, saveLineDefaults, sanitizeLineStyle } from './templates';

export type { Drawing, Point, Tool };

const COLOR = '#5b9cf6';

type PriceSample = { time: number; open?: number; high?: number; low?: number; close: number };

function linearChannel(samples: PriceSample[], t1: number, t2: number): {
  t1: number;
  t2: number;
  mid1: number;
  mid2: number;
  dev: number;
} | null {
  const lo = Math.min(t1, t2);
  const hi = Math.max(t1, t2);
  const pts = samples.filter((s) => s.time >= lo && s.time <= hi);
  if (pts.length < 3) return null;
  const n = pts.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (const s of pts) {
    sumX += s.time;
    sumY += s.close;
    sumXY += s.time * s.close;
    sumXX += s.time * s.time;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  let varSum = 0;
  for (const s of pts) {
    const yhat = intercept + slope * s.time;
    const r = s.close - yhat;
    varSum += r * r;
  }
  const dev = Math.sqrt(varSum / Math.max(1, n - 2)) * 2;
  const a = Math.min(t1, t2);
  const b = Math.max(t1, t2);
  return {
    t1: a,
    t2: b,
    mid1: intercept + slope * a,
    mid2: intercept + slope * b,
    dev,
  };
}

const PHI = 1.618033988749895;
const FIB_TIME = [0, 0.382, 0.618, 1, 1.618, 2.618, 4.236, 6.854] as const;
const GANN_FAN: ReadonlyArray<readonly [string, number, number]> = [
  ['1x8', 1, 8],
  ['1x4', 1, 4],
  ['1x3', 1, 3],
  ['1x2', 1, 2],
  ['1x1', 1, 1],
  ['2x1', 2, 1],
  ['3x1', 3, 1],
  ['4x1', 4, 1],
  ['8x1', 8, 1],
];
const GANN_GRID = [0, 0.125, 0.25, 1 / 3, 0.375, 0.5, 0.625, 2 / 3, 0.75, 0.875, 1] as const;

function isPointList(value: unknown, min = 2): value is Point[] {
  return Array.isArray(value) && value.length >= min && value.every(isPoint);
}

function isOpenEnded(tool: Tool): boolean {
  return tool === 'path' || tool === 'brush';
}

function formatSpan(sec: number): string {
  const abs = Math.abs(sec);
  if (abs >= 86_400) {
    const days = abs / 86_400;
    return `${days >= 10 ? days.toFixed(0) : days.toFixed(1)} d`;
  }
  if (abs >= 3_600) {
    const hours = abs / 3_600;
    return `${hours >= 10 ? hours.toFixed(0) : hours.toFixed(1)} h`;
  }
  if (abs >= 60) return `${Math.round(abs / 60)} min`;
  return `${Math.round(abs)} s`;
}
const SELECTED = '#ffcc66';
const HANDLE = 5;
const HIT_PX = 7;

function fibEnds(d: Extract<Drawing, { type: 'fib' }>): { p1: Point; p2: Point } {
  return { p1: d.p1, p2: d.p2 };
}

function visibleFibLevels(opts: FibOptions): FibOptions['levels'] {
  return opts.levels.filter((l) => l.visible && Number.isFinite(l.value)).slice().sort((a, b) => a.value - b.value);
}

function storageKey(sourceId: string, pairId: string): string {
  return `opencharts:drawings:${sourceId}:${pairId}`;
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `d-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isPoint(value: unknown): value is Point {
  return !!value && typeof value === 'object' && Number.isFinite((value as Point).time) && Number.isFinite((value as Point).price);
}

function isDrawing(value: unknown): value is Drawing {
  if (!value || typeof value !== 'object') return false;
  const d = value as Drawing;
  if (typeof d.id !== 'string') return false;
  switch (d.type) {
    case 'trend':
    case 'rect':
    case 'ray':
    case 'fib':
      return isPoint(d.p1) && isPoint(d.p2);
    case 'hline':
      return Number.isFinite(d.price);
    case 'channel':
      return isPoint(d.p1) && isPoint(d.p2) && isPoint(d.p3);
    case 'fibext':
      return isPoint(d.a) && isPoint(d.b) && isPoint(d.c);
    case 'abcd':
      return isPoint(d.a) && isPoint(d.b) && isPoint(d.c);
    case 'text':
      return isPoint(d.p) && typeof d.text === 'string';
    case 'longpos':
    case 'shortpos':
      return isPoint(d.entry) && isPoint(d.stop) && isPoint(d.target);
    case 'pricerange':
    case 'daterange':
    case 'datepricerange':
      return isPoint(d.p1) && isPoint(d.p2);
    case 'vline':
      return typeof d.time === 'number' && Number.isFinite(d.time);
    case 'hray':
    case 'extline':
      return isPoint(d.p1) && isPoint(d.p2);
    case 'arrow':
      return isPoint(d.p1) && isPoint(d.p2);
    case 'pricelabel':
      return isPoint(d.p);
    case 'note':
      return isPoint(d.p) && typeof d.text === 'string';
    case 'callout':
      return isPoint(d.p1) && isPoint(d.p2) && typeof d.text === 'string';
    case 'ellipse':
      return isPoint(d.p1) && isPoint(d.p2);
    case 'triangle':
      return isPoint(d.p1) && isPoint(d.p2) && isPoint(d.p3);
    case 'regress':
      return isPoint(d.p1) && isPoint(d.p2);
    case 'xabcd':
      return isPoint(d.x) && isPoint(d.a) && isPoint(d.b) && isPoint(d.c) && isPoint(d.d);
    case 'hs':
      return isPoint(d.ls) && isPoint(d.n1) && isPoint(d.head) && isPoint(d.n2) && isPoint(d.rs);
    case 'fibchan':
      return isPoint(d.p1) && isPoint(d.p2) && isPoint(d.p3);
    case 'fibfan':
      return isPoint(d.p1) && isPoint(d.p2);
    case 'arc':
      return isPoint(d.p1) && isPoint(d.p2) && isPoint(d.p3);
    case 'tripattern':
      return isPoint(d.p1) && isPoint(d.p2) && isPoint(d.p3) && isPoint(d.p4);
    case 'elliottimp':
      return isPointList(d.points, 6) && d.points.length === 6;
    case 'elliottabc':
      return isPointList(d.points, 3) && d.points.length === 3;
    case 'path':
    case 'brush':
      return isPointList(d.points, 2);
    case 'flag':
      return isPoint(d.p1) && isPoint(d.p2) && isPoint(d.p3) && isPoint(d.p4);
    case 'forecast':
    case 'fibarcs':
    case 'fibspiral':
    case 'fibtz':
    case 'gannbox':
    case 'gannfan':
    case 'gannsq':
      return isPoint(d.p1) && isPoint(d.p2);
    case 'pitchfork':
      return isPoint(d.p1) && isPoint(d.p2) && isPoint(d.p3);
    default:
      return false;
  }
}

function load(sourceId: string, pairId: string): Drawing[] {
  try {
    const raw = localStorage.getItem(storageKey(sourceId, pairId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isDrawing).map((d) => (d.type === 'fibext' ? { ...d, extendRight: d.extendRight !== false } : d));
  } catch {
    return [];
  }
}

function save(sourceId: string, pairId: string, drawings: Drawing[]): void {
  localStorage.setItem(storageKey(sourceId, pairId), JSON.stringify(drawings));
}

function distPointToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function extendLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
  height: number,
): { a: { x: number; y: number }; b: { x: number; y: number } } {
  return {
    a: extendRay(x2, y2, x1, y1, width, height),
    b: extendRay(x1, y1, x2, y2, width, height),
  };
}

function circleFrom3(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): { cx: number; cy: number; r: number } | null {
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-8) return null;
  const ux =
    ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
  const uy =
    ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  return { cx: ux, cy: uy, r: Math.hypot(ax - ux, ay - uy) };
}

function angleContains(start: number, mid: number, end: number): boolean {
  const tau = Math.PI * 2;
  const n = (a: number) => ((a % tau) + tau) % tau;
  const s = n(start);
  const rel = (a: number) => (n(a) - s + tau) % tau;
  return rel(mid) <= rel(end);
}

function lineIntersection(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number },
): { x: number; y: number } | null {
  const d = (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x);
  if (Math.abs(d) < 1e-8) return null;
  const t = ((b1.x - a1.x) * (b2.y - b1.y) - (b1.y - a1.y) * (b2.x - b1.x)) / d;
  return { x: a1.x + t * (a2.x - a1.x), y: a1.y + t * (a2.y - a1.y) };
}

function extendRay(x1: number, y1: number, x2: number, y2: number, width: number, height: number): { x: number; y: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return { x: x2, y: y2 };
  let t = Number.POSITIVE_INFINITY;
  if (dx > 0) t = Math.min(t, (width - x1) / dx);
  else if (dx < 0) t = Math.min(t, (0 - x1) / dx);
  if (dy > 0) t = Math.min(t, (height - y1) / dy);
  else if (dy < 0) t = Math.min(t, (0 - y1) / dy);
  if (!Number.isFinite(t) || t < 1) t = 1;
  return { x: x1 + dx * t, y: y1 + dy * t };
}

type HandleName = string;

export class DrawingLayer {
  private drawings: Drawing[] = [];
  private selectedId: string | null = null;
  private tool: Tool = 'cursor';
  private draft: { type: Tool; points: Point[]; current: Point } | null = null;
  private sourceId = 'kraken';
  private pairId = 'XRPUSD';
  private lastTime = 0;
  private stepSec = 86400;
  private priceSamples: PriceSample[] = [];
  private magnet = false;
  private layerHidden = false;
  private onToolDone: (() => void) | null = null;
  private onSelect: ((d: Drawing | null) => void) | null = null;
  private onPersist: (() => void) | null = null;
  private muteHistory = false;
  private defaultStyle = loadLineDefaults();
  private onEdit: ((d: Drawing) => void) | null = null;
  private ro: ResizeObserver;
  private rafId = 0;
  private needsPaint = false;
  private lastDpr = 0;
  private lastHit: { x: number; y: number; logical: Point } | null = null;
  private capturedPointer: number | null = null;
  private drivenCrosshair: Point | null = null;
  private lastViewKey = '';
  private viewRaf = 0;
  private drag: {
    mode: 'point' | 'move';
    handle?: HandleName;
    startX: number;
    startY: number;
    orig: Drawing;
    priceOnly?: boolean;
  } | null = null;

  constructor(
    private readonly chart: IChartApi,
    private readonly series: ISeriesApi<SeriesType>,
    private readonly canvas: HTMLCanvasElement,
    private readonly wrap: HTMLElement,
  ) {
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.wrap);
    this.resize();
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(() => this.paintFrame());
    this.chart.timeScale().subscribeVisibleTimeRangeChange(() => this.paintFrame());
    window.addEventListener('resize', this.onWinResize);

    this.wrap.addEventListener('pointerdown', this.onWrapPointerDown, true);
    window.addEventListener('pointermove', this.onWinPointerMove);
    window.addEventListener('pointerup', this.onWinPointerUp);
    window.addEventListener('pointercancel', this.onWinPointerUp);
    this.wrap.addEventListener('contextmenu', this.onContextMenu, true);
    this.wrap.addEventListener('wheel', () => this.paintFrame(), { passive: true, capture: true });
    this.wrap.addEventListener('dblclick', (ev) => this.onDblClick(ev));
    this.wrap.addEventListener('mousedown', (ev) => this.onEmptyClick(ev));
    window.addEventListener('keydown', this.onKey);
    this.syncPointerEvents();
    this.startViewWatch();
  }

  getDrawings(): Drawing[] {
    return this.drawings.map((d) => structuredClone(d));
  }

  getSelectedId(): string | null {
    return this.selectedId;
  }

  getTool(): Tool {
    return this.tool;
  }

  setOnPersist(cb: () => void): void {
    this.onPersist = cb;
  }


  getDefaultStyle(): import('./drawings-types').DrawStyle {
    return { ...this.defaultStyle };
  }

  setDefaultStyle(style: import('./drawings-types').DrawStyle, persist = true): void {
    this.defaultStyle = sanitizeLineStyle(style);
    if (persist) saveLineDefaults(this.defaultStyle);
  }

  private stampStyle<T extends Drawing>(drawing: T): T {
    const base = this.defaultStyle;
    if (!base || (!base.color && !base.width && !base.lineStyle)) return drawing;
    drawing.style = { ...base, ...drawing.style };
    return drawing;
  }


  replaceDrawings(next: Drawing[]): void {
    this.drawings = structuredClone(next);
    if (!this.drawings.some((d) => d.id === this.selectedId)) this.selectedId = null;
    this.draft = null;
    this.muteHistory = true;
    this.persist();
    this.muteHistory = false;
    this.redraw();
    this.emitSelect();
  }

  pickAt(clientX: number, clientY: number): Drawing | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const id = this.hitHandle(x, y)?.id ?? this.hitBody(x, y);
    return this.drawings.find((d) => d.id === id) ?? null;
  }

  getAbcdScreen(): { a: { x: number; y: number }; b: { x: number; y: number }; c: { x: number; y: number }; d: { x: number; y: number }; drawing: Extract<Drawing, { type: 'abcd' }> } | null {
    const d = this.drawings.find((x): x is Extract<Drawing, { type: 'abcd' }> => x.type === 'abcd' && x.id === this.selectedId)
      ?? this.drawings.find((x): x is Extract<Drawing, { type: 'abcd' }> => x.type === 'abcd');
    if (!d) return null;
    const a = this.pointToXy(d.a);
    const b = this.pointToXy(d.b);
    const c = this.pointToXy(d.c);
    const dd = this.pointToXy(abcdPointD(d.a, d.b, d.c));
    if (!a || !b || !c || !dd) return null;
    return { a, b, c, d: dd, drawing: structuredClone(d) };
  }

  setTool(tool: Tool): void {
    this.tool = tool;
    this.draft = null;
    this.syncPointerEvents();
    this.redraw();
  }

  setTimeInfo(lastTime: number, stepSec: number): void {
    this.lastTime = lastTime;
    this.stepSec = stepSec > 0 ? stepSec : 86400;
  }

  setPriceData(samples: PriceSample[]): void {
    this.priceSamples = samples;
    this.scheduleRedraw();
  }

  setMagnet(on: boolean): void {
    this.magnet = on;
  }

  setAllLocked(locked: boolean): void {
    for (const d of this.drawings) d.style = { ...d.style, locked };
    this.persist();
    this.redraw();
  }

  areAllLocked(): boolean {
    return this.drawings.length > 0 && this.drawings.every((d) => d.style?.locked);
  }

  setHidden(hidden: boolean): void {
    this.layerHidden = hidden;
    if (hidden) {
      this.selectedId = null;
      this.draft = null;
      this.emitSelect();
    }
    this.syncPointerEvents();
    this.redraw();
  }

  isHidden(): boolean {
    return this.layerHidden;
  }

  setOnToolDone(cb: () => void): void {
    this.onToolDone = cb;
  }

  setOnSelect(cb: (d: Drawing | null) => void): void {
    this.onSelect = cb;
  }

  setOnEdit(cb: (d: Drawing) => void): void {
    this.onEdit = cb;
  }

  applyFibOptions(opts: FibOptions, persist: boolean): boolean {
    const d = this.getSelected();
    if (!d || (d.type !== 'fib' && d.type !== 'fibext')) return false;
    d.fib = cloneFibOptions(opts);
    if (d.type === 'fibext') d.extendRight = opts.extendLines;
    if (persist) this.persist();
    this.redraw();
    return true;
  }

  getSelected(): Drawing | null {
    return this.drawings.find((d) => d.id === this.selectedId) ?? null;
  }

  patchStyle(partial: import('./drawings-types').DrawStyle): boolean {
    const d = this.getSelected();
    if (!d) return false;
    d.style = { ...d.style, ...partial };
    this.persist();
    this.redraw();
    this.emitSelect();
    return true;
  }

  selectionAnchor(): { x: number; y: number } | null {
    const d = this.getSelected();
    if (!d) return null;
    const width = this.canvas.getBoundingClientRect().width;
    const hs = this.handlesOf(d).map((h) => {
      if (d.type === 'hline') {
        const yy = this.priceToY(d.price);
        return yy === null ? null : { x: width / 2, y: yy };
      }
      return this.pointToXy(h.point);
    }).filter((p): p is { x: number; y: number } => !!p);
    if (!hs.length) return null;
    const x = hs.reduce((a, p) => a + p.x, 0) / hs.length;
    const y = Math.min(...hs.map((p) => p.y));
    return { x, y };
  }

  private emitSelect(): void {
    this.onSelect?.(this.getSelected());
  }

  private shouldSnap(ev: MouseEvent): boolean {
    const modifier = isMagnetModifier(ev);
    return modifier ? !this.magnet : this.magnet;
  }

  private snapLogical(point: Point): Point {
    if (!this.priceSamples.length) return point;
    let best = this.priceSamples[0]!;
    let bestDt = Math.abs(best.time - point.time);
    for (const s of this.priceSamples) {
      const dt = Math.abs(s.time - point.time);
      if (dt < bestDt) {
        best = s;
        bestDt = dt;
      }
    }
    const levels = [best.close, best.open, best.high, best.low].filter((n): n is number => n !== undefined && Number.isFinite(n));
    if (!levels.length) return { time: best.time, price: point.price };
    const price = levels.reduce((a, n) => (Math.abs(n - point.price) < Math.abs(a - point.price) ? n : a));
    return { time: best.time, price };
  }

  setContext(sourceId: string, pairId: string): void {
    this.sourceId = sourceId;
    this.pairId = pairId;
    this.drawings = load(sourceId, pairId);
    this.selectedId = null;
    this.draft = null;
    this.redraw();
    this.emitSelect();
  }

  deleteSelected(): boolean {
    if (!this.selectedId) return false;
    this.drawings = this.drawings.filter((d) => d.id !== this.selectedId);
    this.selectedId = null;
    this.persist();
    this.redraw();
    this.emitSelect();
    return true;
  }

  clearAll(): void {
    this.drawings = [];
    this.selectedId = null;
    this.draft = null;
    this.persist();
    this.redraw();
    this.emitSelect();
  }

  exportJson(): string {
    return JSON.stringify({ version: 1, sourceId: this.sourceId, pairId: this.pairId, drawings: this.drawings }, null, 2);
  }

  importJson(raw: string): void {
    const parsed = JSON.parse(raw) as unknown;
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { drawings?: unknown }).drawings)
        ? (parsed as { drawings: unknown[] }).drawings
        : null;
    if (!list) throw new Error('Invalid drawings file');
    this.drawings = list.filter(isDrawing);
    this.selectedId = null;
    this.persist();
    this.redraw();
  }

  toggleExtendRight(): boolean {
    const d = this.drawings.find((x) => x.id === this.selectedId);
    if (!d) return false;
    if (d.type === 'fib') {
      const fib = fibOptionsOf(d);
      fib.extendLines = !fib.extendLines;
      d.fib = fib;
      this.persist();
      this.redraw();
      return d.fib.extendLines;
    }
    if (d.type !== 'fibext') return false;
    const fib = fibExtOptionsOf(d);
    fib.extendLines = !fib.extendLines;
    d.fib = fib;
    d.extendRight = fib.extendLines;
    this.persist();
    this.redraw();
    return d.extendRight;
  }

  syncSize(): void {
    this.resize();
  }

  destroy(): void {
    this.ro.disconnect();
    this.releaseCapturedPointer();
    this.wrap.removeEventListener('pointerdown', this.onWrapPointerDown, true);
    window.removeEventListener('pointermove', this.onWinPointerMove);
    window.removeEventListener('pointerup', this.onWinPointerUp);
    window.removeEventListener('pointercancel', this.onWinPointerUp);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onWinResize);
    window.removeEventListener('pointermove', this.onWinPointerMove);
    window.removeEventListener('pointerup', this.onWinPointerUp);
    window.removeEventListener('pointercancel', this.onWinPointerUp);
    this.wrap.removeEventListener('contextmenu', this.onContextMenu, true);
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.viewRaf) cancelAnimationFrame(this.viewRaf);
    this.viewRaf = 0;
  }

  private onWinResize = (): void => {
    this.resize();
  };

  private scheduleRedraw(): void {
    this.needsPaint = true;
    if (this.rafId) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = 0;
      if (!this.needsPaint) return;
      this.needsPaint = false;
      this.paintFrame();
    });
  }

  private onEmptyClick(ev: MouseEvent): void {
    if (ev.button !== 0 || this.tool !== 'cursor' || this.draft || this.drag || this.layerHidden) return;
    const target = ev.target as HTMLElement | null;
    if (target?.closest('#draw-bar, #fav-bar, #tool-rail, #chart-menu, .modal, [data-modal]')) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    if (this.hitHandle(x, y) || this.hitBody(x, y)) return;
    if (!this.selectedId) return;
    this.selectedId = null;
    this.redraw();
    this.emitSelect();
  }

  private typingTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    if (el.isContentEditable || el.closest('[contenteditable="true"]')) return true;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el.closest('input, textarea, select');
  }

  private modalOpen(): boolean {
    return Boolean(document.querySelector('#fib-modal:not([hidden]), #ind-modal:not([hidden]), #sym-modal:not([hidden]), #backup-modal:not([hidden])'));
  }

  private onKey = (ev: KeyboardEvent): void => {
    if (this.typingTarget(ev.target) || this.modalOpen()) return;
    if (ev.key === 'Escape') {
      this.cancelInProgress(true);
    } else if (ev.key === 'Enter' && this.draft && isOpenEnded(this.draft.type)) {
      ev.preventDefault();
      this.finishOpenDraft();
    } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
      if (this.deleteSelected()) ev.preventDefault();
    }
  };

  private syncPointerEvents(): void {
    const drawing = this.tool !== 'cursor' && !this.layerHidden;
    this.canvas.classList.toggle('passthrough', !drawing);
    this.chart.applyOptions(drawing ? { handleScroll: false, handleScale: false } : interactionOptions());
  }

  private persist(): void {
    save(this.sourceId, this.pairId, this.drawings);
    if (!this.muteHistory) this.onPersist?.();
  }

  private resize(): void {
    let width = 0;
    let height = 0;
    try {
      const pane = this.chart.paneSize(0);
      width = pane.width;
      height = pane.height;
    } catch {
      /* ignore */
    }
    if (width < 2 || height < 2) {
      const rect = this.wrap.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
    }
    const dpr = window.devicePixelRatio || 1;
    this.lastDpr = dpr;
    this.canvas.width = Math.max(1, Math.floor(width * dpr));
    this.canvas.height = Math.max(1, Math.floor(height * dpr));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.paintFrame();
  }

  private priceToY(price: number): number | null {
    const direct = this.series.priceToCoordinate(price);
    if (direct !== null) return direct;
    const range = this.series.priceScale().getVisibleRange();
    if (!range) return null;
    const yFrom = this.series.priceToCoordinate(range.from);
    const yTo = this.series.priceToCoordinate(range.to);
    const span = range.to - range.from;
    if (yFrom === null || yTo === null || span === 0) return null;
    return yFrom + ((price - range.from) / span) * (yTo - yFrom);
  }

  private yToPrice(y: number): number | null {
    const direct = this.series.coordinateToPrice(y);
    if (direct !== null) return direct;
    const range = this.series.priceScale().getVisibleRange();
    if (!range) return null;
    const yFrom = this.series.priceToCoordinate(range.from);
    const yTo = this.series.priceToCoordinate(range.to);
    if (yFrom === null || yTo === null || yTo === yFrom) return null;
    return range.from + ((y - yFrom) / (yTo - yFrom)) * (range.to - range.from);
  }

  private timeToX(time: number): number | null {
    const ts = this.chart.timeScale();
    const direct = ts.timeToCoordinate(time as Time);
    if (direct !== null) return direct;
    if (!this.lastTime || !this.stepSec) return null;
    const lastIndex = ts.timeToIndex(this.lastTime as Time, true);
    if (lastIndex === null) return null;
    const logical = (Number(lastIndex) + (time - this.lastTime) / this.stepSec) as Logical;
    return ts.logicalToCoordinate(logical);
  }

  private xToTime(x: number): number | null {
    const ts = this.chart.timeScale();
    const time = ts.coordinateToTime(x);
    if (typeof time === 'number' && Number.isFinite(time)) return time;
    const logical = ts.coordinateToLogical(x);
    if (logical === null || !this.lastTime || !this.stepSec) return null;
    const lastIndex = ts.timeToIndex(this.lastTime as Time, true);
    if (lastIndex === null) return null;
    return this.lastTime + (Number(logical) - Number(lastIndex)) * this.stepSec;
  }

  private xyToLogical(x: number, y: number, loose = false): Point | null {
    const price = this.yToPrice(y);
    const time = this.xToTime(x);
    if (price !== null && time !== null) return { time, price };
    if (!loose) return null;
    const rect = this.canvas.getBoundingClientRect();
    const cx = Math.min(Math.max(x, 0.5), Math.max(0.5, rect.width - 0.5));
    const cy = Math.min(Math.max(y, 0.5), Math.max(0.5, rect.height - 0.5));
    const p2 = this.yToPrice(cy);
    const t2 = this.xToTime(cx);
    if (p2 === null || t2 === null) return this.lastHit?.logical ?? null;
    return { time: t2, price: p2 };
  }

  private pointToXy(p: Point): { x: number; y: number } | null {
    const x = this.timeToX(p.time);
    const y = this.priceToY(p.price);
    if (x === null || y === null) return null;
    return { x, y };
  }

  getDrivenCrosshair(): Point | null {
    return this.drivenCrosshair ? { ...this.drivenCrosshair } : null;
  }

  priceToCoordinate(price: number): number | null {
    return this.priceToY(price);
  }

  cancelInProgress(clearSelection = true): void {
    const had = this.draft !== null || this.drag !== null || (clearSelection && this.selectedId !== null);
    this.draft = null;
    this.drag = null;
    if (clearSelection) this.selectedId = null;
    this.releaseCapturedPointer();
    this.clearDrivenCrosshair();
    this.syncPointerEvents();
    this.wrap.style.cursor = '';
    if (had || clearSelection) {
      this.paintFrame();
      this.emitSelect();
    }
  }

  isDrawingToolActive(): boolean {
    return this.tool !== 'cursor' || this.draft !== null;
  }

  private viewKey(): string {
    try {
      const lr = this.chart.timeScale().getVisibleLogicalRange();
      const pr = this.series.priceScale().getVisibleRange();
      const ts = this.chart.timeScale();
      return `${lr?.from ?? ''}:${lr?.to ?? ''}:${pr?.from ?? ''}:${pr?.to ?? ''}:${ts.options().barSpacing}:${ts.options().rightOffset}:${this.canvas.width}x${this.canvas.height}`;
    } catch {
      return '';
    }
  }

  private startViewWatch(): void {
    if (this.viewRaf) return;
    const tick = (): void => {
      this.viewRaf = requestAnimationFrame(tick);
      const key = this.viewKey();
      if (key !== this.lastViewKey) {
        this.lastViewKey = key;
        this.paintFrame();
      }
    };
    this.viewRaf = requestAnimationFrame(tick);
  }

  private syncCrosshair(logical: Point | null): void {
    if (!logical) {
      this.clearDrivenCrosshair();
      return;
    }
    this.drivenCrosshair = { time: logical.time, price: logical.price };
    try {
      this.chart.setCrosshairPosition(logical.price, logical.time as Time, this.series);
    } catch {
      /* scale not ready */
    }
  }

  private clearDrivenCrosshair(): void {
    this.drivenCrosshair = null;
    try {
      this.chart.clearCrosshairPosition();
    } catch {
      /* ignore */
    }
  }

  private eventPoint(ev: MouseEvent, loose = false): { x: number; y: number; logical: Point } | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    let logical = this.xyToLogical(x, y, loose);
    if (!logical) return null;
    if (this.shouldSnap(ev)) logical = this.snapLogical(logical);
    const hit = { x, y, logical };
    this.lastHit = hit;
    return hit;
  }

  private isUiChrome(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    return !!el.closest(
      '#tool-rail, #fav-bar, #draw-bar, #chart-menu, #rail-flyout, .modal, [data-modal], #ind-hud, #ind-modal, #fib-modal, #sym-modal, #backup-modal, #sidebar, #watchlist, button, a, input, textarea, select, [role="dialog"]',
    );
  }

  private releaseCapturedPointer(): void {
    if (this.capturedPointer === null) return;
    try {
      if (this.wrap.hasPointerCapture(this.capturedPointer)) this.wrap.releasePointerCapture(this.capturedPointer);
    } catch {
      /* already released */
    }
    this.capturedPointer = null;
  }

  private capturePointer(ev: PointerEvent): void {
    try {
      this.wrap.setPointerCapture(ev.pointerId);
      this.capturedPointer = ev.pointerId;
    } catch {
      this.capturedPointer = ev.pointerId;
    }
  }

  private onContextMenu = (ev: MouseEvent): void => {
    if (this.layerHidden || this.isUiChrome(ev.target) || this.modalOpen()) return;
    if (this.tool !== 'cursor' || this.draft) {
      ev.preventDefault();
      ev.stopPropagation();
      this.cancelInProgress(false);
    }
  };

  private onWrapPointerDown = (ev: PointerEvent): void => {
    if (this.layerHidden || this.isUiChrome(ev.target) || this.modalOpen()) return;
    if (ev.button === 2) {
      if (this.tool !== 'cursor' || this.draft) {
        ev.preventDefault();
        ev.stopPropagation();
        this.cancelInProgress(false);
        return;
      }
      const rect = this.canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      const id = this.hitHandle(x, y)?.id ?? this.hitBody(x, y);
      if (id && this.selectedId !== id) {
        this.selectedId = id;
        this.paintFrame();
        this.emitSelect();
      }
      return;
    }
    if (ev.button !== 0) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const overPlot =
      ev.clientX >= rect.left - 8 &&
      ev.clientX <= rect.right + 64 &&
      ev.clientY >= rect.top - 8 &&
      ev.clientY <= rect.bottom + 8;
    const handle = this.hitHandle(x, y);
    const body = handle ? null : this.hitBody(x, y);
    if (this.tool === 'cursor') {
      if (!handle && !body) return;
      ev.preventDefault();
      ev.stopPropagation();
      this.capturePointer(ev);
      this.onPointer(ev, 'down');
      return;
    }
    if (!overPlot) return;
    ev.preventDefault();
    ev.stopPropagation();
    this.capturePointer(ev);
    this.onPointer(ev, 'down');
  };

  private onWinPointerMove = (ev: PointerEvent): void => {
    if (this.drag || this.draft || (this.tool === 'brush' && ev.buttons !== 0)) {
      if (this.drag || this.draft) ev.preventDefault();
      this.onPointer(ev, 'move');
      return;
    }
    if (this.tool !== 'cursor' && !this.layerHidden && !this.isUiChrome(ev.target)) {
      const hit = this.eventPoint(ev, true);
      this.syncCrosshair(hit?.logical ?? null);
      return;
    }
    if (ev.buttons !== 0) this.paintFrame();
    this.onHoverPassthrough(ev);
  };

  private onWinPointerUp = (ev: PointerEvent): void => {
    this.releaseCapturedPointer();
    this.onPointer(ev, 'up');
  };

  private onHoverPassthrough(ev: MouseEvent): void {
    if (this.layerHidden || this.tool !== 'cursor' || this.drag) {
      this.canvas.classList.toggle('passthrough', this.tool === 'cursor' && !this.drag);
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const handle = this.hitHandle(x, y);
    const body = handle ? null : this.hitBody(x, y);
    // Keep the overlay pass-through so wheel zoom, pan, and axis drags reach the chart.
    this.canvas.classList.add('passthrough');
    this.wrap.style.cursor = handle ? 'ns-resize' : body ? 'move' : '';
  }

  private onPointer(ev: MouseEvent, phase: 'down' | 'move' | 'up'): void {
    if (phase === 'down' && ev.button === 0 && isMagnetModifier(ev)) ev.preventDefault();
    if (this.layerHidden) {
      if (phase === 'up' && this.drag) {
        this.drag = null;
        this.persist();
        this.syncPointerEvents();
      }
      return;
    }
    const loose = phase !== 'down' && !!(this.drag || this.draft || this.tool === 'brush');
    const hit = this.eventPoint(ev, loose);
    if (hit && (this.drag || this.draft || this.tool !== 'cursor')) this.syncCrosshair(hit.logical);
    if (phase === 'down' && ev.button !== 0) {
      return;
    }
    if (this.tool === 'brush') {
      this.onBrushPointer(ev, hit, phase);
      return;
    }
    if (phase === 'up') {
      if (this.drag) {
        this.drag = null;
        this.persist();
        this.syncPointerEvents();
        this.paintFrame();
      }
      this.wrap.style.cursor = '';
      return;
    }
    if (phase === 'move' && this.drag) {
      if (hit) this.applyDrag(hit);
      return;
    }
    if (!hit) return;

    if (this.tool === 'cursor') {
      this.onCursorPointer(hit, phase);
      return;
    }
    if (phase === 'move' && this.draft) {
      this.draft.current = hit.logical;
      this.paintFrame();
      return;
    }
    if (phase === 'down') this.addDraftPoint(hit.logical);
  }

  private onCursorPointer(hit: { x: number; y: number; logical: Point }, phase: 'down' | 'move'): void {
    if (phase === 'down') {
      const handle = this.hitHandle(hit.x, hit.y);
      const body = handle ? null : this.hitBody(hit.x, hit.y);
      const id = handle?.id ?? body;
      this.selectedId = id;
      if (id) {
        const orig = this.drawings.find((d) => d.id === id);
        if (orig && !orig.style?.locked) {
          this.drag = {
            mode: handle ? 'point' : 'move',
            handle: handle?.handle,
            startX: hit.x,
            startY: hit.y,
            orig: structuredClone(orig),
            priceOnly: handle?.priceOnly,
          };
          this.canvas.classList.remove('passthrough');
          this.chart.applyOptions({ handleScroll: false, handleScale: false });
        }
      }
      this.paintFrame();
      this.emitSelect();
      return;
    }
    if (phase === 'move' && this.drag) this.applyDrag(hit);
  }

  private applyDrag(hit: { x: number; y: number; logical: Point }): void {
    const drag = this.drag;
    if (!drag) return;
    const current = this.drawings.find((d) => d.id === drag.orig.id);
    if (!current) return;
    if (drag.mode === 'point' && drag.handle) {
      let next = hit.logical;
      if (drag.priceOnly) {
        const keep = this.handlePoint(drag.orig, drag.handle);
        if (keep) next = { time: keep.time, price: hit.logical.price };
      }
      this.moveHandle(current, drag.handle, next);
    } else {
      const start = this.xyToLogical(drag.startX, drag.startY, true);
      if (!start) return;
      const dt = hit.logical.time - start.time;
      const dp = hit.logical.price - start.price;
      this.translateDrawing(current, drag.orig, dt, dp);
    }
    this.paintFrame();
  }

  private moveHandle(d: Drawing, handle: HandleName, p: Point): void {
    switch (d.type) {
      case 'trend':
      case 'rect':
      case 'ray':
      case 'fib':
        if (handle === 'p1') d.p1 = p;
        if (handle === 'p2') d.p2 = p;
        break;
      case 'hline':
        d.price = p.price;
        break;
      case 'channel':
        if (handle === 'p1') d.p1 = p;
        if (handle === 'p2') d.p2 = p;
        if (handle === 'p3') d.p3 = p;
        break;
      case 'abcd':
      case 'fibext':
        if (handle === 'a') d.a = p;
        if (handle === 'b') d.b = p;
        if (handle === 'c') d.c = p;
        break;
      case 'text':
        d.p = p;
        break;
      case 'longpos':
      case 'shortpos':
        if (handle === 'entry') d.entry = p;
        if (handle === 'stop') d.stop = p;
        if (handle === 'target') d.target = p;
        break;
      case 'pricerange':
      case 'daterange':
      case 'datepricerange':
        if (handle === 'p1') d.p1 = p;
        if (handle === 'p2') d.p2 = p;
        break;
      case 'vline':
        if (handle === 'time') d.time = p.time;
        break;
      case 'hray':
      case 'extline':
        if (handle === 'p1') d.p1 = p;
        if (handle === 'p2') d.p2 = p;
        break;
      case 'arrow':
        if (handle === 'p1') d.p1 = p;
        if (handle === 'p2') d.p2 = p;
        break;
      case 'pricelabel':
        if (handle === 'p') d.p = p;
        break;
      case 'note':
        if (handle === 'p') d.p = p;
        break;
      case 'callout':
        if (handle === 'p1') d.p1 = p;
        if (handle === 'p2') d.p2 = p;
        break;
      case 'ellipse':
        if (handle === 'p1') d.p1 = p;
        if (handle === 'p2') d.p2 = p;
        break;
      case 'triangle':
        if (handle === 'p1') d.p1 = p;
        if (handle === 'p2') d.p2 = p;
        if (handle === 'p3') d.p3 = p;
        break;
      case 'regress':
        if (handle === 'p1') d.p1 = p;
        if (handle === 'p2') d.p2 = p;
        break;
      case 'xabcd':
        if (handle === 'x') d.x = p;
        if (handle === 'a') d.a = p;
        if (handle === 'b') d.b = p;
        if (handle === 'c') d.c = p;
        if (handle === 'd') d.d = p;
        break;
      case 'hs':
        if (handle === 'ls') d.ls = p;
        if (handle === 'n1') d.n1 = p;
        if (handle === 'head') d.head = p;
        if (handle === 'n2') d.n2 = p;
        if (handle === 'rs') d.rs = p;
        break;
      case 'fibchan':
        if (handle === 'p1') d.p1 = p;
        if (handle === 'p2') d.p2 = p;
        if (handle === 'p3') d.p3 = p;
        break;
      case 'fibfan':
        if (handle === 'p1') d.p1 = p;
        if (handle === 'p2') d.p2 = p;
        break;
      case 'arc':
        if (handle === 'p1') d.p1 = p;
        if (handle === 'p2') d.p2 = p;
        if (handle === 'p3') d.p3 = p;
        break;
      case 'tripattern':
        if (handle === 'p1') d.p1 = p;
        if (handle === 'p2') d.p2 = p;
        if (handle === 'p3') d.p3 = p;
        if (handle === 'p4') d.p4 = p;
        break;
      case 'elliottimp':
      case 'elliottabc':
      case 'path':
      case 'brush': {
        const i = Number(handle);
        if (Number.isInteger(i) && i >= 0 && i < d.points.length) d.points[i] = p;
        break;
      }
      case 'flag':
        if (handle === 'p1') d.p1 = p;
        if (handle === 'p2') d.p2 = p;
        if (handle === 'p3') d.p3 = p;
        if (handle === 'p4') d.p4 = p;
        break;
      case 'forecast':
      case 'fibarcs':
      case 'fibspiral':
      case 'fibtz':
      case 'gannbox':
      case 'gannfan':
      case 'gannsq':
        if (handle === 'p1') d.p1 = p;
        if (handle === 'p2') d.p2 = p;
        break;
      case 'pitchfork':
        if (handle === 'p1') d.p1 = p;
        if (handle === 'p2') d.p2 = p;
        if (handle === 'p3') d.p3 = p;
        break;
    }
  }

  private translateDrawing(current: Drawing, orig: Drawing, dt: number, dp: number): void {
    const shift = (p: Point): Point => ({ time: p.time + dt, price: p.price + dp });
    switch (current.type) {
      case 'trend':
      case 'rect':
      case 'ray':
      case 'fib':
        if (orig.type === current.type) {
          current.p1 = shift(orig.p1);
          current.p2 = shift(orig.p2);
        }
        break;
      case 'hline':
        if (orig.type === 'hline') current.price = orig.price + dp;
        break;
      case 'channel':
        if (orig.type === 'channel') {
          current.p1 = shift(orig.p1);
          current.p2 = shift(orig.p2);
          current.p3 = shift(orig.p3);
        }
        break;
      case 'abcd':
      case 'fibext':
        if (orig.type === current.type) {
          current.a = shift(orig.a);
          current.b = shift(orig.b);
          current.c = shift(orig.c);
        }
        break;
      case 'text':
        if (orig.type === 'text') current.p = shift(orig.p);
        break;
      case 'longpos':
      case 'shortpos':
        if (orig.type === current.type) {
          current.entry = shift(orig.entry);
          current.stop = shift(orig.stop);
          current.target = shift(orig.target);
        }
        break;
      case 'pricerange':
      case 'daterange':
      case 'datepricerange':
        if (orig.type === current.type) {
          current.p1 = shift(orig.p1);
          current.p2 = shift(orig.p2);
        }
        break;
      case 'vline':
        if (orig.type === 'vline') current.time = shift({ time: orig.time, price: 0 }).time;
        break;
      case 'hray':
      case 'extline':
        if (orig.type === current.type) {
          current.p1 = shift(orig.p1);
          current.p2 = shift(orig.p2);
        }
        break;
      case 'arrow':
        if (orig.type === 'arrow') {
          current.p1 = shift(orig.p1);
          current.p2 = shift(orig.p2);
        }
        break;
      case 'pricelabel':
        if (orig.type === 'pricelabel') current.p = shift(orig.p);
        break;
      case 'note':
        if (orig.type === 'note') current.p = shift(orig.p);
        break;
      case 'callout':
        if (orig.type === 'callout') {
          current.p1 = shift(orig.p1);
          current.p2 = shift(orig.p2);
        }
        break;
      case 'ellipse':
        if (orig.type === 'ellipse') {
          current.p1 = shift(orig.p1);
          current.p2 = shift(orig.p2);
        }
        break;
      case 'triangle':
        if (orig.type === 'triangle') {
          current.p1 = shift(orig.p1);
          current.p2 = shift(orig.p2);
          current.p3 = shift(orig.p3);
        }
        break;
      case 'regress':
        if (orig.type === 'regress') {
          current.p1 = shift(orig.p1);
          current.p2 = shift(orig.p2);
        }
        break;
      case 'xabcd':
        if (orig.type === 'xabcd') {
          current.x = shift(orig.x);
          current.a = shift(orig.a);
          current.b = shift(orig.b);
          current.c = shift(orig.c);
          current.d = shift(orig.d);
        }
        break;
      case 'hs':
        if (orig.type === 'hs') {
          current.ls = shift(orig.ls);
          current.n1 = shift(orig.n1);
          current.head = shift(orig.head);
          current.n2 = shift(orig.n2);
          current.rs = shift(orig.rs);
        }
        break;
      case 'fibchan':
        if (orig.type === 'fibchan') {
          current.p1 = shift(orig.p1);
          current.p2 = shift(orig.p2);
          current.p3 = shift(orig.p3);
        }
        break;
      case 'fibfan':
        if (orig.type === 'fibfan') {
          current.p1 = shift(orig.p1);
          current.p2 = shift(orig.p2);
        }
        break;
      case 'arc':
        if (orig.type === 'arc') {
          current.p1 = shift(orig.p1);
          current.p2 = shift(orig.p2);
          current.p3 = shift(orig.p3);
        }
        break;
      case 'tripattern':
        if (orig.type === 'tripattern') {
          current.p1 = shift(orig.p1);
          current.p2 = shift(orig.p2);
          current.p3 = shift(orig.p3);
          current.p4 = shift(orig.p4);
        }
        break;
      case 'elliottimp':
      case 'elliottabc':
      case 'path':
      case 'brush':
        if (orig.type === current.type) current.points = orig.points.map(shift);
        break;
      case 'flag':
        if (orig.type === 'flag') {
          current.p1 = shift(orig.p1);
          current.p2 = shift(orig.p2);
          current.p3 = shift(orig.p3);
          current.p4 = shift(orig.p4);
        }
        break;
      case 'forecast':
      case 'fibarcs':
      case 'fibspiral':
      case 'fibtz':
      case 'gannbox':
      case 'gannfan':
      case 'gannsq':
        if (orig.type === current.type) {
          current.p1 = shift(orig.p1);
          current.p2 = shift(orig.p2);
        }
        break;
      case 'pitchfork':
        if (orig.type === 'pitchfork') {
          current.p1 = shift(orig.p1);
          current.p2 = shift(orig.p2);
          current.p3 = shift(orig.p3);
        }
        break;
    }
  }

  private onDblClick(ev: MouseEvent): void {
    ev.preventDefault();
    if (this.draft && isOpenEnded(this.draft.type) && this.draft.type !== 'brush') {
      this.finishOpenDraft();
      return;
    }
    if (this.tool !== 'cursor') return;
    const rect = this.canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const handle = this.hitHandle(x, y);
    const id = handle?.id ?? this.hitBody(x, y);
    if (!id) return;
    this.selectedId = id;
    this.redraw();
    this.emitSelect();
    const d = this.getSelected();
    if (d) this.onEdit?.(d);
  }

  private onBrushPointer(ev: MouseEvent, hit: { x: number; y: number; logical: Point } | null, phase: 'down' | 'move' | 'up'): void {
    if (phase === 'down' && hit) {
      this.draft = { type: 'brush', points: [hit.logical], current: hit.logical };
      this.redraw();
      return;
    }
    if (phase === 'move' && this.draft?.type === 'brush' && ev.buttons !== 0 && hit) {
      const last = this.draft.points[this.draft.points.length - 1]!;
      const a = this.pointToXy(last);
      const b = this.pointToXy(hit.logical);
      if (a && b && Math.hypot(b.x - a.x, b.y - a.y) >= 4) this.draft.points.push(hit.logical);
      this.draft.current = hit.logical;
      this.redraw();
      return;
    }
    if (phase === 'up' && this.draft?.type === 'brush') this.finishOpenDraft();
  }

  private finishOpenDraft(): void {
    const draft = this.draft;
    if (!draft) return;
    const raw = [...draft.points];
    const last = raw[raw.length - 1];
    if (!last || last.time !== draft.current.time || last.price !== draft.current.price) raw.push(draft.current);
    const pts: Point[] = [];
    for (const p of raw) {
      const prev = pts[pts.length - 1];
      if (!prev || prev.time !== p.time || prev.price !== p.price) pts.push(p);
    }
    if (pts.length >= 2) {
      const created = this.commitPoints(draft.type, pts);
      if (created) {
        this.drawings.push(this.stampStyle(created));
        this.selectedId = created.id;
        this.persist();
      }
    }
    this.draft = null;
    this.redraw();
    this.onToolDone?.();
  }

  private addDraftPoint(point: Point): void {
    if (this.tool === 'path') {
      if (!this.draft || this.draft.type !== 'path') this.draft = { type: 'path', points: [point], current: point };
      else this.draft = { type: 'path', points: [...this.draft.points, point], current: point };
      this.redraw();
      return;
    }
    const needed = TOOLS_POINTS[this.tool];
    if (!Number.isFinite(needed) || needed <= 0) return;
    if (this.tool === 'hline') {
      this.drawings.push(this.stampStyle({ id: newId(), type: 'hline', price: point.price }));
      this.selectedId = this.drawings[this.drawings.length - 1]!.id;
      this.persist();
      this.redraw();
      this.emitSelect();
      this.onToolDone?.();
      return;
    }
    if (this.tool === 'text') {
      const text = window.prompt('Note text', 'Note');
      if (text && text.trim()) {
        this.drawings.push(this.stampStyle({ id: newId(), type: 'text', p: point, text: text.trim() }));
        this.selectedId = this.drawings[this.drawings.length - 1]!.id;
        this.persist();
        this.emitSelect();
        this.redraw();
        this.onToolDone?.();
        return;
      }
      this.redraw();
      return;
    }
    if (!this.draft) {
      if (needed === 1) {
        if (this.tool === 'note') {
          const text = window.prompt('Note', 'Note');
          if (text && text.trim()) {
            const drawing = this.commitPoints('note', [point]);
            if (drawing && drawing.type === 'note') {
              drawing.text = text.trim();
              this.drawings.push(this.stampStyle(drawing));
              this.selectedId = drawing.id;
              this.persist();
              this.emitSelect();
              this.redraw();
              this.onToolDone?.();
              return;
            }
          }
          this.redraw();
          return;
        }
        const drawing = this.commitPoints(this.tool, [point]);
        if (drawing) {
          this.drawings.push(this.stampStyle(drawing));
          this.selectedId = drawing.id;
          this.persist();
          this.emitSelect();
        }
        this.redraw();
        if (drawing) this.onToolDone?.();
        return;
      }
      this.draft = { type: this.tool, points: [point], current: point };
      this.redraw();
      return;
    }
    const points = [...this.draft.points, point];
    if (points.length < needed) {
      this.draft = { type: this.tool, points, current: point };
      this.redraw();
      return;
    }
    if (this.tool === 'callout') {
      const text = window.prompt('Callout', 'Callout');
      if (!(text && text.trim())) {
        this.draft = null;
        this.redraw();
        return;
      }
      const created = this.commitPoints('callout', points);
      if (created && created.type === 'callout') {
        created.text = text.trim();
        this.drawings.push(this.stampStyle(created));
        this.selectedId = created.id;
        this.persist();
        this.emitSelect();
        this.draft = null;
        this.redraw();
        this.onToolDone?.();
        return;
      }
      this.draft = null;
      this.redraw();
      return;
    }
    const created = this.commitPoints(this.tool, points);
    if (created) {
      this.drawings.push(this.stampStyle(created));
      this.selectedId = created.id;
      this.persist();
      this.emitSelect();
    }
    this.draft = null;
    this.redraw();
    if (created) this.onToolDone?.();
  }

  private commitPoints(type: Tool, points: Point[]): Drawing | null {
    const id = newId();
    switch (type) {
      case 'trend':
        return { id, type: 'trend', p1: points[0]!, p2: points[1]! };
      case 'rect':
        return { id, type: 'rect', p1: points[0]!, p2: points[1]! };
      case 'ray':
        return { id, type: 'ray', p1: points[0]!, p2: points[1]! };
      case 'fib':
        return { id, type: 'fib', p1: points[0]!, p2: points[1]!, fib: cloneFibOptions(loadFibDefaults()) };
      case 'channel':
        return { id, type: 'channel', p1: points[0]!, p2: points[1]!, p3: points[2]! };
      case 'abcd':
        return { id, type: 'abcd', a: points[0]!, b: points[1]!, c: points[2]! };
      case 'fibext':
        {
        const fib = cloneFibOptions(loadFibExtDefaults());
        return { id, type: 'fibext', a: points[0]!, b: points[1]!, c: points[2]!, extendRight: fib.extendLines, fib };
      }
      case 'longpos':
        return { id, type: 'longpos', entry: points[0]!, stop: points[1]!, target: points[2]! };
      case 'shortpos':
        return { id, type: 'shortpos', entry: points[0]!, stop: points[1]!, target: points[2]! };
      case 'pricerange':
        return { id, type: 'pricerange', p1: points[0]!, p2: points[1]! };
      case 'daterange':
        return { id, type: 'daterange', p1: points[0]!, p2: points[1]! };
      case 'datepricerange':
        return { id, type: 'datepricerange', p1: points[0]!, p2: points[1]! };
      case 'vline':
        return { id, type: 'vline', time: points[0]!.time };
      case 'hray':
        return { id, type: 'hray', p1: points[0]!, p2: points[1]! };
      case 'extline':
        return { id, type: 'extline', p1: points[0]!, p2: points[1]! };
      case 'arrow':
        return { id, type: 'arrow', p1: points[0]!, p2: points[1]! };
      case 'pricelabel':
        return { id, type: 'pricelabel', p: points[0]! };
      case 'note':
        return { id, type: 'note', p: points[0]!, text: '' };
      case 'callout':
        return { id, type: 'callout', p1: points[0]!, p2: points[1]!, text: '' };
      case 'ellipse':
        return { id, type: 'ellipse', p1: points[0]!, p2: points[1]! };
      case 'triangle':
        return { id, type: 'triangle', p1: points[0]!, p2: points[1]!, p3: points[2]! };
      case 'regress':
        return { id, type: 'regress', p1: points[0]!, p2: points[1]! };
      case 'xabcd':
        return { id, type: 'xabcd', x: points[0]!, a: points[1]!, b: points[2]!, c: points[3]!, d: points[4]! };
      case 'hs':
        return { id, type: 'hs', ls: points[0]!, n1: points[1]!, head: points[2]!, n2: points[3]!, rs: points[4]! };
      case 'fibchan':
        return { id, type: 'fibchan', p1: points[0]!, p2: points[1]!, p3: points[2]! };
      case 'fibfan':
        return { id, type: 'fibfan', p1: points[0]!, p2: points[1]! };
      case 'arc':
        return { id, type: 'arc', p1: points[0]!, p2: points[1]!, p3: points[2]! };
      case 'tripattern':
        return { id, type: 'tripattern', p1: points[0]!, p2: points[1]!, p3: points[2]!, p4: points[3]! };
      case 'elliottimp':
        return { id, type: 'elliottimp', points: points.slice(0, 6) };
      case 'elliottabc':
        return { id, type: 'elliottabc', points: points.slice(0, 3) };
      case 'path':
        return { id, type: 'path', points: [...points] };
      case 'brush':
        return { id, type: 'brush', points: [...points] };
      case 'flag':
        return { id, type: 'flag', p1: points[0]!, p2: points[1]!, p3: points[2]!, p4: points[3]! };
      case 'forecast':
        return { id, type: 'forecast', p1: points[0]!, p2: points[1]! };
      case 'fibarcs':
        return { id, type: 'fibarcs', p1: points[0]!, p2: points[1]! };
      case 'fibspiral':
        return { id, type: 'fibspiral', p1: points[0]!, p2: points[1]! };
      case 'fibtz':
        return { id, type: 'fibtz', p1: points[0]!, p2: points[1]! };
      case 'gannbox':
        return { id, type: 'gannbox', p1: points[0]!, p2: points[1]! };
      case 'gannfan':
        return { id, type: 'gannfan', p1: points[0]!, p2: points[1]! };
      case 'gannsq':
        return { id, type: 'gannsq', p1: points[0]!, p2: points[1]! };
      case 'pitchfork':
        return { id, type: 'pitchfork', p1: points[0]!, p2: points[1]!, p3: points[2]! };
      default:
        return null;
    }
  }

  private handlesOf(d: Drawing): { handle: HandleName; point: Point }[] {
    switch (d.type) {
      case 'trend':
      case 'rect':
      case 'ray':
      case 'fib':
        return [
          { handle: 'p1', point: d.p1 },
          { handle: 'p2', point: d.p2 },
        ];
      case 'hline':
        return [{ handle: 'price', point: { time: this.lastTime || 0, price: d.price } }];
      case 'channel':
        return [
          { handle: 'p1', point: d.p1 },
          { handle: 'p2', point: d.p2 },
          { handle: 'p3', point: d.p3 },
        ];
      case 'abcd':
      case 'fibext':
        return [
          { handle: 'a', point: d.a },
          { handle: 'b', point: d.b },
          { handle: 'c', point: d.c },
        ];
      case 'text':
        return [{ handle: 'p', point: d.p }];
      case 'longpos':
      case 'shortpos':
        return [
          { handle: 'entry', point: d.entry },
          { handle: 'stop', point: d.stop },
          { handle: 'target', point: d.target },
        ];
      case 'pricerange':
      case 'daterange':
      case 'datepricerange':
        return [
          { handle: 'p1', point: d.p1 },
          { handle: 'p2', point: d.p2 },
        ];
      case 'vline':
        return [{ handle: 'time', point: { time: d.time, price: 0 } }];
      case 'hray':
      case 'extline':
        return [
          { handle: 'p1', point: d.p1 },
          { handle: 'p2', point: d.p2 },
        ];
      case 'arrow':
        return [
          { handle: 'p1', point: d.p1 },
          { handle: 'p2', point: d.p2 },
        ];
      case 'pricelabel':
        return [{ handle: 'p', point: d.p }];
      case 'note':
        return [{ handle: 'p', point: d.p }];
      case 'callout':
        return [
          { handle: 'p1', point: d.p1 },
          { handle: 'p2', point: d.p2 },
        ];
      case 'ellipse':
        return [
          { handle: 'p1', point: d.p1 },
          { handle: 'p2', point: d.p2 },
        ];
      case 'triangle':
        return [
          { handle: 'p1', point: d.p1 },
          { handle: 'p2', point: d.p2 },
          { handle: 'p3', point: d.p3 },
        ];
      case 'regress':
        return [
          { handle: 'p1', point: d.p1 },
          { handle: 'p2', point: d.p2 },
        ];
      case 'xabcd':
        return [
          { handle: 'x', point: d.x },
          { handle: 'a', point: d.a },
          { handle: 'b', point: d.b },
          { handle: 'c', point: d.c },
          { handle: 'd', point: d.d },
        ];
      case 'hs':
        return [
          { handle: 'ls', point: d.ls },
          { handle: 'n1', point: d.n1 },
          { handle: 'head', point: d.head },
          { handle: 'n2', point: d.n2 },
          { handle: 'rs', point: d.rs },
        ];
      case 'fibchan':
        return [
          { handle: 'p1', point: d.p1 },
          { handle: 'p2', point: d.p2 },
          { handle: 'p3', point: d.p3 },
        ];
      case 'fibfan':
        return [
          { handle: 'p1', point: d.p1 },
          { handle: 'p2', point: d.p2 },
        ];
      case 'arc':
        return [
          { handle: 'p1', point: d.p1 },
          { handle: 'p2', point: d.p2 },
          { handle: 'p3', point: d.p3 },
        ];
      case 'tripattern':
        return [
          { handle: 'p1', point: d.p1 },
          { handle: 'p2', point: d.p2 },
          { handle: 'p3', point: d.p3 },
          { handle: 'p4', point: d.p4 },
        ];
      case 'elliottimp':
      case 'elliottabc':
      case 'path':
      case 'brush':
        return d.points.map((point, i) => ({ handle: String(i), point }));
      case 'flag':
        return [
          { handle: 'p1', point: d.p1 },
          { handle: 'p2', point: d.p2 },
          { handle: 'p3', point: d.p3 },
          { handle: 'p4', point: d.p4 },
        ];
      case 'forecast':
      case 'fibarcs':
      case 'fibspiral':
      case 'fibtz':
      case 'gannbox':
      case 'gannfan':
      case 'gannsq':
        return [
          { handle: 'p1', point: d.p1 },
          { handle: 'p2', point: d.p2 },
        ];
      case 'pitchfork':
        return [
          { handle: 'p1', point: d.p1 },
          { handle: 'p2', point: d.p2 },
          { handle: 'p3', point: d.p3 },
        ];
    }
  }

  private handlePoint(d: Drawing, handle: HandleName): Point | null {
    return this.handlesOf(d).find((h) => h.handle === handle)?.point ?? null;
  }

  handlePage(handle: HandleName, drawingId?: string | null): { x: number; y: number } | null {
    const d =
      (drawingId ? this.drawings.find((x) => x.id === drawingId) : null) ??
      this.getSelected() ??
      this.drawings[0] ??
      null;
    if (!d) return null;
    const screens = this.handleScreens(d);
    const hit = screens.find((s) => s.handle === handle) ?? screens[0];
    if (!hit) return null;
    const rect = this.canvas.getBoundingClientRect();
    return { x: rect.left + hit.x, y: rect.top + hit.y };
  }

  private fibLabelScreens(d: Drawing): { handle: HandleName; x: number; y: number; priceOnly: boolean; box?: boolean }[] {
    const width = this.canvas.getBoundingClientRect().width;
    const out: { handle: HandleName; x: number; y: number; priceOnly: boolean; box?: boolean }[] = [];
    if (d.type === 'fib') {
      const opts = fibOptionsOf(d);
      const ends = fibEnds(d);
      const t1 = this.timeToX(ends.p1.time);
      const t2 = this.timeToX(ends.p2.time);
      if (t1 === null || t2 === null) return out;
      const left = Math.min(t1, t2);
      const right = opts.extendLines ? width : Math.max(t1, t2);
      const atLeft = opts.labels === 'left';
      const lx = atLeft ? left + 8 : right - 8;
      const y0 = this.priceToY(fibRetracementPrice(ends.p1, ends.p2, 0, opts.reverse));
      const y1 = this.priceToY(fibRetracementPrice(ends.p1, ends.p2, 1, opts.reverse));
      const h0: HandleName = opts.reverse ? 'p1' : 'p2';
      const h1: HandleName = opts.reverse ? 'p2' : 'p1';
      if (y0 !== null) out.push({ handle: h0, x: lx, y: y0, priceOnly: true, box: true });
      if (y1 !== null) out.push({ handle: h1, x: lx, y: y1, priceOnly: true, box: true });
    } else if (d.type === 'fibext') {
      const opts = fibExtOptionsOf(d);
      const a = this.pointToXy(d.a);
      const b = this.pointToXy(d.b);
      const c = this.pointToXy(d.c);
      if (!a || !b || !c) return out;
      const startX = opts.extendLines ? Math.min(a.x, b.x, c.x) : c.x;
      const endX = opts.extendLines ? width : Math.max(a.x, b.x, c.x) + 40;
      const atLeft = opts.labels === 'left';
      const lx = atLeft ? startX + 8 : endX - 8;
      const y0 = this.priceToY(fibExtensionPrice(d.a, d.b, d.c, 0, opts.reverse));
      const y1 = this.priceToY(fibExtensionPrice(d.a, d.b, d.c, 1, opts.reverse));
      if (y0 !== null) out.push({ handle: 'c', x: lx, y: y0, priceOnly: true, box: true });
      if (y1 !== null) out.push({ handle: 'b', x: lx, y: y1, priceOnly: true, box: true });
    }
    return out;
  }

  private handleScreens(
    d: Drawing,
  ): { handle: HandleName; x: number; y: number; priceOnly?: boolean; box?: boolean }[] {
    const width = this.canvas.getBoundingClientRect().width;
    const height = this.canvas.getBoundingClientRect().height;
    const out: { handle: HandleName; x: number; y: number; priceOnly?: boolean; box?: boolean }[] = [];
    for (const h of this.handlesOf(d)) {
      let xy = this.pointToXy(h.point);
      if (d.type === 'hline') {
        const yy = this.priceToY(d.price);
        if (yy === null) continue;
        xy = { x: width / 2, y: yy };
      }
      if (d.type === 'vline') {
        const xx = this.timeToX(d.time);
        if (xx === null) continue;
        xy = { x: xx, y: height / 2 };
      }
      if (d.type === 'hray' && h.handle === 'p2') {
        const yy = this.priceToY(d.p1.price);
        const xx = this.timeToX(d.p2.time);
        if (yy === null || xx === null) continue;
        xy = { x: xx, y: yy };
      }
      if (!xy) continue;
      out.push({ handle: h.handle, x: xy.x, y: xy.y });
    }
    out.push(...this.fibLabelScreens(d));
    return out;
  }

  private hitHandle(x: number, y: number): { id: string; handle: HandleName; priceOnly?: boolean } | null {
    for (const d of this.drawings) {
      for (const h of this.handleScreens(d)) {
        if (h.box) {
          if (Math.abs(x - h.x) <= 56 && Math.abs(y - h.y) <= 10) {
            return { id: d.id, handle: h.handle, priceOnly: h.priceOnly };
          }
          continue;
        }
        if (Math.hypot(x - h.x, y - h.y) <= HANDLE + 3) {
          return { id: d.id, handle: h.handle, priceOnly: h.priceOnly };
        }
      }
    }
    return null;
  }

  private hitBody(x: number, y: number): string | null {
    let best: { id: string; dist: number } | null = null;
    for (const d of this.drawings) {
      const dist = this.hitDistance(d, x, y);
      if (dist === null || dist > HIT_PX) continue;
      if (!best || dist < best.dist) best = { id: d.id, dist };
    }
    return best?.id ?? null;
  }

  private hitDistance(d: Drawing, x: number, y: number): number | null {
    const width = this.canvas.getBoundingClientRect().width;
    const height = this.canvas.getBoundingClientRect().height;
    if (d.type === 'hline') {
      const yy = this.priceToY(d.price);
      return yy === null ? null : Math.abs(y - yy);
    }
    if (d.type === 'vline') {
      const xx = this.timeToX(d.time);
      return xx === null ? null : Math.abs(x - xx);
    }
    if (d.type === 'hray') {
      const yy = this.priceToY(d.p1.price);
      const x1 = this.timeToX(d.p1.time);
      if (yy === null || x1 === null) return null;
      const goRight = d.p2.time >= d.p1.time;
      if (goRight && x < x1 - 2) return Math.hypot(x - x1, y - yy);
      if (!goRight && x > x1 + 2) return Math.hypot(x - x1, y - yy);
      return Math.abs(y - yy);
    }
    if (d.type === 'extline') {
      const a = this.pointToXy(d.p1);
      const b = this.pointToXy(d.p2);
      if (!a || !b) return null;
      const ext = extendLine(a.x, a.y, b.x, b.y, width, height);
      return distPointToSegment(x, y, ext.a.x, ext.a.y, ext.b.x, ext.b.y);
    }
    if (d.type === 'text' || d.type === 'pricelabel' || d.type === 'note') {
      const xy = this.pointToXy(d.p);
      if (!xy) return null;
      const w = d.type === 'text' ? 80 : 120;
      const h = d.type === 'note' ? 28 : 18;
      return x >= xy.x - 2 && x <= xy.x + w && y >= xy.y - h && y <= xy.y + 6 ? 0 : 80;
    }
    if (d.type === 'arrow') {
      const a = this.pointToXy(d.p1);
      const b = this.pointToXy(d.p2);
      if (!a || !b) return null;
      return distPointToSegment(x, y, a.x, a.y, b.x, b.y);
    }
    if (d.type === 'callout') {
      const a = this.pointToXy(d.p1);
      const b = this.pointToXy(d.p2);
      if (!a || !b) return null;
      const onLine = distPointToSegment(x, y, a.x, a.y, b.x, b.y);
      const inBox = x >= b.x - 2 && x <= b.x + 130 && y >= b.y - 22 && y <= b.y + 8 ? 0 : 80;
      return Math.min(onLine, inBox);
    }
    if (d.type === 'ellipse') {
      const a = this.pointToXy(d.p1);
      const b = this.pointToXy(d.p2);
      if (!a || !b) return null;
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const rx = Math.max(1, Math.abs(b.x - a.x) / 2);
      const ry = Math.max(1, Math.abs(b.y - a.y) / 2);
      const v = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      return v <= 1 ? 0 : Math.sqrt(v) * Math.min(rx, ry) - Math.min(rx, ry);
    }
    if (d.type === 'xabcd') {
      const pts = [d.x, d.a, d.b, d.c, d.d].map((p) => this.pointToXy(p));
      if (pts.some((p) => !p)) return null;
      let best = Infinity;
      for (let i = 0; i < pts.length - 1; i++) {
        best = Math.min(best, distPointToSegment(x, y, pts[i]!.x, pts[i]!.y, pts[i + 1]!.x, pts[i + 1]!.y));
      }
      return Number.isFinite(best) ? best : null;
    }
    if (d.type === 'fibchan') {
      const levels = [...FIB_RETRACEMENT, 1.272, 1.618];
      let best = Infinity;
      for (const k of levels) {
        const a = this.pointToXy({
          time: d.p1.time + (d.p3.time - d.p1.time) * k,
          price: d.p1.price + (d.p3.price - d.p1.price) * k,
        });
        const b = this.pointToXy({
          time: d.p2.time + (d.p3.time - d.p1.time) * k,
          price: d.p2.price + (d.p3.price - d.p1.price) * k,
        });
        if (!a || !b) continue;
        const ext = extendLine(a.x, a.y, b.x, b.y, width, height);
        best = Math.min(best, distPointToSegment(x, y, ext.a.x, ext.a.y, ext.b.x, ext.b.y));
      }
      return Number.isFinite(best) ? best : null;
    }
    if (d.type === 'fibfan') {
      let best = Infinity;
      const a = this.pointToXy(d.p1);
      if (!a) return null;
      for (const k of FIB_RETRACEMENT) {
        const b = this.pointToXy({
          time: d.p2.time,
          price: d.p1.price + (d.p2.price - d.p1.price) * k,
        });
        if (!b) continue;
        const end = extendRay(a.x, a.y, b.x, b.y, width, height);
        best = Math.min(best, distPointToSegment(x, y, a.x, a.y, end.x, end.y));
      }
      return Number.isFinite(best) ? best : null;
    }
    if (d.type === 'arc') {
      const a = this.pointToXy(d.p1);
      const b = this.pointToXy(d.p2);
      const c = this.pointToXy(d.p3);
      if (!a || !b || !c) return null;
      const circ = circleFrom3(a.x, a.y, b.x, b.y, c.x, c.y);
      if (!circ) {
        return Math.min(
          distPointToSegment(x, y, a.x, a.y, b.x, b.y),
          distPointToSegment(x, y, b.x, b.y, c.x, c.y),
        );
      }
      const dist = Math.abs(Math.hypot(x - circ.cx, y - circ.cy) - circ.r);
      const ang = Math.atan2(y - circ.cy, x - circ.cx);
      const a1 = Math.atan2(a.y - circ.cy, a.x - circ.cx);
      const a2 = Math.atan2(b.y - circ.cy, b.x - circ.cx);
      const a3 = Math.atan2(c.y - circ.cy, c.x - circ.cx);
      const on = angleContains(a1, a2, a3) ? angleContains(a1, ang, a3) : angleContains(a3, ang, a1);
      return on ? dist : dist + 40;
    }
    if (d.type === 'tripattern') {
      const a = this.pointToXy(d.p1);
      const b = this.pointToXy(d.p2);
      const c = this.pointToXy(d.p3);
      const e = this.pointToXy(d.p4);
      if (!a || !b || !c || !e) return null;
      const l1 = extendLine(a.x, a.y, b.x, b.y, width, height);
      const l2 = extendLine(c.x, c.y, e.x, e.y, width, height);
      return Math.min(
        distPointToSegment(x, y, l1.a.x, l1.a.y, l1.b.x, l1.b.y),
        distPointToSegment(x, y, l2.a.x, l2.a.y, l2.b.x, l2.b.y),
      );
    }
    if (d.type === 'elliottimp' || d.type === 'elliottabc' || d.type === 'path' || d.type === 'brush') {
      return this.hitPolyline(d.points, x, y);
    }
    if (d.type === 'flag') {
      const a = this.pointToXy(d.p1);
      const b = this.pointToXy(d.p2);
      const c = this.pointToXy(d.p3);
      const e = this.pointToXy(d.p4);
      if (!a || !b || !c || !e) return null;
      const p = { x: c.x + e.x - b.x, y: c.y + e.y - b.y };
      return Math.min(
        distPointToSegment(x, y, a.x, a.y, b.x, b.y),
        distPointToSegment(x, y, b.x, b.y, c.x, c.y),
        distPointToSegment(x, y, c.x, c.y, p.x, p.y),
        distPointToSegment(x, y, p.x, p.y, e.x, e.y),
        distPointToSegment(x, y, e.x, e.y, b.x, b.y),
      );
    }
    if (d.type === 'forecast') {
      const a = this.pointToXy(d.p1);
      const b = this.pointToXy(d.p2);
      if (!a || !b) return null;
      const end = extendRay(a.x, a.y, b.x, b.y, width, height);
      return distPointToSegment(x, y, a.x, a.y, end.x, end.y);
    }
    if (d.type === 'fibarcs') {
      const a = this.pointToXy(d.p1);
      const b = this.pointToXy(d.p2);
      if (!a || !b) return null;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      if (dist < 1) return null;
      const toCenter = Math.hypot(x - a.x, y - a.y);
      let best = Infinity;
      for (const k of FIB_RETRACEMENT) {
        if (k <= 0) continue;
        best = Math.min(best, Math.abs(toCenter - dist * k));
      }
      return Number.isFinite(best) ? best : null;
    }
    if (d.type === 'fibspiral') {
      return this.hitPolyline(this.spiralPoints(d.p1, d.p2), x, y);
    }
    if (d.type === 'fibtz') {
      let best = Infinity;
      for (const k of FIB_TIME) {
        const xx = this.timeToX(d.p1.time + (d.p2.time - d.p1.time) * k);
        if (xx !== null) best = Math.min(best, Math.abs(x - xx));
      }
      return Number.isFinite(best) ? best : null;
    }
    if (d.type === 'gannbox' || d.type === 'gannsq') {
      const box = this.gannRect(d);
      if (!box) return null;
      return this.hitGannGrid(box, x, y);
    }
    if (d.type === 'gannfan') {
      const a = this.pointToXy(d.p1);
      const b = this.pointToXy(d.p2);
      if (!a || !b) return null;
      let best = Infinity;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      for (const [, pr, tm] of GANN_FAN) {
        const end = extendRay(a.x, a.y, a.x + dx, a.y + dy * (pr / tm), width, height);
        best = Math.min(best, distPointToSegment(x, y, a.x, a.y, end.x, end.y));
      }
      return Number.isFinite(best) ? best : null;
    }
    if (d.type === 'pitchfork') {
      const a = this.pointToXy(d.p1);
      const b = this.pointToXy(d.p2);
      const c = this.pointToXy(d.p3);
      if (!a || !b || !c) return null;
      const mid = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
      const shaft = extendLine(a.x, a.y, mid.x, mid.y, width, height);
      const tines = [
        extendLine(b.x, b.y, b.x + (shaft.b.x - shaft.a.x), b.y + (shaft.b.y - shaft.a.y), width, height),
        extendLine(c.x, c.y, c.x + (shaft.b.x - shaft.a.x), c.y + (shaft.b.y - shaft.a.y), width, height),
      ];
      return Math.min(
        distPointToSegment(x, y, shaft.a.x, shaft.a.y, shaft.b.x, shaft.b.y),
        distPointToSegment(x, y, tines[0]!.a.x, tines[0]!.a.y, tines[0]!.b.x, tines[0]!.b.y),
        distPointToSegment(x, y, tines[1]!.a.x, tines[1]!.a.y, tines[1]!.b.x, tines[1]!.b.y),
        Math.hypot(x - a.x, y - a.y),
      );
    }
    if (d.type === 'hs') {
      const pts = [d.ls, d.n1, d.head, d.n2, d.rs].map((p) => this.pointToXy(p));
      const n1 = this.pointToXy(d.n1);
      const n2 = this.pointToXy(d.n2);
      if (pts.some((p) => !p) || !n1 || !n2) return null;
      let best = Infinity;
      for (let i = 0; i < pts.length - 1; i++) {
        best = Math.min(best, distPointToSegment(x, y, pts[i]!.x, pts[i]!.y, pts[i + 1]!.x, pts[i + 1]!.y));
      }
      const ext = extendLine(n1.x, n1.y, n2.x, n2.y, width, height);
      best = Math.min(best, distPointToSegment(x, y, ext.a.x, ext.a.y, ext.b.x, ext.b.y));
      return Number.isFinite(best) ? best : null;
    }
    if (d.type === 'regress') {
      const chan = linearChannel(this.priceSamples, d.p1.time, d.p2.time);
      if (!chan) {
        const a = this.pointToXy(d.p1);
        const b = this.pointToXy(d.p2);
        if (!a || !b) return null;
        return distPointToSegment(x, y, a.x, a.y, b.x, b.y);
      }
      const pts = [
        this.pointToXy({ time: chan.t1, price: chan.mid1 }),
        this.pointToXy({ time: chan.t2, price: chan.mid2 }),
        this.pointToXy({ time: chan.t1, price: chan.mid1 + chan.dev }),
        this.pointToXy({ time: chan.t2, price: chan.mid2 + chan.dev }),
        this.pointToXy({ time: chan.t1, price: chan.mid1 - chan.dev }),
        this.pointToXy({ time: chan.t2, price: chan.mid2 - chan.dev }),
      ];
      if (pts.some((p) => !p)) return null;
      return Math.min(
        distPointToSegment(x, y, pts[0]!.x, pts[0]!.y, pts[1]!.x, pts[1]!.y),
        distPointToSegment(x, y, pts[2]!.x, pts[2]!.y, pts[3]!.x, pts[3]!.y),
        distPointToSegment(x, y, pts[4]!.x, pts[4]!.y, pts[5]!.x, pts[5]!.y),
      );
    }
    if (d.type === 'triangle') {
      const a = this.pointToXy(d.p1);
      const b = this.pointToXy(d.p2);
      const c = this.pointToXy(d.p3);
      if (!a || !b || !c) return null;
      const edges = Math.min(
        distPointToSegment(x, y, a.x, a.y, b.x, b.y),
        distPointToSegment(x, y, b.x, b.y, c.x, c.y),
        distPointToSegment(x, y, c.x, c.y, a.x, a.y),
      );
      const sign = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) =>
        (p.x - r.x) * (q.y - r.y) - (q.x - r.x) * (p.y - r.y);
      const pt = { x, y };
      const b1 = sign(pt, a, b) < 0;
      const b2 = sign(pt, b, c) < 0;
      const b3 = sign(pt, c, a) < 0;
      const inside = b1 === b2 && b2 === b3;
      return inside ? Math.min(edges, HIT_PX) : edges;
    }
    if (d.type === 'trend' || d.type === 'ray') {
      const a = this.pointToXy(d.p1);
      const b = this.pointToXy(d.p2);
      if (!a || !b) return null;
      if (d.type === 'ray') {
        const end = extendRay(a.x, a.y, b.x, b.y, width, height);
        return distPointToSegment(x, y, a.x, a.y, end.x, end.y);
      }
      return distPointToSegment(x, y, a.x, a.y, b.x, b.y);
    }
    if (d.type === 'rect') {
      const a = this.pointToXy(d.p1);
      const b = this.pointToXy(d.p2);
      if (!a || !b) return null;
      const left = Math.min(a.x, b.x);
      const right = Math.max(a.x, b.x);
      const top = Math.min(a.y, b.y);
      const bottom = Math.max(a.y, b.y);
      const inside = x >= left && x <= right && y >= top && y <= bottom;
      const toEdge = Math.min(Math.abs(x - left), Math.abs(x - right), Math.abs(y - top), Math.abs(y - bottom));
      return inside ? Math.min(toEdge, HIT_PX) : toEdge;
    }
    if (d.type === 'channel') {
      const a = this.pointToXy(d.p1);
      const b = this.pointToXy(d.p2);
      const c = this.pointToXy(d.p3);
      if (!a || !b || !c) return null;
      const q = { x: c.x + (b.x - a.x), y: c.y + (b.y - a.y) };
      return Math.min(distPointToSegment(x, y, a.x, a.y, b.x, b.y), distPointToSegment(x, y, c.x, c.y, q.x, q.y));
    }
    if (d.type === 'fib') {
      const opts = fibOptionsOf(d);
      const ends = fibEnds(d);
      const t1 = this.timeToX(ends.p1.time);
      const t2 = this.timeToX(ends.p2.time);
      const a = this.pointToXy(d.p1);
      const b = this.pointToXy(d.p2);
      let best = Infinity;
      if (a && b) best = Math.min(best, distPointToSegment(x, y, a.x, a.y, b.x, b.y));
      if (t1 !== null && t2 !== null) {
        const left = Math.min(t1, t2);
        const right = opts.extendLines ? width : Math.max(t1, t2);
        const ys: number[] = [];
        for (const level of visibleFibLevels(opts)) {
          const yy = this.priceToY(fibRetracementPrice(ends.p1, ends.p2, level.value, opts.reverse));
          if (yy === null) continue;
          ys.push(yy);
          if (x >= left - 8 && x <= right + 8) best = Math.min(best, Math.abs(y - yy));
        }
        if (ys.length >= 2 && x >= left - 4 && x <= right + 4) {
          const top = Math.min(...ys);
          const bottom = Math.max(...ys);
          if (y >= top && y <= bottom) best = Math.min(best, HIT_PX);
        }
      }
      return Number.isFinite(best) ? best : null;
    }
    if (d.type === 'fibext') {
      const opts = fibExtOptionsOf(d);
      let best = Infinity;
      const a = this.pointToXy(d.a);
      const b = this.pointToXy(d.b);
      const c = this.pointToXy(d.c);
      if (a && b) best = Math.min(best, distPointToSegment(x, y, a.x, a.y, b.x, b.y));
      if (b && c) best = Math.min(best, distPointToSegment(x, y, b.x, b.y, c.x, c.y));
      const startX = opts.extendLines && a && b && c ? Math.min(a.x, b.x, c.x) : c?.x ?? 0;
      const endX = opts.extendLines ? width : Math.max(a?.x ?? 0, b?.x ?? 0, c?.x ?? 0) + 40;
      const ys: number[] = [];
      for (const level of visibleFibLevels(opts)) {
        const yy = this.priceToY(fibExtensionPrice(d.a, d.b, d.c, level.value, opts.reverse));
        if (yy === null) continue;
        ys.push(yy);
        if (x >= startX - 8 && x <= endX + 8) best = Math.min(best, Math.abs(y - yy));
      }
      if (ys.length >= 2 && x >= startX - 4 && x <= endX + 4) {
        const top = Math.min(...ys);
        const bottom = Math.max(...ys);
        if (y >= top && y <= bottom) best = Math.min(best, HIT_PX);
      }
      return Number.isFinite(best) ? best : null;
    }
    if (d.type === 'pricerange') {
      const y1 = this.priceToY(d.p1.price);
      const y2 = this.priceToY(d.p2.price);
      if (y1 === null || y2 === null) return null;
      const top = Math.min(y1, y2);
      const bottom = Math.max(y1, y2);
      if (y >= top && y <= bottom) return 0;
      return Math.min(Math.abs(y - top), Math.abs(y - bottom));
    }
    if (d.type === 'daterange') {
      const x1 = this.timeToX(d.p1.time);
      const x2 = this.timeToX(d.p2.time);
      if (x1 === null || x2 === null) return null;
      const left = Math.min(x1, x2);
      const right = Math.max(x1, x2);
      if (x >= left && x <= right) return 0;
      return Math.min(Math.abs(x - left), Math.abs(x - right));
    }
    if (d.type === 'datepricerange') {
      const a = this.pointToXy(d.p1);
      const b = this.pointToXy(d.p2);
      if (!a || !b) return null;
      const left = Math.min(a.x, b.x);
      const right = Math.max(a.x, b.x);
      const top = Math.min(a.y, b.y);
      const bottom = Math.max(a.y, b.y);
      const inside = x >= left && x <= right && y >= top && y <= bottom;
      const toEdge = Math.min(Math.abs(x - left), Math.abs(x - right), Math.abs(y - top), Math.abs(y - bottom));
      return inside ? Math.min(toEdge, HIT_PX) : toEdge;
    }
    if (d.type === 'longpos' || d.type === 'shortpos') {
      const a = this.pointToXy(d.entry);
      const b = this.pointToXy(d.target);
      const c = this.pointToXy({ time: d.target.time, price: d.stop.price });
      const e = this.pointToXy({ time: d.entry.time, price: d.stop.price });
      if (!a || !b || !c || !e) return null;
      const left = Math.min(a.x, b.x);
      const right = Math.max(a.x, b.x);
      const top = Math.min(a.y, b.y, c.y);
      const bottom = Math.max(a.y, b.y, c.y);
      const inside = x >= left && x <= right && y >= top && y <= bottom;
      const toEdge = Math.min(Math.abs(x - left), Math.abs(x - right), Math.abs(y - top), Math.abs(y - bottom));
      return inside ? Math.min(toEdge, HIT_PX) : toEdge;
    }
    if (d.type === 'abcd') {
      const a = this.pointToXy(d.a);
      const b = this.pointToXy(d.b);
      const c = this.pointToXy(d.c);
      const dd = this.pointToXy(abcdPointD(d.a, d.b, d.c));
      if (!a || !b || !c || !dd) return null;
      return Math.min(
        distPointToSegment(x, y, a.x, a.y, b.x, b.y),
        distPointToSegment(x, y, b.x, b.y, c.x, c.y),
        distPointToSegment(x, y, c.x, c.y, dd.x, dd.y),
      );
    }
    return null;
  }

  redraw(): void {
    this.scheduleRedraw();
  }

  private paintFrame(): void {
    const dprNow = window.devicePixelRatio || 1;
    if (dprNow !== this.lastDpr) {
      this.resize();
      return;
    }
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const width = this.canvas.getBoundingClientRect().width;
    const height = this.canvas.getBoundingClientRect().height;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.layerHidden) return;
    for (const d of this.drawings) this.paint(ctx, d, width, height, d.id === this.selectedId);
    if (this.draft) this.paintDraft(ctx, width, height);
    if (this.selectedId) {
      const sel = this.drawings.find((d) => d.id === this.selectedId);
      if (sel) this.paintHandles(ctx, sel, width);
    }
  }

  private paintDraft(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const draft = this.draft;
    if (!draft) return;
    const pts = [...draft.points, draft.current];
    const fake = this.commitPoints(draft.type, pts.length >= TOOLS_POINTS[draft.type] ? pts : [...pts, ...Array(TOOLS_POINTS[draft.type] - pts.length).fill(draft.current)]);
    if (fake) this.paint(ctx, fake, width, height, true);
    else {
      const xy = pts.map((p) => this.pointToXy(p)).filter((p): p is { x: number; y: number } => !!p);
      if (xy.length >= 2) {
        ctx.beginPath();
        ctx.strokeStyle = SELECTED;
        ctx.setLineDash([6, 4]);
        ctx.moveTo(xy[0]!.x, xy[0]!.y);
        for (let i = 1; i < xy.length; i++) ctx.lineTo(xy[i]!.x, xy[i]!.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  private paintHandles(ctx: CanvasRenderingContext2D, d: Drawing, width: number): void {
    ctx.save();
    for (const h of this.handlesOf(d)) {
      let xy = this.pointToXy(h.point);
      if (d.type === 'hline') {
        const yy = this.priceToY(d.price);
        if (yy === null) continue;
        xy = { x: width / 2, y: yy };
      }
      if (d.type === 'vline') {
        const xx = this.timeToX(d.time);
        if (xx === null) continue;
        xy = { x: xx, y: this.canvas.getBoundingClientRect().height / 2 };
      }
      if (d.type === 'hray' && h.handle === 'p2') {
        const yy = this.priceToY(d.p1.price);
        const xx = this.timeToX(d.p2.time);
        if (yy === null || xx === null) continue;
        xy = { x: xx, y: yy };
      }
      if (!xy) continue;
      ctx.fillStyle = '#131722';
      ctx.strokeStyle = SELECTED;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(xy.x, xy.y, HANDLE, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  private label(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    color = '#d1d4dc',
    size = 11,
    align: CanvasTextAlign = 'left',
  ): void {
    ctx.save();
    const light = document.documentElement.getAttribute('data-theme') === 'light';
    ctx.font = `${size}px system-ui, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = size <= 10 ? 'middle' : 'alphabetic';
    ctx.lineWidth = 3;
    ctx.strokeStyle = light ? 'rgba(255, 255, 255, 0.88)' : 'rgba(13, 15, 20, 0.85)';
    ctx.fillStyle = color;
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  private formatPrice(price: number): string {
    if (Math.abs(price) >= 1000) return price.toFixed(2);
    if (Math.abs(price) >= 1) return price.toFixed(4);
    return price.toFixed(6);
  }

  private styleOf(d: Drawing, selected: boolean): { color: string; width: number; dash: number[] } {
    const color = d.style?.color ?? (selected ? SELECTED : COLOR);
    const width = Math.min(4, Math.max(1, d.style?.width ?? 1));
    const pattern = d.style?.lineStyle ?? 'solid';
    const dash = pattern === 'dashed' ? [6, 4] : pattern === 'dotted' ? [1.5, 3] : [];
    return { color, width, dash };
  }

  private paint(ctx: CanvasRenderingContext2D, d: Drawing, width: number, height: number, selected: boolean): void {
    ctx.save();
    const st = this.styleOf(d, selected);
    ctx.strokeStyle = st.color;
    ctx.fillStyle = selected ? 'rgba(255, 204, 102, 0.12)' : 'rgba(91, 156, 246, 0.12)';
    ctx.lineWidth = st.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(st.dash);

    if (d.type === 'hline') {
      const y = this.priceToY(d.price);
      if (y !== null) {
        const yy = Math.round(y) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, yy);
        ctx.lineTo(width, yy);
        ctx.stroke();
        this.paintBadge(ctx, this.formatPrice(d.price), width - 84, yy + 8, selected);
      }
    } else if (d.type === 'vline') {
      const x0 = this.timeToX(d.time);
      if (x0 !== null) {
        ctx.beginPath();
        ctx.moveTo(x0, 0);
        ctx.lineTo(x0, height);
        ctx.stroke();
      }
    } else if (d.type === 'hray') {
      const y0 = this.priceToY(d.p1.price);
      const x0 = this.timeToX(d.p1.time);
      if (y0 !== null && x0 !== null) {
        const endX = d.p2.time >= d.p1.time ? width : 0;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(endX, y0);
        ctx.stroke();
      }
    } else if (d.type === 'extline') {
      const a = this.pointToXy(d.p1);
      const b = this.pointToXy(d.p2);
      if (a && b) {
        const ext = extendLine(a.x, a.y, b.x, b.y, width, height);
        ctx.beginPath();
        ctx.moveTo(ext.a.x, ext.a.y);
        ctx.lineTo(ext.b.x, ext.b.y);
        ctx.stroke();
      }
    } else if (d.type === 'trend' || d.type === 'ray' || d.type === 'rect') {
      const a = this.pointToXy(d.p1);
      const b = this.pointToXy(d.p2);
      if (a && b) {
        if (d.type === 'trend') {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        } else if (d.type === 'ray') {
          const end = extendRay(a.x, a.y, b.x, b.y, width, height);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();
        } else {
          const x = Math.min(a.x, b.x);
          const y = Math.min(a.y, b.y);
          ctx.fillRect(x, y, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
          ctx.strokeRect(x, y, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        }
      }
    } else if (d.type === 'channel') {
      const a = this.pointToXy(d.p1);
      const b = this.pointToXy(d.p2);
      const c = this.pointToXy(d.p3);
      if (a && b && c) {
        const q = { x: c.x + (b.x - a.x), y: c.y + (b.y - a.y) };
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }
    } else if (d.type === 'fib') {
      this.paintFibRetracement(ctx, d, width, selected);
    } else if (d.type === 'fibext') {
      this.paintFibExtension(ctx, d, width, selected);
    } else if (d.type === 'abcd') {
      const a = this.pointToXy(d.a);
      const b = this.pointToXy(d.b);
      const c = this.pointToXy(d.c);
      const D = abcdPointD(d.a, d.b, d.c);
      const dd = this.pointToXy(D);
      if (a && b && c && dd) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
        ctx.lineTo(dd.x, dd.y);
        ctx.stroke();
        this.label(ctx, 'A', a.x + 4, a.y - 6);
        this.label(ctx, 'B', b.x + 4, b.y - 6);
        this.label(ctx, 'C', c.x + 4, c.y - 6);
        this.label(ctx, `D  ${this.formatPrice(D.price)}`, dd.x + 4, dd.y - 6, SELECTED);
        ctx.setLineDash([4, 4]);
        for (const k of ABCD_PROJECTIONS) {
          if (k === 1) continue;
          const p = abcdProject(d.a, d.b, d.c, k);
          const xy = this.pointToXy(p);
          const y = this.priceToY(p.price);
          if (y === null) continue;
          ctx.beginPath();
          ctx.moveTo(c.x, y);
          ctx.lineTo(xy ? xy.x : c.x + 40, y);
          ctx.stroke();
          this.label(ctx, `${k}  ${this.formatPrice(p.price)}`, (xy ? xy.x : c.x + 40) + 4, y - 2);
        }
        ctx.setLineDash([]);
      }


    } else if (d.type === 'pricerange' || d.type === 'daterange' || d.type === 'datepricerange') {
      const x1 = this.timeToX(d.p1.time);
      const x2 = this.timeToX(d.p2.time);
      const y1 = this.priceToY(d.p1.price);
      const y2 = this.priceToY(d.p2.price);
      ctx.fillStyle = 'rgba(91, 156, 246, 0.14)';
      ctx.strokeStyle = selected ? SELECTED : COLOR;
      if (d.type === 'pricerange' && y1 !== null && y2 !== null) {
        const top = Math.min(y1, y2);
        const h = Math.abs(y2 - y1);
        ctx.fillRect(0, top, width, h);
        ctx.beginPath();
        ctx.moveTo(0, y1);
        ctx.lineTo(width, y1);
        ctx.moveTo(0, y2);
        ctx.lineTo(width, y2);
        ctx.stroke();
        const delta = d.p2.price - d.p1.price;
        const pct = d.p1.price !== 0 ? (delta / d.p1.price) * 100 : 0;
        const midY = (y1 + y2) / 2;
        this.label(ctx, `${delta >= 0 ? '+' : ''}${this.formatPrice(delta)}  (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`, 8, midY - 4, selected ? SELECTED : '#e0e3ea');
      } else if (d.type === 'daterange' && x1 !== null && x2 !== null) {
        const left = Math.min(x1, x2);
        const w = Math.abs(x2 - x1);
        ctx.fillRect(left, 0, w, height);
        ctx.beginPath();
        ctx.moveTo(x1, 0);
        ctx.lineTo(x1, height);
        ctx.moveTo(x2, 0);
        ctx.lineTo(x2, height);
        ctx.stroke();
        const dt = Number(d.p2.time) - Number(d.p1.time);
        const bars = this.stepSec > 0 ? Math.abs(dt) / this.stepSec : 0;
        const midX = (x1 + x2) / 2;
        const barTxt = bars >= 1 ? `  ·  ${bars >= 10 ? bars.toFixed(0) : bars.toFixed(1)} bars` : '';
        this.label(ctx, `${formatSpan(dt)}${barTxt}`, midX - 24, 16, selected ? SELECTED : '#e0e3ea');
      } else if (d.type === 'datepricerange' && x1 !== null && x2 !== null && y1 !== null && y2 !== null) {
        const left = Math.min(x1, x2);
        const top = Math.min(y1, y2);
        const w = Math.abs(x2 - x1);
        const h = Math.abs(y2 - y1);
        ctx.fillRect(left, top, w, h);
        ctx.strokeRect(left, top, w, h);
        const delta = d.p2.price - d.p1.price;
        const pct = d.p1.price !== 0 ? (delta / d.p1.price) * 100 : 0;
        const dt = Number(d.p2.time) - Number(d.p1.time);
        this.label(
          ctx,
          `${delta >= 0 ? '+' : ''}${this.formatPrice(delta)}  (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)  ·  ${formatSpan(dt)}`,
          left + 4,
          top - 6,
          selected ? SELECTED : '#e0e3ea',
        );
      }
    } else if (d.type === 'longpos' || d.type === 'shortpos') {

      const x1 = this.timeToX(d.entry.time);
      const x2 = this.timeToX(d.target.time);
      const yE = this.priceToY(d.entry.price);
      const yT = this.priceToY(d.target.price);
      const yS = this.priceToY(d.stop.price);
      if (x1 !== null && x2 !== null && yE !== null && yT !== null && yS !== null) {
        const left = Math.min(x1, x2);
        const w = Math.abs(x2 - x1);
        const isLong = d.type === 'longpos';
        const profit = isLong ? d.target.price >= d.entry.price : d.target.price <= d.entry.price;
        const riskOk = isLong ? d.stop.price <= d.entry.price : d.stop.price >= d.entry.price;
        const win = profit ? 'rgba(38, 166, 154, 0.22)' : 'rgba(239, 83, 80, 0.22)';
        const lose = riskOk ? 'rgba(239, 83, 80, 0.22)' : 'rgba(38, 166, 154, 0.22)';
        ctx.fillStyle = win;
        ctx.fillRect(left, Math.min(yE, yT), w, Math.abs(yT - yE));
        ctx.fillStyle = lose;
        ctx.fillRect(left, Math.min(yE, yS), w, Math.abs(yS - yE));
        ctx.strokeStyle = selected ? SELECTED : COLOR;
        ctx.strokeRect(left, Math.min(yE, yT, yS), w, Math.max(yE, yT, yS) - Math.min(yE, yT, yS));
        ctx.beginPath();
        ctx.moveTo(left, yE);
        ctx.lineTo(left + w, yE);
        ctx.stroke();
        const risk = Math.abs(d.entry.price - d.stop.price);
        const reward = Math.abs(d.target.price - d.entry.price);
        const rr = risk > 0 ? reward / risk : 0;
        const tag = isLong ? 'Long' : 'Short';
        const header = `${tag}  TP ${this.formatPrice(d.target.price)}  RR ${rr.toFixed(2)}`;
        const top = Math.min(yE, yT, yS);
        const used: number[] = [];
        const place = (text: string, anchor: number): void => {
          const gap = 20;
          let y = anchor;
          for (let i = 0; i < 8; i++) {
            if (!used.some((u) => Math.abs(y - u) < gap)) break;
            y += gap;
          }
          used.push(y);
          this.paintBadge(ctx, text, left + 4, y, selected);
        };
        place(header, top + 16);
        place(`E ${this.formatPrice(d.entry.price)}`, yE);
        place(`SL ${this.formatPrice(d.stop.price)}`, yS);
      }
    } else if (d.type === 'text') {
      const xy = this.pointToXy(d.p);
      if (xy) this.label(ctx, d.text, xy.x, xy.y, selected ? SELECTED : '#e0e3ea');
    } else if (d.type === 'arrow') {
      const a = this.pointToXy(d.p1);
      const b = this.pointToXy(d.p2);
      if (a && b) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const size = 9;
        ctx.fillStyle = selected ? SELECTED : COLOR;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - size * Math.cos(ang - 0.4), b.y - size * Math.sin(ang - 0.4));
        ctx.lineTo(b.x - size * Math.cos(ang + 0.4), b.y - size * Math.sin(ang + 0.4));
        ctx.closePath();
        ctx.fill();
      }
    } else if (d.type === 'pricelabel') {
      const xy = this.pointToXy(d.p);
      if (xy) this.paintBadge(ctx, this.formatPrice(d.p.price), xy.x + 6, xy.y, selected);
    } else if (d.type === 'note') {
      const xy = this.pointToXy(d.p);
      if (xy) this.paintBadge(ctx, d.text || 'Note', xy.x, xy.y, selected);
    } else if (d.type === 'callout') {
      const a = this.pointToXy(d.p1);
      const b = this.pointToXy(d.p2);
      if (a && b) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(a.x, a.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = selected ? SELECTED : COLOR;
        ctx.fill();
        this.paintBadge(ctx, d.text || 'Callout', b.x, b.y, selected);
      }
    } else if (d.type === 'ellipse') {
      const a = this.pointToXy(d.p1);
      const b = this.pointToXy(d.p2);
      if (a && b) {
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        const rx = Math.max(1, Math.abs(b.x - a.x) / 2);
        const ry = Math.max(1, Math.abs(b.y - a.y) / 2);
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else if (d.type === 'triangle') {
      const a = this.pointToXy(d.p1);
      const b = this.pointToXy(d.p2);
      const c = this.pointToXy(d.p3);
      if (a && b && c) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    } else if (d.type === 'regress') {
      const chan = linearChannel(this.priceSamples, d.p1.time, d.p2.time);
      const midA = chan
        ? this.pointToXy({ time: chan.t1, price: chan.mid1 })
        : this.pointToXy(d.p1);
      const midB = chan
        ? this.pointToXy({ time: chan.t2, price: chan.mid2 })
        : this.pointToXy(d.p2);
      if (midA && midB) {
        if (chan) {
          const upA = this.pointToXy({ time: chan.t1, price: chan.mid1 + chan.dev });
          const upB = this.pointToXy({ time: chan.t2, price: chan.mid2 + chan.dev });
          const dnA = this.pointToXy({ time: chan.t1, price: chan.mid1 - chan.dev });
          const dnB = this.pointToXy({ time: chan.t2, price: chan.mid2 - chan.dev });
          if (upA && upB && dnA && dnB) {
            ctx.beginPath();
            ctx.moveTo(upA.x, upA.y);
            ctx.lineTo(upB.x, upB.y);
            ctx.lineTo(dnB.x, dnB.y);
            ctx.lineTo(dnA.x, dnA.y);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(upA.x, upA.y);
            ctx.lineTo(upB.x, upB.y);
            ctx.moveTo(dnA.x, dnA.y);
            ctx.lineTo(dnB.x, dnB.y);
            ctx.stroke();
          }
        }
        ctx.setLineDash(chan ? [] : [6, 4]);
        ctx.beginPath();
        ctx.moveTo(midA.x, midA.y);
        ctx.lineTo(midB.x, midB.y);
        ctx.stroke();
        ctx.setLineDash([]);
        if (chan) this.label(ctx, 'Regresja  ±2σ', midA.x + 4, midA.y - 6, selected ? SELECTED : '#e0e3ea');
      }
    } else if (d.type === 'xabcd') {
      const pts = [
        ['X', d.x],
        ['A', d.a],
        ['B', d.b],
        ['C', d.c],
        ['D', d.d],
      ] as const;
      const xy = pts.map(([, p]) => this.pointToXy(p));
      if (!xy.some((p) => !p)) {
        ctx.beginPath();
        ctx.moveTo(xy[0]!.x, xy[0]!.y);
        for (let i = 1; i < xy.length; i++) ctx.lineTo(xy[i]!.x, xy[i]!.y);
        ctx.stroke();
        for (let i = 0; i < pts.length; i++) {
          this.label(ctx, pts[i]![0], xy[i]!.x + 4, xy[i]!.y - 6, selected ? SELECTED : '#e0e3ea');
        }
        const swing = (from: Point, to: Point) => Math.abs(to.price - from.price);
        const xa = swing(d.x, d.a);
        const ratios = [
          ['AB/XA', xa ? swing(d.a, d.b) / xa : 0],
          ['BC/AB', swing(d.a, d.b) ? swing(d.b, d.c) / swing(d.a, d.b) : 0],
          ['CD/BC', swing(d.b, d.c) ? swing(d.c, d.d) / swing(d.b, d.c) : 0],
          ['CD/XA', xa ? swing(d.c, d.d) / xa : 0],
        ] as const;
        const mid = xy[4]!;
        this.label(ctx, ratios.map(([n, v]) => `${n} ${v.toFixed(3)}`).join('  '), mid.x + 4, mid.y + 14, selected ? SELECTED : '#e0e3ea');
      }
    } else if (d.type === 'hs') {
      const named = [
        ['LS', d.ls],
        ['N', d.n1],
        ['H', d.head],
        ['N', d.n2],
        ['RS', d.rs],
      ] as const;
      const xy = named.map(([, p]) => this.pointToXy(p));
      const n1 = xy[1];
      const n2 = xy[3];
      if (!xy.some((p) => !p) && n1 && n2) {
        ctx.beginPath();
        ctx.moveTo(xy[0]!.x, xy[0]!.y);
        for (let i = 1; i < xy.length; i++) ctx.lineTo(xy[i]!.x, xy[i]!.y);
        ctx.stroke();
        ctx.setLineDash([6, 4]);
        const ext = extendLine(n1.x, n1.y, n2.x, n2.y, width, height);
        ctx.beginPath();
        ctx.moveTo(ext.a.x, ext.a.y);
        ctx.lineTo(ext.b.x, ext.b.y);
        ctx.stroke();
        ctx.setLineDash([]);
        for (let i = 0; i < named.length; i++) {
          this.label(ctx, named[i]![0], xy[i]!.x + 4, xy[i]!.y - 6, selected ? SELECTED : '#e0e3ea');
        }
        this.label(ctx, 'Head and Shoulders', xy[2]!.x + 4, xy[2]!.y - 18, selected ? SELECTED : '#e0e3ea');
      }
    } else if (d.type === 'fibchan') {
      const levels = [...FIB_RETRACEMENT, 1.272, 1.618];
      for (const k of levels) {
        const a = this.pointToXy({
          time: d.p1.time + (d.p3.time - d.p1.time) * k,
          price: d.p1.price + (d.p3.price - d.p1.price) * k,
        });
        const b = this.pointToXy({
          time: d.p2.time + (d.p3.time - d.p1.time) * k,
          price: d.p2.price + (d.p3.price - d.p1.price) * k,
        });
        if (!a || !b) continue;
        const ext = extendLine(a.x, a.y, b.x, b.y, width, height);
        ctx.setLineDash(k === 0 || k === 1 ? [] : [5, 4]);
        ctx.beginPath();
        ctx.moveTo(ext.a.x, ext.a.y);
        ctx.lineTo(ext.b.x, ext.b.y);
        ctx.stroke();
        ctx.setLineDash([]);
        this.label(ctx, `${k}`, a.x + 4, a.y - 4, selected ? SELECTED : '#e0e3ea');
      }
    } else if (d.type === 'fibfan') {
      const origin = this.pointToXy(d.p1);
      if (origin) {
        for (const k of FIB_RETRACEMENT) {
          const b = this.pointToXy({
            time: d.p2.time,
            price: d.p1.price + (d.p2.price - d.p1.price) * k,
          });
          if (!b) continue;
          const end = extendRay(origin.x, origin.y, b.x, b.y, width, height);
          ctx.setLineDash(k === 0 || k === 1 ? [] : [5, 4]);
          ctx.beginPath();
          ctx.moveTo(origin.x, origin.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();
          ctx.setLineDash([]);
          this.label(ctx, `${k}`, b.x + 4, b.y - 4, selected ? SELECTED : '#e0e3ea');
        }
      }
    } else if (d.type === 'arc') {
      const a = this.pointToXy(d.p1);
      const b = this.pointToXy(d.p2);
      const c = this.pointToXy(d.p3);
      if (a && b && c) {
        const circ = circleFrom3(a.x, a.y, b.x, b.y, c.x, c.y);
        if (circ && circ.r > 1) {
          const a1 = Math.atan2(a.y - circ.cy, a.x - circ.cx);
          const a2 = Math.atan2(b.y - circ.cy, b.x - circ.cx);
          const a3 = Math.atan2(c.y - circ.cy, c.x - circ.cx);
          const ccw = angleContains(a1, a2, a3);
          ctx.beginPath();
          ctx.arc(circ.cx, circ.cy, circ.r, a1, a3, !ccw);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.lineTo(c.x, c.y);
          ctx.stroke();
        }
      }
    } else if (d.type === 'tripattern') {
      const a = this.pointToXy(d.p1);
      const b = this.pointToXy(d.p2);
      const c = this.pointToXy(d.p3);
      const e = this.pointToXy(d.p4);
      if (a && b && c && e) {
        const l1 = extendLine(a.x, a.y, b.x, b.y, width, height);
        const l2 = extendLine(c.x, c.y, e.x, e.y, width, height);
        ctx.beginPath();
        ctx.moveTo(l1.a.x, l1.a.y);
        ctx.lineTo(l1.b.x, l1.b.y);
        ctx.moveTo(l2.a.x, l2.a.y);
        ctx.lineTo(l2.b.x, l2.b.y);
        ctx.stroke();
        const meet = lineIntersection(a, b, c, e);
        if (meet) {
          ctx.fillStyle = selected ? 'rgba(255, 204, 102, 0.12)' : 'rgba(91, 156, 246, 0.12)';
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(meet.x, meet.y);
          ctx.lineTo(c.x, c.y);
          ctx.closePath();
          ctx.fill();
          this.label(ctx, 'Triangle', meet.x + 4, meet.y - 6, selected ? SELECTED : '#e0e3ea');
        }
      }
    } else if (d.type === 'elliottimp' || d.type === 'elliottabc' || d.type === 'path' || d.type === 'brush') {
      const xy = d.points.map((p) => this.pointToXy(p)).filter((p): p is { x: number; y: number } => !!p);
      if (xy.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(xy[0]!.x, xy[0]!.y);
        for (let i = 1; i < xy.length; i++) ctx.lineTo(xy[i]!.x, xy[i]!.y);
        ctx.stroke();
        if (d.type === 'elliottimp' || d.type === 'elliottabc') {
          const tags = d.type === 'elliottimp' ? ['0', '1', '2', '3', '4', '5'] : ['A', 'B', 'C'];
          for (let i = 0; i < xy.length && i < tags.length; i++) {
            this.paintBadge(ctx, tags[i]!, xy[i]!.x + 4, xy[i]!.y - 2, selected);
          }
        }
      }
    } else if (d.type === 'flag') {
      const a = this.pointToXy(d.p1);
      const b = this.pointToXy(d.p2);
      const c = this.pointToXy(d.p3);
      const e = this.pointToXy(d.p4);
      if (a && b && c && e) {
        const p = { x: c.x + e.x - b.x, y: c.y + e.y - b.y };
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
        ctx.lineTo(p.x, p.y);
        ctx.lineTo(e.x, e.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        this.label(ctx, 'Flag', b.x + 4, b.y - 6, selected ? SELECTED : '#e0e3ea');
      }
    } else if (d.type === 'forecast') {
      const a = this.pointToXy(d.p1);
      const b = this.pointToXy(d.p2);
      if (a && b) {
        const end = extendRay(a.x, a.y, b.x, b.y, width, height);
        ctx.setLineDash([7, 5]);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        ctx.setLineDash([]);
        this.label(ctx, `Forecast  ${this.formatPrice(d.p2.price)}`, b.x + 6, b.y - 6, selected ? SELECTED : '#e0e3ea');
      }
    } else if (d.type === 'fibarcs') {
      const a = this.pointToXy(d.p1);
      const b = this.pointToXy(d.p2);
      if (a && b) {
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        for (const k of FIB_RETRACEMENT) {
          if (k <= 0) continue;
          ctx.setLineDash(k === 0.5 || k === 1 ? [] : [5, 4]);
          ctx.beginPath();
          ctx.arc(a.x, a.y, dist * k, ang - Math.PI / 2, ang + Math.PI / 2);
          ctx.stroke();
          ctx.setLineDash([]);
          const lx = a.x + Math.cos(ang) * dist * k;
          const ly = a.y + Math.sin(ang) * dist * k;
          this.label(ctx, `${k}`, lx + 4, ly - 2, selected ? SELECTED : '#e0e3ea');
        }
      }
    } else if (d.type === 'fibspiral') {
      const xy = this.spiralPoints(d.p1, d.p2);
      const screen = xy.map((p) => this.pointToXy(p)).filter((p): p is { x: number; y: number } => !!p);
      if (screen.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(screen[0]!.x, screen[0]!.y);
        for (let i = 1; i < screen.length; i++) ctx.lineTo(screen[i]!.x, screen[i]!.y);
        ctx.stroke();
        this.label(ctx, 'Spirala Fib', screen[0]!.x + 4, screen[0]!.y - 6, selected ? SELECTED : '#e0e3ea');
      }
    } else if (d.type === 'fibtz') {
      for (const k of FIB_TIME) {
        const xx = this.timeToX(d.p1.time + (d.p2.time - d.p1.time) * k);
        if (xx === null) continue;
        ctx.setLineDash(k === 0 || k === 1 ? [] : [5, 4]);
        ctx.beginPath();
        ctx.moveTo(xx, 0);
        ctx.lineTo(xx, height);
        ctx.stroke();
        ctx.setLineDash([]);
        this.label(ctx, `${k}`, xx + 4, 16, selected ? SELECTED : '#e0e3ea');
      }
    } else if (d.type === 'gannbox' || d.type === 'gannsq') {
      const box = this.gannRect(d);
      if (box) this.paintGannGrid(ctx, box, d.type === 'gannsq' ? 'Gann square' : 'Gann box', selected);
    } else if (d.type === 'gannfan') {
      const a = this.pointToXy(d.p1);
      const b = this.pointToXy(d.p2);
      if (a && b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        for (const [name, pr, tm] of GANN_FAN) {
          const end = extendRay(a.x, a.y, a.x + dx, a.y + dy * (pr / tm), width, height);
          ctx.setLineDash(name === '1x1' ? [] : [5, 4]);
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();
          ctx.setLineDash([]);
          this.label(ctx, name, end.x - 28, end.y - 4, selected ? SELECTED : '#e0e3ea');
        }
      }
    } else if (d.type === 'pitchfork') {
      const a = this.pointToXy(d.p1);
      const b = this.pointToXy(d.p2);
      const c = this.pointToXy(d.p3);
      if (a && b && c) {
        const mid = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
        const shaft = extendLine(a.x, a.y, mid.x, mid.y, width, height);
        ctx.beginPath();
        ctx.moveTo(shaft.a.x, shaft.a.y);
        ctx.lineTo(shaft.b.x, shaft.b.y);
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
        const t1 = extendLine(b.x, b.y, b.x + (shaft.b.x - shaft.a.x), b.y + (shaft.b.y - shaft.a.y), width, height);
        const t2 = extendLine(c.x, c.y, c.x + (shaft.b.x - shaft.a.x), c.y + (shaft.b.y - shaft.a.y), width, height);
        ctx.moveTo(t1.a.x, t1.a.y);
        ctx.lineTo(t1.b.x, t1.b.y);
        ctx.moveTo(t2.a.x, t2.a.y);
        ctx.lineTo(t2.b.x, t2.b.y);
        ctx.stroke();
        this.label(ctx, 'Pitchfork', a.x + 4, a.y - 6, selected ? SELECTED : '#e0e3ea');
      }
    }
    ctx.restore();
  }

  private hitPolyline(points: Point[], x: number, y: number): number | null {
    const xy = points.map((p) => this.pointToXy(p));
    let best = Infinity;
    for (let i = 0; i < xy.length - 1; i++) {
      const a = xy[i];
      const b = xy[i + 1];
      if (!a || !b) continue;
      best = Math.min(best, distPointToSegment(x, y, a.x, a.y, b.x, b.y));
    }
    return Number.isFinite(best) ? best : null;
  }

  private spiralPoints(p1: Point, p2: Point): Point[] {
    const a = this.pointToXy(p1);
    const b = this.pointToXy(p2);
    if (!a || !b) return [p1, p2];
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    if (dist < 2) return [p1, p2];
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const growth = Math.log(PHI) / (Math.PI / 2);
    const out: Point[] = [];
    const turns = 3.25;
    const steps = 96;
    for (let i = 0; i <= steps; i++) {
      const theta = (i / steps) * turns * Math.PI * 2;
      const r = dist * Math.exp(growth * theta);
      const sx = a.x + Math.cos(ang + theta) * r;
      const sy = a.y + Math.sin(ang + theta) * r;
      const logical = this.xyToPoint(sx, sy);
      if (logical) out.push(logical);
    }
    return out.length >= 2 ? out : [p1, p2];
  }

  private xyToPoint(x: number, y: number): Point | null {
    const time = this.xToTime(x);
    const price = this.series.coordinateToPrice(y);
    if (time === null || price === null) return null;
    return { time, price };
  }

  private gannRect(
    d: { type: 'gannbox' | 'gannsq'; p1: Point; p2: Point },
  ): { x1: number; y1: number; x2: number; y2: number } | null {
    const a = this.pointToXy(d.p1);
    const b = this.pointToXy(d.p2);
    if (!a || !b) return null;
    if (d.type === 'gannbox') return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    const side = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), 8);
    const sx = Math.sign(b.x - a.x) || 1;
    const sy = Math.sign(b.y - a.y) || 1;
    return { x1: a.x, y1: a.y, x2: a.x + sx * side, y2: a.y + sy * side };
  }

  private hitGannGrid(box: { x1: number; y1: number; x2: number; y2: number }, x: number, y: number): number {
    const left = Math.min(box.x1, box.x2);
    const right = Math.max(box.x1, box.x2);
    const top = Math.min(box.y1, box.y2);
    const bottom = Math.max(box.y1, box.y2);
    let best = Infinity;
    for (const k of GANN_GRID) {
      const xx = left + (right - left) * k;
      const yy = top + (bottom - top) * k;
      best = Math.min(best, Math.abs(x - xx), Math.abs(y - yy));
    }
    best = Math.min(
      best,
      distPointToSegment(x, y, box.x1, box.y1, box.x2, box.y2),
      distPointToSegment(x, y, box.x2, box.y1, box.x1, box.y2),
    );
    return best;
  }

  private paintGannGrid(
    ctx: CanvasRenderingContext2D,
    box: { x1: number; y1: number; x2: number; y2: number },
    title: string,
    selected: boolean,
  ): void {
    const left = Math.min(box.x1, box.x2);
    const right = Math.max(box.x1, box.x2);
    const top = Math.min(box.y1, box.y2);
    const bottom = Math.max(box.y1, box.y2);
    ctx.strokeRect(left, top, right - left, bottom - top);
    for (const k of GANN_GRID) {
      if (k === 0 || k === 1) continue;
      ctx.setLineDash(k === 0.5 ? [] : [4, 3]);
      const xx = left + (right - left) * k;
      const yy = top + (bottom - top) * k;
      ctx.beginPath();
      ctx.moveTo(xx, top);
      ctx.lineTo(xx, bottom);
      ctx.moveTo(left, yy);
      ctx.lineTo(right, yy);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(box.x1, box.y1);
    ctx.lineTo(box.x2, box.y2);
    ctx.moveTo(box.x2, box.y1);
    ctx.lineTo(box.x1, box.y2);
    ctx.stroke();
    this.label(ctx, title, left + 4, top + 14, selected ? SELECTED : '#e0e3ea');
  }



  private paintFibExtension(
    ctx: CanvasRenderingContext2D,
    d: Extract<Drawing, { type: 'fibext' }>,
    width: number,
    selected: boolean,
  ): void {
    const opts = fibExtOptionsOf(d);
    const a = this.pointToXy(d.a);
    const b = this.pointToXy(d.b);
    const c = this.pointToXy(d.c);
    if (!a || !b || !c) return;
    if (opts.showTrend) {
      ctx.beginPath();
      ctx.strokeStyle = selected ? SELECTED : 'rgba(209, 212, 220, 0.7)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash(opts.trendStyle === 'dotted' ? [2, 3] : opts.trendStyle === 'dashed' ? [6, 4] : []);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    this.label(ctx, 'A', a.x + 4, a.y - 8, selected ? SELECTED : '#e0e3ea', 11);
    this.label(ctx, 'B', b.x + 4, b.y - 8, selected ? SELECTED : '#e0e3ea', 11);
    this.label(ctx, 'C', c.x + 4, c.y - 8, selected ? SELECTED : '#e0e3ea', 11);
    const startX = opts.extendLines ? Math.min(a.x, b.x, c.x) : c.x;
    const endX = opts.extendLines ? width : Math.max(a.x, b.x, c.x) + 40;
    const levels = visibleFibLevels(opts);
    if (opts.background && levels.length >= 2) {
      for (let i = 0; i < levels.length - 1; i++) {
        const pa = fibExtensionPrice(d.a, d.b, d.c, levels[i]!.value, opts.reverse);
        const pb = fibExtensionPrice(d.a, d.b, d.c, levels[i + 1]!.value, opts.reverse);
        const ya = this.priceToY(pa);
        const yb = this.priceToY(pb);
        if (ya === null || yb === null) continue;
        ctx.globalAlpha = opts.backgroundOpacity;
        ctx.fillStyle = levels[i]!.color;
        const top = Math.min(ya, yb);
        ctx.fillRect(startX, top, Math.max(0, endX - startX), Math.abs(yb - ya));
      }
      ctx.globalAlpha = 1;
    }
    const placed: { y: number; text: string; color: string }[] = [];
    for (const level of levels) {
      const price = fibExtensionPrice(d.a, d.b, d.c, level.value, opts.reverse);
      const y = this.priceToY(price);
      if (y === null) continue;
      const key = isFibExtKeyLevel(level.value);
      ctx.beginPath();
      ctx.strokeStyle = level.color;
      ctx.globalAlpha = key ? 1 : 0.78;
      ctx.lineWidth = (key ? 2 : 1) * (d.style?.width ?? 1);
      ctx.setLineDash([]);
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      const parts: string[] = [];
      if (opts.showLevels) parts.push(String(level.value));
      if (opts.showPrices) parts.push(this.formatPrice(price));
      if (parts.length) placed.push({ y, text: parts.join('  '), color: level.color });
    }
    placed.sort((p, q) => p.y - q.y);
    const gap = 12;
    for (let i = 1; i < placed.length; i++) {
      if (placed[i]!.y - placed[i - 1]!.y < gap) placed[i]!.y = placed[i - 1]!.y + gap;
    }
    const atLeft = opts.labels === 'left';
    const lx = atLeft ? startX + 5 : endX - 5;
    const align: CanvasTextAlign = atLeft ? 'left' : 'right';
    const v = opts.labelVAlign === 'top' ? -7 : opts.labelVAlign === 'bottom' ? 7 : 0;
    for (const row of placed) {
      this.label(ctx, row.text, lx, row.y + v, row.color, 11, align);
    }
  }

  private paintFibRetracement(
    ctx: CanvasRenderingContext2D,
    d: Extract<Drawing, { type: 'fib' }>,
    width: number,
    selected: boolean,
  ): void {
    const opts = fibOptionsOf(d);
    const ends = fibEnds(d);
    const t1 = this.timeToX(ends.p1.time);
    const t2 = this.timeToX(ends.p2.time);
    if (t1 === null || t2 === null) return;
    const left = Math.min(t1, t2);
    const right = opts.extendLines ? width : Math.max(t1, t2);
    const a = this.pointToXy(d.p1);
    const b = this.pointToXy(d.p2);
    const levels = visibleFibLevels(opts);
    const placed: { y: number; text: string; color: string }[] = [];
    if (opts.background && levels.length >= 2) {
      for (let i = 0; i < levels.length - 1; i++) {
        const pa = fibRetracementPrice(ends.p1, ends.p2, levels[i]!.value, opts.reverse);
        const pb = fibRetracementPrice(ends.p1, ends.p2, levels[i + 1]!.value, opts.reverse);
        const ya = this.priceToY(pa);
        const yb = this.priceToY(pb);
        if (ya === null || yb === null) continue;
        ctx.globalAlpha = opts.backgroundOpacity;
        ctx.fillStyle = levels[i]!.color;
        const top = Math.min(ya, yb);
        ctx.fillRect(left, top, Math.max(0, right - left), Math.abs(yb - ya));
      }
      ctx.globalAlpha = 1;
    }
    for (const level of levels) {
      const price = fibRetracementPrice(ends.p1, ends.p2, level.value, opts.reverse);
      const y = this.priceToY(price);
      if (y === null) continue;
      const key = isFibKeyLevel(level.value);
      ctx.beginPath();
      ctx.strokeStyle = level.color;
      ctx.globalAlpha = key ? 1 : 0.72;
      ctx.lineWidth = (key ? 2 : 1) * (d.style?.width ?? 1);
      ctx.setLineDash([]);
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
      const parts: string[] = [];
      if (opts.showLevels) parts.push(String(level.value));
      if (opts.showPrices) parts.push(this.formatPrice(price));
      if (parts.length) placed.push({ y, text: parts.join('  '), color: level.color });
    }
    ctx.globalAlpha = 1;
    if (a && b) {
      ctx.beginPath();
      ctx.strokeStyle = selected ? SELECTED : 'rgba(209, 212, 220, 0.45)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    placed.sort((p, q) => p.y - q.y);
    const gap = 11;
    for (let i = 1; i < placed.length; i++) {
      if (placed[i]!.y - placed[i - 1]!.y < gap) placed[i]!.y = placed[i - 1]!.y + gap;
    }
    const atLeft = opts.labels === 'left';
    const lx = atLeft ? left + 6 : Math.max(left + 6, right - 6);
    const align: CanvasTextAlign = atLeft ? 'left' : 'right';
    const light = document.documentElement.getAttribute('data-theme') === 'light';
    for (const row of placed) {
      this.label(ctx, row.text, lx, row.y, light ? row.color : row.color, 10, align);
    }
  }

  private paintBadge(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, selected: boolean): void {
    ctx.save();
    ctx.font = '11px system-ui, sans-serif';
    const padX = 6;
    const padY = 4;
    const w = Math.min(220, ctx.measureText(text).width + padX * 2);
    const h = 18;
    const left = x;
    const top = y - h;
    ctx.fillStyle = selected ? 'rgba(255, 204, 102, 0.16)' : 'rgba(19, 23, 34, 0.92)';
    ctx.strokeStyle = selected ? SELECTED : COLOR;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const r = 3;
    ctx.moveTo(left + r, top);
    ctx.lineTo(left + w - r, top);
    ctx.quadraticCurveTo(left + w, top, left + w, top + r);
    ctx.lineTo(left + w, top + h - r);
    ctx.quadraticCurveTo(left + w, top + h, left + w - r, top + h);
    ctx.lineTo(left + r, top + h);
    ctx.quadraticCurveTo(left, top + h, left, top + h - r);
    ctx.lineTo(left, top + r);
    ctx.quadraticCurveTo(left, top, left + r, top);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = selected ? SELECTED : '#e0e3ea';
    ctx.fillText(text, left + padX, top + h - padY - 1);
    ctx.restore();
  }
}
