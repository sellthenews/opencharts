// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const MAGNET_SHOT = path.resolve('screenshots-test/magnet-fix.png');

async function waitReady(page: Page): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
}

async function turnMagnetOn(page: Page): Promise<void> {
  const btn = page.locator('#magnet-btn');
  if ((await btn.getAttribute('aria-pressed')) !== 'true') await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
}

type SnapTarget = {
  mid: number;
  levels: number[];
  time: number;
  a: { x: number; y: number };
  b: { x: number; y: number };
  midToNearestPx: number;
};

async function pickSnapTargets(page: Page): Promise<SnapTarget | null> {
  return page.evaluate(() => {
    const candles = window.__opencharts.getCandles();
    const range = window.__opencharts.getVisibleLogicalRange();
    if (!range || candles.length < 10) return null;
    const from = Math.max(0, Math.floor(range.from) + 1);
    const to = Math.min(candles.length - 2, Math.ceil(range.to) - 1);
    let best: {
      mid: number;
      levels: number[];
      time: number;
      a: { x: number; y: number };
      b: { x: number; y: number };
      midToNearestPx: number;
    } | null = null;
    for (let i = from; i < to; i++) {
      const c = candles[i];
      const next = candles[Math.min(to, i + 3)] ?? candles[i + 1];
      if (!c || !next) continue;
      const mid = (c.high + c.low) / 2;
      const levels = [c.open, c.high, c.low, c.close];
      if (levels.some((n) => Math.abs(n - mid) < 1e-8)) continue;
      const a = window.__opencharts.timePriceToPage(c.time, mid);
      const b = window.__opencharts.timePriceToPage(next.time, mid);
      if (!a || !b) continue;
      const nearest = levels.reduce((min, n) => Math.min(min, Math.abs(n - mid)), Number.POSITIVE_INFINITY);
      const atHigh = window.__opencharts.timePriceToPage(c.time, mid - nearest === 0 ? mid : mid + (mid > c.low ? -nearest : nearest));
      const pxHigh = window.__opencharts.timePriceToPage(c.time, c.high);
      const pxLow = window.__opencharts.timePriceToPage(c.time, c.low);
      if (!pxHigh || !pxLow) continue;
      const midToNearestPx = Math.min(Math.abs(a.y - pxHigh.y), Math.abs(a.y - pxLow.y));
      void atHigh;
      const row = { mid, levels, time: c.time, a, b, midToNearestPx };
      if (!best || row.midToNearestPx > best.midToNearestPx) best = row;
    }
    return best;
  });
}

async function zoomForTallCandles(page: Page): Promise<void> {
  const box = await page.locator('#chart-wrap').boundingBox();
  if (!box) return;
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.45);
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -180);
  await page.waitForTimeout(200);
}

function isOhlc(price: number, levels: number[]): boolean {
  return levels.some((n) => Math.abs(n - price) < 1e-8);
}

async function trendPrices(page: Page): Promise<{ p1: number; p2: number; t1: number; t2: number } | null> {
  return page.evaluate(() => {
    const d = window.__opencharts.getDrawings().find((x) => x.type === 'trend');
    if (!d || d.type !== 'trend') return null;
    return { p1: d.p1.price, p2: d.p2.price, t1: d.p1.time, t2: d.p2.time };
  });
}

async function barLevelsAt(page: Page, time: number): Promise<number[] | null> {
  return page.evaluate((t) => {
    const candles = window.__opencharts.getCandles();
    if (!candles.length) return null;
    const bar = candles.reduce((best, c) => (Math.abs(c.time - t) < Math.abs(best.time - t) ? c : best));
    return [bar.open, bar.high, bar.low, bar.close];
  }, time);
}

