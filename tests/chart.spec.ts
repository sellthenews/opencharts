import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SHOT = path.resolve('screenshots-test/xrp-1d.png');

test('XRP/USD 1D: linia trendu i zapis po przeładowaniu', async ({ page }) => {
  await page.goto('/');

  const source = page.locator('#source');
  await expect(source).toHaveValue('kraken');
  await expect(page.locator('#pair')).toHaveValue('XRPUSD');

  const dayBtn = page.locator('[data-interval="1D"]');
  if (!(await dayBtn.evaluate((el) => el.classList.contains('is-active')))) {
    await dayBtn.click();
  }

  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
  await expect(page.locator('#status')).not.toHaveClass(/is-error/);

  const chart = page.locator('#chart-wrap');
  const box = await chart.boundingBox();
  expect(box).toBeTruthy();
  const b = box!;

  await page.locator('[data-tool="trend"]').click();
  await page.mouse.click(b.x + b.width * 0.28, b.y + b.height * 0.62);
  await page.mouse.click(b.x + b.width * 0.72, b.y + b.height * 0.32);
  await page.waitForTimeout(250);

  const before = await page.evaluate(() => {
    const list = window.__wykresy.getDrawings();
    return {
      list,
      stored: localStorage.getItem('wykresy:drawings:kraken:XRPUSD'),
    };
  });
  expect(before.list.length).toBeGreaterThanOrEqual(1);
  expect(before.list.some((d) => d.type === 'trend')).toBeTruthy();
  expect(before.stored).toBeTruthy();

  fs.mkdirSync(path.dirname(SHOT), { recursive: true });
  await page.screenshot({ path: SHOT, fullPage: true });

  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });

  const after = await page.evaluate(() => {
    const list = window.__wykresy.getDrawings();
    return {
      list,
      stored: localStorage.getItem('wykresy:drawings:kraken:XRPUSD'),
    };
  });
  expect(after.stored).toEqual(before.stored);
  expect(after.list).toEqual(before.list);
  expect(after.list.some((d) => d.type === 'trend')).toBeTruthy();
});
