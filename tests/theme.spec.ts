// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { expect, test } from '@playwright/test';

async function openThemePicker(page: import('@playwright/test').Page): Promise<void> {
  const list = page.locator('#theme-btns');
  if (await list.isHidden()) {
    await page.locator('#theme-toggle').click();
  }
  await expect(list).toBeVisible();
}

test('theme row expands a vertical list, remembers Swapwick, and marks the active option', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });

  await page.locator('#settings-btn').click();
  const toggle = page.locator('#theme-toggle');
  const list = page.locator('#theme-btns');
  await expect(toggle).toBeVisible();
  await expect(list).toBeHidden();

  await toggle.click();
  await expect(list).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  const names = (await list.locator('[data-theme]').evaluateAll((els) => els.map((el) => el.getAttribute('data-theme'))));
  expect(names).toEqual(['dark', 'dim', 'light', 'swapwick']);
  await expect(list.locator('[data-theme="dark"] .theme-swatch')).toBeVisible();
  await expect(list.locator('[data-theme="dim"] .theme-swatch')).toBeVisible();
  await expect(list.locator('[data-theme="light"] .theme-swatch')).toBeVisible();
  await expect(list.locator('[data-theme="swapwick"] .theme-swatch')).toBeVisible();

  await list.locator('[data-theme="dim"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dim');
  await expect(list).toBeHidden();
  await expect(page.locator('#theme-current-name')).toHaveText('Dim');
  const dimBg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
  expect(dimBg).toBe('#2a303a');

  await openThemePicker(page);
  await expect(list.locator('[data-theme="dim"]')).toHaveClass(/is-active/);
  await list.locator('[data-theme="swapwick"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'swapwick');
  await expect(page.locator('#theme-current-name')).toHaveText('Swapwick');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('opencharts:theme'))).toBe('swapwick');
  const layout = await page.evaluate(() => localStorage.getItem('opencharts:layout'));
  expect(layout).toContain('"theme":"swapwick"');
  const bg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
  expect(bg).toBe('#12282c');

  await openThemePicker(page);
  await list.locator('[data-theme="light"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await openThemePicker(page);
  await list.locator('[data-theme="dark"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await openThemePicker(page);
  await list.locator('[data-theme="swapwick"]').click();
  await page.keyboard.press('Escape');

  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'swapwick');
});
