// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SHOT = path.resolve('screenshots-test/crosshair-fib-ctrl.png');

async function waitReady(page: Page): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
}

async function drawFib(page: Page, box: { x: number; y: number; width: number; height: number }): Promise<void> {
  await page.locator('#tool-rail [data-tool="fib"]').click();
  await page.mouse.click(box.x + box.width * 0.28, box.y + box.height * 0.32);
  await page.mouse.click(box.x + box.width * 0.58, box.y + box.height * 0.62);
  await expect.poll(async () => page.evaluate(() => window.__opencharts.getDrawings().some((d) => d.type === 'fib'))).toBe(true);
  await page.locator('#cursor-tool').click();
}

test('Fib anchors stay on time/price after zoom, pan, and price-axis drag', async ({ page }) => {
  await page.goto('/');
  await waitReady(page);
  const box = await page.locator('#chart-wrap').boundingBox();
  expect(box).toBeTruthy();
  const b = box!;
  await drawFib(page, b);

  const before = await page.evaluate(() => {
    const d = window.__opencharts.getDrawings().find((x) => x.type === 'fib');
    if (!d || d.type !== 'fib') return null;
    const level0 = window.__opencharts.fibLevelPrice(0);
    const y = level0 === null ? null : window.__opencharts.priceToCoordinate(level0);
    return { p1: d.p1, p2: d.p2, level0, y };
  });
  expect(before).toBeTruthy();
  expect(before!.level0).not.toBeNull();
  expect(before!.y).not.toBeNull();

  await page.keyboard.press('Escape');
  await page.mouse.click(b.x + b.width * 0.12, b.y + b.height * 0.12);

  await page.mouse.move(b.x + b.width * 0.12, b.y + b.height * 0.18);
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(150);

  await page.mouse.move(b.x + b.width * 0.15, b.y + b.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.08, b.y + b.height * 0.2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);

  await page.mouse.move(b.x + b.width - 18, b.y + b.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width - 18, b.y + b.height * 0.55, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(200);

  const after = await page.evaluate(() => {
    const d = window.__opencharts.getDrawings().find((x) => x.type === 'fib');
    if (!d || d.type !== 'fib') return null;
    const level0 = window.__opencharts.fibLevelPrice(0);
    const y = level0 === null ? null : window.__opencharts.priceToCoordinate(level0);
    return { p1: d.p1, p2: d.p2, level0, y };
  });
  expect(after).toBeTruthy();
  expect(after!.p1.time).toBe(before!.p1.time);
  expect(after!.p1.price).toBeCloseTo(before!.p1.price, 8);
  expect(after!.p2.time).toBe(before!.p2.time);
  expect(after!.p2.price).toBeCloseTo(before!.p2.price, 8);
  expect(after!.level0).toBeCloseTo(before!.level0!, 8);
  expect(after!.y).not.toBeNull();
  const yNow = await page.evaluate((price) => window.__opencharts.priceToCoordinate(price), after!.level0!);
  expect(yNow).toBeCloseTo(after!.y!, 4);
});

test('right-click cancels an in-progress drawing, exits the tool, and Remove only appears on a selected object', async ({ page }) => {
  await page.goto('/');
  await waitReady(page);
  const box = await page.locator('#chart-wrap').boundingBox();
  expect(box).toBeTruthy();
  const b = box!;
  await drawFib(page, b);
  const kept = await page.evaluate(() => window.__opencharts.getDrawings().filter((d) => d.type === 'fib').length);
  expect(kept).toBe(1);

  const fibCount = () => page.evaluate(() => window.__opencharts.getDrawings().filter((d) => d.type === 'fib').length);

  await page.locator('#tool-rail [data-tool="fib"]').click();
  await expect.poll(async () => page.evaluate(() => window.__opencharts.getTool())).toBe('fib');
  await page.mouse.click(b.x + b.width * 0.5, b.y + b.height * 0.35, { button: 'right' });
  await expect(page.locator('#chart-menu')).toBeHidden();
  expect(await fibCount()).toBe(kept);
  expect(await page.evaluate(() => window.__opencharts.getTool())).toBe('cursor');
  await expect(page.locator('#app')).toHaveAttribute('data-tool', 'cursor');
  await expect(page.locator('#tool-rail [data-tool="fib"]')).not.toHaveClass(/is-active/);

  await page.locator('#tool-rail [data-tool="fib"]').click();
  await expect.poll(async () => page.evaluate(() => window.__opencharts.getTool())).toBe('fib');
  await page.mouse.click(b.x + b.width * 0.3, b.y + b.height * 0.28);
  await page.mouse.click(b.x + b.width * 0.5, b.y + b.height * 0.45, { button: 'right' });
  await expect(page.locator('#chart-menu')).toBeHidden();
  expect(await fibCount()).toBe(kept);
  expect(await page.evaluate(() => window.__opencharts.getTool())).toBe('cursor');
  await expect(page.locator('#app')).toHaveAttribute('data-tool', 'cursor');

  await page.mouse.click(b.x + b.width * 0.3, b.y + b.height * 0.4);
  await page.mouse.click(b.x + b.width * 0.55, b.y + b.height * 0.58);
  expect(await fibCount()).toBe(kept);
  expect(await page.evaluate(() => window.__opencharts.getTool())).toBe('cursor');

  const handle = await page.evaluate(() => window.__opencharts.handlePage('p2'));
  expect(handle).toBeTruthy();
  await page.mouse.click(handle!.x, handle!.y, { button: 'right' });
  const menu = page.locator('#chart-menu');
  await expect(menu).toBeVisible();
  const remove = menu.getByRole('menuitem', { name: 'Remove', exact: true });
  await expect(remove).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  expect(await page.evaluate(() => window.__opencharts.getDrawings().some((d) => d.type === 'fib'))).toBe(true);

  await page.mouse.click(handle!.x, handle!.y, { button: 'right' });
  await expect(menu).toBeVisible();
  await remove.click();
  await expect(menu).toBeHidden();
  await expect.poll(async () => page.evaluate(() => window.__opencharts.getDrawings().some((d) => d.type === 'fib'))).toBe(false);
});

test('crosshair stays visible and snaps to OHLC while dragging a Fib handle with Ctrl', async ({ page }) => {
  await page.goto('/');
  await waitReady(page);
  const box = await page.locator('#chart-wrap').boundingBox();
  expect(box).toBeTruthy();
  const b = box!;
  await drawFib(page, b);

  const handle = await page.evaluate(() => window.__opencharts.handlePage('p2'));
  expect(handle).toBeTruthy();
  await page.keyboard.down('Control');
  await page.mouse.move(handle!.x, handle!.y);
  await page.mouse.down();
  await page.mouse.move(handle!.x + 40, handle!.y + 36, { steps: 10 });
  await page.waitForTimeout(80);

  const mid = await page.evaluate(() => {
    const d = window.__opencharts.getDrawings().find((x) => x.type === 'fib');
    const hair = window.__opencharts.getCrosshair();
    const candles = window.__opencharts.getCandles();
    const p2 = d && d.type === 'fib' ? d.p2 : null;
    const candle = p2 ? candles.reduce((best, c) => (Math.abs(c.time - p2.time) < Math.abs(best.time - p2.time) ? c : best), candles[0]!) : null;
    const levels = candle ? [candle.open, candle.high, candle.low, candle.close] : [];
    const onOhlc = p2 !== null && candle !== null && levels.some((v) => Math.abs(v - p2.price) < 1e-8) && candle.time === p2.time;
    return { p2, hair, onOhlc };
  });
  expect(mid.p2).toBeTruthy();
  expect(mid.hair).toBeTruthy();
  expect(mid.hair!.time).toBe(mid.p2!.time);
  expect(mid.hair!.price).toBeCloseTo(mid.p2!.price, 8);
  expect(mid.onOhlc).toBe(true);

  fs.mkdirSync(path.dirname(SHOT), { recursive: true });
  await page.screenshot({ path: SHOT, fullPage: true });

  await page.mouse.up();
  await page.keyboard.up('Control');
});
