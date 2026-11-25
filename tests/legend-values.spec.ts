// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SHOT1 = path.resolve('screenshots-test/xrp-poprawki-1.png');
const SHOT2 = path.resolve('screenshots-test/xrp-poprawki-2.png');

async function waitReady(page: Page): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
  await expect(page.locator('#status')).not.toHaveClass(/is-error/);
}

async function addIndicator(page: Page, kind: string): Promise<void> {
  if (await page.locator('#ind-modal').isHidden()) {
    await page.locator('#ind-btn').click();
  }
  await expect(page.locator('#ind-modal')).toBeVisible();
  await page.locator(`#ind-catalog [data-ind-add="${kind}"]`).click();
}

test('legend values follow the crosshair; screenshots of interval list and Fib', async ({ page }) => {
  await page.goto('/');
  await waitReady(page);

  await addIndicator(page, 'ema');
  await addIndicator(page, 'ema');
  await addIndicator(page, 'rsi');
  await addIndicator(page, 'volume');
  await page.locator('#ind-modal-close').click();
  await expect(page.locator('#ind-modal')).toBeHidden();

  await expect(page.locator('.ind-label[data-kind="ema"]').first()).toContainText('EMA 20');
  await expect(page.locator('.ind-label[data-kind="ema"]').nth(1)).toContainText('EMA 50');
  await expect.poll(async () => page.locator('.ind-label[data-kind="ema"] .ind-value').first().textContent()).toMatch(/\d/);
  await expect.poll(async () => page.locator('.ind-label[data-kind="rsi"] .ind-value').first().textContent()).toMatch(/\d/);
  await expect.poll(async () => page.locator('.ind-label[data-kind="volume"] .ind-value').first().textContent()).toMatch(/\d/);

  const box = await page.locator('#chart-wrap').boundingBox();
  expect(box).toBeTruthy();
  const b = box!;
  const mid = await page.evaluate(() => {
    const c = window.__opencharts.getCandles();
    const i = Math.max(0, c.length - 30);
    const bar = c[i];
    return bar ? window.__opencharts.timePriceToPage(bar.time, bar.close) : null;
  });
  if (mid) await page.mouse.move(mid.x, mid.y);
  await expect.poll(async () => page.locator('.ind-label[data-kind="ema"] .ind-value').first().textContent()).toMatch(/\d/);

  await page.locator('#interval-menu-btn').click();
  await expect(page.locator('#interval-menu')).toBeVisible();
  fs.mkdirSync(path.dirname(SHOT1), { recursive: true });
  await page.screenshot({ path: SHOT1, fullPage: true });

  await page.locator('#interval-menu-btn').click();
  await page.locator('.interval-favs [data-interval="4h"]').click();
  await waitReady(page);
  await expect
    .poll(async () => page.evaluate(() => window.__opencharts.getCandles().length), { timeout: 60_000 })
    .toBeGreaterThan(800);

  const anchors = await page.evaluate(() => {
    const candles = window.__opencharts.getCandles();
    const range = window.__opencharts.getVisibleLogicalRange();
    if (!candles.length || !range) return null;
    const from = Math.max(0, Math.floor(range.from) + 20);
    const to = Math.min(candles.length - 1, Math.ceil(range.to) - 20);
    const slice = candles.slice(from, to + 1);
    if (slice.length < 10) return null;
    const low = slice.reduce((a, c) => (c.low < a.low ? c : a));
    const high = slice.reduce((a, c) => (c.high > a.high ? c : a));
    const p1 = window.__opencharts.timePriceToPage(low.time, low.low);
    const p2 = window.__opencharts.timePriceToPage(high.time, high.high);
    if (!p1 || !p2) return null;
    return { p1, p2 };
  });
  expect(anchors).toBeTruthy();
  await page.locator('#tool-rail [data-tool="fib"]').click();
  await page.mouse.click(anchors!.p1.x, anchors!.p1.y);
  await page.mouse.click(anchors!.p2.x, anchors!.p2.y);
  await expect.poll(async () => page.evaluate(() => window.__opencharts.getDrawings().some((d) => d.type === 'fib'))).toBe(true);
  fs.mkdirSync(path.dirname(SHOT2), { recursive: true });
  await page.screenshot({ path: SHOT2, fullPage: true });
});
