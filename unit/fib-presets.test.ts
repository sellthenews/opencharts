// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyFibPreset,
  builtInFibExtOptions,
  builtInFibOptions,
  classicFibExtOptions,
  classicFibOptions,
  detectFibPreset,
  FIB_DEFAULTS_KEY,
  fibExtLevelXRange,
  fibLevelXRange,
  fibOptionsOf,
  loadFibDefaults,
  isLegacyOursRetracementDefaults,
  looksLikeFibExtLevelSet,
  parseFibExtend,
  PREV_FIB_OURS_VISIBLE,
  sanitizeFibOptions,
  saveFibDefaults,
  upgradeLegacyOursRetracement,
} from '../src/fib-settings';
import { fibExtensionPrice, fibRetracementPrice } from '../src/drawings-math';

test('retracement default is the built-in 14-level set, fill 0.04, lines extend right', () => {
  const ours = builtInFibOptions();
  assert.equal(ours.preset, 'ours');
  assert.deepEqual(
    ours.levels.filter((l) => l.visible).map((l) => l.value),
    [0, 0.236, 0.38, 0.5, 0.61, 0.786, 0.941, 1, 1.13, 1.25, 1.414, 1.618, 1.732, 2.058],
  );
  assert.equal(ours.levels.length, 24);
  assert.equal(ours.backgroundOpacity, 0.04);
  assert.equal(ours.extend, 'right');
  assert.equal(ours.extendLines, true);
  assert.equal(detectFibPreset(ours, 'fib'), 'ours');
});

test('classic retracement shows the previous full 24-level set at 0.08 fill', () => {
  const classic = classicFibOptions();
  assert.equal(classic.preset, 'classic');
  assert.equal(classic.levels.length, 24);
  assert.ok(classic.levels.every((l) => l.visible));
  assert.equal(classic.backgroundOpacity, 0.08);
  assert.equal(classic.extend, 'right');
  assert.equal(classic.extendLines, true);
  assert.equal(detectFibPreset(classic, 'fib'), 'classic');
});

test('applying a retracement preset swaps the level set and keeps label choices', () => {
  const started = { ...builtInFibOptions(), labels: 'left' as const, showPrices: false, reverse: true };
  const classic = applyFibPreset(started, 'fib', 'classic');
  assert.equal(classic.preset, 'classic');
  assert.ok(classic.levels.every((l) => l.visible));
  assert.equal(classic.backgroundOpacity, 0.08);
  assert.equal(classic.labels, 'left');
  assert.equal(classic.showPrices, false);
  assert.equal(classic.reverse, true);
  assert.equal(classic.extend, 'right');
  const back = applyFibPreset(classic, 'fib', 'ours');
  assert.deepEqual(
    back.levels.filter((l) => l.visible).map((l) => l.value),
    [0, 0.236, 0.38, 0.5, 0.61, 0.786, 0.941, 1, 1.13, 1.25, 1.414, 1.618, 1.732, 2.058],
  );
  assert.equal(back.backgroundOpacity, 0.04);
  assert.equal(back.labels, 'left');
});

test('extension ours is a short set; classic keeps the previous catalog visibility', () => {
  const ours = builtInFibExtOptions();
  const classic = classicFibExtOptions();
  assert.equal(ours.preset, 'ours');
  assert.deepEqual(
    ours.levels.filter((l) => l.visible).map((l) => l.value),
    [0, 0.9, 1, 1.061, 1.155, 1.272, 1.414, 1.618],
  );
  assert.equal(ours.backgroundOpacity, 0.04);
  assert.equal(ours.extend, 'right');
  assert.equal(ours.extendLines, true);
  assert.equal(classic.extend, 'right');
  assert.equal(classic.backgroundOpacity, 0.08);
  assert.deepEqual(
    classic.levels.filter((l) => l.visible).map((l) => l.value),
    [0, 0.9, 1, 1.061, 1.155, 1.272, 1.414, 1.618],
  );
  assert.equal(detectFibPreset(ours, 'fibext'), 'ours');
  assert.equal(detectFibPreset(classic, 'fibext'), 'classic');
});

