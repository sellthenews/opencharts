// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { escapeHtml } from './html';
import { fetchJson } from './sources/http';

export const XRP_STRIP_MS = 20_000;

interface VenueQuote {
  id: string;
  label: string;
  pair: string;
  last: number | null;
}

async function lastOf(url: string, read: (data: unknown) => number): Promise<number | null> {
  try {
    const data = await fetchJson<unknown>(url);
    const last = read(data);
    return Number.isFinite(last) ? last : null;
  } catch {
    return null;
  }
}

export async function fetchXrpQuotes(): Promise<VenueQuote[]> {
  const [kraken, binance, coinbase, bitstamp] = await Promise.all([
    lastOf('https://api.kraken.com/0/public/Ticker?pair=XRPUSD', (data) => {
      const result = (data as { result?: Record<string, { c?: string[] }> }).result ?? {};
      const row = Object.values(result)[0];
      return Number(row?.c?.[0]);
    }),
    lastOf('https://api.binance.com/api/v3/ticker/price?symbol=XRPUSDT', (data) => Number((data as { price?: string }).price)),
    lastOf('https://api.exchange.coinbase.com/products/XRP-USD/ticker', (data) => Number((data as { price?: string }).price)),
    lastOf('https://www.bitstamp.net/api/v2/ticker/xrpusd/', (data) => Number((data as { last?: string }).last)),
  ]);
  return [
    { id: 'kraken', label: 'Kraken', pair: 'XRP/USD', last: kraken },
    { id: 'binance', label: 'Binance', pair: 'XRP/USDT', last: binance },
    { id: 'coinbase', label: 'Coinbase', pair: 'XRP/USD', last: coinbase },
    { id: 'bitstamp', label: 'Bitstamp', pair: 'XRP/USD', last: bitstamp },
  ];
}

function formatLast(last: number | null): string {
  if (last === null) return '—';
  if (last >= 1) return last.toFixed(4);
  return last.toFixed(6);
}

export function renderXrpStrip(root: HTMLElement, quotes: VenueQuote[]): void {
  root.innerHTML = quotes
    .map((q) => {
      const title = escapeHtml(`${q.label} ${q.pair}`);
      return `<span class="xrp-quote" data-venue="${escapeHtml(q.id)}" title="${title}"><b>${escapeHtml(q.label)}</b> ${escapeHtml(formatLast(q.last))}</span>`;
    })
    .join('');
}

export function startXrpStrip(root: HTMLElement): void {
  let timer = 0;
  const tick = async (): Promise<void> => {
    if (document.hidden) return;
    const quotes = await fetchXrpQuotes();
    if (root.isConnected) renderXrpStrip(root, quotes);
  };
  void tick();
  timer = window.setInterval(() => void tick(), XRP_STRIP_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void tick();
  });
  window.addEventListener('pagehide', () => window.clearInterval(timer));
}
