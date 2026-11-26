// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { getStocksProxyUrl } from '../config';
import { decodeXrplCurrency, type DexPairRef } from '../sources/ledger-tokens';

export interface XahauTokenInfo {
  currency: string;
  issuer: string;
  name: string | null;
  icon: string | null;
  holders: number;
  trustlines: number;
  verified: boolean;
  blackholed: boolean;
}

interface Side {
  currency: string;
  issuer: string | null;
}

interface PairRow {
  base: Side;
  quote: Side;
  volume30d: number;
  last: number | null;
}

let cache: { at: number; pairs: DexPairRef[]; tokens: Map<string, XahauTokenInfo> } | null = null;
let inflight: Promise<DexPairRef[]> | null = null;

const TTL_MS = 15 * 60_000;

function sideId(side: Side): string {
  return side.issuer ? `${side.currency}.${side.issuer}` : side.currency;
}

/** Book pair id; both sides may be issued tokens: `book:xahau:BASE[.issuer]:QUOTE[.issuer]`. */
export function bookPairFromSides(networkId: string, base: Side, quote: Side): DexPairRef {
  const b = decodeXrplCurrency(base.currency);
  const q = decodeXrplCurrency(quote.currency);
  return {
    id: `book:${networkId}:${sideId(base)}:${sideId(quote)}`,
    networkId,
    kind: 'book',
    label: `${b}/${q}`,
    base: base.currency,
    quote: quote.currency,
    native: quote.issuer ? `${quote.currency}.${quote.issuer}` : `${base.currency}/${quote.currency}`,
    baseIssuer: base.issuer ?? undefined,
    quoteIssuer: quote.issuer ?? undefined,
  };
}

export function xahauTokenInfo(currency: string, issuer?: string): XahauTokenInfo | undefined {
  if (!issuer) return undefined;
  return cache?.tokens.get(`${currency}.${issuer}`);
}

/** Every Xahau pair the Worker lists (all tokens vs XAH, USD and XRP, traded pairs first). */
export async function loadXahauPairs(): Promise<DexPairRef[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.pairs;
  if (inflight) return inflight;
  const base = getStocksProxyUrl();
  if (!base) return [];
  inflight = (async () => {
    try {
      const res = await fetch(`${base}/dex/xahau/pairs`, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { pairs?: PairRow[]; tokens?: XahauTokenInfo[] };
      const pairs = (body.pairs ?? []).map((row) => bookPairFromSides('xahau', row.base, row.quote));
      const tokens = new Map((body.tokens ?? []).map((t) => [`${t.currency}.${t.issuer}`, t]));
      cache = { at: Date.now(), pairs, tokens };
      return pairs;
    } catch {
      return cache?.pairs ?? [];
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
