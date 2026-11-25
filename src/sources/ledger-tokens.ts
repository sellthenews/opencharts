// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

/** Classic XRP Ledger / Xahau address. */
export const CLASSIC_ADDRESS_RE = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;

/** Shared DEX pair reference; kept here to avoid a cycle with dex.ts. */
export interface DexPairRef {
  id: string;
  networkId: string;
  kind: 'amm' | 'book' | 'gt';
  label: string;
  base: string;
  quote: string;
  native: string;
  account?: string;
  address?: string;
  baseIssuer?: string;
  quoteIssuer?: string;
  /** When set, OHLCV from GeckoTerminal is inverted (e.g. RLUSD/XRP → XRP/RLUSD). */
  invert?: boolean;
}

export interface ParsedLedgerToken {
  currency: string;
  issuer: string;
}

export interface ParsedGtAddress {
  currency: string;
  issuer: string;
  quote: string;
}

/** Encode an XRPL / Xahau currency code the way GeckoTerminal and the ledger expect. */
export function encodeXrplCurrency(code: string): string {
  const trimmed = code.trim();
  if (/^[0-9A-Fa-f]{40}$/.test(trimmed)) return trimmed.toUpperCase();
  if (/^[A-Za-z0-9]{3}$/.test(trimmed)) return trimmed.toUpperCase();
  const bytes = new TextEncoder().encode(trimmed);
  if (!bytes.length || bytes.length > 20) return trimmed;
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return (hex + '00'.repeat(20 - bytes.length)).toUpperCase();
}

export function decodeXrplCurrency(code: string): string {
  if (/^[0-9A-Fa-f]{40}$/.test(code)) {
    const bytes: number[] = [];
    for (let i = 0; i < code.length; i += 2) {
      const n = Number.parseInt(code.slice(i, i + 2), 16);
      if (n) bytes.push(n);
    }
    const text = String.fromCharCode(...bytes);
    if (text && /^[A-Za-z0-9]{1,20}$/.test(text)) return text;
  }
  return code;
}

/** GeckoTerminal XRPL pool address: `CURRENCY.issuer_QUOTE`. */
export function geckoXrplPoolAddress(currency: string, issuer: string, quote = 'XRP'): string {
  const cur = encodeXrplCurrency(currency);
  return `${cur}.${issuer}_${quote}`;
}

export function parseGeckoXrplAddress(address: string): ParsedGtAddress | null {
  const raw = address.trim();
  const split = raw.lastIndexOf('_');
  if (split <= 0 || split === raw.length - 1) return null;
  const quote = raw.slice(split + 1);
  const left = raw.slice(0, split);
  const dot = left.indexOf('.');
  if (dot <= 0) return null;
  const currency = decodeXrplCurrency(left.slice(0, dot));
  const issuer = left.slice(dot + 1);
  if (!CLASSIC_ADDRESS_RE.test(issuer)) return null;
  if (!quote) return null;
  return { currency, issuer, quote };
}

/**
 * Parse a pasted token: `SOLO.r…`, `SOLO r…`, `SOLO+r…`, a 160-bit hex + issuer,
 * or a GeckoTerminal XRPL pool address. A bare classic address is not a token.
 */
export function parseLedgerTokenInput(query: string): ParsedLedgerToken | null {
  const q = query.trim();
  if (!q) return null;
  const gt = parseGeckoXrplAddress(q);
  if (gt) return { currency: gt.currency, issuer: gt.issuer };

  const dotted = /^([A-Za-z0-9]{3,40})[.+](r[1-9A-HJ-NP-Za-km-z]{24,34})$/.exec(q);
  if (dotted) return { currency: decodeXrplCurrency(dotted[1]!), issuer: dotted[2]! };

  const spaced = /^([A-Za-z0-9]{3,40})\s+(r[1-9A-HJ-NP-Za-km-z]{24,34})$/.exec(q);
  if (spaced) return { currency: decodeXrplCurrency(spaced[1]!), issuer: spaced[2]! };

  return null;
}

