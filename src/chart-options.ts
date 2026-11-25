// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { ColorType, CrosshairMode, LineStyle, TickMarkType } from 'lightweight-charts';
import type { CandlestickSeriesPartialOptions, DeepPartial, ChartOptions, Time } from 'lightweight-charts';
import { resolvedTimeZone } from './timezone';

export const CHART_FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export function interactionOptions(): DeepPartial<ChartOptions> {
  return {
    kineticScroll: { mouse: false, touch: false },
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: true,
    },
    handleScale: {
      mouseWheel: true,
      pinch: true,
      axisPressedMouseMove: true,
      axisDoubleClickReset: true,
    },
  };
}

export function timeScaleInteraction(borderColor: string): DeepPartial<ChartOptions>['timeScale'] {
  return {
    borderColor,
    borderVisible: false,
    timeVisible: true,
    secondsVisible: false,
    rightOffset: 6,
    barSpacing: 8,
    minBarSpacing: 1.5,
    maxBarSpacing: 32,
    shiftVisibleRangeOnNewBar: true,
    ticksVisible: false,
  };
}

export function crosshairOptions(line: string, labelBg: string): DeepPartial<ChartOptions>['crosshair'] {
  return {
    mode: CrosshairMode.Magnet,
    vertLine: {
      color: line,
      width: 1,
      style: LineStyle.Dashed,
      visible: true,
      labelVisible: true,
      labelBackgroundColor: labelBg,
    },
    horzLine: {
      color: line,
      width: 1,
      style: LineStyle.Dashed,
      visible: true,
      labelVisible: true,
      labelBackgroundColor: labelBg,
    },
  };
}

export function candleSeriesOptions(): CandlestickSeriesPartialOptions {
  return {
    upColor: '#26a69a',
    downColor: '#ef5350',
    borderVisible: false,
    wickUpColor: '#26a69a',
    wickDownColor: '#ef5350',
    lastValueVisible: true,
    priceLineVisible: true,
    priceLineWidth: 1,
    priceLineColor: '#787b86',
  };
}

export function themeChartOptions(light: boolean): DeepPartial<ChartOptions> {
  if (light) {
    return {
      layout: { background: { type: ColorType.Solid, color: '#ffffff' }, textColor: '#131722', fontFamily: CHART_FONT },
      grid: { vertLines: { color: 'rgba(19, 23, 34, 0.06)', visible: true }, horzLines: { color: 'rgba(19, 23, 34, 0.06)', visible: true } },
      rightPriceScale: { borderColor: '#d1d4dc', borderVisible: false, ticksVisible: false },
      timeScale: timeScaleInteraction('#d1d4dc'),
      crosshair: crosshairOptions('rgba(19, 23, 34, 0.35)', '#4c525e'),
    };
  }
  return {
    layout: { background: { type: ColorType.Solid, color: '#0e1116' }, textColor: '#b2b5be', fontFamily: CHART_FONT },
    grid: { vertLines: { color: 'rgba(255, 255, 255, 0.04)', visible: true }, horzLines: { color: 'rgba(255, 255, 255, 0.04)', visible: true } },
    rightPriceScale: { borderColor: '#2a2e39', borderVisible: false, ticksVisible: false },
    timeScale: timeScaleInteraction('#2a2e39'),
    crosshair: crosshairOptions('rgba(209, 212, 220, 0.35)', '#2a2e39'),
  };
}

export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform) || /Mac OS|iPhone|iPad/.test(navigator.userAgent);
}

/** Ctrl on Windows/Linux, Command on Apple — temporary magnet override. */
export function isMagnetModifier(ev: { ctrlKey: boolean; metaKey: boolean }): boolean {
  return isApplePlatform() ? ev.metaKey : ev.ctrlKey;
}

export function formatTimeTick(time: Time, tickMarkType: TickMarkType, locale: string): string {
  const sec =
    typeof time === 'number'
      ? time
      : Date.UTC((time as { year: number; month: number; day: number }).year, (time as { year: number; month: number; day: number }).month - 1, (time as { year: number; month: number; day: number }).day) / 1000;
  const d = new Date(sec * 1000);
  const loc = locale || 'en-US';
  const zone = { timeZone: resolvedTimeZone() } as const;
  const clock = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...zone }).formatToParts(d);
  const hour = Number(clock.find((p) => p.type === 'hour')?.value);
  const minute = Number(clock.find((p) => p.type === 'minute')?.value);
  if (tickMarkType === TickMarkType.Year) return new Intl.DateTimeFormat(loc, { year: 'numeric', ...zone }).format(d);
  if (tickMarkType === TickMarkType.Month) return new Intl.DateTimeFormat(loc, { month: 'short', year: 'numeric', ...zone }).format(d);
  if (tickMarkType === TickMarkType.DayOfMonth) return new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', ...zone }).format(d);
  if (tickMarkType === TickMarkType.TimeWithSeconds) {
    return new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', ...zone }).format(d);
  }
  if (hour === 0 && minute === 0) {
    return new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', ...zone }).format(d);
  }
  return new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...zone }).format(d);
}
