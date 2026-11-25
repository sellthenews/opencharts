// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { expect, test } from '@playwright/test';

test('interval dropdown, favorites, and older 4H history', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
  await expect(page.locator('#status')).not.toHaveClass(/is-error/);

  for (const id of ['15m', '1h', '4h', '1D']) {
    await expect(page.locator(`.interval-favs [data-interval="${id}"]`)).toHaveCount(1);
  }
  await expect(page.locator('.interval-favs [data-interval="1W"]')).toHaveCount(0);

  await page.locator('#interval-menu-btn').click();
  const menu = page.locator('#interval-menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByText('Minutes', { exact: true })).toBeVisible();
  await expect(menu.getByText('Hours', { exact: true })).toBeVisible();
  await expect(menu.getByText('Days', { exact: true })).toBeVisible();
  await expect(menu.locator('[data-pick-interval="45m"]')).toBeVisible();
  await expect(menu.locator('[data-pick-interval="1W"]')).toBeVisible();
  await expect(menu.locator('[data-fav="15m"]')).toHaveClass(/is-on/);

  await menu.locator('[data-fav="1W"]').click();
  await expect(page.locator('.interval-favs [data-interval="1W"]')).toHaveCount(1);
  await expect(page.locator('#interval-menu')).toBeVisible();
  await page.locator('#interval-menu-btn').click();
  await expect(page.locator('#interval-menu')).toBeHidden();

  const fourH = page.locator('.interval-favs [data-interval="4h"]');
  await fourH.click();
  await expect(fourH).toHaveClass(/is-active/);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
  await expect(page.locator('#status')).not.toHaveClass(/is-error/);

  const first = await page.evaluate(async () => {
    const feb2026 = 1_770_768_000; // 11 Feb 2026 00:00 UTC
    for (let i = 0; i < 5; i++) {
      const t0 = window.__opencharts.getCandles()[0]?.time ?? 0;
      if (t0 && t0 < feb2026) return t0;
      await window.__opencharts.loadOlderHistory();
    }
    return window.__opencharts.getCandles()[0]?.time ?? 0;
  });
  // One Binance page after Kraken's ~720 4H bars still starts around Feb 2026. Further pages must go earlier.
  expect(first).toBeLessThan(1_770_768_000);
});