export function parseClassicAddress(query: string): string | null {
  const q = query.trim();
  return CLASSIC_ADDRESS_RE.test(q) ? q : null;
}

export function invertCandles<T extends { open: number; high: number; low: number; close: number; volume: number; time: number }>(
  candles: T[],
): T[] {
  const out: T[] = [];
  for (const c of candles) {
    if (!(c.open > 0) || !(c.close > 0) || !(c.high > 0) || !(c.low > 0)) continue;
    const open = 1 / c.open;
    const close = 1 / c.close;
    const high = 1 / c.low;
    const low = 1 / c.high;
    out.push({
      ...c,
      open,
      close,
      high: Math.max(open, close, high),
      low: Math.min(open, close, low),
      volume: c.volume * ((c.open + c.close) / 2),
    });
  }
  return out;
}

const RLUSD_ISSUER = 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De';
const RLUSD_HEX = '524C555344000000000000000000000000000000';
const RLUSD_AMM = 'rhWTXC2m2gGGA9WozUaoMm6kLAVPb1tcS3';
const BITSTAMP = 'rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B';
const GATEHUB = 'rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq';
const EVR_ISSUER = 'rEvernodee8dJLaFsujS6q1EiXvZYmHXr8';
const CLV_ISSUER = 'rK8rYUs6gFH4QJ9JS814EF9112gKuYZZT';

function gtPair(
  networkId: string,
  address: string,
  label: string,
  base: string,
  quote: string,
  opts?: { invert?: boolean; quoteIssuer?: string; baseIssuer?: string; account?: string },
): DexPairRef {
  const invert = Boolean(opts?.invert);
  const id = `gt:${networkId}:${address}${invert ? ':inv' : ''}`;
  return {
    id,
    networkId,
    kind: 'gt',
    label,
    base,
    quote,
    native: address,
    address,
    invert,
    quoteIssuer: opts?.quoteIssuer,
    baseIssuer: opts?.baseIssuer,
    account: opts?.account,
  };
}

function bookPair(
  networkId: string,
  base: string,
  quote: string,
  quoteIssuer: string,
  label?: string,
): DexPairRef {
  const id = `book:${networkId}:${base}:${quote}.${quoteIssuer}`;
  return {
    id,
    networkId,
    kind: 'book',
    label: label ?? `${base}/${quote}`,
    base,
    quote,
    native: `${quote}.${quoteIssuer}`,
    quoteIssuer,
  };
}

const RLUSD_ADDR = `${RLUSD_HEX}.${RLUSD_ISSUER}_XRP`;

/** Default XRPL chart: kept as the AMM id so existing bookmarks and tests stay valid. */
export const XRPL_DEFAULT_PAIR: DexPairRef = {
  id: `amm:xrpl:${RLUSD_AMM}`,
  networkId: 'xrpl',
  kind: 'amm',
  label: 'XRP/RLUSD',
  base: 'XRP',
  quote: 'RLUSD',
  native: RLUSD_AMM,
  account: RLUSD_AMM,
  quoteIssuer: RLUSD_ISSUER,
  address: RLUSD_ADDR,
  invert: true,
};

export const XAHAU_DEFAULT_PAIR: DexPairRef = bookPair('xahau', 'XAH', 'EVR', EVR_ISSUER);

export const ETH_DEFAULT_PAIR: DexPairRef = {
  id: 'gt:eth:0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
  networkId: 'eth',
  kind: 'gt',
  label: 'WETH/USDC',
  base: 'WETH',
  quote: 'USDC',
  native: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
  address: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
};

/** Well-known Orca SOL/USDC whirlpool, used as a stable Solana default. */
export const SOLANA_DEFAULT_PAIR: DexPairRef = {
  id: 'gt:solana:Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
  networkId: 'solana',
  kind: 'gt',
  label: 'SOL/USDC',
  base: 'SOL',
  quote: 'USDC',
  native: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
  address: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
};

