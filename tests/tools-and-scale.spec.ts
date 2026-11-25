// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SCALE_SHOT = path.resolve('screenshots-test/skala-sidebar.png');

async function waitReady(page: Page): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
}

test('trend line can be drawn, selected, moved, stretched, snapped with Ctrl, and deleted', async ({ page }) => {
  await page.goto('/');
  await waitReady(page);

  const box = await page.locator('#chart-wrap').boundingBox();
  expect(box).toBeTruthy();
  const b = box!;

  await page.locator('#tool-rail [data-tool="trend"]').click();
  await page.mouse.click(b.x + b.width * 0.3, b.y + b.height * 0.45);
  await page.mouse.click(b.x + b.width * 0.62, b.y + b.height * 0.3);
  await page.waitForTimeout(150);
  await page.locator('#cursor-tool').click();

  const start = await page.evaluate(() => {
    const d = window.__opencharts.getDrawings().find((x) => x.type === 'trend');
    if (!d || d.type !== 'trend') return null;
    return {
      p1: d.p1,
      p2: d.p2,
      handle: window.__opencharts.handlePage('p2'),
      mid: window.__opencharts.timePriceToPage((d.p1.time + d.p2.time) / 2, (d.p1.price + d.p2.price) / 2),
    };
  });
  expect(start?.handle).toBeTruthy();
  expect(start?.mid).toBeTruthy();

  await page.mouse.move(start!.mid!.x, start!.mid!.y);
  await page.mouse.down();
  await page.mouse.move(start!.mid!.x, start!.mid!.y + 50, { steps: 8 });
  await page.mouse.up();

  const moved = await page.evaluate(() => {
    const d = window.__opencharts.getDrawings().find((x) => x.type === 'trend');
    return d && d.type === 'trend' ? { p1: d.p1.price, p2: d.p2.price, handle: window.__opencharts.handlePage('p2') } : null;
  });
  expect(moved).toBeTruthy();
  expect(Math.abs(moved!.p1 - start!.p1.price) + Math.abs(moved!.p2 - start!.p2.price)).toBeGreaterThan(0.0001);

  const handle = moved!.handle!;
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x + 40, handle.y + 40, { steps: 8 });
  await page.mouse.up();
  const stretched = await page.evaluate(() => {
    const d = window.__opencharts.getDrawings().find((x) => x.type === 'trend');
    return d && d.type === 'trend' ? d.p2 : null;
  });
  expect(stretched).toBeTruthy();
  expect(Math.abs(stretched!.price - moved!.p2) + Math.abs(stretched!.time - start!.p2.time)).toBeGreaterThan(0);

  await page.keyboard.press('Delete');
  await expect
    .poll(async () => page.evaluate(() => window.__opencharts.getDrawings().some((d) => d.type === 'trend')))
    .toBe(false);

  const snap = await page.evaluate(() => {
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
      const b2 = window.__opencharts.timePriceToPage(next.time, mid);
      if (!b2) continue;
      return { levels, a, b: b2 };
    }
    return null;
  });
  expect(snap).toBeTruthy();
  await page.locator('#tool-rail [data-tool="trend"]').click();
  await page.keyboard.down('Control');
  await page.mouse.click(snap!.a.x, snap!.a.y);
  await page.mouse.click(snap!.b.x, snap!.b.y);
  await page.keyboard.up('Control');
  const snapped = await page.evaluate(() => {
    const d = window.__opencharts.getDrawings().find((x) => x.type === 'trend');
    return d && d.type === 'trend' ? d.p1.price : null;
  });
  expect(snapped).not.toBeNull();
  expect(snap!.levels.some((n) => Math.abs(n - snapped!) < 1e-6)).toBeTruthy();
});

test('horizontal line draws, moves by handle, and deletes', async ({ page }) => {
  await page.goto('/');
  await waitReady(page);
  const box = await page.locator('#chart-wrap').boundingBox();
  const b = box!;
  await page.keyboard.press('Alt+h');
  await expect.poll(async () => page.evaluate(() => window.__opencharts.getTool())).toBe('hline');
  await page.mouse.click(b.x + b.width * 0.5, b.y + b.height * 0.4);
  await page.waitForTimeout(150);
  await page.locator('#cursor-tool').click();
  const before = await page.evaluate(() => {
    const d = window.__opencharts.getDrawings().find((x) => x.type === 'hline');
    return d && d.type === 'hline' ? { price: d.price, handle: window.__opencharts.handlePage('price') } : null;
  });
  expect(before?.handle).toBeTruthy();
  await page.mouse.move(before!.handle!.x, before!.handle!.y);
  await page.mouse.down();
  await page.mouse.move(before!.handle!.x, before!.handle!.y + 60, { steps: 8 });
  const mid = await page.evaluate(() => {
    const d = window.__opencharts.getDrawings().find((x) => x.type === 'hline');
    return d && d.type === 'hline' ? d.price : null;
  });
  expect(mid).not.toBeNull();
  expect(Math.abs((mid ?? 0) - before!.price)).toBeGreaterThan(0.0001);
  await page.mouse.up();
  await page.keyboard.press('Delete');
  await expect
    .poll(async () => page.evaluate(() => window.__opencharts.getDrawings().some((d) => d.type === 'hline')))
    .toBe(false);
});

test('collapsing the watchlist keeps bar spacing and does not jump the scale', async ({ page }) => {
  await page.goto('/');
  await waitReady(page);
  await page.locator('#sidebar-btn').click();
  await page.waitForTimeout(200);
  await page.locator('#sidebar-btn').click();
  await page.waitForTimeout(200);

  const before = await page.evaluate(() => ({
    range: window.__opencharts.getVisibleLogicalRange(),
    spacing: window.__opencharts.getBarSpacing(),
    price: window.__opencharts.getPriceRange(),
  }));
  expect(before.spacing).toBeGreaterThan(0);

  await page.locator('#sidebar-btn').click();
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({
    range: window.__opencharts.getVisibleLogicalRange(),
    spacing: window.__opencharts.getBarSpacing(),
    price: window.__opencharts.getPriceRange(),
  }));
  expect(after.spacing).toBeCloseTo(before.spacing, 5);
  expect(after.range).toBeTruthy();
  expect(before.range).toBeTruthy();
  expect(Math.abs(after.range!.to - before.range!.to)).toBeLessThan(3);

  fs.mkdirSync(path.dirname(SCALE_SHOT), { recursive: true });
  await page.screenshot({ path: SCALE_SHOT, fullPage: true });
});
