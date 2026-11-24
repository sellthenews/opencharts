// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SHOT_DIR = path.resolve('screenshots-test');

async function waitReady(page: Page): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 60_000 });
}

async function noHorizontalScroll(page: Page): Promise<void> {
  const box = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    return {
      scrollWidth: Math.max(root.scrollWidth, body.scrollWidth),
      clientWidth: root.clientWidth,
    };
  });
  expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth + 1);
}


async function assertSingleRowToolbar(page: Page): Promise<void> {
  await expect(page.locator('#more-btn')).toBeVisible();
  const metrics = await page.evaluate(() => {
    const bar = document.querySelector('header.toolbar') as HTMLElement;
    const rect = bar.getBoundingClientRect();
    const tops = [...bar.querySelectorAll('button, select')].flatMap((el) => {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return [];
      const box = el.getBoundingClientRect();
      if (box.height < 2 || box.width < 2) return [];
      if (box.bottom <= rect.top || box.top >= rect.bottom) return [];
      return [Math.round(box.top)];
    });
    return { height: rect.height, uniqueTops: new Set(tops).size };
  });
  expect(metrics.height).toBeLessThanOrEqual(64);
  expect(metrics.uniqueTops).toBe(1);
  await noHorizontalScroll(page);
}

async function swipe(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: from.x, y: from.y, id: 0 }],
  });
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        {
          x: from.x + ((to.x - from.x) * i) / steps,
          y: from.y + ((to.y - from.y) * i) / steps,
          id: 0,
        },
      ],
    });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function pinch(page: Page, cx: number, cy: number, fromDist: number, toDist: number): Promise<void> {
  const session = await page.context().newCDPSession(page);
  const start = [
    { x: cx - fromDist / 2, y: cy, id: 0 },
    { x: cx + fromDist / 2, y: cy, id: 1 },
  ];
  const end = [
    { x: cx - toDist / 2, y: cy, id: 0 },
    { x: cx + toDist / 2, y: cy, id: 1 },
  ];
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: start });
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    const points = start.map((s, idx) => ({
      x: s.x + ((end[idx]!.x - s.x) * i) / steps,
      y: s.y + ((end[idx]!.y - s.y) * i) / steps,
      id: s.id,
    }));
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function visibleWidth(page: Page): Promise<number> {
  return page.evaluate(() => {
    const range = window.__opencharts.getVisibleLogicalRange();
    if (!range) return 0;
    return range.to - range.from;
  });
}

async function runPhoneLayout(page: Page, shotName: string): Promise<void> {
  await page.goto('/');
  await waitReady(page);
  await expect(page.locator('html')).toHaveAttribute('data-layout', 'phone');
  await assertSingleRowToolbar(page);
  const share = await page.evaluate(() => {
    const chart = document.querySelector('#chart-wrap')!.getBoundingClientRect();
    return chart.height / window.innerHeight;
  });
  expect(share).toBeGreaterThan(0.5);

  const box = await page.locator('#chart-wrap').boundingBox();
  expect(box).toBeTruthy();
  const midY = box!.y + box!.height * 0.5;
  const beforePan = await page.evaluate(() => window.__opencharts.getVisibleLogicalRange());
  expect(beforePan).toBeTruthy();
  await swipe(page, { x: box!.x + box!.width * 0.7, y: midY }, { x: box!.x + box!.width * 0.25, y: midY });
  await page.waitForTimeout(300);
  const afterPan = await page.evaluate(() => window.__opencharts.getVisibleLogicalRange());
  expect(afterPan).toBeTruthy();
  expect(Math.abs((afterPan!.from) - (beforePan!.from))).toBeGreaterThan(0.2);

  const beforeZoom = await visibleWidth(page);
  await pinch(page, box!.x + box!.width * 0.5, midY, 60, 180);
  await page.waitForTimeout(300);
  const afterZoom = await visibleWidth(page);
  expect(Math.abs(afterZoom - beforeZoom)).toBeGreaterThan(0.2);

  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, shotName), fullPage: true });
}

test.describe('phone 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('layout, no horizontal scroll, pan and pinch', async ({ page }) => {
    await runPhoneLayout(page, 'telefon-390.png');
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SHOT_DIR, 'telefon-pasek.png'), fullPage: true });
  });

  test('watchlist opens as a full-screen panel', async ({ page }) => {
    await page.goto('/');
    await waitReady(page);
    await page.locator('#sidebar-btn').click();
    await expect(page.locator('#app')).toHaveClass(/phone-panel/);
    await expect(page.locator('#sidebar')).toBeVisible();
    await expect(page.locator('#sidebar-close')).toBeVisible();
    const box = await page.locator('#sidebar').boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(300);
    expect(box?.height ?? 0).toBeGreaterThan(600);
    await noHorizontalScroll(page);
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SHOT_DIR, 'telefon-panel.png'), fullPage: true });
    await page.locator('#sidebar-close').click();
    await expect(page.locator('#app')).not.toHaveClass(/phone-panel/);
  });
});

test.describe('phone 360x800', () => {
  test.use({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });

  test('layout, no horizontal scroll, pan and pinch', async ({ page }) => {
    await runPhoneLayout(page, 'telefon-360.png');
  });
});

test.describe('phone landscape', () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });

  test('landscape layout has no horizontal scroll', async ({ page }) => {
    await page.goto('/');
    await waitReady(page);
    await expect(page.locator('html')).toHaveAttribute('data-layout', 'phone');
    await noHorizontalScroll(page);
    const share = await page.evaluate(() => {
      const chart = document.querySelector('#chart-wrap')!.getBoundingClientRect();
      return chart.height / window.innerHeight;
    });
    expect(share).toBeGreaterThan(0.45);
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SHOT_DIR, 'telefon-poziom.png'), fullPage: true });
  });
});