export const CURATED_XRPL_PAIRS: DexPairRef[] = [
  XRPL_DEFAULT_PAIR,
  gtPair('xrpl', `USD.${BITSTAMP}_XRP`, 'XRP/USD (Bitstamp)', 'XRP', 'USD', { invert: true, quoteIssuer: BITSTAMP }),
  gtPair('xrpl', `USD.${GATEHUB}_XRP`, 'XRP/USD (GateHub)', 'XRP', 'USD', { invert: true, quoteIssuer: GATEHUB }),
  gtPair('xrpl', '534F4C4F00000000000000000000000000000000.rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz_XRP', 'SOLO/XRP', 'SOLO', 'XRP', {
    baseIssuer: 'rsoLo2S1kiGeCcn6hCUXVrCpGMWLrRrLZz',
  }),
  gtPair('xrpl', '434F524500000000000000000000000000000000.rcoreNywaoz2ZCQ8Lg2EbSLnGuRBmun6D_XRP', 'CORE/XRP', 'CORE', 'XRP', {
    baseIssuer: 'rcoreNywaoz2ZCQ8Lg2EbSLnGuRBmun6D',
  }),
  gtPair('xrpl', 'XPM.rXPMxBeefHGxx2K7g5qmmWq3gFsgawkoa_XRP', 'XPM/XRP', 'XPM', 'XRP', {
    baseIssuer: 'rXPMxBeefHGxx2K7g5qmmWq3gFsgawkoa',
  }),
  gtPair('xrpl', '50484E4958000000000000000000000000000000.rDFXbW2ZZCG5WgPtqwNiA2xZokLMm9ivmN_XRP', 'PHNIX/XRP', 'PHNIX', 'XRP', {
    baseIssuer: 'rDFXbW2ZZCG5WgPtqwNiA2xZokLMm9ivmN',
  }),
  gtPair('xrpl', '524E544200000000000000000000000000000000.rBxZbDRD7nsXjETqzEoqq54U5Yc5qaAv2X_XRP', 'RNTB/XRP', 'RNTB', 'XRP', {
    baseIssuer: 'rBxZbDRD7nsXjETqzEoqq54U5Yc5qaAv2X',
  }),
  gtPair('xrpl', '41524D5900000000000000000000000000000000.rGG3wQ4kUzd7Jnmk1n5NWPZjjut62kCBfC_XRP', 'ARMY/XRP', 'ARMY', 'XRP', {
    baseIssuer: 'rGG3wQ4kUzd7Jnmk1n5NWPZjjut62kCBfC',
  }),
  gtPair('xrpl', '46555A5A59000000000000000000000000000000.rhCAT4hRdi2Y9puNdkpMzxrdKa5wkppR62_XRP', 'FUZZY/XRP', 'FUZZY', 'XRP', {
    baseIssuer: 'rhCAT4hRdi2Y9puNdkpMzxrdKa5wkppR62',
  }),
  gtPair('xrpl', '4F70756C656E6365000000000000000000000000.rs5wxrBTSErywDDfPs5NY4Zorrca5QMGVd_XRP', 'Opulence/XRP', 'Opulence', 'XRP', {
    baseIssuer: 'rs5wxrBTSErywDDfPs5NY4Zorrca5QMGVd',
  }),
  gtPair('xrpl', 'XAH.rswh1fvyLqHizBS2awu1vs6QcmwTBd9qiv_XRP', 'XAH (IOU)/XRP', 'XAH', 'XRP', {
    baseIssuer: 'rswh1fvyLqHizBS2awu1vs6QcmwTBd9qiv',
  }),
  gtPair('xrpl', 'CSC.rCSCManTZ8ME9EoLrSHHYKW8PPwWMgkwr_XRP', 'CSC/XRP', 'CSC', 'XRP', {
    baseIssuer: 'rCSCManTZ8ME9EoLrSHHYKW8PPwWMgkwr',
  }),
];

