// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import assert from 'node:assert/strict';
import test from 'node:test';

import { currencyCode, getDexNetwork, rippleToUnix, unixToRipple, amountValue, RIPPLE_EPOCH } from '../src/sources/dex-networks';
import { aggregateTrades, bookQualityToPrice, estimateLedgerIndex, mergeSamples, midFromBooks, parseAmmInfo, tradesFromAccountTx, isRetryableLedgerError, isWorkerOverQuota, ledgerRpc, retryDelayMs, setLedgerFetchForTests, shouldStopAccountTxPaging, shouldTryWorkerFallback, initialSampleCount } from '../src/sources/ledger-rpc';
import { candlesFromOhlcvList, geckoTimeframe, poolFromGecko } from '../src/sources/geckoterminal';
import { dex, parseDexPairId } from '../src/sources/dex';

test('getDexNetwork lists XRPL AMM, Xahau books, and GeckoTerminal chains', () => {
  assert.equal(getDexNetwork('xrpl')?.kind, 'amm');
  assert.equal(getDexNetwork('xahau')?.kind, 'book');
  assert.equal(getDexNetwork('xahau')?.native, 'XAH');
  assert.equal(getDexNetwork('eth')?.kind, 'geckoterminal');
  assert.equal(getDexNetwork('nope'), undefined);
});

test('currencyCode decodes 160-bit hex tickers and ripple time converts', () => {
  assert.equal(currencyCode('524C555344000000000000000000000000000000'), 'RLUSD');
  assert.equal(currencyCode('EVR'), 'EVR');
  assert.equal(rippleToUnix(0), RIPPLE_EPOCH);
  assert.equal(unixToRipple(RIPPLE_EPOCH + 10), 10);
  const native = amountValue('1000000', 'XRP');
  assert.deepEqual(native, { currency: 'XRP', value: 1 });
});

test('parseDexPairId understands AMM, book, and GeckoTerminal ids', () => {
  const amm = parseDexPairId('amm:xrpl:rhWTXC2m2gGGA9WozUaoMm6kLAVPb1tcS3');
  assert.equal(amm?.kind, 'amm');
  assert.equal(amm?.account, 'rhWTXC2m2gGGA9WozUaoMm6kLAVPb1tcS3');
  const book = parseDexPairId('book:xahau:XAH:EVR.rEvernodee8dJLaFsujS6q1EiXvZYmHXr8');
  assert.equal(book?.kind, 'book');
  assert.equal(book?.label, 'XAH/EVR');
  assert.equal(book?.quoteIssuer, 'rEvernodee8dJLaFsujS6q1EiXvZYmHXr8');
  const gt = parseDexPairId('gt:eth:0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640');
  assert.equal(gt?.kind, 'gt');
  assert.equal(gt?.address, '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640');
  assert.equal(parseDexPairId('nope'), undefined);
});

test('tradesFromAccountTx keeps opposite-reserve swaps and skips same-way moves', () => {
  const account = 'rAMM';
  const txs = [
    {
      tx: { date: 100 },
      meta: {
        AffectedNodes: [
          {
            ModifiedNode: {
              LedgerEntryType: 'AccountRoot',
              FinalFields: { Account: account, Balance: '2000000' },
              PreviousFields: { Balance: '1000000' },
            },
          },
          {
            ModifiedNode: {
              LedgerEntryType: 'RippleState',
              FinalFields: {
                Balance: { currency: 'USD', issuer: 'rIOU', value: '10' },
                HighLimit: { issuer: account, currency: 'USD' },
                LowLimit: { issuer: 'rUser', currency: 'USD' },
              },
              PreviousFields: { Balance: { currency: 'USD', issuer: 'rIOU', value: '20' } },
            },
          },
        ],
      },
    },
  ];
  const trades = tradesFromAccountTx(txs, account, 'XRP');
  assert.equal(trades.length, 1);
  assert.equal(trades[0]!.volume, 1);
  assert.equal(trades[0]!.price, 5);
  assert.equal(trades[0]!.time, RIPPLE_EPOCH + 100);
});

