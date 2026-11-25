// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SHOT = path.resolve('screenshots-test');

const ALL_TYPES = [
  'candles',
  'hollow',
  'bars',
  'heikin',
  'high-low',
  'line',
  'line-markers',
  'stepline',
  'area',
  'hlc-area',
  'baseline',
  'columns',
  'renko',
  'kagi',
  'pnf',
  'linebreak',
  'range',
] as const;

async function waitReady(page: Page): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
  await expect(page.locator('#status')).not.toHaveClass(/is-error/);
}

test('all chart types are selectable, persist, and render without errors', async ({ page }) => {
  await page.goto('/');
  await waitReady(page);

  await expect(page.locator('#app')).toHaveAttribute('data-chart-type', 'candles');
  await expect(page.locator('#chart-type-btn')).toBeVisible();

  await page.locator('#chart-type-btn').click();
  const menu = page.locator('#chart-type-menu');
  await expect(menu).toBeVisible();
  for (const id of ALL_TYPES) {
    await expect(menu.locator(`[data-chart-type="${id}"]`)).toBeVisible();
  }
  await expect(menu.locator('[data-chart-type="candles"]')).toHaveClass(/is-active/);
  fs.mkdirSync(SHOT, { recursive: true });
  await page.screenshot({ path: path.join(SHOT, 'e2-chart-types.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  const featured = ['heikin', 'hollow', 'bars', 'line', 'area', 'baseline', 'hlc-area', 'columns', 'renko'] as const;
  for (const id of featured) {
    await page.evaluate((type) => window.__opencharts.setChartType(type), id);
    await expect(page.locator('#app')).toHaveAttribute('data-chart-type', id);
    await expect(page.locator('#status')).not.toHaveClass(/is-error/);
    const n = await page.evaluate(() => window.__opencharts.getCandles().length);
    expect(n).toBeGreaterThan(10);
  }

  await page.screenshot({ path: path.join(SHOT, 'e2-renko.png'), fullPage: true });

  await page.evaluate(() => window.__opencharts.setChartType('heikin'));
  await page.screenshot({ path: path.join(SHOT, 'e2-heikin.png'), fullPage: true });

  await page.evaluate(() => window.__opencharts.setChartType('area'));
  await page.screenshot({ path: path.join(SHOT, 'e2-area.png'), fullPage: true });

  // Cycle every remaining type so a crash in any of them fails the test.
  for (const id of ALL_TYPES) {
    await page.evaluate((type) => window.__opencharts.setChartType(type), id);
    await expect(page.locator('#app')).toHaveAttribute('data-chart-type', id);
    await expect(page.locator('#status')).not.toHaveClass(/is-error/);
  }

  await page.evaluate(() => window.__opencharts.setChartType('kagi'));
  await expect.poll(() => page.evaluate(() => localStorage.getItem('opencharts:chart-type'))).toBe('kagi');
  await page.reload();
  await waitReady(page);
  await expect(page.locator('#app')).toHaveAttribute('data-chart-type', 'kagi');
  const stored = await page.evaluate(() => window.__opencharts.getChartType());
  expect(stored).toBe('kagi');
  await page.screenshot({ path: path.join(SHOT, 'e2-kagi.png'), fullPage: true });
});
