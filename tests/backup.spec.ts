// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const MENU_SHOT = path.resolve('screenshots-test/eksport-import-menu.png');

async function waitReady(page: Page): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
}

async function openchartsData(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const data: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('opencharts:')) data[key] = localStorage.getItem(key) ?? '';
    }
    return data;
  });
}

/** Exchange catalogs can finish writing after ready/export/import; they are not the backup under test. */
function stableOpencharts(data: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith('opencharts:symbols:')) continue;
    out[key] = value;
  }
  return out;
}

test('settings menu exports and replace-imports an identical backup', async ({ page }) => {
  await page.goto('/');
  await waitReady(page);
  await page.evaluate(() => localStorage.setItem('opencharts:test-flag', 'backup-ok'));

  const before = await openchartsData(page);
  expect(before['opencharts:test-flag']).toBe('backup-ok');

  await page.locator('#settings-btn').click();
  await expect(page.locator('#settings-menu')).toBeVisible();
  await expect(page.locator('#settings-export')).toHaveText('Export data');
  await expect(page.locator('#settings-import')).toHaveText('Import data');
  fs.mkdirSync(path.dirname(MENU_SHOT), { recursive: true });
  await page.screenshot({ path: MENU_SHOT, fullPage: true });

  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#settings-export').click()]);
  expect(download.suggestedFilename()).toMatch(/^opencharts-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const filePath = await download.path();
  expect(filePath).toBeTruthy();
  const backup = JSON.parse(fs.readFileSync(filePath!, 'utf8')) as {
    format: string;
    version: number;
    exportedAt: string;
    data: Record<string, string>;
  };
  expect(backup.format).toBe('opencharts-backup');
  expect(backup.version).toBe(1);
  expect(backup.exportedAt).toBeTruthy();
  expect(stableOpencharts(backup.data)).toEqual(stableOpencharts(before));

  await page.evaluate(() => {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('opencharts:')) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  });
  expect(await openchartsData(page)).toEqual({});

  await page.locator('#settings-btn').click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#settings-import').click()]);
  await chooser.setFiles({
    name: download.suggestedFilename(),
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.locator('#backup-modal')).toBeVisible();
  await Promise.all([page.waitForEvent('load'), page.locator('#backup-replace').click()]);
  await waitReady(page);
  expect(stableOpencharts(await openchartsData(page))).toEqual(stableOpencharts(before));
});

test('an invalid backup file is rejected', async ({ page }) => {
  await page.goto('/');
  await waitReady(page);
  await page.evaluate(() => localStorage.setItem('opencharts:test-flag', 'keep-me'));

  await page.locator('#settings-btn').click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#settings-import').click()]);
  await chooser.setFiles({
    name: 'not-a-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"format":"nope","version":1,"exportedAt":"2026-11-24","data":{}}'),
  });
  await expect(page.locator('#backup-modal')).toBeHidden();
  await expect(page.locator('#status')).toHaveClass(/is-error/);
  await expect(page.locator('#status')).toContainText('not an OpenCharts backup');
  const data = await openchartsData(page);
  expect(data['opencharts:test-flag']).toBe('keep-me');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true');
});
