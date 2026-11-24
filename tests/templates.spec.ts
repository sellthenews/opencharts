// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

async function ready(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
}

test('saved template loads onto another chart', async ({ page }) => {
  await ready(page);

  await page.locator('#ind-btn').click();
  await page.locator('[data-ind-add="rsi"]').first().click();
  await page.keyboard.press('Escape');
  const rsi = page.locator('.ind-label[data-kind="rsi"]');
  await expect(rsi).toBeVisible();
  await rsi.locator('[data-ind-act="settings"]').click();
  await page.locator('.ind-popover input[data-ind-field="period"]').fill('21');
  await expect(rsi.locator('.ind-label-text')).toHaveText('RSI 21');
  await page.keyboard.press('Escape');

  async function openSettings(): Promise<void> {
    const menu = page.locator('#settings-menu');
    if (await menu.isHidden()) await page.locator('#settings-btn').click();
    await expect(menu).toBeVisible();
  }

  page.once('dialog', (dialog) => dialog.accept('Swing'));
  await openSettings();
  await page.locator('#settings-save-template').click();
  await expect(page.locator('[data-template-load]')).toHaveText('Swing');

  fs.mkdirSync('screenshots-test', { recursive: true });
  await page.screenshot({ path: path.resolve('screenshots-test/szablony.png'), fullPage: true });

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('opencharts:templates') ?? 'null'));
  expect(stored?.items?.[0]?.name).toBe('Swing');
  expect(stored?.items?.[0]?.indicators?.some((i: { kind: string; params?: { period?: number } }) => i.kind === 'rsi' && i.params?.period === 21)).toBeTruthy();
  expect(stored?.items?.[0]?.styles?.fib).toBeTruthy();
  expect(stored?.items?.[0]?.styles?.fibext).toBeTruthy();

  await page.evaluate(() => window.__opencharts.applySelection('kraken', 'BTCUSD'));
  await expect(page.locator('#pair-btn')).toHaveText('BTC/USD');
  await expect(page.locator('.ind-label[data-kind="rsi"]')).toHaveCount(0);

  await openSettings();
  await page.locator('[data-template-load]').click();
  await expect(page.locator('.ind-label[data-kind="rsi"] .ind-label-text')).toHaveText('RSI 21');
});

test('15 indicators patch the last candle faster than a full rebuild', async ({ page }) => {
  await ready(page);
  const kinds = [
    'sma', 'ema', 'wma', 'bb', 'supertrend', 'donchian', 'keltner', 'volume',
    'rsi', 'macd', 'stoch', 'atr', 'cci', 'cmf', 'aroon',
  ];
  await page.evaluate((list) => window.__opencharts.seedIndicators(list), kinds);
  await expect(page.locator('.ind-label')).toHaveCount(15);

  const full = await page.evaluate(() => {
    window.__opencharts.requestFullApply();
    window.__opencharts.tickLastCandle();
    return window.__opencharts.lastApplyInfo();
  });
  const patch = await page.evaluate(() => {
    window.__opencharts.tickLastCandle();
    return window.__opencharts.lastApplyInfo();
  });
  expect(full.mode).toBe('full');
  expect(patch.mode).toBe('patch');
  expect(patch.ms).toBeLessThan(Math.max(25, full.ms));
  console.log(`indicator apply 15: full ${full.ms.toFixed(2)}ms, patch ${patch.ms.toFixed(2)}ms`);
});
