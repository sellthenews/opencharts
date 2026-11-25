// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SHOT_HIDDEN = path.resolve('screenshots-test/e1-indicators-hidden.png');
const SHOT_VOLUME = path.resolve('screenshots-test/e1-volume-ma-settings.png');

async function waitReady(page: Page): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
}

async function clickEmptyPlot(page: Page): Promise<void> {
  const box = await page.locator('#chart-wrap').boundingBox();
  expect(box).toBeTruthy();
  const b = box!;
  await page.mouse.click(b.x + b.width * 0.62, b.y + b.height * 0.42);
  await page.waitForTimeout(120);
}

test('a click on an empty chart area does not hide indicators; the toolbar button does', async ({ page }) => {
  await page.goto('/');
  await waitReady(page);
  await expect(page.locator('.ind-label[data-kind="volume"]')).toBeVisible();
  await expect(page.locator('#ind-visibility-btn')).toHaveAttribute('aria-pressed', 'false');

  await clickEmptyPlot(page);
  await expect.poll(async () => page.evaluate(() => window.__opencharts.isIndicatorsHidden())).toBe(false);
  await expect(page.locator('#ind-hidden-cue')).toBeHidden();
  await expect(page.locator('#ind-visibility-btn')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.ind-label[data-kind="volume"]')).toBeVisible();

  await page.locator('#ind-visibility-btn').click();
  await expect(page.locator('#app')).toHaveAttribute('data-indicators', 'off');
  await expect.poll(async () => page.evaluate(() => window.__opencharts.isIndicatorsHidden())).toBe(true);
  await expect(page.locator('#ind-hidden-cue')).toBeVisible();
  await expect(page.locator('#ind-visibility-btn')).toHaveAttribute('aria-pressed', 'true');

  fs.mkdirSync(path.dirname(SHOT_HIDDEN), { recursive: true });
  await page.screenshot({ path: SHOT_HIDDEN, fullPage: true });

  await clickEmptyPlot(page);
  await expect.poll(async () => page.evaluate(() => window.__opencharts.isIndicatorsHidden())).toBe(true);
  await expect(page.locator('#ind-hidden-cue')).toBeVisible();

  await page.locator('#ind-visibility-btn').click();
  await expect.poll(async () => page.evaluate(() => window.__opencharts.isIndicatorsHidden())).toBe(false);
  await expect(page.locator('#ind-hidden-cue')).toBeHidden();
  await expect(page.locator('#ind-visibility-btn')).toHaveAttribute('aria-pressed', 'false');

  const box = await page.locator('#chart-wrap').boundingBox();
  const b = box!;
  await page.locator('#tool-rail [data-tool="trend"]').click();
  await expect.poll(async () => page.evaluate(() => window.__opencharts.getTool())).toBe('trend');
  await page.mouse.click(b.x + b.width * 0.3, b.y + b.height * 0.35);
  await expect.poll(async () => page.evaluate(() => window.__opencharts.isIndicatorsHidden())).toBe(false);
  await page.mouse.click(b.x + b.width * 0.6, b.y + b.height * 0.45);
  await expect.poll(async () => page.evaluate(() => window.__opencharts.getDrawings().some((d) => d.type === 'trend'))).toBe(true);
  await expect.poll(async () => page.evaluate(() => window.__opencharts.getTool())).toBe('cursor');

  const handle = await page.evaluate(() => window.__opencharts.handlePage('p2'));
  expect(handle).toBeTruthy();
  await page.mouse.click(handle!.x, handle!.y);
  await expect.poll(async () => page.evaluate(() => window.__opencharts.isIndicatorsHidden())).toBe(false);

  const mid = await page.evaluate(() => {
    const d = window.__opencharts.getDrawings().find((x) => x.type === 'trend');
    if (!d || d.type !== 'trend') return null;
    return window.__opencharts.timePriceToPage((d.p1.time + d.p2.time) / 2, (d.p1.price + d.p2.price) / 2);
  });
  expect(mid).toBeTruthy();
  await page.mouse.move(mid!.x, mid!.y);
  await page.mouse.down();
  await page.mouse.move(mid!.x, mid!.y + 40, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => page.evaluate(() => window.__opencharts.isIndicatorsHidden())).toBe(false);

  const before = await page.evaluate(() => window.__opencharts.getVisibleLogicalRange());
  await page.mouse.move(b.x + b.width * 0.7, b.y + b.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.45, b.y + b.height * 0.4, { steps: 10 });
  await page.mouse.up();
  const after = await page.evaluate(() => window.__opencharts.getVisibleLogicalRange());
  expect(Math.abs((after?.from ?? 0) - (before?.from ?? 0))).toBeGreaterThan(0.2);
  await expect.poll(async () => page.evaluate(() => window.__opencharts.isIndicatorsHidden())).toBe(false);
});

test('volume settings can turn the moving average off; RSI divergences default to off', async ({ page }) => {
  await page.goto('/');
  await waitReady(page);

  const volume = page.locator('.ind-label[data-kind="volume"]');
  await expect(volume).toBeVisible();
  await volume.locator('[data-ind-act="settings"]').click();
  const ma = page.locator('.ind-popover input[data-ind-field="ma"]');
  await expect(ma).toBeVisible();
  await expect(ma).toBeChecked();
  await expect(page.locator('.ind-popover input[data-ind-field="period"]')).toHaveValue('20');
  fs.mkdirSync(path.dirname(SHOT_VOLUME), { recursive: true });
  await page.locator('.ind-popover').screenshot({ path: SHOT_VOLUME, timeout: 10_000 });
  await ma.click();
  await expect(ma).not.toBeChecked();
  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem('opencharts:indicators:kraken:XRPUSD');
    const parsed = raw ? (JSON.parse(raw) as { items?: { kind: string; params?: { ma?: string; period?: number } }[] }) : null;
    const vol = parsed?.items?.find((i) => i.kind === 'volume');
    return vol?.params ?? null;
  });
  expect(stored?.ma).toBe('off');
  expect(stored?.period).toBe(20);
  await page.keyboard.press('Escape');

  await page.locator('#ind-btn').click();
  await page.locator('#ind-search').fill('RSI');
  await page.locator('[data-ind-add="rsi"]').click();
  await page.keyboard.press('Escape');
  const rsi = page.locator('.ind-label[data-kind="rsi"]');
  await expect(rsi).toBeVisible();
  await rsi.locator('[data-ind-act="settings"]').click();
  const div = page.locator('.ind-popover input[data-ind-field="divergences"]');
  await expect(div).toBeVisible();
  await expect(div).not.toBeChecked();
});
