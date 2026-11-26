// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SHOT = path.resolve('screenshots-test/watchlista-sekcje.png');

test('watchlist sections and row order persist after reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
  await expect(page.locator('.watch-row[data-watch-key="kraken:XRPUSD"]')).toBeVisible();

  await page.locator('[data-watch-action="list-menu"]').click();
  await page.locator('.watch-menu [data-watch-action="add-section"]').click();
  const section = page.locator('.watch-section').first();
  await expect(section).toBeVisible();
  await expect(section.locator('[data-watch-section-name]')).toHaveText('Section');

  await section.locator('[data-watch-section-name]').dblclick();
  const input = page.locator('.watch-sec-input');
  await expect(input).toBeVisible();
  await input.fill('Majors');
  await input.press('Enter');
  await expect(section.locator('[data-watch-section-name]')).toHaveText('Majors');

  const eth = page.locator('.watch-row[data-watch-key="kraken:ETHUSD"]');
  const dropArea = page.locator('.watch-section').first();
  await eth.dragTo(dropArea.locator('.watch-sec-head'));
  await expect(page.locator('.watch-section .watch-row[data-watch-key="kraken:ETHUSD"]')).toBeVisible();

  const btc = page.locator('.watch-row[data-watch-key="kraken:BTCUSD"]');
  const xrp = page.locator('.watch-row[data-watch-key="kraken:XRPUSD"]');
  await btc.dragTo(xrp);
  const looseKeys = await page.locator('.watch-body > .watch-row').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-watch-key')),
  );
  expect(looseKeys).toEqual(['kraken:BTCUSD', 'kraken:XRPUSD', 'yahoo:XRPN']);

  fs.mkdirSync(path.dirname(SHOT), { recursive: true });
  await page.screenshot({ path: SHOT, fullPage: true });

  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
  await expect(page.locator('[data-watch-section-name]')).toHaveText('Majors');
  await expect(page.locator('.watch-section .watch-row[data-watch-key="kraken:ETHUSD"]')).toBeVisible();
  const after = await page.locator('.watch-body > .watch-row').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-watch-key')),
  );
  expect(after).toEqual(['kraken:BTCUSD', 'kraken:XRPUSD', 'yahoo:XRPN']);

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('opencharts:watchlists') ?? 'null'));
  expect(stored?.lists?.[0]?.sections?.[0]?.name).toBe('Majors');
  expect(stored?.lists?.[0]?.sections?.[0]?.items?.some((i: { pairId: string }) => i.pairId === 'ETHUSD')).toBeTruthy();
  expect(stored?.lists?.[0]?.items?.map((i: { pairId: string }) => i.pairId)).toEqual(['BTCUSD', 'XRPUSD']);
});
