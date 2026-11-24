// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { expect, test } from '@playwright/test';

test('stocks search: Stocks filter lists Kraken xStocks and AAPLx chart loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });

  await page.locator('#pair-btn').click();
  await expect(page.locator('#sym-modal')).toBeVisible();
  await page.locator('[data-sym-cat="stocks"]').click();
  await page.locator('#sym-search').fill('aapl');

  const row = page.locator('#sym-results .sym-row', { hasText: 'AAPLx' }).first();
  await expect(row).toBeVisible({ timeout: 45_000 });
  await expect(row.locator('.sym-ex')).toHaveText(/Kraken/);
  await row.click();

  await expect(page.locator('#sym-modal')).toBeHidden();
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
  await expect(page.locator('#status')).not.toHaveClass(/is-error/);
  await expect(page.locator('#pair')).toHaveValue(/AAPLxUSD/i);
  await expect(page.locator('#source')).toHaveValue('kraken');
});
