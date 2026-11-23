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
  private ro: ResizeObserver;
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
    this.chart.timeScale().subscribeVisibleLogicalRangeChange(() => this.redraw());

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
    this.canvas.width = Math.max(1, Math.floor(width * dpr));
    this.canvas.height = Math.max(1, Math.floor(height * dpr));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.redraw();
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
    if (d.type === 'text') {
      const xy = this.pointToXy(d.p);
      if (!xy) return null;
      return x >= xy.x - 2 && x <= xy.x + 80 && y >= xy.y - 14 && y <= xy.y + 4 ? 0 : 80;
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
    } else if (d.type === 'text') {
      const xy = this.pointToXy(d.p);
      if (xy) this.label(ctx, d.text, xy.x, xy.y, selected ? SELECTED : '#e0e3ea');
    }
    ctx.restore();
  }
}
