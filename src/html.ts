// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Allow only a hex colour so imported settings cannot inject CSS or markup. */
export function safeCssColor(value: string, fallback = '#42a5f5'): string {
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value) ? value : fallback;
}