test('sanitize keeps a user-saved custom level set and does not force a preset', () => {
  const custom = sanitizeFibOptions({
    levels: [
      { value: 0, visible: true, color: '#888888' },
      { value: 0.5, visible: true, color: '#e91e63' },
    ],
    backgroundOpacity: 0.12,
    extendLines: true,
  });
  assert.equal(custom.levels.length, 2);
  assert.equal(custom.levels[1]!.color, '#e91e63');
  assert.equal(custom.backgroundOpacity, 0.12);
  assert.equal(custom.extend, 'right');
  assert.equal(custom.extendLines, true);
  assert.equal(detectFibPreset(custom, 'fib'), null);
});

test('legacy extendLines maps to right or none; missing flags stay unextended on old drawings', () => {
  assert.equal(parseFibExtend({ extendLines: true }), 'right');
  assert.equal(parseFibExtend({ extendLines: false }), 'none');
  assert.equal(parseFibExtend({ extend: 'both' }), 'both');
  assert.equal(parseFibExtend({ extend: 'left', extendLines: true }), 'left');
  const oldOff = sanitizeFibOptions({
    levels: [
      { value: 0, visible: true, color: '#888888' },
      { value: 1, visible: true, color: '#888888' },
    ],
    extendLines: false,
  });
  assert.equal(oldOff.extend, 'none');
  assert.equal(oldOff.extendLines, false);
  const legacy = fibOptionsOf({
    fib: {
      levels: [
        { value: 0, visible: true, color: '#888888' },
        { value: 1, visible: true, color: '#888888' },
      ],
    },
  });
  assert.equal(legacy.extend, 'none');
});

test('level line spans follow Right, Left, Both, and None', () => {
  assert.deepEqual(fibLevelXRange(20, 80, 200, 'none'), { start: 20, end: 80 });
  assert.deepEqual(fibLevelXRange(80, 20, 200, 'right'), { start: 20, end: 200 });
  assert.deepEqual(fibLevelXRange(20, 80, 200, 'left'), { start: 0, end: 80 });
  assert.deepEqual(fibLevelXRange(20, 80, 200, 'both'), { start: 0, end: 200 });
  assert.deepEqual(fibExtLevelXRange(10, 40, 30, 200, 'none'), { start: 30, end: 80 });
  assert.deepEqual(fibExtLevelXRange(10, 40, 30, 200, 'right'), { start: 10, end: 200 });
  assert.deepEqual(fibExtLevelXRange(10, 40, 30, 200, 'left'), { start: 0, end: 40 });
  assert.deepEqual(fibExtLevelXRange(10, 40, 30, 200, 'both'), { start: 0, end: 200 });
});

