// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Wykresy contributors

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 200);
    } catch {
      /* ignore */
    }
    throw new Error(`HTTP ${res.status} dla ${url}${detail ? `: ${detail}` : ''}`);
  }
  return (await res.json()) as T;
}

export function changePct(last: number, open: number): number | null {
  if (!Number.isFinite(last) || !Number.isFinite(open) || open === 0) return null;
  return ((last - open) / open) * 100;
}
