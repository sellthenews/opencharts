// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

/**
 * Plain transaction JSON for the XRP Ledger and Xahau. Nothing here signs or sends:
 * the JSON goes to Xaman, which shows it to the user and signs it on their phone.
 */

import { encodeXrplCurrency } from '../sources/ledger-tokens';

export type LedgerId = 'xrpl' | 'xahau';

export const XAHAU_NETWORK_ID = 21337;

export interface Asset {
  /** 3-letter code, 40-hex code, or the native code (XRP / XAH). */
  currency: string;
  issuer?: string;
}

export type Amount = string | { currency: string; issuer: string; value: string };

export type TxJson = Record<string, unknown> & { TransactionType: string };

export const NATIVE: Record<LedgerId, string> = { xrpl: 'XRP', xahau: 'XAH' };

export const OFFER_FLAGS = { passive: 0x00010000, immediateOrCancel: 0x00020000, fillOrKill: 0x00040000, sell: 0x00080000 } as const;
export const PAYMENT_FLAGS = { noRippleDirect: 0x00010000, partialPayment: 0x00020000, limitQuality: 0x00040000 } as const;
export const TRUSTSET_FLAGS = { setNoRipple: 0x00020000 } as const;
export const AMM_DEPOSIT_FLAGS = { lpToken: 0x00010000, singleAsset: 0x00080000, twoAsset: 0x00100000 } as const;
export const AMM_WITHDRAW_FLAGS = { lpToken: 0x00010000, withdrawAll: 0x00020000, singleAsset: 0x00080000, twoAsset: 0x00100000 } as const;

export function isNative(asset: Asset, ledger: LedgerId): boolean {
  return !asset.issuer && (asset.currency === NATIVE[ledger] || asset.currency === 'XRP' || asset.currency === 'XAH');
}

/** Ledger amounts carry at most 15 significant digits. */
export function formatValue(value: number): string {
  if (!Number.isFinite(value) || value <= 0) throw new Error('Amount must be greater than zero');
  const text = Number(value.toPrecision(15)).toString();
  if (!/e/i.test(text)) return text;
  const [mant, expText] = text.toLowerCase().split('e') as [string, string];
  return `${mant}e${Number(expText)}`;
}

/** Native amounts are integer drops (1 XRP or 1 XAH = 1,000,000 drops). */
export function toDrops(value: number): string {
  if (!Number.isFinite(value) || value <= 0) throw new Error('Amount must be greater than zero');
  const drops = Math.floor(value * 1_000_000 + 1e-9);
  if (drops < 1) throw new Error('Amount is below one drop');
  return String(drops);
}

export function amount(asset: Asset, value: number, ledger: LedgerId): Amount {
  if (isNative(asset, ledger)) return toDrops(value);
  if (!asset.issuer) throw new Error(`Token ${asset.currency} needs an issuer`);
  return { currency: encodeXrplCurrency(asset.currency), issuer: asset.issuer, value: formatValue(value) };
}

export function assetSpec(asset: Asset, ledger: LedgerId): Record<string, string> {
  if (isNative(asset, ledger)) return { currency: NATIVE[ledger] === 'XAH' ? 'XAH' : 'XRP' };
  return { currency: encodeXrplCurrency(asset.currency), issuer: asset.issuer ?? '' };
}

/** The XRPL wire format names native currency "XRP" on both ledgers. */
function ammAsset(asset: Asset, ledger: LedgerId): Record<string, string> {
  if (isNative(asset, ledger)) return { currency: 'XRP' };
  return { currency: encodeXrplCurrency(asset.currency), issuer: asset.issuer ?? '' };
}

function base(type: string, account: string, ledger: LedgerId, flags = 0): TxJson {
  const tx: TxJson = { TransactionType: type, Account: account };
  if (flags) tx.Flags = flags;
  if (ledger === 'xahau') tx.NetworkID = XAHAU_NETWORK_ID;
  return tx;
}

export interface OrderInput {
  ledger: LedgerId;
  account: string;
  side: 'buy' | 'sell';
  base: Asset;
  quote: Asset;
  /** Amount of the base asset. */
  size: number;
  /** Price in quote per base. For market orders this is the worst price allowed (after slippage). */
  price: number;
  type: 'limit' | 'market';
  passive?: boolean;
}

/**
 * Limit or market order as an OfferCreate. Buy: you get base, you pay quote.
 * Sell: you give base, you get quote; tfSell lets you get more than asked.
 * Market: immediate-or-cancel at the worst allowed price, nothing stays on the book.
 */
