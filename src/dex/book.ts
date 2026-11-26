// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { ledgerRpc } from '../sources/ledger-rpc';
import { amountValue, getDexNetwork, type LedgerAmount } from '../sources/dex-networks';
import { currencyCode } from '../sources/dex-networks';
import { assetSpec, type Asset, type LedgerId } from './tx';

export interface BookLevel {
  /** Quote per base. */
  price: number;
  /** Base amount at this level. */
  size: number;
  account?: string;
}

export interface OrderBook {
  bids: BookLevel[];
  asks: BookLevel[];
  at: number;
}

interface RawOffer {
  Account?: string;
  TakerGets?: LedgerAmount;
  TakerPays?: LedgerAmount;
  taker_gets_funded?: LedgerAmount;
  taker_pays_funded?: LedgerAmount;
}

function same(a: string, b: string): boolean {
  return currencyCode(a).toUpperCase() === currencyCode(b).toUpperCase();
}

/** Turn raw offers into price levels (quote per base). Funded amounts win when the ledger reports them. */
export function levelsFromOffers(offers: RawOffer[], base: Asset, quote: Asset, native: string, side: 'bid' | 'ask'): BookLevel[] {
  const out: BookLevel[] = [];
  for (const o of offers) {
    const gets = amountValue(o.taker_gets_funded ?? o.TakerGets, native);
    const pays = amountValue(o.taker_pays_funded ?? o.TakerPays, native);
    if (!gets || !pays || !(gets.value > 0) || !(pays.value > 0)) continue;
    if (side === 'ask' && same(gets.currency, base.currency) && same(pays.currency, quote.currency)) {
      out.push({ price: pays.value / gets.value, size: gets.value, account: o.Account });
    } else if (side === 'bid' && same(gets.currency, quote.currency) && same(pays.currency, base.currency)) {
      out.push({ price: gets.value / pays.value, size: pays.value, account: o.Account });
    }
  }
  out.sort((a, b) => (side === 'ask' ? a.price - b.price : b.price - a.price));
  return out;
}

export async function fetchOrderBook(ledger: LedgerId, base: Asset, quote: Asset, limit = 60): Promise<OrderBook> {
  const network = getDexNetwork(ledger);
  if (!network) throw new Error('Unknown ledger');
  const b = assetSpec(base, ledger);
  const q = assetSpec(quote, ledger);
  const [askRes, bidRes] = await Promise.all([
    ledgerRpc<{ offers?: RawOffer[] }>(network, 'book_offers', { taker_gets: b, taker_pays: q, limit, ledger_index: 'validated' }),
    ledgerRpc<{ offers?: RawOffer[] }>(network, 'book_offers', { taker_gets: q, taker_pays: b, limit, ledger_index: 'validated' }),
  ]);
  return {
    asks: levelsFromOffers(askRes.offers ?? [], base, quote, network.native, 'ask'),
    bids: levelsFromOffers(bidRes.offers ?? [], base, quote, network.native, 'bid'),
    at: Date.now(),
  };
}

/** Group levels into price buckets for display. */
export function groupLevels(levels: BookLevel[], max = 14): BookLevel[] {
  const merged: BookLevel[] = [];
  for (const l of levels) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.price - l.price) / l.price < 1e-9) last.size += l.size;
    else merged.push({ price: l.price, size: l.size });
    if (merged.length >= max) break;
  }
  return merged;
}

export interface Fill {
  /** Base filled. */
  filled: number;
  /** Quote spent (buy) or received (sell). */
  cost: number;
  avgPrice: number;
  worstPrice: number;
  /** True when the book did not have enough size. */
  partial: boolean;
}

/** Walk the book to estimate a market order of `size` base. Buy walks asks, sell walks bids. */
export function estimateFill(book: OrderBook, side: 'buy' | 'sell', size: number): Fill | null {
  const levels = side === 'buy' ? book.asks : book.bids;
  if (!levels.length || !(size > 0)) return null;
  let left = size;
  let cost = 0;
  let worst = levels[0]!.price;
  for (const l of levels) {
    if (left <= 0) break;
    const take = Math.min(left, l.size);
    cost += take * l.price;
    left -= take;
    worst = l.price;
  }
  const filled = size - Math.max(0, left);
  return { filled, cost, avgPrice: filled > 0 ? cost / filled : 0, worstPrice: worst, partial: left > 1e-12 };
}

export function spread(book: OrderBook): { bid: number | null; ask: number | null; pct: number | null } {
  const bid = book.bids[0]?.price ?? null;
  const ask = book.asks[0]?.price ?? null;
  const pct = bid != null && ask != null && ask > 0 ? ((ask - bid) / ask) * 100 : null;
  return { bid, ask, pct };
}

/** Cumulative depth curve points within ±range of the mid price. */
export function depthCurve(book: OrderBook, range = 0.2): { bids: Array<[number, number]>; asks: Array<[number, number]>; mid: number | null } {
  const s = spread(book);
  const mid = s.bid != null && s.ask != null ? (s.bid + s.ask) / 2 : s.bid ?? s.ask;
  if (mid == null) return { bids: [], asks: [], mid: null };
  const lo = mid * (1 - range);
  const hi = mid * (1 + range);
  const bids: Array<[number, number]> = [];
  let acc = 0;
  for (const l of book.bids) {
    if (l.price < lo) break;
    acc += l.size;
    bids.push([l.price, acc]);
  }
  const asks: Array<[number, number]> = [];
  acc = 0;
  for (const l of book.asks) {
    if (l.price > hi) break;
    acc += l.size;
    asks.push([l.price, acc]);
  }
  return { bids, asks, mid };
}
