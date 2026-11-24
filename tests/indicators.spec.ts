// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';

test('indicators dialog: search RSI, add, change period, hide, remove', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });

  await page.locator('#ind-btn').click();
  await expect(page.locator('#ind-modal')).toBeVisible();
  await page.locator('#ind-search').fill('RSI');
  await expect(page.locator('[data-ind-add="rsi"]')).toBeVisible();
  await expect(page.locator('[data-ind-add="sma"]')).toHaveCount(0);
  await page.locator('[data-ind-add="rsi"]').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#ind-modal')).toBeHidden();

  const rsi = page.locator('.ind-label[data-kind="rsi"]');
  await expect(rsi).toBeVisible();
  await expect(rsi.locator('.ind-label-text')).toHaveText('RSI 14');
  await expect(page.locator('#app')).toHaveAttribute('data-rsi', 'on');

  await rsi.locator('[data-ind-act="settings"]').click();
  const period = page.locator('.ind-popover input[data-ind-field="period"]');
  await expect(period).toBeVisible();
  await period.fill('21');
  await expect(rsi.locator('.ind-label-text')).toHaveText('RSI 21');

  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem('opencharts:indicators:kraken:XRPUSD');
    return raw ? JSON.parse(raw) : null;
  });
  expect(stored?.v).toBe(2);
  expect(stored?.items?.some((i: { kind: string; params?: { period?: number } }) => i.kind === 'rsi' && i.params?.period === 21)).toBeTruthy();

  await rsi.locator('[data-ind-act="toggle"]').click();
  await expect(page.locator('.ind-label[data-kind="rsi"]')).toHaveAttribute('data-visible', 'off');
  await expect(page.locator('#app')).toHaveAttribute('data-rsi', 'off');

  await page.locator('.ind-label[data-kind="rsi"] [data-ind-act="remove"]').click();
  await expect(page.locator('.ind-label[data-kind="rsi"]')).toHaveCount(0);
});

test('indicator math matches reference fixtures', () => {
  execFileSync('node', ['--experimental-strip-types', 'scripts/check-indicators.ts'], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
});

test('indicators persist after reload, favorites and screenshots', async ({ page }) => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });

  await page.locator('#ind-btn').click();
  await expect(page.locator('#ind-modal')).toBeVisible();
  await expect(page.locator('.ind-group h3').filter({ hasText: 'Trend' })).toBeVisible();
  await expect(page.locator('[data-ind-add="sma"]')).toBeVisible();
  await expect(page.locator('[data-ind-add="vpvr"]')).toBeVisible();
  const rsiFav = page.locator('.ind-group:not(:has-text("Favorites")) [data-ind-fav="rsi"]');
  await rsiFav.click();
  await expect(page.locator('[data-ind-fav="rsi"]')).toHaveCount(2);
  await expect(page.locator('[data-ind-fav="rsi"]').first()).toHaveClass(/is-on/);
  await expect(page.locator('.ind-group h3').filter({ hasText: 'Favorites' })).toBeVisible();
  fs.mkdirSync('screenshots-test', { recursive: true });
  await page.screenshot({ path: path.resolve('screenshots-test/wskazniki-okno.png'), fullPage: true });

  await page.locator('[data-ind-add="sma"]').first().click();
  await page.locator('[data-ind-add="bb"]').first().click();
  await page.locator('[data-ind-add="rsi"]').first().click();
  await page.locator('[data-ind-add="macd"]').first().click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#ind-modal')).toBeHidden();
  await expect(page.locator('.ind-label[data-kind="sma"]')).toBeVisible();
  await expect(page.locator('.ind-label[data-kind="bb"]')).toBeVisible();
  await expect(page.locator('.ind-label[data-kind="rsi"]')).toBeVisible();
  await expect(page.locator('.ind-label[data-kind="macd"]')).toBeVisible();

  const rsi = page.locator('.ind-label[data-kind="rsi"]');
  await rsi.locator('[data-ind-act="settings"]').click();
  await page.locator('.ind-popover input[data-ind-field="period"]').fill('21');
  await expect(rsi.locator('.ind-label-text')).toHaveText('RSI 21');
  await page.screenshot({ path: path.resolve('screenshots-test/wskazniki-wykres.png'), fullPage: true });

  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem('opencharts:indicators:kraken:XRPUSD');
    return raw ? JSON.parse(raw) : null;
  });
  expect(stored?.v).toBe(2);
  expect(stored?.items?.some((i: { kind: string; params?: { period?: number } }) => i.kind === 'rsi' && i.params?.period === 21)).toBeTruthy();

  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
  await expect(page.locator('.ind-label[data-kind="rsi"] .ind-label-text')).toHaveText('RSI 21');
  await expect(page.locator('.ind-label[data-kind="sma"]')).toBeVisible();
  await expect(page.locator('.ind-label[data-kind="macd"]')).toBeVisible();

  await page.locator('#ind-btn').click();
  await expect(page.locator('#ind-modal')).toBeVisible();
  await expect(page.locator('.ind-group h3').filter({ hasText: 'Favorites' })).toBeVisible();
  await expect(page.locator('[data-ind-fav="rsi"]').first()).toHaveClass(/is-on/);
});
