// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LANGS, flagSvg, isLangId } from '../src/i18n.ts';

test('every language has an inline SVG flag and no remote URL', () => {
  for (const lang of LANGS) {
    assert.equal(isLangId(lang.id), true);
    const svg = flagSvg(lang.id);
    assert.match(svg, /^<svg /);
    assert.match(svg, /<\/svg>$/);
    assert.equal(/https?:|cdn|flagcdn|twimg/i.test(svg), false);
  }
  assert.equal(flagSvg('en'), flagSvg('en'));
});
