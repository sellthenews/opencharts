// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { expect, test } from '@playwright/test';

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
