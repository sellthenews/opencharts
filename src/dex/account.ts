// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { ledgerRpc } from '../sources/ledger-rpc';
import { amountValue, getDexNetwork, rippleToUnix, type LedgerAmount } from '../sources/dex-networks';
import { decodeXrplCurrency } from '../sources/ledger-tokens';
import type { LedgerId } from './tx';

export interface Balance {
  currency: string;
  issuer?: string;
  value: number;
  limit?: number;
  noRipple?: boolean;
  frozen?: boolean;
}

export interface AccountSnapshot {
  exists: boolean;
  native: number;
  /** Native locked by the base and owner reserves. */
  reserve: number;
  ownerCount: number;
  lines: Balance[];
}

export interface OpenOffer {
  seq: number;
  gets: { currency: string; issuer?: string; value: number };
  pays: { currency: string; issuer?: string; value: number };
  flags: number;
}

export interface HistoryRow {
  hash: string;
  type: string;
  result: string;
  time: number;
  summary: string;
}

/** Reserves at the time of writing: XRPL 1 + 0.2 per object; Xahau 1 + 0.2. Read live from server_info when possible. */
const RESERVE: Record<LedgerId, { base: number; inc: number }> = { xrpl: { base: 1, inc: 0.2 }, xahau: { base: 1, inc: 0.2 } };

function net(ledger: LedgerId) {
  const n = getDexNetwork(ledger);
  if (!n) throw new Error('Unknown ledger');
  return n;
}

export async function fetchReserves(ledger: LedgerId): Promise<{ base: number; inc: number }> {
  try {
    const res = await ledgerRpc<{ info?: { validated_ledger?: { reserve_base_xrp?: number; reserve_inc_xrp?: number } } }>(net(ledger), 'server_info', {});
    const v = res.info?.validated_ledger;
    if (v && Number.isFinite(v.reserve_base_xrp) && Number.isFinite(v.reserve_inc_xrp)) return { base: Number(v.reserve_base_xrp), inc: Number(v.reserve_inc_xrp) };
  } catch {
    /* fall back to the defaults */
  }
  return RESERVE[ledger];
}

export async function fetchAccount(ledger: LedgerId, account: string): Promise<AccountSnapshot> {
  const n = net(ledger);
  let info: { account_data?: { Balance?: string; OwnerCount?: number } };
  try {
    info = await ledgerRpc(n, 'account_info', { account, ledger_index: 'validated' });
  } catch (err) {
    if (/actNotFound|Account not found/i.test(String(err instanceof Error ? err.message : err))) {
      return { exists: false, native: 0, reserve: 0, ownerCount: 0, lines: [] };
    }
    throw err;
  }
  const [linesRes, reserves] = await Promise.all([
    ledgerRpc<{ lines?: Array<{ currency: string; account: string; balance: string; limit: string; no_ripple?: boolean; freeze?: boolean; freeze_peer?: boolean }> }>(n, 'account_lines', {
      account,
      ledger_index: 'validated',
      limit: 400,
    }),
    fetchReserves(ledger),
  ]);
  const ownerCount = Number(info.account_data?.OwnerCount ?? 0);
  return {
    exists: true,
    native: Number(info.account_data?.Balance ?? 0) / 1_000_000,
    ownerCount,
    reserve: reserves.base + reserves.inc * ownerCount,
    lines: (linesRes.lines ?? []).map((l) => ({
      currency: l.currency,
      issuer: l.account,
      value: Number(l.balance),
      limit: Number(l.limit),
      noRipple: l.no_ripple,
      frozen: Boolean(l.freeze || l.freeze_peer),
    })),
  };
}

export async function fetchOpenOffers(ledger: LedgerId, account: string): Promise<OpenOffer[]> {
  const n = net(ledger);
  const res = await ledgerRpc<{ offers?: Array<{ seq: number; flags: number; taker_gets: LedgerAmount; taker_pays: LedgerAmount }> }>(n, 'account_offers', {
    account,
    ledger_index: 'validated',
    limit: 200,
  });
  const out: OpenOffer[] = [];
  for (const o of res.offers ?? []) {
    const gets = amountValue(o.taker_gets, n.native);
    const pays = amountValue(o.taker_pays, n.native);
    if (gets && pays) out.push({ seq: o.seq, flags: o.flags, gets, pays });
  }
  return out;
}

