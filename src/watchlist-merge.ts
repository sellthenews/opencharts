// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

/** Merge keeps the lists already on this device; a list with the same id is replaced by the imported one. */
export function mergeWatchlists(current: string | null, incoming: string): string {
  try {
    const a = current ? (JSON.parse(current) as { lists?: { id?: string }[]; activeId?: string }) : null;
    const b = JSON.parse(incoming) as { lists?: { id?: string }[]; activeId?: string };
    if (!a || !Array.isArray(a.lists) || !Array.isArray(b.lists)) return incoming;
    const ids = new Set(b.lists.map((l) => l?.id));
    const lists = [...a.lists.filter((l) => !ids.has(l?.id)), ...b.lists];
    return JSON.stringify({ ...a, ...b, lists, activeId: b.activeId ?? a.activeId });
  } catch {
    return incoming;
  }
}
