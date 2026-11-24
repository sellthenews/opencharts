// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

/** New key prefix. Older `wykresy:` (and any `opencandle:`) keys are copied once. */
export const STORAGE_PREFIX = 'opencharts:';

const OLD_PREFIXES = ['wykresy:', 'opencandle:'] as const;

function migrateStore(store: Storage): void {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key) keys.push(key);
  }
  for (const key of keys) {
    for (const old of OLD_PREFIXES) {
      if (!key.startsWith(old)) continue;
      const next = STORAGE_PREFIX + key.slice(old.length);
      if (store.getItem(next) == null) {
        const value = store.getItem(key);
        if (value != null) store.setItem(next, value);
      }
    }
  }
}

/** Copy legacy keys into `opencharts:` without overwriting newer values. */
export function migrateStorage(): void {
  try {
    migrateStore(localStorage);
    migrateStore(sessionStorage);
  } catch {
    // Storage may be unavailable (privacy mode); the app already tolerates that.
  }
}

migrateStorage();
