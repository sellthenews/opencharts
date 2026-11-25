// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { STOCKS_PROXY_UNCONFIGURED, getStocksProxyUrl } from '../config';
import { aggregateCandles, sortDedup } from './aggregate';
import { changePct, fetchJson } from './http';
import type { Candle, CandleQuery, DataSource, IntervalId, PairId, Ticker } from './types';
import { sourceIntervalFor } from './intervals';

/**
 * Yahoo interval / range mapping:
 * - 1h: native `1h` with `range=3mo` (Yahoo typically keeps only ~60–90 days of hourly bars).
 * - 4h: aggregated from that 1h series.
 * - 1D: `1d` + `range=5y`
 * - 1W: `1wk` + `range=max`
 * - 1M: `1mo` + `range=max`
 */
const QUERY: Record<string, { interval: string; range: string }> = {
  '1m': { interval: '1m', range: '7d' },
  '5m': { interval: '5m', range: '60d' },
  '15m': { interval: '15m', range: '60d' },
  '30m': { interval: '30m', range: '60d' },
  '1h': { interval: '1h', range: '3mo' },
  '1D': { interval: '1d', range: '5y' },
  '1W': { interval: '1wk', range: 'max' },
  '1M': { interval: '1mo', range: 'max' },
};
const NATIVE_IDS = Object.keys(QUERY);

/** How far before `period2` to ask Yahoo for one older page. */
function historyWindowSec(interval: string): number {
  switch (interval) {
    case '1m':
      return 7 * 86400;
    case '2m':
    case '5m':
    case '15m':
    case '30m':
    case '90m':
      return 55 * 86400;
    case '60m':
    case '1h':
      return 120 * 86400;
    case '1d':
      return 5 * 365 * 86400;
    default:
      return 20 * 365 * 86400;
  }
}

export const YAHOO_STOCKS: { id: string; name: string }[] = [
  { id: 'XRPN', name: 'Evernorth Holdings' },
  { id: 'AAPL', name: 'Apple' },
  { id: 'MSFT', name: 'Microsoft' },
  { id: 'NVDA', name: 'NVIDIA' },
  { id: 'TSLA', name: 'Tesla' },
  { id: 'AMZN', name: 'Amazon' },
  { id: 'META', name: 'Meta Platforms' },
  { id: 'GOOGL', name: 'Alphabet' },
  { id: 'COIN', name: 'Coinbase' },
  { id: 'MSTR', name: 'MicroStrategy' },
  { id: 'HOOD', name: 'Robinhood' },
];

interface YahooChart {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
        currency?: string;
        regularMarketPrice?: number;
        regularMarketChangePercent?: number;
        chartPreviousClose?: number;
        previousClose?: number;
        shortName?: string;
        longName?: string;
      };
      timestamp?: number[];
      indicators?: { quote?: Array<{ open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }> };
    }>;
    error?: { code?: string; description?: string } | null;
  };
}

export interface YahooSearchQuote {
  symbol?: string;
  shortname?: string;
  longname?: string;
  quoteType?: string;
  exchange?: string;
  exchDisp?: string;
}

export interface YahooSearchResponse {
  quotes?: YahooSearchQuote[];
}

function proxyUrl(): string {
  const base = getStocksProxyUrl();
  if (!base) throw new Error(STOCKS_PROXY_UNCONFIGURED);
  return base;
}

function candlesFromChart(data: YahooChart): Candle[] {
  const result = data.chart?.result?.[0];
  if (!result) {
    const err = data.chart?.error;
    throw new Error(err?.description || 'Yahoo: no chart data');
  }
  const ts = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0];
  if (!quote) throw new Error('Yahoo: no quotes');
  const candles: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const open = Number(quote.open?.[i]);
    const high = Number(quote.high?.[i]);
    const low = Number(quote.low?.[i]);
    const close = Number(quote.close?.[i]);
    const volume = Number(quote.volume?.[i] ?? 0);
    if (![open, high, low, close].every(Number.isFinite)) continue;
    candles.push({
      time: ts[i]!,
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : 0,
    });
  }
  return sortDedup(candles);
}

async function fetchChart(symbol: string, interval: string, range: string, opts?: { before?: number; includePrePost?: boolean }): Promise<YahooChart> {
  const base = proxyUrl();
  const params = new URLSearchParams();
  params.set('interval', interval);
  params.set('includePrePost', opts?.includePrePost ? 'true' : 'false');
  if (opts?.before !== undefined) {
    const period2 = Math.max(0, Math.floor(opts.before));
    const period1 = Math.max(0, period2 - historyWindowSec(interval));
    params.set('period1', String(period1));
    params.set('period2', String(period2));
  } else {
    params.set('range', range);
  }
  const url = `${base}/v8/finance/chart/${encodeURIComponent(symbol)}?${params.toString()}`;
  return fetchJson<YahooChart>(url);
}

export const yahoo: DataSource = {
  id: 'yahoo',
  name: 'Yahoo (via Swapwick proxy)',
  pairs: YAHOO_STOCKS.map((s) => ({ id: s.id, label: s.id, native: s.id })),
  nativeIntervals: NATIVE_IDS,
  async fetchCandles(pairId: PairId, interval: IntervalId, opts?: CandleQuery): Promise<Candle[]> {
    const symbol = this.pairs.find((p) => p.id === pairId)?.native ?? pairId;
    const srcId = sourceIntervalFor(this.nativeIntervals, interval);
    if (!srcId) throw new Error(`Yahoo: unsupported interval ${interval}`);
    const q = QUERY[srcId];
    if (!q) throw new Error(`Yahoo: unsupported interval ${interval}`);
    let candles = candlesFromChart(
      await fetchChart(symbol, q.interval, q.range, { before: opts?.before, includePrePost: opts?.includePrePost }),
    );
    if (srcId !== interval) candles = aggregateCandles(candles, interval);
    if (opts?.before !== undefined) candles = candles.filter((c) => c.time < opts.before!);
    if (opts?.limit && candles.length > opts.limit) candles = candles.slice(-opts.limit);
    return candles;
  },
  async fetchTicker(pairId: PairId): Promise<Ticker> {
    const symbol = this.pairs.find((p) => p.id === pairId)?.native ?? pairId;
    const data = await fetchChart(symbol, '1d', '5d', { includePrePost: false });
    const meta = data.chart?.result?.[0]?.meta;
    if (!meta) throw new Error('Yahoo: empty ticker');
    const last = Number(meta.regularMarketPrice);
    if (!Number.isFinite(last)) throw new Error('Yahoo: no last price');
    const pct = Number(meta.regularMarketChangePercent);
    if (Number.isFinite(pct)) return { last, change24hPct: pct };
    const prev = Number(meta.chartPreviousClose ?? meta.previousClose);
    return { last, change24hPct: changePct(last, prev) };
  },
};

export async function searchYahooQuotes(query: string): Promise<YahooSearchQuote[]> {
  const q = query.trim();
  if (!q) return [];
  const base = getStocksProxyUrl();
  if (!base) return [];
  const url = `${base}/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=12&newsCount=0`;
  const data = await fetchJson<YahooSearchResponse>(url);
  return (data.quotes ?? []).filter((row) => {
    const typ = (row.quoteType ?? '').toUpperCase();
    return typ === 'EQUITY' || typ === 'ETF';
  });
}
