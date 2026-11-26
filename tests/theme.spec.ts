// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { expect, test } from '@playwright/test';

test('gear menu can switch dark, dim, swapwick and light, and swapwick is remembered', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });

  await page.locator('#settings-btn').click();
  const dimBtn = page.locator('#theme-btns [data-theme="dim"]');
  const swapBtn = page.locator('#theme-btns [data-theme="swapwick"]');
  await expect(dimBtn).toBeVisible();
  await expect(dimBtn).toHaveText('Dim');
  await expect(swapBtn).toBeVisible();
  await expect(swapBtn).toHaveText('Swapwick');
  await dimBtn.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dim');
  await expect(dimBtn).toHaveClass(/is-active/);
  const dimBg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
  expect(dimBg).toBe('#2a303a');

  await swapBtn.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'swapwick');
  await expect(swapBtn).toHaveClass(/is-active/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('opencharts:theme'))).toBe('swapwick');
  const layout = await page.evaluate(() => localStorage.getItem('opencharts:layout'));
  expect(layout).toContain('"theme":"swapwick"');
  const bg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
  expect(bg).toBe('#12282c');

  await page.locator('#theme-btns [data-theme="light"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.locator('#theme-btns [data-theme="dark"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await swapBtn.click();
  await page.keyboard.press('Escape');

  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'swapwick');
});
