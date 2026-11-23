import { expect, test } from '@playwright/test';

test('RSI włącza panel i ustawienia trafiają do localStorage', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });

  await page.locator('input[data-ind="rsi"]').check();
  await expect(page.locator('#app')).toHaveAttribute('data-rsi', 'on');

  const stored = await page.evaluate(() => {
    const raw = localStorage.getItem('wykresy:indicators');
    return raw ? JSON.parse(raw) : null;
  });
  expect(stored?.rsi?.on).toBeTruthy();

  const settings = await page.evaluate(() => window.__wykresy.getIndicatorSettings());
  expect(settings.rsi.on).toBeTruthy();
  expect(settings.volume.on).toBeTruthy();
});
