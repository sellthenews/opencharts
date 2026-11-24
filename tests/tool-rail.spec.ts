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

  await expect(page.locator('#fav-bar')).toBeVisible();
  await expect(page.locator('#fav-bar [data-tool="trend"]')).toBeVisible();

  await page.locator('[data-rail-caret="lines"]').click();
  await expect(flyout.locator('.fly-h', { hasText: 'LINES' })).toBeVisible();
  await expect(flyout.locator('.fly-h', { hasText: 'CHANNELS' })).toBeVisible();
  await flyout.locator('[data-star="hline"]').click();
  await flyout.locator('[data-star="extline"]').click();
  await expect(flyout).toBeVisible();
  await page.locator('[data-rail-caret="forecast"]').click();
  await flyout.locator('[data-star="shortpos"]').click();
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
  await expect(fav.locator('[data-tool="hline"]')).toBeVisible();
  await expect(fav.locator('[data-tool="shortpos"]')).toBeVisible();

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

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('opencharts:favorites-v2') ?? 'null'));
  expect(stored?.tools).toEqual(expect.arrayContaining(['trend', 'hline', 'extline', 'shortpos']));

  await page.reload();
  await waitReady(page);
  await expect(page.locator('#fav-bar')).toBeVisible();
  await expect(page.locator('#fav-bar [data-tool="trend"]')).toBeVisible();
  const again = await page.locator('#fav-bar').boundingBox();
  expect(again).toBeTruthy();
  expect(Math.abs(again!.x - after!.x)).toBeLessThan(4);
  expect(Math.abs(again!.y - after!.y)).toBeLessThan(4);
});

test('clean localStorage shows the default favorites bar', async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  await waitReady(page);
  const fav = page.locator('#fav-bar');
  await expect(fav).toBeVisible();
  for (const tool of ['brush', 'channel', 'fib', 'xabcd', 'fibext', 'callout', 'trend', 'rect', 'path', 'ray', 'abcd', 'longpos', 'text', 'note']) {
    await expect(fav.locator(`[data-tool="${tool}"]`)).toBeVisible();
  }
  await expect(fav.locator('[data-tool="hline"]')).toHaveCount(0);
  const stored = await page.evaluate(() => localStorage.getItem('opencharts:favorites-v2'));
  expect(stored).toBeNull();
  fs.mkdirSync(path.dirname(path.resolve('screenshots-test/ulubione-domyslne.png')), { recursive: true });
  await page.screenshot({ path: path.resolve('screenshots-test/ulubione-domyslne.png'), fullPage: true });
});

test('a stored v2 favorites list is left unchanged', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('opencharts:favorites-v2', JSON.stringify({ v: 2, tools: ['hline'], x: 24, y: 96 }));
  });
  await page.goto('/');
  await waitReady(page);
  const fav = page.locator('#fav-bar');
  await expect(fav).toBeVisible();
  await expect(fav.locator('[data-tool="hline"]')).toBeVisible();
  await expect(fav.locator('[data-tool="trend"]')).toHaveCount(0);
  await expect(fav.locator('[data-tool="fib"]')).toHaveCount(0);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('opencharts:favorites-v2') ?? 'null'));
  expect(stored?.tools).toEqual(['hline']);
  const box = await fav.boundingBox();
  expect(box).toBeTruthy();
  const wrap = await page.locator('#chart-wrap').boundingBox();
  expect(wrap).toBeTruthy();
  expect(Math.abs(box!.x - (wrap!.x + 24))).toBeLessThan(6);
  expect(Math.abs(box!.y - (wrap!.y + 96))).toBeLessThan(6);
});

test('legacy empty favorites list migrates to the default set and shows the bar', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('opencharts:favorites', JSON.stringify({ v: 1, tools: [], x: 40, y: 200 }));
  });
  await page.goto('/');
  await waitReady(page);
  const fav = page.locator('#fav-bar');
  await expect(fav).toBeVisible();
  for (const tool of ['brush', 'channel', 'fib', 'xabcd', 'fibext', 'callout', 'trend', 'rect', 'path', 'ray', 'abcd', 'longpos', 'text', 'note']) {
    await expect(fav.locator(`[data-tool="${tool}"]`)).toBeVisible();
  }
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('opencharts:favorites-v2') ?? 'null'));
  expect(stored?.v).toBe(2);
  expect(stored?.tools[0]).toBe('brush');
  expect(stored?.tools).toEqual(expect.arrayContaining(['fib', 'trend', 'note']));
  expect(stored?.tools.length).toBeGreaterThanOrEqual(20);
  const box = await fav.boundingBox();
  const wrap = await page.locator('#chart-wrap').boundingBox();
  expect(box).toBeTruthy();
  expect(wrap).toBeTruthy();
  expect(Math.abs(box!.y - (wrap!.y + 200))).toBeGreaterThan(40);
  expect(Math.abs(box!.y - (wrap!.y + 72))).toBeLessThan(16);
});

test('legacy custom favorites list is merged with defaults and stays visible', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('opencharts:favorites', JSON.stringify({ v: 1, tools: ['hline', 'fib', 'extline'], x: 16, y: 160 }));
  });
  await page.goto('/');
  await waitReady(page);
  const fav = page.locator('#fav-bar');
  await expect(fav).toBeVisible();
  await expect(fav.locator('[data-tool="hline"]')).toBeVisible();
  await expect(fav.locator('[data-tool="extline"]')).toBeVisible();
  await expect(fav.locator('[data-tool="fib"]')).toBeVisible();
  await expect(fav.locator('[data-tool="brush"]')).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('opencharts:favorites-v2') ?? 'null') as { v: number; tools: string[] } | null);
  expect(stored?.v).toBe(2);
  const tools = stored?.tools ?? [];
  expect(tools[0]).toBe('brush');
  expect(tools.indexOf('fib')).toBeGreaterThanOrEqual(0);
  expect(tools.indexOf('fib')).toBeLessThan(tools.indexOf('hline'));
  expect(tools.indexOf('hline')).toBeLessThan(tools.indexOf('extline'));
  await page.reload();
  await waitReady(page);
  await expect(page.locator('#fav-bar')).toBeVisible();
  const again = await page.evaluate(() => JSON.parse(localStorage.getItem('opencharts:favorites-v2') ?? 'null'));
  expect(again?.tools).toEqual(tools);
  fs.mkdirSync(path.dirname(path.resolve('screenshots-test/ulubione-migracja.png')), { recursive: true });
  await page.screenshot({ path: path.resolve('screenshots-test/ulubione-migracja.png'), fullPage: true });
});