test('aggregateTrades and mergeSamples fill candle buckets', () => {
  const trades = [
    { time: 100, price: 2, volume: 1 },
    { time: 110, price: 4, volume: 3 },
    { time: 200, price: 5, volume: 1 },
  ];
  const candles = aggregateTrades(trades, 100);
  assert.equal(candles.length, 2);
  assert.deepEqual(candles[0], { time: 100, open: 2, high: 4, low: 2, close: 4, volume: 4 });
  const merged = mergeSamples(candles, [{ time: 0, price: 1 }, { time: 100, price: 99 }]);
  assert.equal(merged[0]!.time, 0);
  assert.equal(merged[0]!.close, 1);
  assert.equal(merged.find((c) => c.time === 100)?.close, 4);
});

test('book mid and quality convert both sides of an order book', () => {
  const ask = bookQualityToPrice(
    { TakerGets: '1000000', TakerPays: { currency: 'USD', issuer: 'rI', value: '2' } },
    'XRP',
    'USD',
    'XRP',
  );
  const bid = bookQualityToPrice(
    { TakerGets: { currency: 'USD', issuer: 'rI', value: '3' }, TakerPays: '1000000' },
    'XRP',
    'USD',
    'XRP',
  );
  assert.equal(ask, 2);
  assert.equal(bid, 3);
  assert.deepEqual(midFromBooks([3], [2]), { bid: 3, ask: 2, mid: 2.5 });
});

test('parseAmmInfo and ledger index estimate', () => {
  const snap = parseAmmInfo(
    {
      amm: {
        account: 'rAMM',
        amount: '2000000',
        amount2: { currency: 'USD', issuer: 'rI', value: '10' },
      },
    },
    'XRP',
  );
  assert.equal(snap?.price, 5);
  assert.equal(estimateLedgerIndex(1000, 1_000_000, 999_996), 999);
});

test('GeckoTerminal pool, timeframe, and OHLCV helpers', () => {
  const pool = poolFromGecko(
    {
      attributes: { address: '0xabc', name: 'WETH / USDC 0.05%', reserve_in_usd: '10' },
      relationships: { network: { data: { id: 'eth' } } },
    },
    'base',
  );
  assert.equal(pool?.id, 'gt:eth:0xabc');
  assert.equal(pool?.base, 'WETH');
  assert.equal(pool?.quote, 'USDC');
  assert.deepEqual(geckoTimeframe('4h'), { timeframe: 'hour', aggregate: 4 });
  assert.equal(geckoTimeframe('13m'), null);
  const candles = candlesFromOhlcvList([[200, 1, 3, 0.5, 2, 9]], 0);
  assert.deepEqual(candles[0], { time: 200, open: 1, high: 3, low: 0.5, close: 2, volume: 9 });
});

test('tooBusy and Worker 418 are retryable; Worker is not used for a busy official node', () => {
  assert.equal(isRetryableLedgerError('rate limit: units quota (2000 per 10s) exhausted, retry in ~13892ms'), true);
  assert.equal(isRetryableLedgerError('tooBusy'), true);
  assert.equal(isWorkerOverQuota('HTTP 418 for https://opencharts-proxy.opencharts.workers.dev/dex/rpc/xrpl'), true);
  assert.equal(isWorkerOverQuota('usage exceeded'), true);
  assert.equal(shouldTryWorkerFallback('tooBusy'), false);
  assert.equal(shouldTryWorkerFallback('rate limit: units quota exhausted'), false);
  assert.equal(shouldTryWorkerFallback('HTTP 418 for https://opencharts-proxy.opencharts.workers.dev/dex/rpc/xrpl'), false);
  assert.equal(shouldTryWorkerFallback('Failed to fetch'), true);
  assert.equal(shouldStopAccountTxPaging(0, new Error('tooBusy')), false);
  assert.equal(shouldStopAccountTxPaging(12, new Error('tooBusy')), true);
  assert.equal(retryDelayMs('rate limit exhausted, retry in ~200ms', 0), 200);
  assert.equal(initialSampleCount('1D', false), 16);
  assert.ok(initialSampleCount('1D', true) < 120);
});

