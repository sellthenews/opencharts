// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test('drawing: trend line, change color, Delete', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });

  const box = await page.locator('#chart-wrap').boundingBox();
  expect(box).toBeTruthy();
  const b = box!;

  await page.locator('#tool-rail [data-tool="trend"]').click();
  await page.mouse.click(b.x + b.width * 0.3, b.y + b.height * 0.65);
  await page.mouse.click(b.x + b.width * 0.7, b.y + b.height * 0.3);
  await page.waitForTimeout(250);

  await expect(page.locator('#cursor-tool')).toHaveClass(/is-active/);
  await expect(page.locator('#draw-bar')).toBeVisible();

  await page.locator('#draw-color').evaluate((el) => {
    const input = el as HTMLInputElement;
    input.value = '#e91e63';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(100);

  const styled = await page.evaluate(() => window.__opencharts.getDrawings());
  expect(styled.some((d) => d.type === 'trend' && d.style?.color === '#e91e63')).toBeTruthy();

  await page.keyboard.press('Delete');
  await page.waitForTimeout(100);
  const after = await page.evaluate(() => window.__opencharts.getDrawings());
  expect(after.some((d) => d.type === 'trend')).toBeFalsy();
  await expect(page.locator('#draw-bar')).toBeHidden();
});

test('style bar stays hidden until a drawing is selected, sits in the corner, hides on Esc, Delete removes', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
  await expect(page.locator('#draw-bar')).toBeHidden();

  const box = await page.locator('#chart-wrap').boundingBox();
  expect(box).toBeTruthy();
  const b = box!;

  await page.locator('#tool-rail [data-tool="fib"]').click();
  await page.mouse.click(b.x + b.width * 0.25, b.y + b.height * 0.35);
  await page.mouse.click(b.x + b.width * 0.7, b.y + b.height * 0.65);
  await page.waitForTimeout(250);

  const bar = page.locator('#draw-bar');
  await expect(bar).toBeVisible();
  const barBox = await bar.boundingBox();
  expect(barBox).toBeTruthy();
  expect(Math.abs(barBox!.x - (b.x + 8))).toBeLessThan(10);
  expect(Math.abs(barBox!.y - (b.y + 8))).toBeLessThan(10);

  fs.mkdirSync(path.dirname(path.resolve('screenshots-test/fib-zaznaczony.png')), { recursive: true });
  await page.screenshot({ path: path.resolve('screenshots-test/fib-zaznaczony.png'), fullPage: true });

  await page.mouse.click(b.x + b.width * 0.88, b.y + b.height * 0.82);
  await expect(bar).toBeHidden();

  await page.mouse.click(b.x + b.width * 0.48, b.y + b.height * 0.5);
  await expect(bar).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(bar).toBeHidden();

  await page.mouse.click(b.x + b.width * 0.48, b.y + b.height * 0.5);
  await expect(bar).toBeVisible();
  await page.keyboard.press('Delete');
  await page.waitForTimeout(100);
  const after = await page.evaluate(() => window.__opencharts.getDrawings());
  expect(after.some((d) => d.type === 'fib')).toBeFalsy();
  await expect(bar).toBeHidden();
});
