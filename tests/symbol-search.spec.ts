// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { expect, test } from '@playwright/test';

test('symbol search: type sol, pick a result, chart loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
  await expect(page.locator('#pair')).toHaveValue('XRPUSD');

  await page.locator('#pair-btn').click();
  const input = page.locator('#sym-search');
  await expect(input).toBeVisible();
  await input.fill('sol');

  const row = page.locator('#sym-results .sym-row').first();
  await expect(row).toBeVisible({ timeout: 45_000 });
  const label = (await row.locator('.sym-label').textContent()) ?? '';
  expect(label.toLowerCase()).toContain('sol');
  await row.click();

  await expect(page.locator('#sym-modal')).toBeHidden();
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
  await expect(page.locator('#status')).not.toHaveClass(/is-error/);
  const pair = await page.locator('#pair').inputValue();
  expect(pair.toLowerCase()).toContain('sol');
});