export function buildOffer(o: OrderInput): TxJson {
  if (!(o.size > 0) || !(o.price > 0)) throw new Error('Size and price must be greater than zero');
  let flags = 0;
  if (o.type === 'market') flags |= OFFER_FLAGS.immediateOrCancel;
  if (o.side === 'sell') flags |= OFFER_FLAGS.sell;
  if (o.passive && o.type === 'limit') flags |= OFFER_FLAGS.passive;
  const tx = base('OfferCreate', o.account, o.ledger, flags);
  const baseAmt = amount(o.base, o.size, o.ledger);
  const quoteAmt = amount(o.quote, o.size * o.price, o.ledger);
  if (o.side === 'buy') {
    tx.TakerPays = baseAmt;
    tx.TakerGets = quoteAmt;
  } else {
    tx.TakerGets = baseAmt;
    tx.TakerPays = quoteAmt;
  }
  return tx;
}

export function buildCancel(ledger: LedgerId, account: string, offerSequence: number): TxJson {
  const tx = base('OfferCancel', account, ledger);
  tx.OfferSequence = offerSequence;
  return tx;
}

/** Trust line to hold an issued token. Limit 0 removes an empty line. */
export function buildTrustSet(ledger: LedgerId, account: string, token: Asset, limit: number): TxJson {
  if (!token.issuer) throw new Error('A trust line needs an issuer');
  const tx = base('TrustSet', account, ledger, TRUSTSET_FLAGS.setNoRipple);
  tx.LimitAmount = { currency: encodeXrplCurrency(token.currency), issuer: token.issuer, value: limit > 0 ? formatValue(limit) : '0' };
  return tx;
}

export interface SwapInput {
  ledger: LedgerId;
  account: string;
  from: Asset;
  to: Asset;
  /** Exact amount to receive. */
  receive: number;
  /** Most you are willing to spend (estimate plus slippage). */
  sendMax: number;
  paths?: unknown[];
}

/** Cross-currency swap to yourself: receive exactly `receive`, spend at most `sendMax`. */
export function buildSwap(s: SwapInput): TxJson {
  const tx = base('Payment', s.account, s.ledger);
  tx.Destination = s.account;
  tx.Amount = amount(s.to, s.receive, s.ledger);
  tx.SendMax = amount(s.from, s.sendMax, s.ledger);
  if (s.paths && s.paths.length) tx.Paths = s.paths;
  return tx;
}

export function buildAmmDeposit(
  account: string,
  a: Asset,
  b: Asset,
  amountA: number,
  amountB: number | null,
): TxJson {
  const ledger: LedgerId = 'xrpl';
  const tx = base('AMMDeposit', account, ledger, amountB != null ? AMM_DEPOSIT_FLAGS.twoAsset : AMM_DEPOSIT_FLAGS.singleAsset);
  tx.Asset = ammAsset(a, ledger);
  tx.Asset2 = ammAsset(b, ledger);
  tx.Amount = amount(a, amountA, ledger);
  if (amountB != null) tx.Amount2 = amount(b, amountB, ledger);
  return tx;
}

export function buildAmmWithdraw(account: string, a: Asset, b: Asset, mode: { all: true } | { lpTokens: number; lpCurrency: string; lpIssuer: string }): TxJson {
  const ledger: LedgerId = 'xrpl';
  if ('all' in mode) {
    const tx = base('AMMWithdraw', account, ledger, AMM_WITHDRAW_FLAGS.withdrawAll);
    tx.Asset = ammAsset(a, ledger);
    tx.Asset2 = ammAsset(b, ledger);
    return tx;
  }
  const tx = base('AMMWithdraw', account, ledger, AMM_WITHDRAW_FLAGS.lpToken);
  tx.Asset = ammAsset(a, ledger);
  tx.Asset2 = ammAsset(b, ledger);
  tx.LPTokenIn = { currency: mode.lpCurrency, issuer: mode.lpIssuer, value: formatValue(mode.lpTokens) };
  return tx;
}

export function buildAmmCreate(account: string, a: Asset, b: Asset, amountA: number, amountB: number, feeBps: number): TxJson {
  const ledger: LedgerId = 'xrpl';
  const tx = base('AMMCreate', account, ledger);
  tx.Amount = amount(a, amountA, ledger);
  tx.Amount2 = amount(b, amountB, ledger);
  // TradingFee is in units of 1/100,000; 1 bps = 10. Max 1% = 1000.
  tx.TradingFee = Math.max(0, Math.min(1000, Math.round(feeBps * 10)));
  return tx;
}

/** Expire a transaction a little over a minute after it is prepared, instead of letting it hang. */
export function withLastLedger(tx: TxJson, validatedIndex: number, margin = 20): TxJson {
  return { ...tx, LastLedgerSequence: validatedIndex + margin };
}

export function explorerTxUrl(ledger: LedgerId, hash: string): string {
  return ledger === 'xahau' ? `https://xahauexplorer.com/explorer/${hash}` : `https://livenet.xrpl.org/transactions/${hash}`;
}

export function explorerAccountUrl(ledger: LedgerId, account: string): string {
  return ledger === 'xahau' ? `https://xahauexplorer.com/explorer/${account}` : `https://livenet.xrpl.org/accounts/${account}`;
}
