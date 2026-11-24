// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const PROXY = 'https://opencharts-proxy.test';
const SHOT = path.resolve('screenshots-test/stocks-yahoo.png');

function mockChart(symbol: string, last: number) {
  const timestamp: number[] = [];
  const open: number[] = [];
  const high: number[] = [];
  const low: number[] = [];
  const close: number[] = [];
  const volume: number[] = [];
  const start = 1700000000;
  for (let i = 0; i < 180; i++) {
    const mid = last * (0.85 + (i / 180) * 0.2);
    const o = mid * 0.99;
    const c = mid * 1.01;
    timestamp.push(start + i * 86400);
    open.push(o);
    high.push(Math.max(o, c) * 1.02);
    low.push(Math.min(o, c) * 0.98);
    close.push(c);
    volume.push(1_000_000 + i * 1000);
  }
  close[close.length - 1] = last;
  return {
    chart: {
      result: [
        {
          meta: {
            symbol,
            currency: 'USD',
            regularMarketPrice: last,
            regularMarketChangePercent: 1.25,
            chartPreviousClose: last * 0.99,
            shortName: symbol === 'XRPN' ? 'Evernorth Holdings Inc.' : symbol,
          },
          timestamp,
          indicators: { quote: [{ open, high, low, close, volume }] },
        },
      ],
      error: null,
    },
  };
}

test('without a stocks proxy, Stocks shows a configuration message', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });

  await page.locator('#pair-btn').click();
  await expect(page.locator('#sym-modal')).toBeVisible();
  await page.locator('[data-sym-cat="stocks"]').click();
  await expect(page.locator('.sym-banner')).toHaveText('Stock data proxy not configured yet');
  await expect(page.locator('#sym-results .sym-row', { hasText: 'AAPLx' }).first()).toBeVisible({ timeout: 45_000 });
});

test('mocked Yahoo proxy loads an XRPN chart', async ({ page }) => {
  await page.addInitScript((proxy) => {
    localStorage.setItem('opencharts:stocks-proxy', proxy);
  }, PROXY);

  await page.route(`${PROXY}/**`, async (route) => {
    const url = route.request().url();
    if (url.includes('/v8/finance/chart/')) {
      const symbol = decodeURIComponent(url.split('/v8/finance/chart/')[1]!.split('?')[0]!);
      const last = symbol === 'XRPN' ? 6.67 : 100;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockChart(symbol, last)),
      });
      return;
    }
    if (url.includes('/v1/finance/search')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          quotes: [
            { symbol: 'XRPN', shortname: 'Evernorth Holdings Inc.', quoteType: 'EQUITY', exchDisp: 'NasdaqCM' },
          ],
        }),
      });
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not mocked"}' });
  });

  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });

  await page.locator('#pair-btn').click();
  await expect(page.locator('#sym-modal')).toBeVisible();
  await page.locator('[data-sym-cat="stocks"]').click();
  await expect(page.locator('.sym-banner')).toHaveCount(0);

  const row = page.locator('#sym-results .sym-row', { hasText: 'XRPN' }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText('Evernorth');
  await expect(row.locator('.sym-ex')).toHaveText(/Yahoo/);
  await row.click();

  await expect(page.locator('#sym-modal')).toBeHidden();
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
  await expect(page.locator('#status')).not.toHaveClass(/is-error/);
  await expect(page.locator('#status')).toContainText(/Yahoo/i);
  await expect(page.locator('#source')).toHaveValue('yahoo');
  await expect(page.locator('#pair')).toHaveValue('XRPN');

  fs.mkdirSync(path.dirname(SHOT), { recursive: true });
  await page.screenshot({ path: SHOT, fullPage: true });
});
