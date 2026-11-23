import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts';

export type Tool = 'cursor' | 'trend' | 'hline' | 'rect';

export interface Point {
  time: number;
  price: number;
}

export type Drawing =
  | { id: string; type: 'trend'; p1: Point; p2: Point }
  | { id: string; type: 'hline'; price: number }
  | { id: string; type: 'rect'; p1: Point; p2: Point };

const COLOR = '#5b9cf6';
const SELECTED = '#ffcc66';
const HIT_PX = 7;

function storageKey(sourceId: string, pairId: string): string {
  return `wykresy:drawings:${sourceId}:${pairId}`;
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `d-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isDrawing(value: unknown): value is Drawing {
  if (!value || typeof value !== 'object') return false;
  const d = value as Drawing;
  return d.type === 'trend' || d.type === 'hline' || d.type === 'rect';
}

function load(sourceId: string, pairId: string): Drawing[] {
  try {
    const raw = localStorage.getItem(storageKey(sourceId, pairId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isDrawing);
  } catch {
    return [];
  }
}

function save(sourceId: string, pairId: string, drawings: Drawing[]): void {
  localStorage.setItem(storageKey(sourceId, pairId), JSON.stringify(drawings));
}

function timeToNumber(time: Time | null | undefined): number | null {
  if (typeof time === 'number' && Number.isFinite(time)) return time;
  return null;
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

export class DrawingLayer {
  private drawings: Drawing[] = [];
  private selectedId: string | null = null;
  private tool: Tool = 'cursor';
  private draft: { type: Tool; start: Point; current: Point } | null = null;
  private sourceId = 'kraken';
  private pairId = 'XRPUSD';
  private ro: ResizeObserver;

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
    this.chart.subscribeClick((param) => {
      if (this.tool !== 'cursor' || !param.point) return;
      const price = this.series.coordinateToPrice(param.point.y);
      if (price === null) return;
      this.selectAt(param.point.x, param.point.y);
    });

    this.canvas.addEventListener('mousedown', (ev) => this.onPointer(ev, 'down'));
    this.canvas.addEventListener('mousemove', (ev) => this.onPointer(ev, 'move'));
    this.canvas.addEventListener('mouseup', (ev) => this.onPointer(ev, 'up'));
    this.canvas.addEventListener('mouseleave', () => {
      if (this.draft && this.tool !== 'hline') this.redraw();
    });

    window.addEventListener('keydown', this.onKey);
    this.syncPointerEvents();
  }

  getDrawings(): Drawing[] {
    return this.drawings.slice();
  }

  getSelectedId(): string | null {
    return this.selectedId;
  }

  setTool(tool: Tool): void {
    this.tool = tool;
    this.draft = null;
    this.syncPointerEvents();
    this.redraw();
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
      this.redraw();
    } else if (ev.key === 'Delete' || ev.key === 'Backspace') {
      const target = ev.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (this.deleteSelected()) ev.preventDefault();
    }
  };

  private syncPointerEvents(): void {
    const drawing = this.tool !== 'cursor';
    this.canvas.classList.toggle('passthrough', !drawing);
    this.chart.applyOptions({
      handleScroll: !drawing,
      handleScale: !drawing,
    });
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
      /* pane size may be unavailable before the first layout */
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

  private eventPoint(ev: MouseEvent): { x: number; y: number; logical: Point } | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const logical = this.xyToLogical(x, y);
    if (!logical) return null;
    return { x, y, logical };
  }

  private xyToLogical(x: number, y: number): Point | null {
    const price = this.series.coordinateToPrice(y);
    if (price === null) return null;
    let time = timeToNumber(this.chart.timeScale().coordinateToTime(x));
    if (time === null) {
      const range = this.chart.timeScale().getVisibleRange();
      const width = this.chart.timeScale().width();
      if (!range || width <= 0) return null;
      const from = timeToNumber(range.from);
      const to = timeToNumber(range.to);
      if (from === null || to === null) return null;
      time = from + ((to - from) * x) / width;
    }
    return { time, price };
  }

  private onPointer(ev: MouseEvent, phase: 'down' | 'move' | 'up'): void {
    if (this.tool === 'cursor') return;
    const hit = this.eventPoint(ev);
    if (!hit) return;

    if (this.tool === 'hline') {
      if (phase === 'down') {
        this.drawings.push({ id: newId(), type: 'hline', price: hit.logical.price });
        this.selectedId = this.drawings[this.drawings.length - 1].id;
        this.persist();
        this.redraw();
      }
      return;
    }

    if (phase === 'down') {
      if (!this.draft) {
        this.draft = { type: this.tool, start: hit.logical, current: hit.logical };
        this.redraw();
      } else {
        this.commitDraft(hit.logical);
      }
      return;
    }

    if (phase === 'move' && this.draft) {
      this.draft.current = hit.logical;
      this.redraw();
    }
  }

  private commitDraft(end: Point): void {
    const draft = this.draft;
    if (!draft) return;
    if (draft.type === 'trend') {
      this.drawings.push({ id: newId(), type: 'trend', p1: draft.start, p2: end });
    } else if (draft.type === 'rect') {
      this.drawings.push({ id: newId(), type: 'rect', p1: draft.start, p2: end });
    }
    this.selectedId = this.drawings[this.drawings.length - 1]?.id ?? null;
    this.draft = null;
    this.persist();
    this.redraw();
  }

  private selectAt(x: number, y: number): void {
    let best: { id: string; dist: number } | null = null;
    for (const d of this.drawings) {
      const dist = this.hitDistance(d, x, y);
      if (dist === null || dist > HIT_PX) continue;
      if (!best || dist < best.dist) best = { id: d.id, dist };
    }
    this.selectedId = best?.id ?? null;
    this.redraw();
  }

  private hitDistance(d: Drawing, x: number, y: number): number | null {
    if (d.type === 'hline') {
      const yy = this.series.priceToCoordinate(d.price);
      if (yy === null) return null;
      return Math.abs(y - yy);
    }
    const a = this.pointToXy(d.p1);
    const b = this.pointToXy(d.p2);
    if (!a || !b) return null;
    if (d.type === 'trend') return distPointToSegment(x, y, a.x, a.y, b.x, b.y);
    const left = Math.min(a.x, b.x);
    const right = Math.max(a.x, b.x);
    const top = Math.min(a.y, b.y);
    const bottom = Math.max(a.y, b.y);
    const inside = x >= left && x <= right && y >= top && y <= bottom;
    const toEdge = Math.min(Math.abs(x - left), Math.abs(x - right), Math.abs(y - top), Math.abs(y - bottom));
    return inside ? Math.min(toEdge, HIT_PX) : toEdge;
  }

  private pointToXy(p: Point): { x: number; y: number } | null {
    const x = this.chart.timeScale().timeToCoordinate(p.time as Time);
    const y = this.series.priceToCoordinate(p.price);
    if (x === null || y === null) return null;
    return { x, y };
  }

  redraw(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const width = this.canvas.getBoundingClientRect().width;

    for (const d of this.drawings) this.paint(ctx, d, width, d.id === this.selectedId);
    if (this.draft) {
      if (this.draft.type === 'trend') {
        this.paint(ctx, { id: 'draft', type: 'trend', p1: this.draft.start, p2: this.draft.current }, width, true);
      } else if (this.draft.type === 'rect') {
        this.paint(ctx, { id: 'draft', type: 'rect', p1: this.draft.start, p2: this.draft.current }, width, true);
      }
    }
  }

  private paint(ctx: CanvasRenderingContext2D, d: Drawing, width: number, selected: boolean): void {
    ctx.save();
    ctx.strokeStyle = selected ? SELECTED : COLOR;
    ctx.fillStyle = selected ? 'rgba(255, 204, 102, 0.12)' : 'rgba(91, 156, 246, 0.12)';
    ctx.lineWidth = selected ? 2.2 : 1.6;
    ctx.lineCap = 'round';
    ctx.setLineDash(d.id === 'draft' ? [6, 4] : []);

    if (d.type === 'hline') {
      const y = this.series.priceToCoordinate(d.price);
      if (y !== null) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    } else {
      const a = this.pointToXy(d.p1);
      const b = this.pointToXy(d.p2);
      if (a && b) {
        if (d.type === 'trend') {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        } else {
          const x = Math.min(a.x, b.x);
          const y = Math.min(a.y, b.y);
          const w = Math.abs(b.x - a.x);
          const h = Math.abs(b.y - a.y);
          ctx.fillRect(x, y, w, h);
          ctx.strokeRect(x, y, w, h);
        }
      }
    }
    ctx.restore();
  }
}
