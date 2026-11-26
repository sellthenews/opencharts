// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { expect, test } from '@playwright/test';

test('symbol modal: exchange picker is gone, language then gear then sign-in', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });

  const holder = await page.locator('.state-holders').boundingBox();
  expect(!holder || holder.width <= 2).toBeTruthy();
  await expect(page.locator('#exchange-field')).toHaveCount(1);
  await expect(page.locator('#pair-src')).toHaveText('Kraken');

  const lang = page.locator('#lang-btn');
  const gear = page.locator('#settings-btn');
  await expect(lang).toBeVisible();
  await expect(gear).toBeVisible();
  await expect(gear).toHaveAttribute('aria-label', /.+/);
  await expect(gear).toHaveAttribute('title', /.+/);
  expect(((await gear.textContent()) ?? '').trim()).toBe('');
  const [l, g, a] = await Promise.all([
    lang.boundingBox(),
    gear.boundingBox(),
    page.locator('#header-account-btn').boundingBox(),
  ]);
  expect(l && g && g.x > l.x && Math.abs(g.x - (l.x + l.width)) < 48).toBeTruthy();
  expect(g && a && a.x > g.x && Math.abs(a.x - (g.x + g.width)) < 48).toBeTruthy();
});

test('symbol modal: typing opens it, tabs, keyboard, recents', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });

  // Typing a letter on the chart opens the search with that letter.
  await page.locator('#chart-wrap').click({ position: { x: 100, y: 100 } });
  await page.keyboard.press('x');
  await expect(page.locator('#sym-modal')).toBeVisible();
  await expect(page.locator('#sym-search')).toHaveValue('x');
  await page.locator('#sym-search').fill('');

  // Empty state lists popular symbols with type tag and exchange.
  const first = page.locator('#sym-results .sym-row').first();
  await expect(first).toBeVisible({ timeout: 45_000 });
  await expect(first.locator('.sym-type')).toBeVisible();
  await expect(first.locator('.sym-ex-name')).toBeVisible();

  // Tabs and source dropdown stay in sync.
  await page.locator('[data-sym-cat="xrpl"]').click();
  await expect(page.locator('#sym-source')).toHaveValue('dex:xrpl');
  await page.locator('[data-sym-cat="all"]').click();
  await expect(page.locator('#sym-source')).toHaveValue('all');
  await page.locator('#sym-source').selectOption('yahoo');
  await expect(page.locator('[data-sym-cat="stocks"]')).toHaveClass(/is-active/);
  await page.locator('#sym-source').selectOption('all');
  await page.locator('[data-sym-cat="all"]').click();

  // Keyboard: type, arrow down, Enter selects the second row.
  await page.locator('#sym-search').fill('sol');
  await expect(page.locator('#sym-clear')).toBeVisible();
  const rows = page.locator('#sym-results .sym-row');
  await expect(rows.nth(1)).toBeVisible({ timeout: 45_000 });
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(1)).toHaveClass(/is-active/);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(page.locator('#sym-modal')).toBeHidden();
  await expect(page.locator('#pair')).toHaveValue(/sol/i);

  // The pick shows up under recent searches; Esc closes.
  await page.locator('#pair-btn').click();
  await expect(page.locator('#sym-results .sym-section').first()).toBeVisible();
  await expect(page.locator('#sym-results .sym-row').first()).toContainText(/sol/i);
  await page.keyboard.press('Escape');
  await expect(page.locator('#sym-modal')).toBeHidden();
});
