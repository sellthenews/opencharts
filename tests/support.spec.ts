// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { expect, test } from '@playwright/test';

const ADDRESS = 'rEo9s1W4u1R5STTB287JxhxffSxDftVkPJ';
const ISSUER = 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De';
const RLUSD = '524C555344000000000000000000000000000000';
const XAMAN = `https://xaman.app/detect/request:${ADDRESS}`;
const XAMAN_RLUSD = `${XAMAN}?currency=${RLUSD}&issuer=${ISSUER}`;

test('Support button opens a modal with the address, XRP or RLUSD, QR, and Xaman link', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });

  await expect(page.locator('#support-btn')).toBeVisible();
  await page.locator('#support-btn').click();
  const modal = page.locator('#support-modal');
  await expect(modal).toBeVisible();
  await expect(modal.locator('#support-address')).toHaveText(ADDRESS);
  await expect(modal.locator('.support-qr svg')).toBeVisible();
  await expect(modal.locator('#support-xaman')).toHaveAttribute('href', XAMAN);
  await expect(modal.locator('.support-xrp')).toHaveText(/RLUSD/i);
  await expect(modal.locator('.support-xrp')).toHaveText(/XRP Ledger/i);
  await expect(modal.locator('[data-support-asset="xrp"]')).toHaveClass(/is-active/);
  await modal.locator('[data-support-asset="rlusd"]').click();
  await expect(modal.locator('#support-xaman')).toHaveAttribute('href', XAMAN_RLUSD);
  await modal.locator('[data-support-asset="xrp"]').click();
  await expect(modal.locator('#support-xaman')).toHaveAttribute('href', XAMAN);
  await expect(modal).not.toContainText(/minimum|min\.|activated|reserve/i);
  await page.locator('#support-close').click();
  await expect(modal).toBeHidden();
});

test('on a phone, Support lives in the gear menu', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
  await expect(page.locator('#support-btn')).toBeHidden();
  await page.locator('#settings-btn').click();
  await expect(page.locator('#settings-support')).toBeVisible();
  await page.locator('#settings-support').click();
  await expect(page.locator('#support-modal')).toBeVisible();
  await expect(page.locator('#support-address')).toHaveText(ADDRESS);
  await expect(page.locator('#settings-menu')).toBeHidden();
});
