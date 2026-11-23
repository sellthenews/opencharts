// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Wykresy contributors

import { expect, test } from '@playwright/test';

test('lista obserwowanych: domyślne pary Krakena i otwieranie wykresu', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
  await expect(page.locator('#watchlist')).toBeVisible();

  const state = await page.evaluate(() => window.__wykresy.getWatchState());
  const moje = state.lists.find((l) => l.name === 'Moje' || l.id === 'moje');
  expect(moje?.items).toEqual([
    { sourceId: 'kraken', pairId: 'XRPUSD' },
    { sourceId: 'kraken', pairId: 'BTCUSD' },
    { sourceId: 'kraken', pairId: 'ETHUSD' },
  ]);
  expect(state.lists.some((l) => l.name === 'Krypto')).toBeTruthy();

  await expect(page.locator('.watch-row')).toHaveCount(3);
  await page.locator('.watch-row[data-pair="BTCUSD"]').click();
  await expect(page.locator('#pair')).toHaveValue('BTCUSD');
  await expect(page.locator('#source')).toHaveValue('kraken');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
  await expect(page.locator('#status')).toContainText(/BTC|XBT/);
});
