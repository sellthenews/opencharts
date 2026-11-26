// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import type { IChartApi } from 'lightweight-charts';

export async function chartPngBlob(chart: IChartApi, overlays: HTMLCanvasElement[]): Promise<Blob> {
  const shot = chart.takeScreenshot();
  const canvas = document.createElement('canvas');
  canvas.width = shot.width;
  canvas.height = shot.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  ctx.drawImage(shot, 0, 0);
  for (const layer of overlays) {
    if (!layer.width || !layer.height) continue;
    ctx.drawImage(layer, 0, 0, canvas.width, canvas.height);
  }
  await paintBrandMark(ctx, canvas, document.querySelector('#chart-brand'), document.querySelector('#chart'));
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
  if (!blob) throw new Error('Could not encode PNG');
  return blob;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function copyBlob(blob: Blob): Promise<void> {
  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') throw new Error('Clipboard images are not available');
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

/** Draw the on-chart brand mark into an export, mapped from CSS pixels to the screenshot. */
export async function paintBrandMark(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  mark: Element | null,
  host: Element | null,
): Promise<void> {
  if (!mark || !host || !(mark instanceof HTMLElement)) return;
  const cr = host.getBoundingClientRect();
  if (cr.width < 2 || cr.height < 2 || !canvas.width || !canvas.height) return;
  const sx = canvas.width / cr.width;
  const sy = canvas.height / cr.height;
  const opacity = Number(getComputedStyle(mark).opacity);
  ctx.save();
  ctx.globalAlpha = Number.isFinite(opacity) && opacity > 0 ? opacity : 0.32;
  const img = mark.querySelector('img');
  if (img instanceof HTMLImageElement) {
    try {
      if (!img.complete || !img.naturalWidth) await img.decode();
      const r = img.getBoundingClientRect();
      ctx.drawImage(img, (r.left - cr.left) * sx, (r.top - cr.top) * sy, r.width * sx, r.height * sy);
    } catch {
      /* icon is optional; the address is still drawn */
    }
  }
  const label = mark.querySelector('span');
  if (label instanceof HTMLElement && label.textContent) {
    const r = label.getBoundingClientRect();
    const cs = getComputedStyle(label);
    const size = parseFloat(cs.fontSize) || 11;
    ctx.font = `${cs.fontWeight || 600} ${size * sy}px ${cs.fontFamily || 'sans-serif'}`;
    ctx.fillStyle = cs.color || '#b2b5be';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(label.textContent, (r.left - cr.left) * sx, (r.top - cr.top + r.height / 2) * sy);
  }
  ctx.restore();
}
