// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { expect, test, type Page, type Route } from '@playwright/test';

const ACC = 'rJJKbp9fXL9AR4kZwVzHLNkUCvY7D1kjCa';

function rpcResult(method: string, params: Record<string, unknown>): Record<string, unknown> {
  switch (method) {
    case 'book_offers': {
      const gets = params.taker_gets as { currency: string; issuer?: string };
      const pays = params.taker_pays as { currency: string; issuer?: string };
      const nativeGets = !gets.issuer;
      const iou = (c: { currency: string; issuer?: string }, v: string) => ({ currency: c.currency, issuer: c.issuer ?? '', value: v });
      const offers = [1, 2, 3].map((i) =>
        nativeGets
          ? { Account: ACC, TakerGets: String(i * 1_000_000), TakerPays: iou(pays, String(i * (0.5 + i * 0.01))) }
          : { Account: ACC, TakerGets: iou(gets, String(i * (0.48 - i * 0.01))), TakerPays: String(i * 1_000_000) },
      );
      return { offers, ledger_index: 100 };
    }
    case 'account_info':
      return { account_data: { Account: params.account, Balance: '25000000', OwnerCount: 1, Flags: 0 }, ledger_index: 100 };
    case 'account_lines':
      return { lines: [{ account: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De', currency: '524C555344000000000000000000000000000000', balance: '12.5', limit: '1000' }] };
    case 'account_offers':
      return { offers: [{ seq: 42, flags: 0, taker_gets: '1000000', taker_pays: { currency: 'USD', issuer: 'rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq', value: '0.5' } }] };
    case 'account_tx':
      return { transactions: [] };
    case 'server_info':
      return { info: { validated_ledger: { reserve_base_xrp: 1, reserve_inc_xrp: 0.2, seq: 100 } } };
    case 'ledger':
      return { ledger: { ledger_index: '100', close_time: 800000000 }, ledger_index: 100 };
    case 'amm_info':
      return {
        amm: {
          account: 'rhWTXC2m2gGGA9WozUaoMm6kLAVPb1tcS3',
          amount: '2000000000000',
          amount2: { currency: '524C555344000000000000000000000000000000', issuer: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De', value: '1000000' },
          lp_token: { currency: '03ABC', issuer: 'rhWTXC2m2gGGA9WozUaoMm6kLAVPb1tcS3', value: '5000' },
          trading_fee: 300,
        },
      };
    default:
      return {};
  }
}

async function mockLedgers(page: Page): Promise<void> {
  const handler = async (route: Route) => {
    const req = route.request();
    if (req.method() !== 'POST') return route.fallback();
    const body = JSON.parse(req.postData() ?? '{}') as { method: string; params?: Array<Record<string, unknown>> };
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ result: { status: 'success', ...rpcResult(body.method, body.params?.[0] ?? {}) } }) });
  };
  await page.route('https://xrplcluster.com/**', handler);
  await page.route('https://s2.ripple.com:51234/**', handler);
  await page.route('https://xahau.network/**', handler);
  await page.route('https://xahau.org/**', handler);
  await page.route('**/dex/rpc/**', handler);
  await page.route('**/xaman/config', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"apiKey":null}' }));
}

test('DEX mode: XRPL/Xahau panel with book, trade preview, account, and Xaman disabled without a key', async ({ page }) => {
  test.setTimeout(120_000);
  await mockLedgers(page);
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
  await expect(page.locator('#dex-panel')).toBeHidden();

  await page.locator('#dex-btn').click();
  await expect(page.locator('#dex-btn')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#dex-panel')).toBeVisible();
  await expect(page.locator('#watchlist')).toBeHidden();
  await expect(page.locator('#source')).toHaveValue('dex');
  await expect(page.locator('#pair-btn')).toHaveText(/XRP\/RLUSD/);

  // Book and depth
  await expect(page.locator('.dex-lvl.ask')).toHaveCount(3, { timeout: 20_000 });
  await expect(page.locator('.dex-lvl.bid')).toHaveCount(3);
  await expect(page.locator('#dex-depth')).toBeVisible();

  // Xaman: no key, so a clear disabled button
  const xaman = page.locator('#xaman-btn');
  await expect(xaman).toBeDisabled();
  await expect(xaman).toHaveText('Connect Xaman');

  // Account by address
  await page.locator('[data-dex-tab="account"]').click();
  await page.locator('[name="addr"]').fill(ACC);
  await page.locator('.dex-watch button').click();
  await expect(page.locator('.dex-body')).toContainText('25', { timeout: 20_000 });
  await expect(page.locator('[data-cancel="42"]')).toBeVisible({ timeout: 20_000 });

  // Limit order preview
  await page.locator('[data-dex-tab="trade"]').click();
  await page.locator('[name="price"]').fill('0.5');
  await page.locator('[name="size"]').fill('10');
  await page.locator('.dex-go').click();
  await expect(page.locator('.dex-preview')).toContainText('OfferCreate');
  await expect(page.locator('.dex-preview pre')).toContainText('"TakerPays": "10000000"');
  await expect(page.locator('[data-dex-sign]')).toBeDisabled();

  // Market preview walks the book
  await page.locator('[data-otype="market"]').click();
  await page.locator('[name="size"]').fill('2');
  await page.locator('.dex-go').click();
  await expect(page.locator('.dex-preview pre')).toContainText('"Flags": 131072');

  // AMM on XRPL
  await page.locator('[data-dex-tab="amm"]').click();
  await expect(page.locator('.dex-body')).toContainText('0.300%', { timeout: 20_000 });

  // Symbol search only offers XRPL and Xahau in DEX mode
  await page.locator('#pair-btn').click();
  await expect(page.locator('[data-sym-cat="xrpl"]')).toBeVisible();
  await expect(page.locator('[data-sym-cat="stocks"]')).toBeHidden();
  await expect(page.locator('[data-sym-cat="dex"]')).toBeHidden();
  await page.keyboard.press('Escape');

  // Xahau: no AMM tab, NetworkID in transactions
  await page.locator('[data-dex-net="xahau"]').click();
  await expect(page.locator('#dex-network')).toHaveValue('xahau');
  await expect(page.locator('[data-dex-tab="amm"]')).toBeHidden();
  await page.locator('[data-dex-tab="trade"]').click();
  await page.locator('[data-otype="limit"]').click();
  await page.locator('[name="price"]').fill('2');
  await page.locator('[name="size"]').fill('1');
  await page.locator('.dex-go').click();
  await expect(page.locator('.dex-preview pre')).toContainText('"NetworkID": 21337');

  // Leaving DEX mode brings back the chart you had
  await page.locator('#dex-btn').click();
  await expect(page.locator('#dex-panel')).toBeHidden();
  await expect(page.locator('#source')).toHaveValue('kraken');
});
