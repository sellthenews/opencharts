// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import type { Candle, IntervalId, PairId, Ticker } from '../sources/types';
import { intervalSeconds } from '../sources/intervals';
import { isKrakenTokenized, krakenWsName } from '../sources/catalog';
import { isoToUnix } from './merge';

export const KRAKEN_WS_URL = 'wss://ws.kraken.com/v2';

export const KRAKEN_WS_SYMBOL: Record<string, string> = {
  XRPUSD: 'XRP/USD',
  BTCUSD: 'BTC/USD',
  ETHUSD: 'ETH/USD',
};

const SYMBOL_TO_PAIR: Record<string, PairId> = Object.fromEntries(
  Object.entries(KRAKEN_WS_SYMBOL).map(([pair, symbol]) => [symbol, pair]),
);

function wsSymbol(pair: string): string | undefined {
  if (isKrakenTokenized(pair)) return undefined;
  const named = KRAKEN_WS_SYMBOL[pair] ?? krakenWsName(pair);
  if (!named) return undefined;
  KRAKEN_WS_SYMBOL[pair] = named;
  SYMBOL_TO_PAIR[named] = pair;
  return named;
}

function intervalMinutes(id: IntervalId): number | null {
  if (id === '1M') return 10080;
  const sec = intervalSeconds(id);
  if (sec === null || sec < 60) return null;
  return Math.round(sec / 60);
}

const KRAKEN_WS_INTERVALS = new Set([1, 5, 15, 30, 60, 240, 1440, 10080, 21600]);

export type LiveStatus = 'off' | 'connecting' | 'live';

interface OhlcRow {
  symbol?: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  interval_begin?: string;
  interval?: number;
}

interface TickerRow {
  symbol?: string;
  last?: number;
  change_pct?: number;
}

export class KrakenLive {
  private ws: WebSocket | null = null;
  private stopped = true;
  private backoff = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private chartPair: PairId | null = null;
  private chartInterval: IntervalId | null = null;
  private tickerPairs: PairId[] = [];
  private status: LiveStatus = 'off';

  constructor(
    private readonly onOhlc: (pair: PairId, interval: IntervalId, candle: Candle) => void,
    private readonly onTicker: (pair: PairId, ticker: Ticker) => void,
    private readonly onStatus: (status: LiveStatus) => void,
  ) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearReconnect();
    this.ws?.close();
    this.ws = null;
    this.setStatus('off');
  }

  setChart(pair: PairId | null, interval: IntervalId | null): void {
    this.chartPair = pair;
    this.chartInterval = interval;
    if (this.ws?.readyState === WebSocket.OPEN) this.subscribe();
    else if (!this.stopped) this.connect();
  }

  setTickers(pairs: PairId[]): void {
    this.tickerPairs = [...new Set(pairs)];
    if (this.ws?.readyState === WebSocket.OPEN) this.subscribe();
    else if (!this.stopped) this.connect();
  }

  private setStatus(status: LiveStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.onStatus(status);
  }

  private connect(): void {
    if (this.stopped) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.clearReconnect();
    this.setStatus('connecting');
    const ws = new WebSocket(KRAKEN_WS_URL);
    this.ws = ws;
    ws.addEventListener('open', () => {
      this.backoff = 1000;
      this.setStatus('live');
      this.subscribe();
    });
    ws.addEventListener('message', (ev) => this.onMessage(String(ev.data)));
    ws.addEventListener('error', () => {
      /* close handler reconnects */
    });
    ws.addEventListener('close', () => {
      if (this.ws === ws) this.ws = null;
      if (!this.stopped) {
        this.setStatus('off');
        this.scheduleReconnect();
      }
    });
  }

  private scheduleReconnect(): void {
    this.clearReconnect();
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, 30_000);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private subscribe(): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    if (this.chartPair) {
      const symbol = wsSymbol(this.chartPair);
      const interval = intervalMinutes(this.chartInterval ?? '1D');
      if (symbol && interval && KRAKEN_WS_INTERVALS.has(interval)) {
        this.ws.send(
          JSON.stringify({
            method: 'subscribe',
            params: {
              channel: 'ohlc',
              symbol: [symbol],
              interval,
              snapshot: false,
            },
          }),
        );
      }
    }
    const tickerSymbols = this.tickerPairs.map((p) => wsSymbol(p)).filter((s): s is string => Boolean(s));
    if (tickerSymbols.length) {
      this.ws.send(
        JSON.stringify({
          method: 'subscribe',
          params: {
            channel: 'ticker',
            symbol: tickerSymbols,
          },
        }),
      );
    }
  }

  private onMessage(raw: string): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    if (msg.channel === 'heartbeat' || msg.method === 'subscribe') return;
    if (msg.channel === 'ohlc' && Array.isArray(msg.data)) {
      const view = this.chartInterval ?? '1D';
      const srcInterval: IntervalId = view === '1M' ? '1W' : view;
      for (const row of msg.data as OhlcRow[]) {
        const pair = row.symbol ? SYMBOL_TO_PAIR[row.symbol] : undefined;
        if (!pair || !row.interval_begin) continue;
        if (this.chartPair && pair !== this.chartPair) continue;
        this.onOhlc(pair, srcInterval, {
          time: isoToUnix(row.interval_begin),
          open: Number(row.open),
          high: Number(row.high),
          low: Number(row.low),
          close: Number(row.close),
          volume: Number(row.volume),
        });
      }
      return;
    }
    if (msg.channel === 'ticker' && Array.isArray(msg.data)) {
      for (const row of msg.data as TickerRow[]) {
        const pair = row.symbol ? SYMBOL_TO_PAIR[row.symbol] : undefined;
        if (!pair || !Number.isFinite(Number(row.last))) continue;
        const change = Number(row.change_pct);
        this.onTicker(pair, {
          last: Number(row.last),
          change24hPct: Number.isFinite(change) ? change : null,
        });
      }
    }
  }
}
