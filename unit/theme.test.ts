// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import assert from 'node:assert/strict';
import test from 'node:test';
import { isThemeName, themeColorMeta } from '../src/theme.ts';

test('isThemeName accepts dark, dim, swapwick and light only', () => {
  assert.equal(isThemeName('dark'), true);
  assert.equal(isThemeName('dim'), true);
  assert.equal(isThemeName('swapwick'), true);
  assert.equal(isThemeName('light'), true);
  assert.equal(isThemeName('mid'), false);
  assert.equal(isThemeName(''), false);
});

test('themeColorMeta matches each theme bar color', () => {
  assert.equal(themeColorMeta('light'), '#ffffff');
  assert.equal(themeColorMeta('dim'), '#343c48');
  assert.equal(themeColorMeta('swapwick'), '#1a3036');
  assert.equal(themeColorMeta('dark'), '#12151c');
});
