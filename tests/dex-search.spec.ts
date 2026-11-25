// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SHOT = path.resolve('screenshots-test');

async function waitReady(page: Page, timeout = 90_000): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout });
  await expect(page.locator('#status')).not.toHaveClass(/is-error/);
}

async function candleCount(page: Page): Promise<number> {
  return page.evaluate(() => window.__opencharts.getCandles().length);
}

async function pickDexSymbol(page: Page, query: string, label: RegExp): Promise<void> {
  await page.locator('#pair-btn').click();
  await expect(page.locator('#sym-modal')).toBeVisible();
  await page.locator('[data-sym-filter="dex"]').click();
  await page.locator('#sym-search').fill(query);
  const row = page.locator('#sym-results .sym-row', { hasText: label }).first();
  await expect(row).toBeVisible({ timeout: 45_000 });
  await row.click();
  await expect(page.locator('#sym-modal')).toBeHidden();
}

test('DEX search lists many XRPL pairs and loads candles on XRPL, Xahau, Ethereum and Solana', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await waitReady(page, 45_000);

  await page.selectOption('#source', 'dex');
  await expect(page.locator('#dex-network')).toHaveValue('xrpl');
  await expect(page.locator('#pair-btn')).toHaveText(/XRP\/RLUSD/i);
  await waitReady(page);
  expect(await candleCount(page)).toBeGreaterThan(0);

  await page.locator('#pair-btn').click();
  await expect(page.locator('#sym-modal')).toBeVisible();
  await page.locator('[data-sym-filter="dex"]').click();
  await expect(page.locator('#sym-search')).toHaveAttribute('placeholder', /currency\.issuer/i);
  await expect(page.locator('#sym-results .sym-row').nth(8)).toBeVisible({ timeout: 45_000 });
  const labels = await page.locator('#sym-results .sym-row').allTextContents();
  const joined = labels.join(' | ');
  expect(joined).toMatch(/PHNIX/i);
  expect(joined).toMatch(/SOLO/i);
  expect(joined).toMatch(/FUZZY/i);
  fs.mkdirSync(SHOT, { recursive: true });
  await page.screenshot({ path: path.join(SHOT, 'e3-dex-xrpl-search.png'), fullPage: true });
  await page.keyboard.press('Escape');

  await pickDexSymbol(page, 'PHNIX', /PHNIX\/XRP/i);
  await expect(page.locator('#pair-btn')).toHaveText(/PHNIX\/XRP/i);
  await waitReady(page);
  expect(await candleCount(page)).toBeGreaterThan(0);
  await page.screenshot({ path: path.join(SHOT, 'e3-dex-phnix.png'), fullPage: true });

  await pickDexSymbol(page, 'SOLO', /SOLO\/XRP/i);
  await expect(page.locator('#pair-btn')).toHaveText(/SOLO\/XRP/i);
  await waitReady(page);
  expect(await candleCount(page)).toBeGreaterThan(0);

  await page.selectOption('#dex-network', 'xahau');
  await expect(page.locator('#pair-btn')).toHaveText(/XAH\/EVR/i);
  await waitReady(page, 120_000);
  expect(await candleCount(page)).toBeGreaterThan(0);

  await page.locator('#pair-btn').click();
  await expect(page.locator('#sym-modal')).toBeVisible();
  await page.locator('[data-sym-filter="dex"]').click();
  await page.locator('#sym-search').fill('CLV');
  await expect(page.locator('#sym-results .sym-row', { hasText: /CLV/i }).first()).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('Escape');

  await page.selectOption('#dex-network', 'eth');
  await expect(page.locator('#pair-btn')).toHaveText(/WETH\/USDC/i);
  await waitReady(page);
  expect(await candleCount(page)).toBeGreaterThan(5);

  await page.selectOption('#dex-network', 'solana');
  await expect(page.locator('#pair-btn')).toHaveText(/SOL\/USDC/i);
  await waitReady(page);
  expect(await candleCount(page)).toBeGreaterThan(5);
  await page.screenshot({ path: path.join(SHOT, 'e3-dex-solana.png'), fullPage: true });
});