function fmtAmount(a: LedgerAmount | undefined, native: string): string {
  const v = amountValue(a, native);
  if (!v) return '';
  return `${Number(v.value.toPrecision(6))} ${decodeXrplCurrency(v.currency)}`;
}

/** Recent DEX-related transactions of an account. */
export async function fetchHistory(ledger: LedgerId, account: string, limit = 40): Promise<HistoryRow[]> {
  const n = net(ledger);
  const res = await ledgerRpc<{ transactions?: Array<{ tx?: Record<string, unknown>; tx_json?: Record<string, unknown>; hash?: string; meta?: { TransactionResult?: string; delivered_amount?: LedgerAmount } }> }>(
    n,
    'account_tx',
    { account, limit, ledger_index_min: -1, ledger_index_max: -1, forward: false },
  );
  const rows: HistoryRow[] = [];
  for (const item of res.transactions ?? []) {
    const tx = (item.tx_json ?? item.tx ?? {}) as Record<string, unknown>;
    const type = String(tx.TransactionType ?? '');
    if (!/^(OfferCreate|OfferCancel|Payment|TrustSet|AMMDeposit|AMMWithdraw|AMMCreate|AMMVote)$/.test(type)) continue;
    const result = String(item.meta?.TransactionResult ?? '');
    let summary = '';
    if (type === 'OfferCreate') summary = `${fmtAmount(tx.TakerGets as LedgerAmount, n.native)} → ${fmtAmount(tx.TakerPays as LedgerAmount, n.native)}`;
    else if (type === 'Payment') {
      // Never trust Amount on partial payments: the delivered amount is what arrived.
      const delivered = item.meta?.delivered_amount ?? (tx.Amount as LedgerAmount);
      summary = `${tx.Destination === account ? '←' : '→'} ${fmtAmount(delivered, n.native)}`;
    } else if (type === 'TrustSet') {
      const lim = tx.LimitAmount as { currency?: string; value?: string } | undefined;
      summary = lim ? `${decodeXrplCurrency(lim.currency ?? '')} ${lim.value}` : '';
    } else if (type === 'OfferCancel') summary = `#${tx.OfferSequence}`;
    else summary = fmtAmount(tx.Amount as LedgerAmount, n.native);
    rows.push({
      hash: String(item.hash ?? tx.hash ?? ''),
      type,
      result,
      time: typeof tx.date === 'number' ? rippleToUnix(tx.date) : 0,
      summary,
    });
  }
  return rows;
}

export interface PathQuote {
  sourceAmount: number;
  paths: unknown[];
}

/** Ask the ledger for the cheapest way to deliver `receive` of `to`, paying with `from`. */
export async function findPath(
  ledger: LedgerId,
  account: string,
  from: { currency: string; issuer?: string },
  destinationAmount: string | { currency: string; issuer: string; value: string },
): Promise<PathQuote | null> {
  const n = net(ledger);
  const nativeCode = ledger === 'xahau' ? 'XAH' : 'XRP';
  const sourceCurrencies = [from.issuer ? { currency: from.currency, issuer: from.issuer } : { currency: ledger === 'xahau' ? nativeCode : 'XRP' }];
  const res = await ledgerRpc<{ alternatives?: Array<{ source_amount: LedgerAmount; paths_computed?: unknown[] }> }>(n, 'ripple_path_find', {
    source_account: account,
    destination_account: account,
    destination_amount: destinationAmount,
    source_currencies: sourceCurrencies,
    ledger_index: 'validated',
  });
  let best: PathQuote | null = null;
  for (const alt of res.alternatives ?? []) {
    const v = amountValue(alt.source_amount, n.native);
    if (!v) continue;
    if (!best || v.value < best.sourceAmount) best = { sourceAmount: v.value, paths: alt.paths_computed ?? [] };
  }
  return best;
}
