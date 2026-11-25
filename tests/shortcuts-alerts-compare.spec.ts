// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

async function ready(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
}

test('alert and interval helper checks', async ({ page }) => {
  await ready(page);
  const out = await page.evaluate(() => {
    const api = window.__opencharts;
    const price = { id: 'a', sourceId: 'kraken', pairId: 'XRPUSD', kind: 'price', price: 2, direction: 'above', enabled: true };
    const p1 = { time: 100, price: 1 };
    const p2 = { time: 200, price: 2 };
    const trend = { id: 'b', sourceId: 'kraken', pairId: 'XRPUSD', kind: 'trend', price: 2, direction: 'cross', enabled: true, p1, p2 };
    const hline = { id: 'c', sourceId: 'kraken', pairId: 'XRPUSD', kind: 'hline', price: 10, direction: 'cross', enabled: true };
    return {
      i4: api.parseInterval('4'),
      i1d: api.parseInterval('1D'),
      id: api.parseInterval('d'),
      iw: api.parseInterval('1w'),
      bad: api.parseInterval('nope'),
      mid: api.trendPriceAt(p1, p2, 150),
      below: api.checkAlert(price, 1.5),
      hit: api.checkAlert(price, 2),
      cross: api.checkAlert(trend, 2, { time: 200, prev: 1.2, prevTime: 150 }),
      stay: api.checkAlert(trend, 1.2, { time: 150, prev: 1.1, prevTime: 140 }),
      hcross: api.checkAlert(hline, 11, { prev: 9, prevTime: 1, time: 2 }),
      habove: api.checkAlert(hline, 11, { prev: 10.5, prevTime: 1, time: 2 }),
    };
  });
  expect(out.i4).toBe('4h');
  expect(out.i1d).toBe('1D');
  expect(out.id).toBe('1D');
  expect(out.iw).toBe('1W');
  expect(out.bad).toBeNull();
  expect(out.mid).toBe(1.5);
  expect(out.below).toBe(false);
  expect(out.hit).toBe(true);
  expect(out.cross).toBe(true);
  expect(out.stay).toBe(false);
  expect(out.hcross).toBe(true);
  expect(out.habove).toBe(false);
});

test('shortcuts: Alt tools, interval, undo/redo', async ({ page }) => {
  await ready(page);

  await page.keyboard.press('Alt+h');
  await expect.poll(async () => page.evaluate(() => window.__opencharts.getTool())).toBe('hline');

  await page.keyboard.type('4');
  await expect(page.locator('#interval-hint')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect.poll(async () => page.evaluate(() => window.__opencharts.getInterval())).toBe('4h');
  await expect(page.locator('[data-interval="4h"]')).toHaveClass(/is-active/);

  await page.evaluate(() => {
    window.__opencharts.importDrawings(
      JSON.stringify({
        version: 1,
        sourceId: 'kraken',
        pairId: 'XRPUSD',
        drawings: [{ id: 't1', type: 'hline', price: 1.5 }],
      }),
    );
  });
  await expect.poll(async () => page.evaluate(() => window.__opencharts.getDrawings().length)).toBe(1);
  await page.evaluate(() => {
    const list = window.__opencharts.getDrawings();
    // select by re-importing after a click is hard; delete via undo stack: clear all
  });
  await page.keyboard.press('Alt+t');
  await expect.poll(async () => page.evaluate(() => window.__opencharts.getTool())).toBe('trend');

  await page.locator('#ind-btn').click();
  await page.locator('[data-ind-add="rsi"]').first().click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.ind-label[data-kind="rsi"]')).toBeVisible();
  await page.locator('#chart-wrap').click({ position: { x: 20, y: 20 } });
  await page.keyboard.press('Control+z');
  await expect.poll(async () => page.locator('.ind-label[data-kind="rsi"]').count()).toBe(0);
  await page.keyboard.press('Control+y');
  await expect(page.locator('.ind-label[data-kind="rsi"]')).toBeVisible();
});

test('alerts: add, edit, delete, note, and screenshot', async ({ page }) => {
  await ready(page);
  await expect(page.locator('.alert-note')).toHaveText('Alerts work while this tab is open');

  const wrap = page.locator('#chart-wrap');
  const box = await wrap.boundingBox();
  expect(box).toBeTruthy();
  await wrap.click({ button: 'right', position: { x: box!.width * 0.6, y: box!.height * 0.4 } });
  const item = page.locator('#chart-menu [data-chart-menu="add-alert"]');
  await expect(item).toBeVisible();
  await expect(item).toContainText('Add alert');
  await item.click();
  await expect(page.locator('.alert-item')).toHaveCount(1);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('opencharts:alerts') ?? '[]'));
  expect(stored.length).toBe(1);

  await page.locator('[data-alert-edit]').click();
  await page.locator('#alert-price').fill('3.25');
  await page.locator('#alert-form button[type="submit"]').click();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('opencharts:alerts') ?? '[]'));
  expect(after[0].price).toBe(3.25);

  fs.mkdirSync('screenshots-test', { recursive: true });
  await page.screenshot({ path: path.resolve('screenshots-test/alerty.png'), fullPage: true });

  await page.locator('[data-alert-del]').click();
  await expect(page.locator('.alert-item')).toHaveCount(0);
});

test('compare overlay persists percent legend', async ({ page }) => {
  await ready(page);
  await page.locator('#compare-btn').click();
  await expect(page.locator('#compare-pop')).toBeVisible();
  await page.locator('[data-compare-add="kraken:BTCUSD"]').click();
  await expect(page.locator('#compare-legend')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#compare-legend')).toContainText('BTC/USD');
  const keys = await page.evaluate(() => JSON.parse(localStorage.getItem('opencharts:compare') ?? '[]'));
  expect(keys.some((k: { pairId: string }) => k.pairId === 'BTCUSD')).toBeTruthy();

  fs.mkdirSync('screenshots-test', { recursive: true });
  await page.locator('body').click({ position: { x: 10, y: 10 } });
  await page.screenshot({ path: path.resolve('screenshots-test/compare.png'), fullPage: true });
});
