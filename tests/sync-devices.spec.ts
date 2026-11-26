// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/** Two devices signed in to the same account, against an in-memory fake of the account API. */
let server: { updatedAt: number | null; data: Record<string, string> } = { updatedAt: null, data: {} };

async function device(context: BrowserContext): Promise<Page> {
  await context.route(/opencharts-proxy[^/]*\/(auth\/me|sync)$/, async (route) => {
    const req = route.request();
    const cors = { 'Access-Control-Allow-Origin': new URL(req.headers()['origin'] ?? 'http://127.0.0.1:4173').origin, 'Access-Control-Allow-Credentials': 'true' };
    if (req.url().endsWith('/auth/me')) {
      return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ user: { id: 'u1', email: 'm@example.com', displayName: 'Mateusz', providers: ['github'] } }) });
    }
    if (req.method() === 'PUT') {
      const body = JSON.parse(req.postData() ?? '{}') as { data: Record<string, string> };
      server = { updatedAt: Date.now(), data: body.data };
    }
    return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify(server) });
  });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
  return page;
}

test('a list made on one device shows on the other after focus, with no manual sync', async ({ browser }) => {
  server = { updatedAt: null, data: {} };
  const desktop = await device(await browser.newContext());
  const phone = await device(await browser.newContext({ viewport: { width: 390, height: 844 } }));

  // Desktop: add a section (an ordinary edit) — it must upload by itself.
  await desktop.locator('[data-watch-action="list-menu"]').click();
  await desktop.locator('.watch-menu [data-watch-action="add-section"]').click();
  await expect.poll(() => server.data['opencharts:watchlists']?.includes('"sections":[{') ?? false, { timeout: 15_000 }).toBe(true);

  // Phone: becomes visible again -> pulls and shows the section without a reload.
  await phone.waitForTimeout(5_500);
  await phone.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    window.dispatchEvent(new Event('focus'));
  });
  await expect.poll(async () => phone.evaluate(() => localStorage.getItem('opencharts:watchlists')?.includes('"sections":[{') ?? false), { timeout: 15_000 }).toBe(true);
  await expect(phone.locator('.watch-section').first()).toBeAttached();
});

test('undo and redo buttons in the drawing rail', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
  const undo = page.locator('#rail-undo');
  const redo = page.locator('#rail-redo');
  await expect(undo).toBeVisible();
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();
  const box = await page.locator('#chart').boundingBox();
  await page.keyboard.press('Alt+h');
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  const count = () => page.evaluate(() => (window as unknown as { __opencharts: { getDrawings: () => unknown[] } }).__opencharts.getDrawings().length);
  await expect.poll(count).toBe(1);
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect.poll(count).toBe(0);
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect.poll(count).toBe(1);
  await page.keyboard.press('Control+z');
  await expect.poll(count).toBe(0);
  await page.keyboard.press('Control+y');
  await expect.poll(count).toBe(1);
});

test('undo and redo are on screen on a phone', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
  const b = await page.locator('#rail-undo').boundingBox();
  expect(b).toBeTruthy();
  expect(b!.x).toBeGreaterThanOrEqual(0);
  expect(b!.x + b!.width).toBeLessThanOrEqual(390);
  expect(b!.y + b!.height).toBeLessThanOrEqual(844);
  await ctx.close();
});
