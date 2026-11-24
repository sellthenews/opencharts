// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { expect, test } from '@playwright/test';

test('context menu: right-click opens the menu, Reset chart closes it', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });

  const box = await page.locator('#chart-wrap').boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height * 0.4, { button: 'right' });
  const menu = page.locator('#chart-menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Reset chart' })).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Reset chart' }).click();
  await expect(menu).toBeHidden();
  await expect(page.locator('#status')).toContainText(/Chart view reset/);
});
