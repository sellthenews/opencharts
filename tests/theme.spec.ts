// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { expect, test } from '@playwright/test';

test('gear menu can switch dark, dim and light, and dim is remembered', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });

  await page.locator('#settings-btn').click();
  const dimBtn = page.locator('#theme-btns [data-theme="dim"]');
  await expect(dimBtn).toBeVisible();
  await expect(dimBtn).toHaveText('Dim');
  await dimBtn.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dim');
  await expect(dimBtn).toHaveClass(/is-active/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('opencharts:theme'))).toBe('dim');
  const layout = await page.evaluate(() => localStorage.getItem('opencharts:layout'));
  expect(layout).toContain('"theme":"dim"');

  const bg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
  expect(bg).toBe('#2a303a');

  await page.locator('#theme-btns [data-theme="light"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.locator('#theme-btns [data-theme="dark"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await dimBtn.click();
  await page.keyboard.press('Escape');

  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dim');
});
