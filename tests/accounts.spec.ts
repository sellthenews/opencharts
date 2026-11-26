// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SHOT = path.resolve('screenshots-test');

test('Account in Settings opens GitHub, Google and email sign-in', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });

  await expect(page.locator('#header-account-btn')).toBeVisible();
  await expect(page.locator('#backup-hint')).toHaveCount(0);
  await expect(page.locator('#goto-date')).toHaveCount(0);
  await page.locator('#header-account-btn').click();
  await expect(page.locator('#account-modal')).toBeVisible();
  await page.locator('#account-close').click();
  await expect(page.locator('#account-modal')).toBeHidden();

  await page.locator('#settings-btn').click();
  await expect(page.locator('#settings-menu')).toBeVisible();
  await page.locator('#settings-account').click();

  await expect(page.locator('#account-modal')).toBeVisible();
  await expect(page.locator('#account-guest')).toBeVisible();
  await expect(page.locator('#account-github')).toBeVisible();
  await expect(page.locator('#account-google')).toBeVisible();
  await expect(page.locator('#account-email')).toBeVisible();
  await expect(page.locator('#account-password')).toBeVisible();
  await expect(page.locator('#account-register')).toBeVisible();
  await expect(page.locator('[data-i18n="account.localOnly"]')).toBeVisible();

  fs.mkdirSync(SHOT, { recursive: true });
  await page.screenshot({ path: path.join(SHOT, 'e3-accounts.png'), fullPage: true });

  await page.locator('#account-close').click();
  await expect(page.locator('#account-modal')).toBeHidden();
});
