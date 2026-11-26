// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { expect, test } from '@playwright/test';

test('watchlist: default Kraken pairs and opening a chart', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
  await expect(page.locator('#watchlist')).toBeVisible();

  const state = await page.evaluate(() => window.__opencharts.getWatchState());
  const moje = state.lists.find((l) => l.name === 'My list' || l.id === 'moje');
  expect(moje?.items).toEqual([
    { sourceId: 'kraken', pairId: 'XRPUSD' },
    { sourceId: 'yahoo', pairId: 'XRPN' },
    { sourceId: 'kraken', pairId: 'BTCUSD' },
    { sourceId: 'kraken', pairId: 'ETHUSD' },
  ]);
  expect(state.lists.some((l) => l.name === 'Crypto' || l.id === 'krypto')).toBeTruthy();

  await expect(page.locator('.watch-row')).toHaveCount(4);
  await expect(page.locator('.watch-row .asset-icon')).toHaveCount(4);
  await expect(page.locator('.watch-row[data-pair="XRPUSD"] .asset-icon-letter')).toHaveText('X');
  await page.locator('.watch-row[data-pair="BTCUSD"]').click();
  await expect(page.locator('#pair')).toHaveValue('BTCUSD');
  await expect(page.locator('#source')).toHaveValue('kraken');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
  await expect(page.locator('#status')).toContainText(/BTC|XBT/);

  const before = await page.locator('#chart-wrap').boundingBox();
  expect(before).toBeTruthy();
  await expect(page.locator('#sidebar')).toBeVisible();
  await page.locator('#sidebar-btn').click();
  await expect(page.locator('#sidebar')).toBeHidden();
  const after = await page.locator('#chart-wrap').boundingBox();
  expect(after).toBeTruthy();
  expect(after!.width).toBeGreaterThan(before!.width + 40);

  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
  await expect(page.locator('#sidebar')).toBeHidden();
  await expect(page.locator('#app')).toHaveAttribute('data-sidebar', 'off');
});
