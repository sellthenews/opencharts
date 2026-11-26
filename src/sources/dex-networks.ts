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
  { id: 'sui-network', name: 'Sui', kind: 'geckoterminal', native: 'SUI', nativeLabel: 'SUI' },
  { id: 'tron', name: 'Tron', kind: 'geckoterminal', native: 'TRX', nativeLabel: 'TRX' },
  { id: 'ton', name: 'TON', kind: 'geckoterminal', native: 'TON', nativeLabel: 'TON' },
  { id: 'aptos', name: 'Aptos', kind: 'geckoterminal', native: 'APT', nativeLabel: 'APT' },
  { id: 'near', name: 'Near', kind: 'geckoterminal', native: 'NEAR', nativeLabel: 'NEAR' },
  { id: 'sei-evm', name: 'Sei', kind: 'geckoterminal', native: 'SEI', nativeLabel: 'SEI' },
  { id: 'hyperevm', name: 'HyperEVM', kind: 'geckoterminal', native: 'HYPE', nativeLabel: 'HYPE' },
  { id: 'hyperliquid', name: 'Hyperliquid', kind: 'geckoterminal', native: 'HYPE', nativeLabel: 'HYPE' },
  { id: 'berachain', name: 'Berachain', kind: 'geckoterminal', native: 'BERA', nativeLabel: 'BERA' },
  { id: 'sonic', name: 'Sonic', kind: 'geckoterminal', native: 'S', nativeLabel: 'S' },
  { id: 'injective', name: 'Injective', kind: 'geckoterminal', native: 'INJ', nativeLabel: 'INJ' },
  { id: 'linea', name: 'Linea', kind: 'geckoterminal', native: 'ETH', nativeLabel: 'ETH' },
  { id: 'zksync', name: 'zkSync', kind: 'geckoterminal', native: 'ETH', nativeLabel: 'ETH' },
  { id: 'mantle', name: 'Mantle', kind: 'geckoterminal', native: 'MNT', nativeLabel: 'MNT' },
  { id: 'scroll', name: 'Scroll', kind: 'geckoterminal', native: 'ETH', nativeLabel: 'ETH' },
  { id: 'unichain', name: 'Unichain', kind: 'geckoterminal', native: 'ETH', nativeLabel: 'ETH' },
  { id: 'world-chain', name: 'World Chain', kind: 'geckoterminal', native: 'ETH', nativeLabel: 'ETH' },
  { id: 'ink', name: 'Ink', kind: 'geckoterminal', native: 'ETH', nativeLabel: 'ETH' },
  { id: 'cro', name: 'Cronos', kind: 'geckoterminal', native: 'CRO', nativeLabel: 'CRO' },
] as const;

const BY_ID = new Map(DEX_NETWORKS.map((n) => [n.id, n]));

export function getDexNetwork(id: string): DexNetwork | undefined {
  return BY_ID.get(id);
}

/** GeckoTerminal's id for Sui is `sui-network`; older builds stored `sui`. */
function migrateDexNetworkId(raw: string | null): string | null {
  if (raw === 'sui') return 'sui-network';
  return raw;
}

function migrateSuiPairStorage(): void {
  try {
    if (localStorage.getItem(DEX_NETWORK_KEY) === 'sui') {
      localStorage.setItem(DEX_NETWORK_KEY, 'sui-network');
    }
    const oldPair = localStorage.getItem(`${DEX_PAIR_KEY}:sui`);
    if (oldPair && !localStorage.getItem(`${DEX_PAIR_KEY}:sui-network`)) {
      localStorage.setItem(`${DEX_PAIR_KEY}:sui-network`, oldPair.replace(/^gt:sui:/, 'gt:sui-network:'));
    }
  } catch {
    /* private mode */
  }
}

export function loadDexNetworkId(): string {
  try {
    migrateSuiPairStorage();
    const raw = migrateDexNetworkId(localStorage.getItem(DEX_NETWORK_KEY));
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
