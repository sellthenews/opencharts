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
