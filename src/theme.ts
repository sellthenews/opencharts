// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

export const THEME_KEY = 'opencharts:theme';

export const THEME_NAMES = ['dark', 'dim', 'light', 'swapwick'] as const;

export type ThemeName = (typeof THEME_NAMES)[number];

export function isThemeName(value: unknown): value is ThemeName {
  return value === 'dark' || value === 'dim' || value === 'swapwick' || value === 'light';
}

const THEME_LABEL_KEYS: Record<ThemeName, string> = {
  dark: 'toolbar.darkTheme',
  dim: 'toolbar.dimTheme',
  light: 'toolbar.lightTheme',
  swapwick: 'toolbar.swapwickTheme',
};

export function themeLabelKey(name: ThemeName): string {
  return THEME_LABEL_KEYS[name];
}

export function setThemePickerOpen(open: boolean): void {
  if (typeof document === 'undefined') return;
  const wrap = document.querySelector('#settings-theme');
  const toggle = document.querySelector<HTMLButtonElement>('#theme-toggle');
  const list = document.querySelector<HTMLElement>('#theme-btns');
  if (!wrap || !toggle || !list) return;
  wrap.classList.toggle('is-open', open);
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  list.hidden = !open;
}

export function loadTheme(): ThemeName {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (isThemeName(raw)) return raw;
  } catch {
    /* ignore */
  }
  return 'dark';
}

export function isLightTheme(name?: string | null): boolean {
  const theme = name ?? (typeof document !== 'undefined' ? document.documentElement.getAttribute('data-theme') : null);
  return theme === 'light';
}

export function cssVar(name: string, fallback = ''): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function themeColorMeta(theme: ThemeName): string {
  if (theme === 'light') return '#ffffff';
  if (theme === 'dim') return '#343c48';
  if (theme === 'swapwick') return '#1a3036';
  return '#12151c';
}
