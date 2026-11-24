// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const DIR_SHOT = path.resolve('screenshots-test/fib-kierunek.png');
const EXT_SHOT = path.resolve('screenshots-test/fib-extension.png');

async function waitReady(page: import('@playwright/test').Page): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
}

test('Fib retracement: level 1 is point 1, level 0 is point 2; Reverse flips it', async ({ page }) => {
  await page.goto('/');
  await waitReady(page);

  const box = await page.locator('#chart-wrap').boundingBox();
  expect(box).toBeTruthy();
  const b = box!;

  await page.locator('#tool-rail [data-tool="fib"]').click();
  // First click higher on the chart (swing high), second lower (swing low).
  await page.mouse.click(b.x + b.width * 0.22, b.y + b.height * 0.4);
  await page.mouse.click(b.x + b.width * 0.55, b.y + b.height * 0.6);
  await page.waitForTimeout(250);

  const drawn = await page.evaluate(() => {
    const d = window.__opencharts.getDrawings().find((x) => x.type === 'fib');
    if (!d || d.type !== 'fib') return null;
    return {
      p1: d.p1.price,
      p2: d.p2.price,
      reverse: !!d.fib?.reverse,
      level0: window.__opencharts.fibLevelPrice(0),
      level1: window.__opencharts.fibLevelPrice(1),
      level1618: window.__opencharts.fibLevelPrice(1.618),
    };
  });
  expect(drawn).toBeTruthy();
  expect(drawn!.reverse).toBe(false);
  expect(drawn!.level0).toBeCloseTo(drawn!.p2, 8);
  expect(drawn!.level1).toBeCloseTo(drawn!.p1, 8);
  // Level 1.618 lies past point 1, away from 0 (point 2).
  const beyond = drawn!.p1 + (drawn!.p1 - drawn!.p2) * 0.618;
  expect(drawn!.level1618).toBeCloseTo(beyond, 8);

  fs.mkdirSync(path.dirname(DIR_SHOT), { recursive: true });
  await page.screenshot({ path: DIR_SHOT, fullPage: true });

  const mid = await page.locator('#chart-wrap').boundingBox();
  await page.locator('#cursor-tool').click();
  await page.mouse.dblclick(mid!.x + mid!.width * 0.38, mid!.y + mid!.height * 0.5);
  await expect(page.locator('#fib-modal')).toBeVisible();
  await page.locator('#fib-reverse').check();
  await page.locator('#fib-ok').click();
  await expect(page.locator('#fib-modal')).toBeHidden();

  const flipped = await page.evaluate(() => {
    const d = window.__opencharts.getDrawings().find((x) => x.type === 'fib');
    if (!d || d.type !== 'fib') return null;
    return {
      p1: d.p1.price,
      p2: d.p2.price,
      reverse: !!d.fib?.reverse,
      level0: window.__opencharts.fibLevelPrice(0),
      level1: window.__opencharts.fibLevelPrice(1),
    };
  });
  expect(flipped?.reverse).toBe(true);
  expect(flipped!.level0).toBeCloseTo(flipped!.p1, 8);
  expect(flipped!.level1).toBeCloseTo(flipped!.p2, 8);
});

test('Trend-based Fib extension: level 0 is C, level 1 is C+(B−A)', async ({ page }) => {
  await page.goto('/');
  await waitReady(page);

  const box = await page.locator('#chart-wrap').boundingBox();
  expect(box).toBeTruthy();
  const b = box!;

  await page.locator('#tool-rail [data-rail-caret="fib"]').click();
  await page.locator('#rail-flyout [data-tool="fibext"]').click();
  await page.mouse.click(b.x + b.width * 0.25, b.y + b.height * 0.58);
  await page.mouse.click(b.x + b.width * 0.4, b.y + b.height * 0.35);
  await page.mouse.click(b.x + b.width * 0.52, b.y + b.height * 0.48);
  await page.waitForTimeout(250);

  const ext = await page.evaluate(() => {
    const d = window.__opencharts.getDrawings().find((x) => x.type === 'fibext');
    if (!d || d.type !== 'fibext') return null;
    return {
      a: d.a.price,
      b: d.b.price,
      c: d.c.price,
      level0: window.__opencharts.fibExtensionLevelPrice(0),
      level1: window.__opencharts.fibExtensionLevelPrice(1),
    };
  });
  expect(ext).toBeTruthy();
  expect(ext!.level0).toBeCloseTo(ext!.c, 8);
  expect(ext!.level1).toBeCloseTo(ext!.c + (ext!.b - ext!.a), 8);

  fs.mkdirSync(path.dirname(EXT_SHOT), { recursive: true });
  await page.screenshot({ path: EXT_SHOT, fullPage: true });
});
