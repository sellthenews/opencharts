// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { expect, test, type Page } from '@playwright/test';

async function waitReady(page: Page): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
}

test('chart stops moving after the mouse is released (no kinetic scroll)', async ({ page }) => {
  await page.goto('/');
  await waitReady(page);

  const box = await page.locator('#chart-wrap').boundingBox();
  expect(box).toBeTruthy();
  const b = box!;
  const before = await page.evaluate(() => window.__opencharts.getVisibleLogicalRange());
  expect(before).toBeTruthy();

  await page.mouse.move(b.x + b.width * 0.55, b.y + b.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.4, { steps: 12 });
  await page.mouse.up();

  const released = await page.evaluate(() => window.__opencharts.getVisibleLogicalRange());
  expect(released).toBeTruthy();
  expect(Math.abs((released!.from - before!.from) + (released!.to - before!.to))).toBeGreaterThan(0.4);

  await page.waitForTimeout(500);
  const settled = await page.evaluate(() => window.__opencharts.getVisibleLogicalRange());
  expect(settled).toBeTruthy();
  expect(settled!.from).toBeCloseTo(released!.from, 5);
  expect(settled!.to).toBeCloseTo(released!.to, 5);
});

test('Ctrl snaps a drawing point to OHLC; without Ctrl the price is free', async ({ page }) => {
  await page.goto('/');
  await waitReady(page);

  const target = await page.evaluate(() => {
    const candles = window.__opencharts.getCandles();
    const range = window.__opencharts.getVisibleLogicalRange();
    if (!range || candles.length < 10) return null;
    const from = Math.max(0, Math.floor(range.from));
    const to = Math.min(candles.length - 1, Math.ceil(range.to));
    for (let i = Math.floor((from + to) / 2); i < to - 1; i++) {
      const c = candles[i]!;
      const mid = (c.high + c.low) / 2;
      const levels = [c.open, c.high, c.low, c.close];
      if (levels.some((n) => Math.abs(n - mid) < 1e-8)) continue;
      const a = window.__opencharts.timePriceToPage(c.time, mid);
      const next = candles[i + 3] ?? candles[i + 1];
      if (!a || !next) continue;
      const b = window.__opencharts.timePriceToPage(next.time, mid);
      if (!b) continue;
      return { mid, levels, a, b, time: c.time };
    }
    return null;
  });
  expect(target).toBeTruthy();

  await page.locator('#tool-rail [data-tool="trend"]').click();
  await page.mouse.click(target!.a.x, target!.a.y);
  await page.mouse.click(target!.b.x, target!.b.y);
  await page.waitForTimeout(150);

  const free = await page.evaluate(() => {
    const d = window.__opencharts.getDrawings().find((x) => x.type === 'trend');
    return d && d.type === 'trend' ? d.p1.price : null;
  });
  expect(free).not.toBeNull();
  expect(target!.levels.some((n) => Math.abs(n - free!) < 1e-6)).toBeFalsy();
  expect(Math.abs(free! - target!.mid)).toBeLessThan(Math.abs(target!.levels[0]! - target!.mid));

  await page.keyboard.press('Delete');
  await expect.poll(async () => page.evaluate(() => window.__opencharts.getDrawings().some((d) => d.type === 'trend'))).toBe(false);

  await page.locator('#tool-rail [data-tool="trend"]').click();
  const wrap = await page.locator('#chart-wrap').boundingBox();
  expect(wrap).toBeTruthy();
  const posA = { x: target!.a.x - wrap!.x, y: target!.a.y - wrap!.y };
  const posB = { x: target!.b.x - wrap!.x, y: target!.b.y - wrap!.y };
  await page.locator('#chart-wrap').click({ position: posA, modifiers: ['Control'] });
  await page.locator('#chart-wrap').click({ position: posB, modifiers: ['Control'] });
  await page.waitForTimeout(150);

  const snapped = await page.evaluate(() => {
    const d = window.__opencharts.getDrawings().find((x) => x.type === 'trend');
    if (!d || d.type !== 'trend') return null;
    const candles = window.__opencharts.getCandles();
    const bar = candles.find((c) => c.time === d.p1.time) ?? candles.reduce((best, c) =>
      Math.abs(c.time - d.p1.time) < Math.abs(best.time - d.p1.time) ? c : best,
    );
    return { price: d.p1.price, time: d.p1.time, levels: [bar.open, bar.high, bar.low, bar.close] };
  });
  expect(snapped).toBeTruthy();
  expect(snapped!.levels.some((n) => Math.abs(n - snapped!.price) < 1e-8)).toBeTruthy();
});
