// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Wykresy contributors

export interface OhlcBar {
  open: number;
  high: number;
  low: number;
  close: number;
}

export function formatOhlcPrice(value: number): string {
  const abs = Math.abs(value);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : 6;
  return value.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: digits });
}

export function ohlcLegendHtml(bar: OhlcBar, prevClose: number | null): string {
  const change = prevClose && prevClose !== 0 ? ((bar.close - prevClose) / prevClose) * 100 : null;
  const dir = change === null ? (bar.close >= bar.open ? 'up' : 'down') : change >= 0 ? 'up' : 'down';
  const chg =
    change === null
      ? ''
      : `<span class="ohlc-chg">${change >= 0 ? '+' : ''}${change.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</span>`;
  const item = (label: string, value: number, cls = '') =>
    `<span class="ohlc-item${cls ? ` ${cls}` : ''}"><em>${label}</em> ${formatOhlcPrice(value)}</span>`;
  return `<div class="ohlc-row" data-dir="${dir}">${item('O', bar.open)}${item('H', bar.high)}${item('L', bar.low)}${item('C', bar.close, 'ohlc-c')}${chg}</div>`;
}
