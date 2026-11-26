// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { expect, test } from '@playwright/test';
import fs from 'node:fs';

test('the chart shows a Swapwick mark above the time axis that ignores clicks', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
  const mark = page.locator('#chart-brand');
  await expect(mark).toBeVisible();
  await expect(mark).toContainText('swapwick.com');
  await expect(mark.locator('img')).toBeVisible();
  await expect(mark).toHaveCSS('pointer-events', 'none');
  const opacity = Number(await mark.evaluate((el) => getComputedStyle(el).opacity));
  expect(opacity).toBeGreaterThanOrEqual(0.25);
  expect(opacity).toBeLessThanOrEqual(0.35);

  const [m, c] = await Promise.all([mark.boundingBox(), page.locator('#chart').boundingBox()]);
  expect(m && c).toBeTruthy();
  expect(m!.x).toBeGreaterThanOrEqual(c!.x);
  expect(m!.x).toBeLessThan(c!.x + c!.width / 2);
  expect(m!.y + m!.height).toBeLessThan(c!.y + c!.height - 16);
  expect(m!.y).toBeGreaterThan(c!.y + c!.height / 2);
});

test('the chart mark is smaller and on screen on a phone', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
  const mark = page.locator('#chart-brand');
  await expect(mark).toBeVisible();
  const box = await mark.boundingBox();
  expect(box).toBeTruthy();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  expect(box!.height).toBeLessThanOrEqual(16);
  await ctx.close();
});

test('a saved chart image includes the brand mark', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
  await page.locator('#settings-btn').click();
  await expect(page.locator('#settings-menu')).toBeVisible();
  const status = page.locator('#status');
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15_000 }),
    page.locator('#settings-png').evaluate((el: HTMLElement) => el.click()),
  ]);
  const file = await download.path();
  expect(file).toBeTruthy();
  const dataUrl = 'data:image/png;base64,' + fs.readFileSync(file!).toString('base64');
  const ok = await page.evaluate(async (url) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    const mark = document.querySelector('#chart-brand');
    const host = document.querySelector('#chart');
    if (!ctx || !mark || !host) return false;
    ctx.drawImage(img, 0, 0);
    const mr = mark.getBoundingClientRect();
    const cr = host.getBoundingClientRect();
    const sx = canvas.width / cr.width;
    const sy = canvas.height / cr.height;
    const x = Math.max(0, Math.floor((mr.left - cr.left) * sx));
    const y = Math.max(0, Math.floor((mr.top - cr.top) * sy));
    const w = Math.max(1, Math.ceil(mr.width * sx));
    const h = Math.max(1, Math.ceil(mr.height * sy));
    const data = ctx.getImageData(x, y, w, h).data;
    const right = Math.min(canvas.width - 4, x + w + 16);
    const bg = ctx.getImageData(right, y + Math.floor(h / 2), 1, 1).data;
    let diff = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (Math.abs(data[i]! - bg[0]!) + Math.abs(data[i + 1]! - bg[1]!) + Math.abs(data[i + 2]! - bg[2]!) > 18) diff += 1;
    }
    return diff > 20;
  }, dataUrl);
  expect(ok).toBeTruthy();
});
