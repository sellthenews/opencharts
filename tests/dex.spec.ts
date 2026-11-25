// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SHOT = path.resolve('screenshots-test');
const XRPL_PAIR = 'amm:xrpl:rhWTXC2m2gGGA9WozUaoMm6kLAVPb1tcS3';
const ETH_PAIR = 'gt:eth:0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640';
const XAHAU_PAIR = 'book:xahau:XAH:EVR.rEvernodee8dJLaFsujS6q1EiXvZYmHXr8';

async function waitReady(page: Page, timeout = 90_000): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout });
  await expect(page.locator('#status')).not.toHaveClass(/is-error/);
}

test('DEX network select splits XRPL, Xahau and GeckoTerminal charts', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await waitReady(page, 45_000);

  await expect(page.locator('#network-field')).toBeHidden();
  await expect(page.locator('#source')).toHaveValue('kraken');

  await page.selectOption('#source', 'dex');
  await expect(page.locator('#network-field')).toBeVisible();
  await expect(page.locator('#dex-network')).toHaveValue('xrpl');
  await expect(page.locator('#pair')).toHaveValue(XRPL_PAIR);
  await expect(page.locator('#pair-btn')).toHaveText(/XRP\/RLUSD/i);
  await waitReady(page);
  const xrplBars = await page.evaluate(() => window.__opencharts.getCandles().length);
  expect(xrplBars).toBeGreaterThan(0);

  fs.mkdirSync(SHOT, { recursive: true });
  await page.screenshot({ path: path.join(SHOT, 'e3-dex-xrpl.png'), fullPage: true });

  await page.locator('#dex-network').focus();
  await page.screenshot({ path: path.join(SHOT, 'e3-dex-networks.png'), fullPage: true });

  await page.selectOption('#dex-network', 'eth');
  await expect(page.locator('#dex-network')).toHaveValue('eth');
  await expect(page.locator('#pair')).toHaveValue(ETH_PAIR);
  await expect(page.locator('#pair-btn')).toHaveText(/WETH\/USDC/i);
  await waitReady(page);
  const ethBars = await page.evaluate(() => window.__opencharts.getCandles().length);
  expect(ethBars).toBeGreaterThan(5);
  await page.screenshot({ path: path.join(SHOT, 'e3-dex-eth.png'), fullPage: true });

  await expect.poll(() => page.evaluate(() => localStorage.getItem('opencharts:dex-network'))).toBe('eth');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('opencharts:dex-pair:eth')))
    .toBe(ETH_PAIR);

  await page.reload();
  await waitReady(page);
  await expect(page.locator('#source')).toHaveValue('dex');
  await expect(page.locator('#dex-network')).toHaveValue('eth');
  await expect(page.locator('#pair')).toHaveValue(ETH_PAIR);

  await page.selectOption('#dex-network', 'xahau');
  await expect(page.locator('#dex-network')).toHaveValue('xahau');
  await expect(page.locator('#pair')).toHaveValue(XAHAU_PAIR);
  await expect(page.locator('#pair-btn')).toHaveText(/XAH\/EVR/i);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('opencharts:dex-network'))).toBe('xahau');

  await page.locator('#pair-btn').click();
  await expect(page.locator('#sym-modal')).toBeVisible();
  await page.locator('[data-sym-filter="dex"]').click();
  await expect(page.locator('#sym-results .sym-row').first()).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('#sym-results .sym-ex').first()).toHaveText(/DEX/);
  await page.keyboard.press('Escape');

  await page.selectOption('#source', 'kraken');
  await expect(page.locator('#network-field')).toBeHidden();
  await waitReady(page, 45_000);
});
