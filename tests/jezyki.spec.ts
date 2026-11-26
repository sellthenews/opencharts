// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SHOT_DIR = path.resolve('screenshots-test');

async function waitReady(page: Page): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
}

async function pickLang(page: Page, id: string): Promise<void> {
  await page.locator('#lang-btn').click();
  await expect(page.locator('#lang-menu')).toBeVisible();
  await page.locator(`#lang-menu [data-lang="${id}"]`).click();
  await expect(page.locator('#lang-select')).toHaveValue(id);
}

test('language switch, persistence, autodetection, and RTL', async ({ page, browser }) => {
  await page.goto('/');
  await waitReady(page);

  await expect(page.locator('#lang-btn')).toBeVisible();
  await expect(page.locator('#lang-select')).toHaveValue('en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('[data-i18n="toolbar.exchange"]')).toHaveText('Exchange');
  const storedBefore = await page.evaluate(() => localStorage.getItem('opencharts:lang'));
  expect(storedBefore).toBeNull();

  await pickLang(page, 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('#chart-wrap')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('#charts')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('[data-i18n="toolbar.exchange"]')).not.toHaveText('Exchange');
  const storedAr = await page.evaluate(() => localStorage.getItem('opencharts:lang'));
  expect(storedAr).toBe('ar');

  await page.reload();
  await waitReady(page);
  await expect(page.locator('#lang-select')).toHaveValue('ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('#chart-wrap')).toHaveAttribute('dir', 'ltr');

  const zhCtx = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1400, height: 900 } });
  const zhPage = await zhCtx.newPage();
  await zhPage.goto('/');
  await waitReady(zhPage);
  await expect(zhPage.locator('#lang-btn')).toBeVisible();
  await expect(zhPage.locator('#lang-select')).toHaveValue('zh');
  await expect(zhPage.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(zhPage.locator('html')).toHaveAttribute('dir', 'ltr');
  const storedZh = await zhPage.evaluate(() => localStorage.getItem('opencharts:lang'));
  expect(storedZh).toBeNull();
  await expect(zhPage.locator('[data-i18n="toolbar.exchange"]')).not.toHaveText('Exchange');
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await zhPage.screenshot({ path: path.join(SHOT_DIR, 'jezyki-zh.png') });
  await zhCtx.close();

  await pickLang(page, 'pl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  await page.screenshot({ path: path.join(SHOT_DIR, 'jezyki-pl.png') });
  await pickLang(page, 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.screenshot({ path: path.join(SHOT_DIR, 'jezyki-ar.png') });
});
