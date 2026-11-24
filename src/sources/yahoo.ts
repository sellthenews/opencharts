// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { STOCKS_PROXY_UNCONFIGURED, getStocksProxyUrl } from '../config';
import { aggregateCandles, sortDedup } from './aggregate';
import { changePct, fetchJson } from './http';
import type { Candle, DataSource, IntervalId, PairId, Ticker } from './types';

/**
 * Yahoo interval / range mapping:
 * - 1h: native `1h` with `range=3mo` (Yahoo typically keeps only ~60–90 days of hourly bars).
 * - 4h: aggregated from that 1h series.
 * - 1D: `1d` + `range=5y`
 * - 1W: `1wk` + `range=max`
 * - 1M: `1mo` + `range=max`
 */
const QUERY: Record<Exclude<IntervalId, '4h'>, { interval: string; range: string }> = {
  '1h': { interval: '1h', range: '3mo' },
  '1D': { interval: '1d', range: '5y' },
  '1W': { interval: '1wk', range: 'max' },
  '1M': { interval: '1mo', range: 'max' },
};

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

async function fetchChart(symbol: string, interval: string, range: string): Promise<YahooChart> {
  const base = proxyUrl();
  const url = `${base}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}&includePrePost=false`;
  return fetchJson<YahooChart>(url);
}

export const yahoo: DataSource = {
  id: 'yahoo',
  name: 'Yahoo (via OpenCharts proxy)',
  pairs: YAHOO_STOCKS.map((s) => ({ id: s.id, label: s.id, native: s.id })),
  nativeIntervals: ['1h', '1D', '1W', '1M'],
  async fetchCandles(pairId: PairId, interval: IntervalId): Promise<Candle[]> {
    const symbol = this.pairs.find((p) => p.id === pairId)?.native ?? pairId;
    if (interval === '4h') {
      const hourly = candlesFromChart(await fetchChart(symbol, QUERY['1h'].interval, QUERY['1h'].range));
      return aggregateCandles(hourly, '4h');
    }
    const q = QUERY[interval];
    return candlesFromChart(await fetchChart(symbol, q.interval, q.range));
  },
  async fetchTicker(pairId: PairId): Promise<Ticker> {
    const symbol = this.pairs.find((p) => p.id === pairId)?.native ?? pairId;
    const data = await fetchChart(symbol, '1d', '5d');
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
