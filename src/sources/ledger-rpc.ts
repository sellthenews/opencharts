// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { getStocksProxyUrl } from '../config';
import type { Candle } from './types';
import {
  DROPS,
  amountValue,
  currencyCode,
  rippleToUnix,
  type DexNetwork,
  type LedgerAmount,
} from './dex-networks';

export const DEX_PROXY_MISSING = 'DEX data proxy not updated on the Worker yet';

export const LEDGER_RPC_METHODS = ['amm_info', 'account_tx', 'book_offers', 'ledger', 'server_info', 'account_info'] as const;
export type LedgerRpcMethod = (typeof LEDGER_RPC_METHODS)[number];

export interface LedgerTrade {
  time: number;
  price: number;
  volume: number;
}

export interface AmmSnapshot {
  account: string;
  amount: { currency: string; issuer?: string; value: number };
  amount2: { currency: string; issuer?: string; value: number };
  /** Price of amount in units of amount2 (quote / base when amount is the base). */
  price: number;
}

export interface BookQuote {
  bid: number | null;
  ask: number | null;
  mid: number | null;
}

interface RpcEnvelope {
  result?: Record<string, unknown> & { status?: string; error?: string; error_message?: string };
  error?: string;
}

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function workerRpcUrl(networkId: string): string | null {
  const base = getStocksProxyUrl();
  if (!base) return null;
  const path = networkId === 'xahau' ? 'xahau' : 'xrpl';
  return `${base}/dex/rpc/${path}`;
}

/**
 * Call an official ledger JSON-RPC endpoint, falling back to the OpenCharts
 * Worker if the browser is blocked. If the Worker has not been updated yet
 * (404), the original error is rethrown or DEX_PROXY_MISSING is raised.
 */
export async function ledgerRpc<T = Record<string, unknown>>(
  network: DexNetwork,
  method: LedgerRpcMethod,
  params: Record<string, unknown> = {},
): Promise<T> {
  if (!network.rpc) throw new Error(`No official RPC for ${network.name}`);
  const payload = { method, params: [params] };
  const urls = [network.rpc, network.rpcFallback].filter((u): u is string => Boolean(u));
  let lastErr: Error | null = null;
  for (const url of urls) {
    try {
      const res = await postJson(url, payload);
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status} for ${url}`);
        if (res.status >= 500 || res.status === 429) continue;
        // 4xx from the official node may still be a valid RPC wrapper; try parse below after throw if body empty
      }
      const data = (await res.json()) as RpcEnvelope;
      const result = data.result;
      if (!result || result.status === 'error' || result.error) {
        lastErr = new Error(String(result?.error_message || result?.error || data.error || 'RPC error'));
        continue;
      }
      return result as T;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }
  const proxy = workerRpcUrl(network.id);
  if (proxy) {
    try {
      const res = await postJson(proxy, payload);
      if (res.status === 404) throw new Error(DEX_PROXY_MISSING);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${proxy}`);
      const data = (await res.json()) as RpcEnvelope;
      const result = data.result;
      if (!result || result.status === 'error' || result.error) {
        throw new Error(String(result?.error_message || result?.error || data.error || 'RPC error'));
      }
      return result as T;
    } catch (err) {
      if (err instanceof Error && err.message === DEX_PROXY_MISSING) throw err;
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastErr ?? new Error(`${network.name} RPC unavailable`);
}

export function ammPrice(amount: { value: number }, amount2: { value: number }): number {
  if (!(amount.value > 0)) return NaN;
  return amount2.value / amount.value;
}

export function parseAmmInfo(result: Record<string, unknown>, native: string): AmmSnapshot | null {
  const amm = result.amm as
    | {
        account?: string;
        amount?: LedgerAmount;
        amount2?: LedgerAmount;
      }
    | undefined;
  if (!amm?.account) return null;
  const a = amountValue(amm.amount, native);
  const b = amountValue(amm.amount2, native);
  if (!a || !b || !(a.value > 0)) return null;
  return { account: amm.account, amount: a, amount2: b, price: ammPrice(a, b) };
}

