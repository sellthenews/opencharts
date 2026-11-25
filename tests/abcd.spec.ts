// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { expect, test } from '@playwright/test';

test('AB=CD: computes D and recalculates after dragging C', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });

  const box = await page.locator('#chart-wrap').boundingBox();
  expect(box).toBeTruthy();
  const b = box!;

  await page.locator('#tool-rail [data-tool="abcd"]').click();
  await page.mouse.click(b.x + b.width * 0.3, b.y + b.height * 0.55);
  await page.mouse.click(b.x + b.width * 0.45, b.y + b.height * 0.35);
  await page.mouse.click(b.x + b.width * 0.55, b.y + b.height * 0.5);
  await page.waitForTimeout(200);

  const before = await page.evaluate(() => {
    const list = window.__opencharts.getDrawings();
    const d = list.find((x) => x.type === 'abcd');
    return d && d.type === 'abcd' ? d : null;
  });
  expect(before).toBeTruthy();
  const expectedD = {
    time: before!.c.time + (before!.b.time - before!.a.time),
    price: before!.c.price + (before!.b.price - before!.a.price),
  };
  expect(before!.c.time + (before!.b.time - before!.a.time)).toBeCloseTo(expectedD.time, 8);
  expect(before!.c.price + (before!.b.price - before!.a.price)).toBeCloseTo(expectedD.price, 8);

  await page.locator('#tool-rail [data-tool="cursor"], #cursor-tool').click();
  await page.evaluate(() => document.querySelector('#draw-overlay')?.classList.remove('passthrough'));

  const screen = await page.evaluate(() => window.__opencharts.getAbcdScreen());
  expect(screen).toBeTruthy();
  const overlay = await page.locator('#draw-overlay').boundingBox();
  expect(overlay).toBeTruthy();
  const o = overlay!;

  await page.mouse.move(o.x + screen!.c.x, o.y + screen!.c.y);
  await page.mouse.down();
  await page.mouse.move(o.x + screen!.c.x + 50, o.y + screen!.c.y - 40, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);

  const after = await page.evaluate(() => {
    const list = window.__opencharts.getDrawings();
    const d = list.find((x) => x.type === 'abcd');
    return d && d.type === 'abcd' ? d : null;
  });
  expect(after).toBeTruthy();
  expect(after!.c.time).not.toBeCloseTo(before!.c.time, 6);
  const newDPrice = after!.c.price + (after!.b.price - after!.a.price);
  const newDTime = after!.c.time + (after!.b.time - after!.a.time);
  // A and B stay put; D follows C + (B-A)
  expect(after!.a.price).toBeCloseTo(before!.a.price, 6);
  expect(after!.b.price).toBeCloseTo(before!.b.price, 6);
  expect(newDPrice).toBeCloseTo(after!.c.price + (after!.b.price - after!.a.price), 8);
  expect(newDTime).toBeCloseTo(after!.c.time + (after!.b.time - after!.a.time), 8);
  expect(newDPrice).not.toBeCloseTo(expectedD.price, 4);
});