test('ledgerRpc retries a reachable tooBusy official node and ignores Worker 418', async () => {
  const calls: string[] = [];
  let clusterHits = 0;
  setLedgerFetchForTests(async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('workers.dev')) {
      return new Response('usage exceeded', { status: 418 });
    }
    if (url.includes('ripple.com')) {
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    clusterHits += 1;
    if (clusterHits === 1) {
      return new Response(
        JSON.stringify({
          result: {
            status: 'error',
            error: 'tooBusy',
            error_message: 'rate limit: units quota exhausted, retry in ~200ms',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response(
      JSON.stringify({
        result: {
          status: 'success',
          amm: { account: 'rAMM', amount: '1000000', amount2: { currency: 'USD', issuer: 'rI', value: '2' } },
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  });
  try {
    const network = getDexNetwork('xrpl')!;
    const result = await ledgerRpc<{ amm?: { account?: string } }>(network, 'amm_info', { amm_account: 'rAMM' });
    assert.equal(result.amm?.account, 'rAMM');
    assert.equal(calls.some((u) => u.includes('workers.dev')), false);
    assert.equal(calls.some((u) => u.includes('ripple.com')), false);
    assert.ok(clusterHits >= 2);
  } finally {
    setLedgerFetchForTests(null);
  }
});

test('DEX candles stay available when a later account_tx page is rate limited', async () => {
  let accountPages = 0;
  setLedgerFetchForTests(async (input, init) => {
    const url = String(input);
    if (url.includes('workers.dev')) return new Response('usage exceeded', { status: 418 });
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
    const method = body.method;
    if (method === 'amm_info') {
      return new Response(
        JSON.stringify({
          result: {
            amm: {
              account: 'rhWTXC2m2gGGA9WozUaoMm6kLAVPb1tcS3',
              amount: '2000000',
              amount2: { currency: 'USD', issuer: 'rI', value: '10' },
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (method === 'account_tx') {
      accountPages += 1;
      if (accountPages > 1) {
        return new Response(
          JSON.stringify({
            result: {
              status: 'error',
              error: 'tooBusy',
              error_message: 'rate limit: units quota exhausted, retry in ~200ms',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      const account = 'rhWTXC2m2gGGA9WozUaoMm6kLAVPb1tcS3';
      const nowRipple = Math.floor(Date.now() / 1000) - 946684800;
      return new Response(
        JSON.stringify({
          result: {
            transactions: [
              {
                tx: { date: nowRipple - 60 },
                meta: {
                  AffectedNodes: [
                    {
                      ModifiedNode: {
                        LedgerEntryType: 'AccountRoot',
                        FinalFields: { Account: account, Balance: '2000000' },
                        PreviousFields: { Balance: '1000000' },
                      },
                    },
                    {
                      ModifiedNode: {
                        LedgerEntryType: 'RippleState',
                        FinalFields: {
                          Balance: { currency: 'USD', issuer: 'rI', value: '10' },
                          HighLimit: { issuer: account, currency: 'USD' },
                          LowLimit: { issuer: 'rUser', currency: 'USD' },
                        },
                        PreviousFields: { Balance: { currency: 'USD', issuer: 'rI', value: '20' } },
                      },
                    },
                  ],
                },
              },
            ],
            marker: { ledger: 1, seq: 1 },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify({ result: { status: 'error', error: 'unexpected' } }), { status: 200 });
  });
  try {
    const candles = await dex.fetchCandles('amm:xrpl:rhWTXC2m2gGGA9WozUaoMm6kLAVPb1tcS3', '1D');
    assert.ok(candles.length >= 1);
    assert.ok(candles[candles.length - 1]!.close > 0);
  } finally {
    setLedgerFetchForTests(null);
  }
});
