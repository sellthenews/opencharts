// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { ColorType, CrosshairMode, LineStyle } from 'lightweight-charts';
import type { CandlestickSeriesPartialOptions, DeepPartial, ChartOptions } from 'lightweight-charts';

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

/** Ctrl on Windows/Linux, Command on Apple — TradingView-style temporary magnet. */
export function isMagnetModifier(ev: { ctrlKey: boolean; metaKey: boolean }): boolean {
  return isApplePlatform() ? ev.metaKey : ev.ctrlKey;
}
