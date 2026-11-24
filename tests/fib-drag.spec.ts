// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const DRAG_SHOT = path.resolve('screenshots-test/fib-przeciaganie.png');
const ICONS_SHOT = path.resolve('screenshots-test/ikony-nowe.png');

async function waitReady(page: Page): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
}

test('tool icons and tooltips include the tool name and shortcut', async ({ page }) => {
  await page.goto('/');
  await waitReady(page);

  const trend = page.locator('#tool-rail [data-tool="trend"]');
  await expect(trend).toHaveAttribute('title', 'Trend Line (Alt+T)');
  await expect(page.locator('#tool-rail [data-tool="fib"]')).toHaveAttribute('title', 'Fib Retracement (Alt+F)');
  await expect(page.locator('#magnet-btn')).toHaveAttribute('title', /Magnet.*Ctrl/);
  const license = page.locator('.site-foot a');
  await expect(license).toHaveText('Open source (AGPL-3.0)');
  await expect(license).toHaveAttribute('href', 'https://github.com/sellthenews/opencharts/blob/main/LICENSE');
  await expect(trend.locator('svg')).toBeVisible();
  await expect(page.locator('#tool-rail [data-tool="fib"] svg')).toBeVisible();

  await page.locator('#tool-rail [data-rail-caret="lines"]').click();
  const hline = page.locator('#rail-flyout [data-tool="hline"]');
  await expect(hline).toBeVisible();
  await expect(hline).toHaveAttribute('title', 'Horizontal Line (Alt+H)');
  await expect(page.locator('#rail-flyout [data-tool="vline"]')).toHaveAttribute('title', 'Vertical Line (Alt+V)');

  await page.locator('#tool-rail [data-rail-caret="fib"]').click();
  const ext = page.locator('#rail-flyout [data-tool="fibext"]');
  await expect(ext).toBeVisible();
  await expect(ext).toHaveAttribute('title', /Trend-Based Fib Extension/);
  await expect(ext.locator('.fly-ico svg')).toBeVisible();

  fs.mkdirSync(path.dirname(ICONS_SHOT), { recursive: true });
  await page.screenshot({ path: ICONS_SHOT, fullPage: true });
});

test('Fib retracement and Fib Ext handle levels update during drag, before mouseup', async ({ page }) => {
  await page.goto('/');
  await waitReady(page);

  const box = await page.locator('#chart-wrap').boundingBox();
  expect(box).toBeTruthy();
  const b = box!;

  await page.locator('#tool-rail [data-tool="fib"]').click();
  await page.mouse.click(b.x + b.width * 0.25, b.y + b.height * 0.35);
  await page.mouse.click(b.x + b.width * 0.55, b.y + b.height * 0.62);
  await page.waitForTimeout(200);
  await page.locator('#cursor-tool').click();

  const before = await page.evaluate(() => {
    const d = window.__opencharts.getDrawings().find((x) => x.type === 'fib');
    return {
      level0: window.__opencharts.fibLevelPrice(0),
      level1: window.__opencharts.fibLevelPrice(1),
      p2: d && d.type === 'fib' ? d.p2.price : null,
      handle: window.__opencharts.handlePage('p2'),
    };
  });
  expect(before.level0).not.toBeNull();
  expect(before.handle).toBeTruthy();

  await page.mouse.move(before.handle!.x, before.handle!.y);
  await page.mouse.down();
  await page.mouse.move(before.handle!.x, before.handle!.y + 80, { steps: 12 });

  const mid = await page.evaluate(() => ({
    level0: window.__opencharts.fibLevelPrice(0),
    level1: window.__opencharts.fibLevelPrice(1),
  }));
  expect(mid.level0).not.toBeNull();
  expect(Math.abs((mid.level0 ?? 0) - (before.level0 ?? 0))).toBeGreaterThan(0.0001);

  fs.mkdirSync(path.dirname(DRAG_SHOT), { recursive: true });
  await page.screenshot({ path: DRAG_SHOT, fullPage: true });

  await page.mouse.up();
  const after = await page.evaluate(() => window.__opencharts.fibLevelPrice(0));
  expect(after).not.toBeNull();
  expect(after!).toBeCloseTo(mid.level0!, 5);

  await page.keyboard.press('Delete');
  await expect
    .poll(async () => page.evaluate(() => window.__opencharts.getDrawings().some((d) => d.type === 'fib')))
    .toBe(false);

  const favExt = page.locator('#fav-bar [data-tool="fibext"]');
  if (await favExt.count()) {
    await favExt.click();
  } else {
    await page.locator('#tool-rail [data-rail-caret="fib"]').click();
    await page.locator('#rail-flyout [data-tool="fibext"]').click();
  }

  await page.mouse.click(b.x + b.width * 0.22, b.y + b.height * 0.6);
  await page.mouse.click(b.x + b.width * 0.38, b.y + b.height * 0.32);
  await page.mouse.click(b.x + b.width * 0.55, b.y + b.height * 0.5);
  await page.waitForTimeout(200);
  await page.locator('#cursor-tool').click();

  const extBefore = await page.evaluate(() => ({
    level0: window.__opencharts.fibExtensionLevelPrice(0),
    level1: window.__opencharts.fibExtensionLevelPrice(1),
    handle: window.__opencharts.handlePage('c'),
  }));
  expect(extBefore.level0).not.toBeNull();
  expect(extBefore.handle).toBeTruthy();

  await page.mouse.move(extBefore.handle!.x, extBefore.handle!.y);
  await page.mouse.down();
  await page.mouse.move(extBefore.handle!.x, extBefore.handle!.y + 70, { steps: 12 });

  const extMid = await page.evaluate(() => window.__opencharts.fibExtensionLevelPrice(0));
  expect(extMid).not.toBeNull();
  expect(Math.abs((extMid ?? 0) - (extBefore.level0 ?? 0))).toBeGreaterThan(0.0001);
  await page.mouse.up();
});
