// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const MENU_SHOT = path.resolve('screenshots-test/watchlist-menu.png');
const LIST_SHOT = path.resolve('screenshots-test/watchlist-lista.png');

async function ready(page: import('@playwright/test').Page): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
}

async function addFromSearch(
  page: import('@playwright/test').Page,
  query: string,
  rowText: string,
  category?: 'stocks',
): Promise<void> {
  await page.locator('[data-watch-action="add-symbol"]').click();
  await expect(page.locator('#sym-modal')).toBeVisible();
  await expect(page.locator('#sym-modal-title')).toHaveText('Add to watchlist');
  if (category) await page.locator(`[data-sym-cat="${category}"]`).click();
  await page.locator('#sym-search').fill(query);
  const row = page.locator('#sym-results .sym-row', { hasText: rowText }).first();
  await expect(row).toBeVisible({ timeout: 45_000 });
  await row.click();
  await expect(page.locator('#sym-modal')).toBeHidden();
}

test('context menu adds and removes the chart symbol; + adds, x removes, list grows past 3 and persists', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page);

  // Use the empty Crypto list so the open chart (XRP/USD) can be added.
  await page.locator('#watch-list-select').selectOption({ label: 'Crypto' });
  await expect(page.locator('.watch-row')).toHaveCount(0);

  const box = await page.locator('#chart-wrap').boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.click(box!.x + box!.width * 0.55, box!.y + box!.height * 0.35, { button: 'right' });
  const menu = page.locator('#chart-menu');
  await expect(menu).toBeVisible();
  const addItem = menu.locator('[data-chart-menu="watchlist"]');
  await expect(addItem).toHaveText(/Add XRP\/USD to watchlist/);
  fs.mkdirSync(path.dirname(MENU_SHOT), { recursive: true });
  await page.screenshot({ path: MENU_SHOT, fullPage: true });
  await addItem.click();
  await expect(menu).toBeHidden();
  await expect(page.locator('.watch-row[data-pair="XRPUSD"]')).toHaveCount(1);
  await expect(page.locator('#pair')).toHaveValue('XRPUSD');

  await page.mouse.click(box!.x + box!.width * 0.55, box!.y + box!.height * 0.35, { button: 'right' });
  await expect(menu.locator('[data-chart-menu="watchlist"]')).toHaveText(/Remove XRP\/USD from watchlist/);
  await menu.locator('[data-chart-menu="watchlist"]').click();
  await expect(page.locator('.watch-row')).toHaveCount(0);

  await page.locator('#watch-list-select').selectOption({ label: 'My list' });
  await expect(page.locator('.watch-row')).toHaveCount(4);
  const chartPair = await page.locator('#pair').inputValue();

  await addFromSearch(page, 'solusd', 'SOL/USD');
  await addFromSearch(page, 'aapl', 'AAPLx', 'stocks');
  await addFromSearch(page, 'xrpn', 'XRPN', 'stocks');

  // Adding from + must not switch the open chart.
  await expect(page.locator('#pair')).toHaveValue(chartPair);
  const count = await page.locator('.watch-row').count();
  expect(count).toBeGreaterThan(3);
  await expect(page.locator('.watch-row[data-pair="AAPLxUSD"], .watch-row[data-pair="AAPLx"]')).toHaveCount(1);
  await expect(page.locator('.watch-row[data-pair="XRPN"]')).toHaveCount(1);

  // Wait for live quotes, including Yahoo XRPN, so the screenshot shows prices and %.
  await expect
    .poll(async () => {
      const texts = await page.locator('.watch-last').allTextContents();
      return texts.filter((t) => t.trim() && t.trim() !== '…').length;
    }, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(5);
  await expect(page.locator('.watch-row[data-pair="XRPN"] .watch-last')).not.toHaveText('…', { timeout: 30_000 });

  fs.mkdirSync(path.dirname(LIST_SHOT), { recursive: true });
  await page.screenshot({ path: LIST_SHOT, fullPage: true });

  const before = await page.evaluate(() => window.__opencharts.getWatchState());
  const keys = before.lists
    .find((l) => l.id === 'moje' || l.name === 'My list')
    ?.items.map((i) => `${i.sourceId}:${i.pairId}`);
  expect(keys?.length ?? 0).toBeGreaterThan(3);

  const remove = page.locator('.watch-row[data-pair="XRPUSD"] [data-watch-remove]');
  await remove.click();
  await expect(page.locator('.watch-row[data-pair="XRPUSD"]')).toHaveCount(0);
  const afterRemove = await page.locator('.watch-row').count();
  expect(afterRemove).toBe(count - 1);

  await page.reload();
  await ready(page);
  await expect(page.locator('.watch-row')).toHaveCount(afterRemove);
  await expect(page.locator('.watch-row[data-pair="XRPN"]')).toHaveCount(1);
  await expect(page.locator('.watch-row[data-pair="XRPUSD"]')).toHaveCount(0);
});

test('blocked stock proxy shows an ad-blocker message', async ({ page }) => {
  await page.route('https://opencharts-proxy.opencharts.workers.dev/**', (route) => route.abort('blockedbyclient'));
  await page.goto('/');
  await ready(page);
  await page.locator('#pair-btn').click();
  await page.locator('[data-sym-cat="stocks"]').click();
  const row = page.locator('#sym-results .sym-row', { hasText: 'XRPN' }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click();
  await expect(page.locator('#status')).toHaveClass(/is-error/, { timeout: 20_000 });
  await expect(page.locator('#status')).toContainText('opencharts-proxy.opencharts.workers.dev');
  await expect(page.locator('#status')).toContainText(/ad blocker or privacy extension/i);
});

test('legacy wykresy: localStorage is migrated and the app still loads', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem(
      'wykresy:watchlists',
      JSON.stringify({
        activeId: 'moje',
        lists: [
          {
            id: 'moje',
            name: 'Moje',
            items: [
              { sourceId: 'kraken', pairId: 'SOLUSD' },
              { sourceId: 'kraken', pairId: 'XRPUSD' },
            ],
          },
        ],
      }),
    );
    localStorage.setItem(
      'wykresy:layout',
      JSON.stringify({ sourceId: 'kraken', pairId: 'SOLUSD', intervalId: '1D', theme: 'dark', paneCount: 1 }),
    );
    localStorage.setItem('wykresy:symbols:kraken', JSON.stringify({ v: 1, t: Date.now(), rows: [] }));
    localStorage.setItem('wykresy:theme', 'dark');
  });
  await page.goto('/');
  await ready(page);
  const migrated = await page.evaluate(() => ({
    watch: localStorage.getItem('opencharts:watchlists'),
    layout: localStorage.getItem('opencharts:layout'),
    oldWatch: localStorage.getItem('wykresy:watchlists'),
    state: window.__opencharts.getWatchState(),
  }));
  expect(migrated.watch).toBeTruthy();
  expect(migrated.layout).toBeTruthy();
  expect(migrated.oldWatch).toBeTruthy();
  const items = migrated.state.lists.find((l) => l.id === 'moje')?.items ?? [];
  expect(items).toEqual([
    { sourceId: 'kraken', pairId: 'SOLUSD' },
    { sourceId: 'kraken', pairId: 'XRPUSD' },
  ]);
  await expect(page.locator('.watch-row')).toHaveCount(2);
  await expect(page.locator('.watch-row[data-pair="SOLUSD"]')).toBeVisible();
  await expect(page.locator('#pair')).toHaveValue('SOLUSD');
  await expect(page.locator('#source')).toHaveValue('kraken');
  await expect(page.locator('#status')).not.toHaveClass(/is-error/);
});
