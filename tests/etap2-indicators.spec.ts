// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test('stage 2 indicators persist, alerts, and screenshots', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });

  await page.evaluate(() => {
    window.__opencharts.seedIndicators(['vwap', 'rsi', 'macd', 'autoFib', 'autoTrend', 'maOf', 'cvd', 'footprint']);
  });

  await expect(page.locator('.ind-label[data-kind="vwap"]')).toBeVisible();
  await expect(page.locator('.ind-label[data-kind="rsi"]')).toBeVisible();
  await expect(page.locator('.ind-label[data-kind="macd"]')).toBeVisible();
  await expect(page.locator('.ind-label[data-kind="autoFib"]')).toBeVisible();
  await expect(page.locator('.ind-label[data-kind="cvd"]')).toBeVisible();
  await expect(page.locator('.ind-label[data-kind="footprint"]')).toBeVisible();
  await expect(page.locator('.ind-label[data-kind="maOf"]')).toBeVisible();

  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem('opencharts:indicators:kraken:XRPUSD');
    return raw ? JSON.parse(raw) : null;
  });
  const kinds = (stored?.items ?? []).map((i: { kind: string }) => i.kind);
  for (const kind of ['vwap', 'rsi', 'macd', 'autoFib', 'autoTrend', 'maOf', 'cvd', 'footprint']) {
    expect(kinds).toContain(kind);
  }
  const vwap = stored?.items?.find((i: { kind: string; params?: { bands?: number; highs?: string } }) => i.kind === 'vwap');
  expect(vwap?.params?.bands).toBe(3);
  expect(vwap?.params?.highs).toBe('on');

  await page.locator('#alert-kind').selectOption('rsi-70');
  await page.locator('#alert-form button[type="submit"]').click();
  const alerts = await page.evaluate(() => window.__opencharts.getAlerts());
  expect(alerts.some((a) => a.kind === 'indicator' && a.indicatorKind === 'rsi' && a.price === 70)).toBeTruthy();

  const fired = await page.evaluate(() =>
    window.__opencharts.checkAlert(
      { id: 't', sourceId: 'kraken', pairId: 'XRPUSD', kind: 'indicator', price: 70, direction: 'cross', enabled: true, indicatorKind: 'rsi' },
      1,
      { rsi: { prev: 65, last: 72 } },
    ),
  );
  expect(fired).toBe(true);

  await page.waitForTimeout(400);
  fs.mkdirSync('screenshots-test', { recursive: true });
  await page.screenshot({ path: path.resolve('screenshots-test/etap2-vwap-div.png'), fullPage: true });

  await page.locator('.ind-label[data-kind="macd"] [data-ind-act="remove"]').click();
  await page.locator('.ind-label[data-kind="maOf"] [data-ind-act="remove"]').click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.resolve('screenshots-test/etap2-autofib-cvd.png'), fullPage: true });
});
