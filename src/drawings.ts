// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Wykresy contributors

import type { IChartApi, ISeriesApi, Logical, SeriesType, Time } from 'lightweight-charts';
import {
  ABCD_PROJECTIONS,
  FIB_EXTENSION,
  FIB_RETRACEMENT,
  abcdPointD,
  abcdProject,
  fibExtensionPrice,
  fibRetracementPrice,
} from './drawings-math';
import { TOOLS_POINTS } from './drawings-types';
import type { Drawing, Point, Tool } from './drawings-types';
import { interactionOptions } from './chart-options';

export type { Drawing, Point, Tool };

const COLOR = '#5b9cf6';

type PriceSample = { time: number; close: number };

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

function storageKey(sourceId: string, pairId: string): string {
  return `wykresy:drawings:${sourceId}:${pairId}`;
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
  private ro: ResizeObserver;
  private rafId = 0;
  private needsPaint = false;
  private lastDpr = 0;
  private drag: { mode: 'point' | 'move'; handle?: HandleName; startX: number; startY: number; orig: Drawing } | null =
    null;

  constructor(
    private readonly chart: IChartApi,
    private readonly series: ISeriesApi<SeriesType>,
    private readonly canvas: HTMLCanvasElement,
    private readonly wrap: HTMLElement,
  ) {
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.wrap);
    this.resize();
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(() => this.scheduleRedraw());
    window.addEventListener('resize', this.onWinResize);

    this.canvas.addEventListener('mousedown', (ev) => this.onPointer(ev, 'down'));
    this.canvas.addEventListener('mousemove', (ev) => this.onPointer(ev, 'move'));
    window.addEventListener('mouseup', (ev) => this.onPointer(ev, 'up'));
    this.wrap.addEventListener('mousemove', (ev) => this.onHoverPassthrough(ev));
    window.addEventListener('keydown', this.onKey);
    this.syncPointerEvents();
  }

  getDrawings(): Drawing[] {
    return this.drawings.map((d) => structuredClone(d));
  }

  getSelectedId(): string | null {
    return this.selectedId;
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

  setContext(sourceId: string, pairId: string): void {
    this.sourceId = sourceId;
    this.pairId = pairId;
    this.drawings = load(sourceId, pairId);
    this.selectedId = null;
    this.draft = null;
    this.redraw();
  }

  deleteSelected(): boolean {
    if (!this.selectedId) return false;
    this.drawings = this.drawings.filter((d) => d.id !== this.selectedId);
    this.selectedId = null;
    this.persist();
    this.redraw();
    return true;
  }

  clearAll(): void {
    this.drawings = [];
    this.selectedId = null;
    this.draft = null;
    this.persist();
    this.redraw();
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
    if (!list) throw new Error('Nieprawidłowy plik rysunków');
    this.drawings = list.filter(isDrawing);
    this.selectedId = null;
    this.persist();
    this.redraw();
  }

  toggleExtendRight(): boolean {
    const d = this.drawings.find((x) => x.id === this.selectedId);
    if (!d || d.type !== 'fibext') return false;
    d.extendRight = !d.extendRight;
    this.persist();
    this.redraw();
    return d.extendRight;
  }

  syncSize(): void {
    this.resize();
  }

  destroy(): void {
    this.ro.disconnect();
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onWinResize);
    if (this.rafId) cancelAnimationFrame(this.rafId);
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

  private onKey = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') {
      this.draft = null;
      this.drag = null;
      this.redraw();
    } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
      const target = ev.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
      if (this.deleteSelected()) ev.preventDefault();
    }
  };

  private syncPointerEvents(): void {
    const drawing = this.tool !== 'cursor';
    this.canvas.classList.toggle('passthrough', !drawing);
    this.chart.applyOptions(drawing ? { handleScroll: false, handleScale: false } : interactionOptions());
  }

  private persist(): void {
    save(this.sourceId, this.pairId, this.drawings);
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

  private xyToLogical(x: number, y: number): Point | null {
    const price = this.series.coordinateToPrice(y);
    const time = this.xToTime(x);
    if (price === null || time === null) return null;
    return { time, price };
  }

  private pointToXy(p: Point): { x: number; y: number } | null {
    const x = this.timeToX(p.time);
    const y = this.series.priceToCoordinate(p.price);
    if (x === null || y === null) return null;
    return { x, y };
  }

  private eventPoint(ev: MouseEvent): { x: number; y: number; logical: Point } | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const logical = this.xyToLogical(x, y);
    if (!logical) return null;
    return { x, y, logical };
  }

  private onHoverPassthrough(ev: MouseEvent): void {
    if (this.tool !== 'cursor' || this.drag) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const hit = this.hitHandle(x, y) || this.hitBody(x, y);
    this.canvas.classList.toggle('passthrough', !hit);
  }

  private onPointer(ev: MouseEvent, phase: 'down' | 'move' | 'up'): void {
    const hit = this.eventPoint(ev);
    if (phase === 'up') {
      if (this.drag) {
        this.drag = null;
        this.persist();
        this.syncPointerEvents();
        this.redraw();
      }
      return;
    }
    if (!hit) return;

    if (this.tool === 'cursor') {
      this.onCursorPointer(hit, phase);
      return;
    }
    if (phase === 'move' && this.draft) {
      this.draft.current = hit.logical;
      this.redraw();
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
        if (orig) {
          this.drag = {
            mode: handle ? 'point' : 'move',
            handle: handle?.handle,
            startX: hit.x,
            startY: hit.y,
            orig: structuredClone(orig),
          };
          this.canvas.classList.remove('passthrough');
          this.chart.applyOptions({ handleScroll: false, handleScale: false });
        }
      }
      this.redraw();
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
      this.moveHandle(current, drag.handle, hit.logical);
    } else {
      const start = this.xyToLogical(drag.startX, drag.startY);
      if (!start) return;
      const dt = hit.logical.time - start.time;
      const dp = hit.logical.price - start.price;
      this.translateDrawing(current, drag.orig, dt, dp);
    }
    this.redraw();
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
    }
  }

  private addDraftPoint(point: Point): void {
    const needed = TOOLS_POINTS[this.tool];
    if (needed <= 0) return;
    if (this.tool === 'hline') {
      this.drawings.push({ id: newId(), type: 'hline', price: point.price });
      this.selectedId = this.drawings[this.drawings.length - 1]!.id;
      this.persist();
      this.redraw();
      return;
    }
    if (this.tool === 'text') {
      const text = window.prompt('Tekst notatki', 'Notatka');
      if (text && text.trim()) {
        this.drawings.push({ id: newId(), type: 'text', p: point, text: text.trim() });
        this.selectedId = this.drawings[this.drawings.length - 1]!.id;
        this.persist();
      }
      this.redraw();
      return;
    }
    if (!this.draft) {
      if (needed === 1) {
        if (this.tool === 'note') {
          const text = window.prompt('Notatka', 'Notatka');
          if (text && text.trim()) {
            const drawing = this.commitPoints('note', [point]);
            if (drawing && drawing.type === 'note') {
              drawing.text = text.trim();
              this.drawings.push(drawing);
              this.selectedId = drawing.id;
              this.persist();
            }
          }
          this.redraw();
          return;
        }
        const drawing = this.commitPoints(this.tool, [point]);
        if (drawing) {
          this.drawings.push(drawing);
          this.selectedId = drawing.id;
          this.persist();
        }
        this.redraw();
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
      const text = window.prompt('Objaśnienie', 'Objaśnienie');
      if (!(text && text.trim())) {
        this.draft = null;
        this.redraw();
        return;
      }
      const created = this.commitPoints('callout', points);
      if (created && created.type === 'callout') {
        created.text = text.trim();
        this.drawings.push(created);
        this.selectedId = created.id;
        this.persist();
      }
      this.draft = null;
      this.redraw();
      return;
    }
    const created = this.commitPoints(this.tool, points);
    if (created) {
      this.drawings.push(created);
      this.selectedId = created.id;
      this.persist();
    }
    this.draft = null;
    this.redraw();
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
        return { id, type: 'fib', p1: points[0]!, p2: points[1]! };
      case 'channel':
        return { id, type: 'channel', p1: points[0]!, p2: points[1]!, p3: points[2]! };
      case 'abcd':
        return { id, type: 'abcd', a: points[0]!, b: points[1]!, c: points[2]! };
      case 'fibext':
        return { id, type: 'fibext', a: points[0]!, b: points[1]!, c: points[2]!, extendRight: true };
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
    }
  }

  private hitHandle(x: number, y: number): { id: string; handle: HandleName } | null {
    for (const d of this.drawings) {
      for (const h of this.handlesOf(d)) {
        let xy = this.pointToXy(h.point);
        if (d.type === 'hline') {
          const yy = this.series.priceToCoordinate(d.price);
          if (yy === null) continue;
          xy = { x: this.canvas.getBoundingClientRect().width / 2, y: yy };
        }
        if (d.type === 'vline') {
          const xx = this.timeToX(d.time);
          if (xx === null) continue;
          xy = { x: xx, y: this.canvas.getBoundingClientRect().height / 2 };
        }
        if (d.type === 'hray' && h.handle === 'p2') {
          const yy = this.series.priceToCoordinate(d.p1.price);
          const xx = this.timeToX(d.p2.time);
          if (yy === null || xx === null) continue;
          xy = { x: xx, y: yy };
        }
        if (!xy) continue;
        if (Math.hypot(x - xy.x, y - xy.y) <= HANDLE + 3) return { id: d.id, handle: h.handle };
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
      const yy = this.series.priceToCoordinate(d.price);
      return yy === null ? null : Math.abs(y - yy);
    }
    if (d.type === 'vline') {
      const xx = this.timeToX(d.time);
      return xx === null ? null : Math.abs(x - xx);
    }
    if (d.type === 'hray') {
      const yy = this.series.priceToCoordinate(d.p1.price);
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
      let best = Infinity;
      for (const k of FIB_RETRACEMENT) {
        const yy = this.series.priceToCoordinate(fibRetracementPrice(d.p1, d.p2, k));
        if (yy !== null) best = Math.min(best, Math.abs(y - yy));
      }
      return Number.isFinite(best) ? best : null;
    }
    if (d.type === 'fibext') {
      let best = Infinity;
      for (const k of FIB_EXTENSION) {
        const yy = this.series.priceToCoordinate(fibExtensionPrice(d.a, d.b, d.c, k));
        if (yy !== null) best = Math.min(best, Math.abs(y - yy));
      }
      const a = this.pointToXy(d.a);
      const b = this.pointToXy(d.b);
      const c = this.pointToXy(d.c);
      if (a && b) best = Math.min(best, distPointToSegment(x, y, a.x, a.y, b.x, b.y));
      if (b && c) best = Math.min(best, distPointToSegment(x, y, b.x, b.y, c.x, c.y));
      return Number.isFinite(best) ? best : null;
    }
    if (d.type === 'pricerange') {
      const y1 = this.series.priceToCoordinate(d.p1.price);
      const y2 = this.series.priceToCoordinate(d.p2.price);
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
    const width = this.canvas.getBoundingClientRect().width;
    const height = this.canvas.getBoundingClientRect().height;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
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
        const yy = this.series.priceToCoordinate(d.price);
        if (yy === null) continue;
        xy = { x: width / 2, y: yy };
      }
      if (d.type === 'vline') {
        const xx = this.timeToX(d.time);
        if (xx === null) continue;
        xy = { x: xx, y: this.canvas.getBoundingClientRect().height / 2 };
      }
      if (d.type === 'hray' && h.handle === 'p2') {
        const yy = this.series.priceToCoordinate(d.p1.price);
        const xx = this.timeToX(d.p2.time);
        if (yy === null || xx === null) continue;
        xy = { x: xx, y: yy };
      }
      if (!xy) continue;
      ctx.fillStyle = '#131722';
      ctx.strokeStyle = SELECTED;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(xy.x - HANDLE, xy.y - HANDLE, HANDLE * 2, HANDLE * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  private label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = '#d1d4dc'): void {
    ctx.save();
    ctx.font = '11px system-ui, sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(13, 15, 20, 0.85)';
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

  private paint(ctx: CanvasRenderingContext2D, d: Drawing, width: number, height: number, selected: boolean): void {
    ctx.save();
    ctx.strokeStyle = selected ? SELECTED : COLOR;
    ctx.fillStyle = selected ? 'rgba(255, 204, 102, 0.12)' : 'rgba(91, 156, 246, 0.12)';
    ctx.lineWidth = selected ? 2 : 1.5;
    ctx.lineCap = 'round';
    ctx.setLineDash(d.id.startsWith('d-') && d.id.length < 0 ? [6, 4] : []);

    if (d.type === 'hline') {
      const y = this.series.priceToCoordinate(d.price);
      if (y !== null) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
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
      const y0 = this.series.priceToCoordinate(d.p1.price);
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
      const t1 = this.timeToX(d.p1.time);
      const t2 = this.timeToX(d.p2.time);
      if (t1 !== null && t2 !== null) {
        const left = Math.min(t1, t2);
        const right = Math.max(t1, t2);
        for (const k of FIB_RETRACEMENT) {
          const price = fibRetracementPrice(d.p1, d.p2, k);
          const y = this.series.priceToCoordinate(price);
          if (y === null) continue;
          ctx.beginPath();
          ctx.strokeStyle = selected ? SELECTED : COLOR;
          ctx.globalAlpha = 0.95;
          ctx.moveTo(left, y);
          ctx.lineTo(right, y);
          ctx.stroke();
          this.label(ctx, `${k}  ${this.formatPrice(price)}`, right + 4, y - 2);
        }
      }
    } else if (d.type === 'fibext') {
      const a = this.pointToXy(d.a);
      const b = this.pointToXy(d.b);
      const c = this.pointToXy(d.c);
      if (a && b && c) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
        ctx.stroke();
        this.label(ctx, 'A', a.x + 4, a.y - 6);
        this.label(ctx, 'B', b.x + 4, b.y - 6);
        this.label(ctx, 'C', c.x + 4, c.y - 6);
        const startX = d.extendRight ? Math.min(a.x, b.x, c.x) : c.x;
        const endX = d.extendRight ? width : Math.max(a.x, b.x, c.x) + 40;
        for (const k of FIB_EXTENSION) {
          const price = fibExtensionPrice(d.a, d.b, d.c, k);
          const y = this.series.priceToCoordinate(price);
          if (y === null) continue;
          ctx.beginPath();
          ctx.moveTo(startX, y);
          ctx.lineTo(endX, y);
          ctx.stroke();
          this.label(ctx, `${k}  ${this.formatPrice(price)}`, endX + 4, y - 2);
        }
      }
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
          const y = this.series.priceToCoordinate(p.price);
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
      const y1 = this.series.priceToCoordinate(d.p1.price);
      const y2 = this.series.priceToCoordinate(d.p2.price);
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
        const barTxt = bars >= 1 ? `  ·  ${bars >= 10 ? bars.toFixed(0) : bars.toFixed(1)} sł.` : '';
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
      const yE = this.series.priceToCoordinate(d.entry.price);
      const yT = this.series.priceToCoordinate(d.target.price);
      const yS = this.series.priceToCoordinate(d.stop.price);
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
        this.label(ctx, `${tag}  RR ${rr.toFixed(2)}`, left + 4, Math.min(yE, yT, yS) - 6, selected ? SELECTED : '#e0e3ea');
        this.label(ctx, `E ${this.formatPrice(d.entry.price)}`, left + 4, yE - 4);
        this.label(ctx, `TP ${this.formatPrice(d.target.price)}`, left + 4, yT - 4);
        this.label(ctx, `SL ${this.formatPrice(d.stop.price)}`, left + 4, yS - 4);
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
      if (xy) this.paintBadge(ctx, d.text || 'Notatka', xy.x, xy.y, selected);
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
        this.paintBadge(ctx, d.text || 'Objaśnienie', b.x, b.y, selected);
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
    }
    ctx.restore();
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
