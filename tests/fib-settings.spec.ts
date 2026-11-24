// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const CHART_SHOT = path.resolve('screenshots-test/fib-wykres.png');
const SETTINGS_SHOT = path.resolve('screenshots-test/fib-ustawienia.png');

async function waitReady(page: import('@playwright/test').Page): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
}

async function drawFib(page: import('@playwright/test').Page): Promise<void> {
  const box = await page.locator('#chart-wrap').boundingBox();
  expect(box).toBeTruthy();
  const b = box!;
  await page.locator('#tool-rail [data-tool="fib"]').click();
  await page.mouse.click(b.x + b.width * 0.22, b.y + b.height * 0.32);
  await page.mouse.click(b.x + b.width * 0.58, b.y + b.height * 0.58);
  await page.waitForTimeout(250);
}

test('Fib retracement: 24 levels, settings dialog, persist and Save as default', async ({ page }) => {
  await page.goto('/');
  await waitReady(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await drawFib(page);
  const first = await page.evaluate(() => window.__opencharts.getDrawings().find((d) => d.type === 'fib'));
  expect(first?.type).toBe('fib');
  const levels = first && first.type === 'fib' ? first.fib?.levels ?? [] : [];
  expect(levels).toHaveLength(24);
  expect(levels.every((l) => l.visible)).toBeTruthy();
  expect(levels.map((l) => l.value)).toEqual([
    0, 0.236, 0.278, 0.38, 0.44, 0.5, 0.577, 0.61, 0.667, 0.707, 0.77, 0.786, 0.8, 0.878, 0.941, 1, 1.13, 1.25, 1.414,
    1.618, 1.732, 2.058, 2.236, 2.618,
  ]);

  fs.mkdirSync(path.dirname(CHART_SHOT), { recursive: true });
  await page.screenshot({ path: CHART_SHOT, fullPage: true });

  const box = await page.locator('#chart-wrap').boundingBox();
  const b = box!;
  await page.mouse.dblclick(b.x + b.width * 0.4, b.y + b.height * 0.45);
  await expect(page.locator('#fib-modal')).toBeVisible();
  await expect(page.locator('#fib-modal-title')).toHaveText('Fib Retracement');
  await expect(page.locator('.fib-level-row')).toHaveCount(24);

  await page.screenshot({ path: SETTINGS_SHOT, fullPage: true });

  const row236 = page.locator('.fib-level-row').filter({ has: page.locator('.fib-level-value[value="0.236"]') });
  await row236.locator('.fib-level-on').uncheck();
  const row50 = page.locator('.fib-level-row').filter({ has: page.locator('.fib-level-value[value="0.5"]') });
  await row50.locator('.fib-level-color').evaluate((el) => {
    const input = el as HTMLInputElement;
    input.value = '#e91e63';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('#fib-ok').click();
  await expect(page.locator('#fib-modal')).toBeHidden();

  const afterOk = await page.evaluate(() => {
    const d = window.__opencharts.getDrawings().find((x) => x.type === 'fib');
    return d && d.type === 'fib' ? d.fib : null;
  });
  expect(afterOk?.levels.find((l) => l.value === 0.236)?.visible).toBe(false);
  expect(afterOk?.levels.find((l) => l.value === 0.5)?.color.toLowerCase()).toBe('#e91e63');

  await page.reload();
  await waitReady(page);
  const afterReload = await page.evaluate(() => {
    const d = window.__opencharts.getDrawings().find((x) => x.type === 'fib');
    return d && d.type === 'fib' ? d.fib : null;
  });
  expect(afterReload?.levels.find((l) => l.value === 0.236)?.visible).toBe(false);
  expect(afterReload?.levels.find((l) => l.value === 0.5)?.color.toLowerCase()).toBe('#e91e63');

  const idBefore = await page.evaluate(() => window.__opencharts.getDrawings().find((d) => d.type === 'fib')?.id);

  // Re-select the saved fib, change a setting, Save as default, then draw a new one.
  const wrap = await page.locator('#chart-wrap').boundingBox();
  expect(wrap).toBeTruthy();
  const w = wrap!;
  await page.locator('#cursor-tool').click();
  await page.mouse.click(w.x + w.width * 0.4, w.y + w.height * 0.45);
  await page.locator('#draw-settings').click();
  await expect(page.locator('#fib-modal')).toBeVisible();
  await page.locator('#fib-save-default').click();
  await expect(page.locator('#fib-saved-note')).toContainText('Saved as default');
  await page.locator('#fib-ok').click();

  await page.evaluate(() => window.__opencharts.importDrawings(JSON.stringify([])));
  await drawFib(page);
  const created = await page.evaluate(() => {
    const list = window.__opencharts.getDrawings().filter((d) => d.type === 'fib');
    return list.map((d) => (d.type === 'fib' ? { id: d.id, fib: d.fib } : null));
  });
  const fresh = created[created.length - 1];
  expect(fresh?.id).not.toBe(idBefore);
  expect(fresh?.fib?.levels).toHaveLength(24);
  expect(fresh?.fib?.levels.find((l) => l.value === 0.236)?.visible).toBe(false);
  expect(fresh?.fib?.levels.find((l) => l.value === 0.5)?.color.toLowerCase()).toBe('#e91e63');
});
