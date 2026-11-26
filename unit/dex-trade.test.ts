// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  OFFER_FLAGS,
  buildAmmDeposit,
  buildAmmWithdraw,
  buildCancel,
  buildOffer,
  buildSwap,
  buildTrustSet,
  formatValue,
  toDrops,
  withLastLedger,
} from '../src/dex/tx.ts';
import { depthCurve, estimateFill, levelsFromOffers, spread } from '../src/dex/book.ts';
import { lookalikeWarning } from '../src/dex/issuers.ts';

const ACC = 'rJJKbp9fXL9AR4kZwVzHLNkUCvY7D1kjCa';
const RLUSD = { currency: 'RLUSD', issuer: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De' };
const RLUSD_HEX = '524C555344000000000000000000000000000000';

test('amounts: drops are integers, token values keep 15 digits', () => {
  assert.equal(toDrops(1.5), '1500000');
  assert.equal(toDrops(0.000001), '1');
  assert.throws(() => toDrops(0.0000001));
  assert.equal(formatValue(1 / 3), '0.333333333333333');
  assert.throws(() => formatValue(0));
});

test('limit buy and market sell offers', () => {
  const buy = buildOffer({ ledger: 'xrpl', account: ACC, side: 'buy', base: { currency: 'XRP' }, quote: RLUSD, size: 10, price: 0.5, type: 'limit' });
  assert.equal(buy.TransactionType, 'OfferCreate');
  assert.equal(buy.TakerPays, '10000000');
  assert.deepEqual(buy.TakerGets, { currency: RLUSD_HEX, issuer: RLUSD.issuer, value: '5' });
  assert.equal(buy.Flags, undefined);
  assert.equal(buy.NetworkID, undefined);

  const sell = buildOffer({ ledger: 'xahau', account: ACC, side: 'sell', base: { currency: 'EVR', issuer: 'rEvernodee8dJLaFsujS6q1EiXvZYmHXr8' }, quote: { currency: 'XAH' }, size: 2, price: 3, type: 'market' });
  assert.equal(sell.Flags, OFFER_FLAGS.immediateOrCancel | OFFER_FLAGS.sell);
  assert.equal(sell.NetworkID, 21337);
  assert.deepEqual(sell.TakerGets, { currency: 'EVR', issuer: 'rEvernodee8dJLaFsujS6q1EiXvZYmHXr8', value: '2' });
  assert.equal(sell.TakerPays, '6000000');
});

test('cancel, trust line, swap, AMM and expiry', () => {
  assert.deepEqual(buildCancel('xahau', ACC, 7), { TransactionType: 'OfferCancel', Account: ACC, NetworkID: 21337, OfferSequence: 7 });
  const trust = buildTrustSet('xrpl', ACC, RLUSD, 1e15);
  assert.deepEqual(trust.LimitAmount, { currency: RLUSD_HEX, issuer: RLUSD.issuer, value: '1000000000000000' });
  assert.equal(buildTrustSet('xrpl', ACC, RLUSD, 0).LimitAmount && (buildTrustSet('xrpl', ACC, RLUSD, 0).LimitAmount as { value: string }).value, '0');
  const swap = buildSwap({ ledger: 'xrpl', account: ACC, from: RLUSD, to: { currency: 'XRP' }, receive: 1, sendMax: 0.6, paths: [[{ currency: 'XRP' }]] });
  assert.equal(swap.Destination, ACC);
  assert.equal(swap.Amount, '1000000');
  assert.deepEqual(swap.SendMax, { currency: RLUSD_HEX, issuer: RLUSD.issuer, value: '0.6' });
  assert.equal(swap.Flags, undefined, 'never a partial payment');
  const dep = buildAmmDeposit(ACC, { currency: 'XRP' }, RLUSD, 10, 5);
  assert.deepEqual(dep.Asset, { currency: 'XRP' });
  assert.deepEqual(dep.Asset2, { currency: RLUSD_HEX, issuer: RLUSD.issuer });
  assert.equal(dep.Flags, 0x00100000);
  assert.equal(buildAmmWithdraw(ACC, { currency: 'XRP' }, RLUSD, { all: true }).Flags, 0x00020000);
  assert.equal(withLastLedger(dep, 100).LastLedgerSequence, 120);
});

test('order book levels, spread, market fill estimate and depth', () => {
  const asks = levelsFromOffers(
    [
      { TakerGets: '2000000', TakerPays: { currency: RLUSD_HEX, issuer: RLUSD.issuer, value: '1.2' } },
      { TakerGets: '1000000', TakerPays: { currency: RLUSD_HEX, issuer: RLUSD.issuer, value: '0.5' } },
    ],
    { currency: 'XRP' },
    RLUSD,
    'XRP',
    'ask',
  );
  assert.deepEqual(asks.map((l) => [l.price, l.size]), [[0.5, 1], [0.6, 2]]);
  const bids = levelsFromOffers([{ TakerGets: { currency: RLUSD_HEX, issuer: RLUSD.issuer, value: '0.9' }, TakerPays: '2000000' }], { currency: 'XRP' }, RLUSD, 'XRP', 'bid');
  assert.deepEqual(bids.map((l) => [l.price, l.size]), [[0.45, 2]]);
  const book = { asks, bids, at: 0 };
  assert.equal(spread(book).bid, 0.45);
  const fill = estimateFill(book, 'buy', 2)!;
  assert.equal(fill.cost, 0.5 + 0.6);
  assert.equal(fill.worstPrice, 0.6);
  assert.equal(fill.partial, false);
  assert.equal(estimateFill(book, 'buy', 5)!.partial, true);
  const d = depthCurve(book, 0.5);
  assert.equal(d.asks.at(-1)![1], 3);
});

test('look-alike tokens get a warning, real ones do not', () => {
  assert.equal(lookalikeWarning(RLUSD_HEX, RLUSD.issuer), false);
  assert.equal(lookalikeWarning('RLUSD', 'rDCoqEkGfyjCZRi67cVYpUmgR5U2LdcztB'), true);
  assert.equal(lookalikeWarning('ABC', 'rDCoqEkGfyjCZRi67cVYpUmgR5U2LdcztB'), false);
});
