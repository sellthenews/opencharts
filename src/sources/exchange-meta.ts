// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { getDexNetwork } from './dex-networks';

export interface ExchangeMeta {
  /** Styling key for the small round badge. */
  key: string;
  name: string;
  /** One or two letters shown inside the badge. */
  badge: string;
}

const CEX: Record<string, ExchangeMeta> = {
  kraken: { key: 'kraken', name: 'Kraken', badge: 'K' },
  binance: { key: 'binance', name: 'Binance', badge: 'B' },
  coinbase: { key: 'coinbase', name: 'Coinbase', badge: 'C' },
  bitstamp: { key: 'bitstamp', name: 'Bitstamp', badge: 'Bs' },
  yahoo: { key: 'yahoo', name: 'Yahoo Finance', badge: 'Y' },
};

export function exchangeMeta(sourceId: string, networkId?: string): ExchangeMeta {
  if (sourceId === 'dex') {
    const net = networkId ? getDexNetwork(networkId) : undefined;
    const name = net?.name ?? 'DEX';
    const badge = name.replace(/[^A-Za-z]/g, '').slice(0, 2) || 'D';
    return { key: net?.id === 'xrpl' || net?.id === 'xahau' ? net.id : 'dex', name, badge: badge.charAt(0).toUpperCase() + badge.slice(1).toLowerCase() };
  }
  return CEX[sourceId] ?? { key: 'other', name: sourceId, badge: sourceId.slice(0, 1).toUpperCase() };
}