export const CURATED_XAHAU_PAIRS: DexPairRef[] = [
  XAHAU_DEFAULT_PAIR,
  bookPair('xahau', 'XAH', 'CLV', CLV_ISSUER),
  bookPair('xahau', 'XAH', 'USD', GATEHUB, 'XAH/USD (GateHub)'),
];

export const DEFAULT_PAIRS: Record<string, DexPairRef> = {
  xrpl: XRPL_DEFAULT_PAIR,
  xahau: XAHAU_DEFAULT_PAIR,
  eth: ETH_DEFAULT_PAIR,
  solana: SOLANA_DEFAULT_PAIR,
};

export function curatedPairsFor(networkId: string): DexPairRef[] {
  if (networkId === 'xrpl') return CURATED_XRPL_PAIRS;
  if (networkId === 'xahau') return CURATED_XAHAU_PAIRS;
  const def = DEFAULT_PAIRS[networkId];
  return def ? [def] : [];
}

export function pairIdentityKey(pair: DexPairRef): string {
  const addr = pair.address || (pair.kind === 'gt' ? pair.native : '');
  const parsed = addr ? parseGeckoXrplAddress(addr) : null;
  if (parsed) {
    const a = parsed.currency.toLowerCase();
    const b = parsed.quote.toLowerCase();
    const [left, right] = a < b ? [a, parsed.issuer, b] : [b, parsed.issuer, a];
    return `${pair.networkId}:tok:${left}:${parsed.issuer}:${right}`;
  }
  if (pair.quoteIssuer || pair.baseIssuer) {
    const a = pair.base.toLowerCase();
    const b = pair.quote.toLowerCase();
    const issuer = (pair.quoteIssuer || pair.baseIssuer || '').toLowerCase();
    const [left, right] = a < b ? [a, issuer, b] : [b, issuer, a];
    return `${pair.networkId}:tok:${left}:${issuer}:${right}`;
  }
  if (pair.account) return `${pair.networkId}:acc:${pair.account.toLowerCase()}`;
  if (pair.address) return `${pair.networkId}:addr:${pair.address.toLowerCase()}`;
  return pair.id.toLowerCase();
}

export function mergeDexPairs(primary: DexPairRef[], extra: DexPairRef[]): DexPairRef[] {
  const seen = new Set<string>();
  const out: DexPairRef[] = [];
  for (const pair of [...primary, ...extra]) {
    const key = pairIdentityKey(pair);
    if (seen.has(key) || seen.has(pair.id.toLowerCase())) continue;
    seen.add(key);
    seen.add(pair.id.toLowerCase());
    out.push(pair);
  }
  return out;
}

export function pairFromPastedToken(networkId: string, native: string, parsed: ParsedLedgerToken): DexPairRef {
  if (networkId === 'xrpl') {
    const address = geckoXrplPoolAddress(parsed.currency, parsed.issuer, native);
    const ticker = decodeXrplCurrency(parsed.currency);
    return gtPair('xrpl', address, `${ticker}/${native}`, ticker, native, { baseIssuer: parsed.issuer });
  }
  return bookPair(networkId, native, decodeXrplCurrency(parsed.currency), parsed.issuer);
}

export function labelFromGtAddress(_networkId: string, address: string, invert = false): { base: string; quote: string; label: string; issuer?: string } {
  const parsed = parseGeckoXrplAddress(address);
  if (parsed) {
    const base = invert ? parsed.quote : parsed.currency;
    const quote = invert ? parsed.currency : parsed.quote;
    return { base, quote, label: `${base}/${quote}`, issuer: parsed.issuer };
  }
  return { base: 'BASE', quote: 'QUOTE', label: address.slice(0, 10) + '…' };
}