function installMemoryStorage(): void {
  const mem = new Map<string, string>();
  const storage = {
    getItem: (key: string) => (mem.has(key) ? mem.get(key)! : null),
    setItem: (key: string, value: string) => {
      mem.set(key, String(value));
    },
    removeItem: (key: string) => {
      mem.delete(key);
    },
    clear: () => mem.clear(),
    key: (index: number) => [...mem.keys()][index] ?? null,
    get length() {
      return mem.size;
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
}

test('looksLikeFibExtLevelSet detects the extension visible set and catalog', () => {
  assert.equal(looksLikeFibExtLevelSet(builtInFibOptions()), false);
  assert.equal(looksLikeFibExtLevelSet(classicFibOptions()), false);
  assert.equal(looksLikeFibExtLevelSet(builtInFibExtOptions()), true);
  assert.equal(looksLikeFibExtLevelSet(classicFibExtOptions()), true);
  const custom = sanitizeFibOptions({
    levels: [
      { value: 0, visible: true, color: '#888888' },
      { value: 0.5, visible: true, color: '#888888' },
    ],
  });
  assert.equal(looksLikeFibExtLevelSet(custom), false);
});

test('polluted retracement defaults that match the extension set self-heal to the built-in default levels', () => {
  installMemoryStorage();
  saveFibDefaults(builtInFibExtOptions());
  const raw = localStorage.getItem(FIB_DEFAULTS_KEY);
  assert.ok(raw);
  const stored = JSON.parse(raw!) as { levels?: { value: number; visible?: boolean }[] };
  assert.deepEqual(
    (stored.levels ?? []).filter((l) => l.visible !== false).map((l) => l.value),
    [0, 0.236, 0.38, 0.5, 0.61, 0.786, 0.941, 1, 1.13, 1.25, 1.414, 1.618, 1.732, 2.058],
  );
  localStorage.setItem(FIB_DEFAULTS_KEY, JSON.stringify(builtInFibExtOptions()));
  const loaded = loadFibDefaults();
  assert.deepEqual(
    loaded.levels.filter((l) => l.visible).map((l) => l.value),
    [0, 0.236, 0.38, 0.5, 0.61, 0.786, 0.941, 1, 1.13, 1.25, 1.414, 1.618, 1.732, 2.058],
  );
  const healed = JSON.parse(localStorage.getItem(FIB_DEFAULTS_KEY)!) as { levels?: { value: number; visible?: boolean }[] };
  assert.deepEqual(
    (healed.levels ?? []).filter((l) => l.visible !== false).map((l) => l.value),
    [0, 0.236, 0.38, 0.5, 0.61, 0.786, 0.941, 1, 1.13, 1.25, 1.414, 1.618, 1.732, 2.058],
  );
});

test('legacy 7-level retracement defaults upgrade to the new default; custom sets are kept', () => {
  installMemoryStorage();
  const legacy = {
    ...builtInFibOptions(),
    preset: 'ours' as const,
    levels: builtInFibOptions().levels.map((row) => ({
      ...row,
      visible: PREV_FIB_OURS_VISIBLE.some((v) => Math.abs(v - row.value) < 1e-4),
    })),
  };
  assert.equal(isLegacyOursRetracementDefaults(legacy), true);
  const upgraded = upgradeLegacyOursRetracement(legacy);
  assert.deepEqual(
    upgraded.levels.filter((l) => l.visible).map((l) => l.value),
    [0, 0.236, 0.38, 0.5, 0.61, 0.786, 0.941, 1, 1.13, 1.25, 1.414, 1.618, 1.732, 2.058],
  );
  const hidden = upgraded.levels.filter((l) => !l.visible).map((l) => l.value);
  assert.deepEqual(hidden, [0.278, 0.44, 0.577, 0.667, 0.707, 0.77, 0.8, 0.878, 2.236, 2.618]);
  localStorage.setItem(FIB_DEFAULTS_KEY, JSON.stringify(legacy));
  const loaded = loadFibDefaults();
  assert.deepEqual(
    loaded.levels.filter((l) => l.visible).map((l) => l.value),
    [0, 0.236, 0.38, 0.5, 0.61, 0.786, 0.941, 1, 1.13, 1.25, 1.414, 1.618, 1.732, 2.058],
  );

  const custom = sanitizeFibOptions({
    levels: [
      { value: 0, visible: true, color: '#888888' },
      { value: 0.5, visible: true, color: '#888888' },
      { value: 1, visible: true, color: '#888888' },
    ],
    backgroundOpacity: 0.12,
  });
  assert.equal(isLegacyOursRetracementDefaults(custom), false);
  localStorage.setItem(FIB_DEFAULTS_KEY, JSON.stringify(custom));
  const kept = loadFibDefaults();
  assert.deepEqual(
    kept.levels.filter((l) => l.visible).map((l) => l.value),
    [0, 0.5, 1],
  );
  assert.equal(kept.backgroundOpacity, 0.12);
});

test('log-scale fib prices use ln(price); non-positive prices fall back to linear', () => {
  const p1 = { time: 1, price: 100 };
  const p2 = { time: 2, price: 10 };
  const linear = fibRetracementPrice(p1, p2, 1, false, false);
  const logged = fibRetracementPrice(p1, p2, 1, false, true);
  assert.equal(linear, 100);
  assert.ok(Math.abs(logged - 100) < 1e-9);
  const midLin = fibRetracementPrice(p1, p2, 0.5, false, false);
  const midLog = fibRetracementPrice(p1, p2, 0.5, false, true);
  assert.ok(Math.abs(midLin - 55) < 1e-9);
  assert.ok(Math.abs(midLog - Math.sqrt(100 * 10)) < 1e-9);
  const a = { time: 1, price: 8 };
  const b = { time: 2, price: 18 };
  const c = { time: 3, price: 10 };
  const extLin = fibExtensionPrice(a, b, c, 1, false, false);
  const extLog = fibExtensionPrice(a, b, c, 1, false, true);
  assert.ok(Math.abs(extLin - 20) < 1e-9);
  assert.ok(Math.abs(extLog - (10 * (18 / 8))) < 1e-9);
  const fallback = fibRetracementPrice({ time: 1, price: -2 }, p2, 0.5, false, true);
  assert.ok(Math.abs(fallback - fibRetracementPrice({ time: 1, price: -2 }, p2, 0.5, false, false)) < 1e-9);
});
