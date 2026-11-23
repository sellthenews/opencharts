// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Wykresy contributors

import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SHOT = path.resolve('screenshots-test/etap2-rsi-fib.png');

test('zrzut etap 2: XRP/USD 1D Kraken, RSI, Fibo, obserwowane', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#source')).toHaveValue('kraken');
  await expect(page.locator('#pair')).toHaveValue('XRPUSD');
  const dayBtn = page.locator('[data-interval="1D"]');
  if (!(await dayBtn.evaluate((el) => el.classList.contains('is-active')))) {
    await dayBtn.click();
  }
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
  await expect(page.locator('#watchlist')).toBeVisible();
  await expect(page.locator('.watch-row')).toHaveCount(3);

  await page.locator('#ind-btn').click();
  await page.locator('[data-ind-add="rsi"]').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#app')).toHaveAttribute('data-rsi', 'on');
  await expect(page.locator('.ind-label[data-kind="rsi"]')).toBeVisible();
  await page.waitForTimeout(400);

  const box = await page.locator('#chart-wrap').boundingBox();
  expect(box).toBeTruthy();
  const b = box!;
  // clicks in the upper (price) pane, not the RSI pane
  await page.locator('[data-tool="fib"]').click();
  await page.mouse.click(b.x + b.width * 0.25, b.y + b.height * 0.22);
  await page.mouse.click(b.x + b.width * 0.7, b.y + b.height * 0.48);
  await page.waitForTimeout(250);

  const drawings = await page.evaluate(() => window.__wykresy.getDrawings());
  expect(drawings.some((d) => d.type === 'fib')).toBeTruthy();

  fs.mkdirSync(path.dirname(SHOT), { recursive: true });
  await page.screenshot({ path: SHOT, fullPage: true });
});
