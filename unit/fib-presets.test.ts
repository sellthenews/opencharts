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
  sanitizeFibOptions,
} from '../src/fib-settings';

test('retracement ours is the built-in default: 7 levels, fill 0.04, extensions off', () => {
  const ours = builtInFibOptions();
  assert.equal(ours.preset, 'ours');
  assert.deepEqual(
    ours.levels.filter((l) => l.visible).map((l) => l.value),
    [0, 0.236, 0.38, 0.5, 0.61, 0.786, 1],
  );
  assert.equal(ours.levels.length, 24);
  assert.equal(ours.backgroundOpacity, 0.04);
  assert.equal(ours.extendLines, false);
  assert.equal(detectFibPreset(ours, 'fib'), 'ours');
});

test('classic retracement shows the previous full 24-level set at 0.08 fill', () => {
  const classic = classicFibOptions();
  assert.equal(classic.preset, 'classic');
  assert.equal(classic.levels.length, 24);
  assert.ok(classic.levels.every((l) => l.visible));
  assert.equal(classic.backgroundOpacity, 0.08);
  assert.equal(classic.extendLines, false);
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
  const back = applyFibPreset(classic, 'fib', 'ours');
  assert.deepEqual(
    back.levels.filter((l) => l.visible).map((l) => l.value),
    [0, 0.236, 0.38, 0.5, 0.61, 0.786, 1],
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
    [0, 0.618, 1, 1.272, 1.618, 2, 3.618],
  );
  assert.equal(ours.backgroundOpacity, 0.04);
  assert.equal(ours.extendLines, true);
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
  assert.equal(custom.extendLines, true);
  assert.equal(detectFibPreset(custom, 'fib'), null);
});
