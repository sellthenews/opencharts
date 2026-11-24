// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const MENU_SHOT = path.resolve('screenshots-test/pasek-menu.png');
const FAV_SHOT = path.resolve('screenshots-test/pasek-ulubione.png');

async function waitReady(page: import('@playwright/test').Page): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
}

async function useLightTheme(page: import('@playwright/test').Page): Promise<void> {
  const theme = await page.locator('html').getAttribute('data-theme');
  if (theme !== 'light') {
    await page.locator('#theme-btn').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  }
}

test('group menu, pick tool, favorites persist after drag and reload', async ({ page }) => {
  await page.goto('/');
  await waitReady(page);
  await useLightTheme(page);

  await page.locator('[data-rail-caret="forecast"]').click();
  const flyout = page.locator('#rail-flyout');
  await expect(flyout).toBeVisible();
  await expect(flyout.locator('.fly-h', { hasText: 'FORECASTING' })).toBeVisible();
  await expect(flyout.locator('.fly-h', { hasText: 'MEASURERS' })).toBeVisible();
  await expect(flyout).toContainText('Long Position');
  await expect(flyout).toContainText('Date and Price Range');
  await expect(flyout).not.toContainText(/VOLUME|VWAP|Ghost/i);

  fs.mkdirSync(path.dirname(MENU_SHOT), { recursive: true });
  await page.screenshot({ path: MENU_SHOT, fullPage: true });

  await flyout.locator('[data-tool="pricerange"]').click();
  await expect(flyout).toBeHidden();
  await expect(page.locator('#tool-rail [data-rail-group="forecast"]')).toHaveAttribute('data-tool', 'pricerange');

  const box = await page.locator('#chart-wrap').boundingBox();
  expect(box).toBeTruthy();
  const b = box!;
  await page.mouse.click(b.x + b.width * 0.3, b.y + b.height * 0.55);
  await page.mouse.click(b.x + b.width * 0.3, b.y + b.height * 0.35);
  await page.waitForTimeout(200);
  const drawn = await page.evaluate(() => window.__opencharts.getDrawings());
  expect(drawn.some((d) => d.type === 'pricerange')).toBeTruthy();

  await page.locator('[data-rail-caret="lines"]').click();
  await expect(flyout.locator('.fly-h', { hasText: 'LINES' })).toBeVisible();
  await expect(flyout.locator('.fly-h', { hasText: 'CHANNELS' })).toBeVisible();
  await flyout.locator('[data-star="trend"]').click();
  await flyout.locator('[data-star="hline"]').click();
  await flyout.locator('[data-star="ray"]').click();
  await expect(flyout).toBeVisible();
  await page.locator('[data-rail-caret="text"]').click();
  await flyout.locator('[data-star="text"]').click();
  await flyout.locator('[data-star="note"]').click();
  await page.locator('[data-rail-caret="shapes"]').click();
  await flyout.locator('[data-star="rect"]').click();
  await page.keyboard.press('Escape');
  await expect(flyout).toBeHidden();

  // Hide the style bar for a clear favorites screenshot (click-empty does not
  // deselect while the overlay is in passthrough mode).
  await page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>('#draw-bar');
    if (bar) bar.hidden = true;
  });

  const fav = page.locator('#fav-bar');
  await expect(fav).toBeVisible();
  await expect(fav.locator('[data-tool="trend"]')).toBeVisible();
  await expect(fav.locator('[data-tool="note"]')).toBeVisible();

  const before = await fav.boundingBox();
  expect(before).toBeTruthy();
  const handle = page.locator('#fav-handle');
  const hb = await handle.boundingBox();
  expect(hb).toBeTruthy();
  await page.mouse.move(hb!.x + hb!.width / 2, hb!.y + hb!.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb!.x + 180, hb!.y + 70, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  const after = await fav.boundingBox();
  expect(after).toBeTruthy();
  expect(Math.abs(after!.x - before!.x)).toBeGreaterThan(40);
  expect(Math.abs(after!.y - before!.y)).toBeGreaterThan(20);

  await page.screenshot({ path: FAV_SHOT, fullPage: true });

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('opencharts:favorites') ?? 'null'));
  expect(stored?.tools).toEqual(expect.arrayContaining(['trend', 'hline', 'ray', 'text', 'note', 'rect']));

  await page.reload();
  await waitReady(page);
  await expect(page.locator('#fav-bar')).toBeVisible();
  await expect(page.locator('#fav-bar [data-tool="trend"]')).toBeVisible();
  const again = await page.locator('#fav-bar').boundingBox();
  expect(again).toBeTruthy();
  expect(Math.abs(again!.x - after!.x)).toBeLessThan(4);
  expect(Math.abs(again!.y - after!.y)).toBeLessThan(4);
});
