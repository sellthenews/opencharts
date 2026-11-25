// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

/** Official public JSON-RPC, listed at https://xrpl.org/docs/tutorials/public-servers */
export const XRPL_RPC = 'https://xrplcluster.com/';
export const XRPL_RPC_FALLBACK = 'https://s2.ripple.com:51234/';

/** Official public JSON-RPC, listed at https://xahau.network/docs/features/public-nodes-rpc/ */
export const XAHAU_RPC = 'https://xahau.network/';
export const XAHAU_RPC_FALLBACK = 'https://xahau.org/';

export const GECKO_API = 'https://api.geckoterminal.com/api/v2';

export const RIPPLE_EPOCH = 946_684_800;
export const DROPS = 1_000_000;

export const DEX_NETWORK_KEY = 'opencharts:dex-network';
export const DEX_PAIR_KEY = 'opencharts:dex-pair';

export type DexKind = 'amm' | 'book' | 'geckoterminal';

export interface DexNetwork {
  id: string;
  name: string;
  kind: DexKind;
  /** Official JSON-RPC origin, with trailing slash. */
  rpc?: string;
  rpcFallback?: string;
  /** Native currency code as the ledger JSON-RPC expects it. */
  native: string;
  nativeLabel: string;
}

export const DEX_NETWORKS: readonly DexNetwork[] = [
  { id: 'xrpl', name: 'XRPL', kind: 'amm', rpc: XRPL_RPC, rpcFallback: XRPL_RPC_FALLBACK, native: 'XRP', nativeLabel: 'XRP' },
  { id: 'xahau', name: 'Xahau', kind: 'book', rpc: XAHAU_RPC, rpcFallback: XAHAU_RPC_FALLBACK, native: 'XAH', nativeLabel: 'XAH' },
  { id: 'eth', name: 'Ethereum', kind: 'geckoterminal', native: 'ETH', nativeLabel: 'ETH' },
  { id: 'bsc', name: 'BNB Chain', kind: 'geckoterminal', native: 'BNB', nativeLabel: 'BNB' },
  { id: 'base', name: 'Base', kind: 'geckoterminal', native: 'ETH', nativeLabel: 'ETH' },
  { id: 'solana', name: 'Solana', kind: 'geckoterminal', native: 'SOL', nativeLabel: 'SOL' },
  { id: 'polygon_pos', name: 'Polygon', kind: 'geckoterminal', native: 'POL', nativeLabel: 'POL' },
  { id: 'arbitrum', name: 'Arbitrum', kind: 'geckoterminal', native: 'ETH', nativeLabel: 'ETH' },
  { id: 'avax', name: 'Avalanche', kind: 'geckoterminal', native: 'AVAX', nativeLabel: 'AVAX' },
  { id: 'optimism', name: 'Optimism', kind: 'geckoterminal', native: 'ETH', nativeLabel: 'ETH' },
  { id: 'sui', name: 'Sui', kind: 'geckoterminal', native: 'SUI', nativeLabel: 'SUI' },
  { id: 'tron', name: 'Tron', kind: 'geckoterminal', native: 'TRX', nativeLabel: 'TRX' },
] as const;

const BY_ID = new Map(DEX_NETWORKS.map((n) => [n.id, n]));

export function getDexNetwork(id: string): DexNetwork | undefined {
  return BY_ID.get(id);
}

export function loadDexNetworkId(): string {
  try {
    const raw = localStorage.getItem(DEX_NETWORK_KEY);
    if (raw && BY_ID.has(raw)) return raw;
  } catch {
    /* private mode */
  }
  return 'xrpl';
}

export function saveDexNetworkId(id: string): void {
  try {
    localStorage.setItem(DEX_NETWORK_KEY, id);
  } catch {
    /* private mode */
  }
}

export function loadDexPairId(networkId: string): string | null {
  try {
    const raw = localStorage.getItem(`${DEX_PAIR_KEY}:${networkId}`);
    return raw && raw.length ? raw : null;
  } catch {
    return null;
  }
}

export function saveDexPairId(networkId: string, pairId: string): void {
  try {
    localStorage.setItem(`${DEX_PAIR_KEY}:${networkId}`, pairId);
  } catch {
    /* private mode */
  }
}

/** Ripple / Xahau currency as a short ticker (hex 160-bit codes decode to ASCII). */
export function currencyCode(code: string | undefined): string {
  if (!code) return '';
  if (/^[0-9A-Fa-f]{40}$/.test(code)) {
    const text = hexToAscii(code);
    if (text && /^[A-Za-z0-9]{1,20}$/.test(text)) return text;
  }
  return code;
}

function hexToAscii(hex: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    const n = Number.parseInt(hex.slice(i, i + 2), 16);
    if (n) bytes.push(n);
  }
  return String.fromCharCode(...bytes);
}

export function rippleToUnix(rippleTime: number): number {
  return rippleTime + RIPPLE_EPOCH;
}

export function unixToRipple(unix: number): number {
  return unix - RIPPLE_EPOCH;
}

export type LedgerAmount = string | { currency: string; issuer?: string; value: string };

export function amountValue(amount: LedgerAmount | undefined, native: string): { currency: string; issuer?: string; value: number } | null {
  if (amount == null) return null;
  if (typeof amount === 'string') {
    const drops = Number(amount);
    if (!Number.isFinite(drops)) return null;
    return { currency: native, value: drops / DROPS };
  }
  const value = Number(amount.value);
  if (!Number.isFinite(value)) return null;
  return { currency: currencyCode(amount.currency), issuer: amount.issuer, value };
}

export function isNativeAmount(amount: LedgerAmount, native: string): boolean {
  return typeof amount === 'string' || (typeof amount === 'object' && amount.currency === native && !amount.issuer);
}
