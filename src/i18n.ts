// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { MESSAGES } from './i18n-messages';

export const LANG_KEY = 'opencharts:lang';

export const LANGS = [
  { id: 'en', native: 'English', locale: 'en-US', dir: 'ltr' },
  { id: 'zh', native: '中文（简体）', locale: 'zh-CN', dir: 'ltr' },
  { id: 'ja', native: '日本語', locale: 'ja-JP', dir: 'ltr' },
  { id: 'pl', native: 'Polski', locale: 'pl-PL', dir: 'ltr' },
  { id: 'ru', native: 'Русский', locale: 'ru-RU', dir: 'ltr' },
  { id: 'de', native: 'Deutsch', locale: 'de-DE', dir: 'ltr' },
  { id: 'es', native: 'Español', locale: 'es-ES', dir: 'ltr' },
  { id: 'pt', native: 'Português (BR)', locale: 'pt-BR', dir: 'ltr' },
  { id: 'ko', native: '한국어', locale: 'ko-KR', dir: 'ltr' },
  { id: 'tr', native: 'Türkçe', locale: 'tr-TR', dir: 'ltr' },
  { id: 'vi', native: 'Tiếng Việt', locale: 'vi-VN', dir: 'ltr' },
  { id: 'id', native: 'Indonesia', locale: 'id-ID', dir: 'ltr' },
  { id: 'hi', native: 'हिन्दी', locale: 'hi-IN', dir: 'ltr' },
  { id: 'ar', native: 'العربية', locale: 'ar', dir: 'rtl' },
] as const;

export type LangId = (typeof LANGS)[number]['id'];

const LANG_SET = new Set<string>(LANGS.map((l) => l.id));
const LANG_BY_ID = Object.fromEntries(LANGS.map((l) => [l.id, l])) as Record<LangId, (typeof LANGS)[number]>;

const PREFIX: { prefix: string; id: LangId }[] = [
  { prefix: 'zh', id: 'zh' },
  { prefix: 'ja', id: 'ja' },
  { prefix: 'pl', id: 'pl' },
  { prefix: 'ru', id: 'ru' },
  { prefix: 'de', id: 'de' },
  { prefix: 'es', id: 'es' },
  { prefix: 'pt', id: 'pt' },
  { prefix: 'ko', id: 'ko' },
  { prefix: 'tr', id: 'tr' },
  { prefix: 'vi', id: 'vi' },
  { prefix: 'id', id: 'id' },
  { prefix: 'hi', id: 'hi' },
  { prefix: 'ar', id: 'ar' },
  { prefix: 'en', id: 'en' },
];

let current: LangId = 'en';
const listeners = new Set<() => void>();

export function isLangId(value: unknown): value is LangId {
  return typeof value === 'string' && LANG_SET.has(value);
}

export function detectLang(langs: readonly string[] | string | undefined = typeof navigator !== 'undefined' ? navigator.languages ?? navigator.language : 'en'): LangId {
  const list = (Array.isArray(langs) ? langs : [langs ?? 'en']).map((s) => String(s).toLowerCase());
  for (const raw of list) {
    const tag = raw.replace('_', '-');
    for (const row of PREFIX) {
      if (tag === row.prefix || tag.startsWith(`${row.prefix}-`)) return row.id;
    }
  }
  return 'en';
}

export function loadLang(): LangId {
  try {
    const raw = localStorage.getItem(LANG_KEY);
    if (isLangId(raw)) return raw;
  } catch {
    /* ignore */
  }
  return detectLang();
}

export function getLang(): LangId {
  return current;
}

export function localeOf(lang: LangId = current): string {
  return LANG_BY_ID[lang]?.locale ?? 'en-US';
}

export function isRtl(lang: LangId = current): boolean {
  return LANG_BY_ID[lang]?.dir === 'rtl';
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const table = MESSAGES[current] ?? MESSAGES.en;
  let text = table[key] ?? MESSAGES.en[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  try {
    return new Intl.NumberFormat(localeOf(), options).format(value);
  } catch {
    return String(value);
  }
}

export function formatDate(tsSec: number): string {
  try {
    return new Intl.DateTimeFormat(localeOf(), { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(tsSec * 1000));
  } catch {
    return new Date(tsSec * 1000).toISOString().slice(0, 10);
  }
}

export function applyStaticDom(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n!);
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle!);
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria!));
  });
  root.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder!);
  });
}

function applyDocument(): void {
  const meta = LANG_BY_ID[current];
  const html = document.documentElement;
  html.lang = meta.id === 'zh' ? 'zh-CN' : meta.id === 'pt' ? 'pt-BR' : meta.id;
  html.dir = meta.dir;
  html.dataset.lang = current;
  const chartWrap = document.querySelector<HTMLElement>('#chart-wrap');
  const charts = document.querySelector<HTMLElement>('#charts');
  if (chartWrap) chartWrap.dir = 'ltr';
  if (charts) charts.dir = 'ltr';
  applyStaticDom();
  const select = document.querySelector<HTMLSelectElement>('#lang-select');
  if (select && select.value !== current) select.value = current;
}

export function onLangChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function setLang(id: LangId, persist = true): void {
  const next = isLangId(id) ? id : 'en';
  current = next;
  if (persist) {
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      /* ignore */
    }
  }
  applyDocument();
  for (const cb of listeners) cb();
}

export function fillLangSelect(select: HTMLSelectElement | null = document.querySelector('#lang-select')): void {
  if (!select) return;
  select.innerHTML = LANGS.map((l) => `<option value="${l.id}">${l.native}</option>`).join('');
  select.value = current;
}

export function initLang(): LangId {
  current = loadLang();
  applyDocument();
  fillLangSelect();
  const select = document.querySelector<HTMLSelectElement>('#lang-select');
  select?.addEventListener('change', () => {
    if (isLangId(select.value)) setLang(select.value);
  });
  return current;
}
