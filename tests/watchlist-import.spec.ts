// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { expect, test } from '@playwright/test';
import fs from 'node:fs';

const PHNIX = 'gt:xrpl:50484E4958000000000000000000000000000000.rDFXbW2ZZCG5WgPtqwNiA2xZokLMm9ivmN_XRP';
const XAH_USD = 'book:xahau:XAH:USD.rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq';

function sampleBackup(): string {
  const state = {
    activeId: 'imp',
    lists: [
      {
        id: 'imp',
        name: 'Imported',
        items: [],
        sections: [
          { id: 's1', name: 'FX', collapsed: false, items: [{ sourceId: 'yahoo', pairId: 'USDPLN=X' }] },
          { id: 's2', name: 'INDEX', collapsed: false, items: [{ sourceId: 'yahoo', pairId: '^GSPC' }] },
          {
            id: 's3',
            name: 'CRYPTO',
            collapsed: false,
            items: [
              { sourceId: 'kraken', pairId: 'XRPUSD' },
              { sourceId: 'dex', pairId: PHNIX },
              { sourceId: 'dex', pairId: XAH_USD },
            ],
          },
          {
            id: 's4',
            name: 'ANALYSIS',
            collapsed: false,
            items: [
              { sourceId: 'calc', pairId: 'XLMXRP' },
              { sourceId: 'kraken', pairId: 'XRPUSD' },
              { sourceId: 'kraken', pairId: 'XRPBTC' },
              { sourceId: 'calc', pairId: 'BTC.D' },
              { sourceId: 'calc', pairId: 'XRP.D' },
            ],
          },
        ],
      },
    ],
  };
  const file = process.env.WATCHLIST_IMPORT_FILE;
  if (file) return fs.readFileSync(file, 'utf8');
  return JSON.stringify({
    format: 'opencharts-backup',
    version: 1,
    exportedAt: '2026-11-26T12:00:00.000Z',
    data: { 'opencharts:watchlists': JSON.stringify(state) },
  });
}

test('importing a watchlist file adds its sections, keeps old lists and fills prices', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });

  await page.evaluate(() =>
    localStorage.setItem(
      'opencharts:watchlists',
      JSON.stringify({
        activeId: 'moje',
        lists: [
          { id: 'moje', name: 'Moje', items: [{ sourceId: 'kraken', pairId: 'ETHUSD' }], sections: [] },
          { id: 'krypto', name: 'Krypto', items: [], sections: [] },
        ],
      }),
    ),
  );
  await page.locator('#settings-btn').click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#settings-import').click()]);
  await chooser.setFiles({ name: 'watchlist.json', mimeType: 'application/json', buffer: Buffer.from(sampleBackup()) });
  await expect(page.locator('#backup-modal')).toBeVisible();
  await Promise.all([page.waitForEvent('load'), page.locator('#backup-merge').click()]);
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });

  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('opencharts:watchlists') ?? '{}'));
  expect(state.lists.map((l: { id: string }) => l.id)).toEqual(['moje', 'krypto', state.activeId]);

  const names = await page.locator('.watch-section [data-watch-section-name]').allTextContents();
  expect(names.length).toBeGreaterThanOrEqual(4);

  const rows = page.locator('.watch-row');
  const total = await rows.count();
  expect(total).toBeGreaterThanOrEqual(9);
  // every row gets a price (not the loading dots and not a dash)
  await expect
    .poll(async () => (await page.locator('.watch-row .watch-last').allTextContents()).filter((x) => !/^[0-9]/.test(x.trim())).length, {
      timeout: 60_000,
      intervals: [1000],
    })
    .toBe(0);

  // the same pair in two sections: removing one keeps the other
  const xrp = page.locator('.watch-row[data-watch-key="kraken:XRPUSD"]');
  expect(await xrp.count()).toBe(2);
  await xrp.last().locator('[data-watch-remove]').click();
  await expect(page.locator('.watch-row[data-watch-key="kraken:XRPUSD"]')).toHaveCount(1);

  // a DEX row (id contains colons) can be removed too
  const dexRow = page.locator('.watch-row[data-source="dex"]').first();
  const before = await page.locator('.watch-row').count();
  await dexRow.locator('[data-watch-remove]').click();
  await expect(page.locator('.watch-row')).toHaveCount(before - 1);
});
