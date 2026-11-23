// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Wykresy contributors

import { expect, test } from '@playwright/test';

test('okno wskaźników: wyszukaj RSI, dodaj, zmień okres, ukryj, usuń', async ({ page }) => {
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
    const raw = localStorage.getItem('wykresy:indicators');
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
