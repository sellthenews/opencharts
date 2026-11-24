// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { expect, test, type Page } from '@playwright/test';

async function waitReady(page: Page): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
  await expect(page.locator('#status')).not.toHaveClass(/is-error/);
}

test('Fib completes in two clicks at the chosen anchors, and a horizontal line keeps the clicked price', async ({ page }) => {
  await page.goto('/');
  await waitReady(page);

  const anchors = await page.evaluate(() => {
    const candles = window.__opencharts.getCandles();
    const range = window.__opencharts.getVisibleLogicalRange();
    if (!candles.length || !range) return null;
    const from = Math.max(0, Math.floor(range.from) + 8);
    const to = Math.min(candles.length - 1, Math.ceil(range.to) - 8);
    const a = candles[from];
    const b = candles[to];
    if (!a || !b) return null;
    const p1 = window.__opencharts.timePriceToPage(a.time, a.low);
    const p2 = window.__opencharts.timePriceToPage(b.time, b.high);
    if (!p1 || !p2) return null;
    return { a: { time: a.time, price: a.low }, b: { time: b.time, price: b.high }, p1, p2 };
  });
  expect(anchors).toBeTruthy();

  await page.locator('#tool-rail [data-tool="fib"]').click();
  await page.mouse.click(anchors!.p1.x, anchors!.p1.y);
  await page.mouse.click(anchors!.p2.x, anchors!.p2.y);
  await expect.poll(async () => page.evaluate(() => window.__opencharts.getDrawings().filter((d) => d.type === 'fib').length)).toBe(1);
  await expect.poll(async () => page.evaluate(() => window.__opencharts.getTool())).toBe('cursor');

  const fib = await page.evaluate(() => {
    const d = window.__opencharts.getDrawings().find((x) => x.type === 'fib');
    return d && d.type === 'fib' ? { p1: d.p1, p2: d.p2 } : null;
  });
  expect(fib).toBeTruthy();
  expect(fib!.p1.time).toBe(anchors!.a.time);
  expect(fib!.p2.time).toBe(anchors!.b.time);
  expect(fib!.p1.price).toBeCloseTo(anchors!.a.price, 4);
  expect(fib!.p2.price).toBeCloseTo(anchors!.b.price, 4);
  const top = Math.max(anchors!.a.price, anchors!.b.price);
  expect(Math.max(fib!.p1.price, fib!.p2.price)).toBeCloseTo(top, 4);

  const mid = await page.evaluate(() => {
    const candles = window.__opencharts.getCandles();
    const range = window.__opencharts.getVisibleLogicalRange();
    if (!candles.length || !range) return null;
    const i = Math.round((Math.max(0, range.from) + Math.min(candles.length - 1, range.to)) / 2);
    const c = candles[i];
    if (!c) return null;
    const price = c.low * 0.4 + c.high * 0.6;
    const pt = window.__opencharts.timePriceToPage(c.time, price);
    return pt ? { price, ...pt } : null;
  });
  expect(mid).toBeTruthy();

  await page.keyboard.press('Alt+h');
  await expect.poll(async () => page.evaluate(() => window.__opencharts.getTool())).toBe('hline');
  await page.mouse.click(mid!.x, mid!.y);
  await expect.poll(async () => page.evaluate(() => window.__opencharts.getDrawings().some((d) => d.type === 'hline'))).toBe(true);

  const placed = await page.evaluate(() => {
    const d = window.__opencharts.getDrawings().find((x) => x.type === 'hline');
    return d && d.type === 'hline' ? d.price : null;
  });
  expect(placed).not.toBeNull();
  expect(placed!).toBeCloseTo(mid!.price, 3);

  const field = page.locator('#draw-price');
  await expect(page.locator('#draw-price-wrap')).toBeVisible();
  const edited = Number((placed! * 1.01).toFixed(4));
  await field.fill(String(edited));
  await field.press('Enter');
  const after = await page.evaluate(() => {
    const d = window.__opencharts.getDrawings().find((x) => x.type === 'hline');
    return d && d.type === 'hline' ? d.price : null;
  });
  expect(after).toBeCloseTo(edited, 4);
});
