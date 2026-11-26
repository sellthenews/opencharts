// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { searchSymbols } from '../src/sources/catalog.ts';
import type { SymbolInfo } from '../src/sources/catalog.ts';

function sym(sourceId: string, base: string, quote: string, kind: 'crypto' | 'stock' = 'crypto'): SymbolInfo {
  const label = quote ? `${base}/${quote}` : base;
  return { sourceId, id: `${base}${quote}`, native: `${base}${quote}`, base, quote, label, kind, search: `${label} ${base}${quote}`.toLowerCase() } as SymbolInfo;
}

test('xrp: USD first, majors first, stablecoins, then fiat, then crypto; partial tickers last', () => {
  const items = [
    sym('kraken', 'XRP', 'AUD'),
    sym('binance', 'XRP', 'BTC'),
    sym('yahoo', 'XRPN', '', 'stock'),
    sym('binance', 'XRP', 'USDT'),
    sym('bitstamp', 'XRP', 'USD'),
    sym('kraken', 'XRP', 'USD'),
    sym('coinbase', 'XRP', 'USD'),
    sym('kraken', 'XRP', 'EUR'),
    sym('dex', 'XRP', 'RLUSD'),
  ];
  const out = searchSymbols('xrp', 'all', items).map((s) => `${s.sourceId}:${s.label}`);
  assert.deepEqual(out, [
    'kraken:XRP/USD',
    'coinbase:XRP/USD',
    'bitstamp:XRP/USD',
    'binance:XRP/USDT',
    'dex:XRP/RLUSD',
    'kraken:XRP/AUD',
    'kraken:XRP/EUR',
    'binance:XRP/BTC',
    'yahoo:XRPN',
  ]);
});