test('desktop mouse: magnet ON snaps a placed point and a dragged handle to OHLC', async ({ page }) => {
  await page.goto('/');
  await waitReady(page);
  await zoomForTallCandles(page);
  const target = await pickSnapTargets(page);
  expect(target).toBeTruthy();

  await turnMagnetOn(page);
  await page.locator('#tool-rail [data-tool="trend"]').click();
  await page.mouse.click(target!.a.x, target!.a.y);
  await page.mouse.click(target!.b.x, target!.b.y);
  await expect.poll(async () => page.evaluate(() => window.__opencharts.getDrawings().some((d) => d.type === 'trend'))).toBe(true);

  const placed = await trendPrices(page);
  expect(placed).toBeTruthy();
  const placedLevels = await barLevelsAt(page, placed!.t1);
  expect(placedLevels).toBeTruthy();
  expect(isOhlc(placed!.p1, placedLevels!)).toBeTruthy();
  const endLevels = await barLevelsAt(page, placed!.t2);
  expect(endLevels).toBeTruthy();
  expect(isOhlc(placed!.p2, endLevels!)).toBeTruthy();

  await expect.poll(async () => page.evaluate(() => window.__opencharts.getTool())).toBe('cursor');
  const handle = await page.evaluate(() => window.__opencharts.handlePage('p2'));
  expect(handle).toBeTruthy();
  await page.mouse.move(handle!.x, handle!.y);
  await page.mouse.down();
  await page.mouse.move(target!.a.x, target!.a.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(120);

  const dragged = await trendPrices(page);
  expect(dragged).toBeTruthy();
  const dragLevels = await barLevelsAt(page, dragged!.t2);
  expect(dragLevels).toBeTruthy();
  expect(isOhlc(dragged!.p2, dragLevels!)).toBeTruthy();
});

test('desktop mouse: Ctrl still inverts magnet (snaps when off, frees when on)', async ({ page }) => {
  await page.goto('/');
  await waitReady(page);
  const target = await pickSnapTargets(page);
  expect(target).toBeTruthy();

  await page.locator('#tool-rail [data-tool="trend"]').click();
  const wrap = await page.locator('#chart-wrap').boundingBox();
  expect(wrap).toBeTruthy();
  const posA = { x: target!.a.x - wrap!.x, y: target!.a.y - wrap!.y };
  const posB = { x: target!.b.x - wrap!.x, y: target!.b.y - wrap!.y };
  await page.locator('#chart-wrap').click({ position: posA, modifiers: ['Control'] });
  await page.locator('#chart-wrap').click({ position: posB, modifiers: ['Control'] });
  await expect.poll(async () => page.evaluate(() => window.__opencharts.getDrawings().some((d) => d.type === 'trend'))).toBe(true);
  const snappedOff = await trendPrices(page);
  expect(snappedOff).toBeTruthy();
  const offLevels = await barLevelsAt(page, snappedOff!.t1);
  expect(offLevels).toBeTruthy();
  expect(isOhlc(snappedOff!.p1, offLevels!)).toBeTruthy();

  await page.keyboard.press('Delete');
  await expect.poll(async () => page.evaluate(() => window.__opencharts.getDrawings().some((d) => d.type === 'trend'))).toBe(false);

  await turnMagnetOn(page);
  await page.locator('#tool-rail [data-tool="trend"]').click();
  await page.locator('#chart-wrap').click({ position: posA, modifiers: ['Control'] });
  await page.locator('#chart-wrap').click({ position: posB, modifiers: ['Control'] });
  await expect.poll(async () => page.evaluate(() => window.__opencharts.getDrawings().some((d) => d.type === 'trend'))).toBe(true);
  const freed = await trendPrices(page);
  expect(freed).toBeTruthy();
  const freeLevels = await barLevelsAt(page, freed!.t1);
  expect(freeLevels).toBeTruthy();
  expect(isOhlc(freed!.p1, freeLevels!)).toBeFalsy();
  expect(Math.abs(freed!.p1 - target!.mid)).toBeLessThan(Math.abs(freeLevels![0]! - target!.mid));
});

test.describe('mobile touch magnet', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });

  async function touchTap(page: Page, x: number, y: number): Promise<void> {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }

  async function touchDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      const x = from.x + ((to.x - from.x) * i) / steps;
      const y = from.y + ((to.y - from.y) * i) / steps;
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }

  test('magnet ON snaps a placed point and a dragged handle with touch', async ({ page }) => {
    await page.goto('/');
    await waitReady(page);
    await zoomForTallCandles(page);
    const target = await pickSnapTargets(page);
    expect(target).toBeTruthy();

    await turnMagnetOn(page);
    await page.locator('#tool-rail [data-tool="trend"]').click();
    await touchTap(page, target!.a.x, target!.a.y);
    await page.waitForTimeout(80);
    await touchTap(page, target!.b.x, target!.b.y);
    await expect.poll(async () => page.evaluate(() => window.__opencharts.getDrawings().some((d) => d.type === 'trend'))).toBe(true);

    const placed = await trendPrices(page);
    expect(placed).toBeTruthy();
    const placedLevels = await barLevelsAt(page, placed!.t1);
    expect(placedLevels).toBeTruthy();
    expect(isOhlc(placed!.p1, placedLevels!)).toBeTruthy();
    const endLevels = await barLevelsAt(page, placed!.t2);
    expect(endLevels).toBeTruthy();
    expect(isOhlc(placed!.p2, endLevels!)).toBeTruthy();

    await expect.poll(async () => page.evaluate(() => window.__opencharts.getTool())).toBe('cursor');
    const handle = await page.evaluate(() => window.__opencharts.handlePage('p2'));
    expect(handle).toBeTruthy();
    await touchDrag(page, handle!, target!.a);
    await page.waitForTimeout(120);

    const dragged = await trendPrices(page);
    expect(dragged).toBeTruthy();
    const dragLevels = await barLevelsAt(page, dragged!.t2);
    expect(dragLevels).toBeTruthy();
    expect(isOhlc(dragged!.p2, dragLevels!)).toBeTruthy();

    fs.mkdirSync(path.dirname(MAGNET_SHOT), { recursive: true });
    await page.screenshot({ path: MAGNET_SHOT, fullPage: true });
  });
});
