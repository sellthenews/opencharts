// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import assert from 'node:assert/strict';
import test from 'node:test';

import { assetColor, assetIconHtml, assetLetter, baseTicker, cacheKey } from '../src/asset-icon';

test('baseTicker takes the left side of a pair label', () => {
  assert.equal(baseTicker('XRP/USD'), 'XRP');
  assert.equal(baseTicker('WETH/USDC'), 'WETH');
  assert.equal(baseTicker('AAPL'), 'AAPL');
  assert.equal(baseTicker('XBT/USD'), 'BTC');
  assert.equal(baseTicker('', 'ETH-USD'), 'ETH');
});

test('letter fallback uses the first alphanumeric and a stable color', () => {
  assert.equal(assetLetter('XRP/USD'), 'X');
  assert.equal(assetLetter('1INCH/USD'), '1');
  assert.equal(assetColor('XRP/USD'), assetColor('XRP/USDT'));
  assert.notEqual(assetColor('XRP/USD'), assetColor('ETH/USD'));
});

test('icon html renders a round placeholder with data attributes and no third-party chart brand', () => {
  const html = assetIconHtml('kraken', 'XRPUSD', 'XRP/USD');
  assert.match(html, /class="asset-icon"/);
  assert.match(html, /data-icon-source="kraken"/);
  assert.match(html, /data-icon-pair="XRPUSD"/);
  assert.match(html, /asset-icon-letter">X</);
  assert.equal(html.toLowerCase().includes(['trading', 'view'].join('')), false);
  assert.equal(cacheKey('kraken', 'XRPUSD'), 'kraken:XRPUSD');
});