interface AffectedNode {
  CreatedNode?: NodeBody;
  ModifiedNode?: NodeBody;
  DeletedNode?: NodeBody;
}

interface NodeBody {
  LedgerEntryType?: string;
  FinalFields?: Record<string, unknown>;
  NewFields?: Record<string, unknown>;
  PreviousFields?: Record<string, unknown>;
}

function nodeBody(node: AffectedNode): { kind: string; body: NodeBody } | null {
  if (node.ModifiedNode) return { kind: 'Modified', body: node.ModifiedNode };
  if (node.CreatedNode) return { kind: 'Created', body: node.CreatedNode };
  if (node.DeletedNode) return { kind: 'Deleted', body: node.DeletedNode };
  return null;
}

/**
 * A swap against an AMM changes the two reserves in opposite directions.
 * Deposits and withdrawals move both the same way and are skipped for volume
 * (the post-trade reserve ratio is still used as a price tick).
 */
export function tradesFromAccountTx(
  transactions: unknown[],
  ammAccount: string,
  native: string,
): LedgerTrade[] {
  const out: LedgerTrade[] = [];
  for (const raw of transactions) {
    const wrap = raw as {
      tx?: { date?: number; TransactionType?: string };
      tx_json?: { date?: number; TransactionType?: string };
      meta?: { AffectedNodes?: AffectedNode[] };
      date?: number;
    };
    const tx = wrap.tx ?? wrap.tx_json ?? {};
    const date = tx.date ?? wrap.date;
    if (typeof date !== 'number') continue;
    const time = rippleToUnix(date);
    const nodes = wrap.meta?.AffectedNodes ?? [];
    let xrpFinal: number | null = null;
    let xrpPrev: number | null = null;
    let iouFinal: number | null = null;
    let iouPrev: number | null = null;
    for (const node of nodes) {
      const parsed = nodeBody(node);
      if (!parsed) continue;
      const typ = parsed.body.LedgerEntryType ??
        (parsed.body.FinalFields as { LedgerEntryType?: string } | undefined)?.LedgerEntryType;
      const final = (parsed.body.FinalFields ?? parsed.body.NewFields ?? {}) as Record<string, unknown>;
      const prev = (parsed.body.PreviousFields ?? {}) as Record<string, unknown>;
      if (typ === 'AccountRoot' && final.Account === ammAccount) {
        if (typeof final.Balance === 'string') xrpFinal = Number(final.Balance) / DROPS;
        if (typeof prev.Balance === 'string') xrpPrev = Number(prev.Balance) / DROPS;
      }
      if (typ === 'RippleState') {
        const high = (final.HighLimit ?? {}) as { issuer?: string; currency?: string };
        const low = (final.LowLimit ?? {}) as { issuer?: string; currency?: string };
        if (high.issuer !== ammAccount && low.issuer !== ammAccount) continue;
        const fin = amountValue(final.Balance as LedgerAmount, native);
        const pre = prev.Balance != null ? amountValue(prev.Balance as LedgerAmount, native) : null;
        if (fin) iouFinal = Math.abs(fin.value);
        if (pre) iouPrev = Math.abs(pre.value);
      }
    }
    if (xrpFinal == null || iouFinal == null || !(xrpFinal > 0)) continue;
    const price = iouFinal / xrpFinal;
    if (!Number.isFinite(price) || !(price > 0)) continue;
    let volume = 0;
    if (xrpPrev != null && iouPrev != null) {
      const dx = xrpFinal - xrpPrev;
      const di = iouFinal - iouPrev;
      if (dx * di < 0) volume = Math.abs(dx);
    }
    out.push({ time, price, volume });
  }
  out.sort((a, b) => a.time - b.time);
  return out;
}

