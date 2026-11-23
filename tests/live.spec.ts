// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Wykresy contributors

import { expect, test } from '@playwright/test';

test('Kraken WebSocket: status przechodzi na Na żywo', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
  await expect(page.locator('#source')).toHaveValue('kraken');
  await expect(page.locator('#live-status')).toBeVisible();
  await expect(page.locator('#live-status')).toHaveAttribute('data-live', 'live', { timeout: 20_000 });
  await expect(page.locator('#live-status')).toHaveText('Na żywo');
});
