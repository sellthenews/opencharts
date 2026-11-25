// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test('PWA manifest is linked, installable, and the service worker registers', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toBeTruthy();
  const manifestUrl = new URL(manifestHref!, page.url());
  const res = await page.request.get(manifestUrl.href);
  expect(res.ok()).toBeTruthy();
  const manifest = (await res.json()) as {
    name: string;
    short_name: string;
    start_url: string;
    scope: string;
    display: string;
    icons: { src: string; sizes: string; purpose?: string }[];
  };
  expect(manifest.name).toBe('OpenCharts');
  expect(manifest.short_name).toBe('OpenCharts');
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('./');
  expect(manifest.scope).toBe('./');
  expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
  expect(manifest.icons.some((i) => i.sizes === '192x192')).toBeTruthy();
  expect(manifest.icons.some((i) => i.sizes === '512x512' && (i.purpose ?? 'any').includes('maskable'))).toBeTruthy();

  for (const icon of manifest.icons) {
    const iconRes = await page.request.get(new URL(icon.src, manifestUrl).href);
    expect(iconRes.ok(), icon.src).toBeTruthy();
    expect(iconRes.headers()['content-type'] ?? '').toMatch(/image\/png/);
  }

  const sw = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { supported: false, ready: false, script: '' };
    const reg = await navigator.serviceWorker.ready;
    return {
      supported: true,
      ready: Boolean(reg.active || reg.installing || reg.waiting),
      script: reg.active?.scriptURL ?? reg.installing?.scriptURL ?? reg.waiting?.scriptURL ?? '',
      scope: reg.scope,
    };
  });
  expect(sw.supported).toBeTruthy();
  expect(sw.ready).toBeTruthy();
  expect(sw.script).toMatch(/\/sw\.js$/);

  const swRes = await page.request.get(new URL('sw.js', page.url()).href);
  expect(swRes.ok()).toBeTruthy();
  const body = await swRes.text();
  expect(body).toContain('version.json');
  expect(body).toContain('opencharts-assets-v3');
  expect(body).not.toMatch(/https?:\/\/cdn\./i);

  fs.mkdirSync(path.resolve('screenshots-test'), { recursive: true });
  await page.screenshot({ path: path.resolve('screenshots-test/e2-pwa.png'), fullPage: true });
});