export function aggregateTrades(trades: LedgerTrade[], intervalSec: number): Candle[] {
  if (!trades.length || !(intervalSec > 0)) return [];
  const map = new Map<number, Candle>();
  for (const trade of trades) {
    const time = Math.floor(trade.time / intervalSec) * intervalSec;
    const bar = map.get(time);
    if (!bar) {
      map.set(time, {
        time,
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        volume: trade.volume,
      });
    } else {
      bar.high = Math.max(bar.high, trade.price);
      bar.low = Math.min(bar.low, trade.price);
      bar.close = trade.price;
      bar.volume += trade.volume;
    }
  }
  return [...map.values()].sort((a, b) => a.time - b.time);
}

/** Merge sparse mid-price samples into trade candles (samples fill empty buckets only). */
export function mergeSamples(candles: Candle[], samples: { time: number; price: number }[]): Candle[] {
  const byTime = new Map(candles.map((c) => [c.time, { ...c }]));
  for (const sample of samples) {
    if (!(sample.price > 0) || !Number.isFinite(sample.price)) continue;
    if (byTime.has(sample.time)) continue;
    byTime.set(sample.time, {
      time: sample.time,
      open: sample.price,
      high: sample.price,
      low: sample.price,
      close: sample.price,
      volume: 0,
    });
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

export function bookQualityToPrice(
  offer: { TakerGets?: LedgerAmount; TakerPays?: LedgerAmount; quality?: string },
  baseCurrency: string,
  quoteCurrency: string,
  native: string,
): number | null {
  const gets = amountValue(offer.TakerGets, native);
  const pays = amountValue(offer.TakerPays, native);
  if (!gets || !pays || !(gets.value > 0) || !(pays.value > 0)) return null;
  // Price as quote per base: if this offer sells base (TakerGets=base), taker pays quote, price = pays/gets.
  if (currencyCode(gets.currency) === currencyCode(baseCurrency) && currencyCode(pays.currency) === currencyCode(quoteCurrency)) {
    return pays.value / gets.value;
  }
  if (currencyCode(gets.currency) === currencyCode(quoteCurrency) && currencyCode(pays.currency) === currencyCode(baseCurrency)) {
    return gets.value / pays.value;
  }
  return null;
}

export function midFromBooks(bids: number[], asks: number[]): BookQuote {
  const bid = bids.length ? Math.max(...bids) : null;
  const ask = asks.length ? Math.min(...asks) : null;
  let mid: number | null = null;
  if (bid != null && ask != null && ask > 0) mid = (bid + ask) / 2;
  else mid = bid ?? ask;
  return { bid, ask, mid };
}

export async function fetchValidatedLedger(network: DexNetwork): Promise<{ index: number; closeTime: number }> {
  const result = await ledgerRpc<{ ledger?: { ledger_index?: string | number; close_time?: number }; ledger_index?: number }>(
    network,
    'ledger',
    { ledger_index: 'validated' },
  );
  const ledger = (result.ledger ?? result) as { ledger_index?: string | number; close_time?: number };
  const index = Number(ledger.ledger_index);
  const closeTime = typeof ledger.close_time === 'number' ? rippleToUnix(ledger.close_time) : Date.now() / 1000;
  if (!Number.isFinite(index)) throw new Error(`${network.name}: no validated ledger`);
  return { index, closeTime };
}

/** Estimate a ledger index at a unix time, assuming ~4s ledgers (XRPL and Xahau). */
export function estimateLedgerIndex(currentIndex: number, currentClose: number, targetUnix: number): number {
  const step = 4;
  return Math.max(1, Math.round(currentIndex - (currentClose - targetUnix) / step));
}

export function currencySpec(currency: string, issuer: string | undefined, native: string): Record<string, string> {
  if (currency === native || currency === 'XRP' && native === 'XRP') return { currency: native };
  if (!issuer) return { currency };
  return { currency, issuer };
}

export { currencyCode };
