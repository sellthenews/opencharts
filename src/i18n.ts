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


const FLAG_SVG: Record<LangId, string> = {
  en: '<svg viewBox="0 0 21 15" width="20" height="14"><rect width="21" height="15" fill="#b22234"/><path fill="#fff" d="M0 1.15h21v1.15H0zm0 2.31h21v1.15H0zm0 2.31h21v1.15H0zm0 2.31h21v1.15H0zm0 2.31h21v1.15H0zm0 2.31h21v1.15H0z"/><rect width="9.5" height="8.05" fill="#3c3b6e"/></svg>',
  zh: '<svg viewBox="0 0 21 15" width="20" height="14"><rect width="21" height="15" fill="#de2910"/><path fill="#ffde00" d="M3.4 2.3 4 4.1h1.9L4.7 5.2l.6 1.8L3.4 5.9 1.5 7 2.1 5.2.3 4.1h1.9zm4.6 0 .35.7h.75l-.6.44.23.7-.73-.5-.73.5.23-.7-.6-.44h.75zm2.3 1.5.35.7h.75l-.6.44.23.7-.73-.5-.73.5.23-.7-.6-.44h.75zm0 2.7.35.7h.75l-.6.44.23.7-.73-.5-.73.5.23-.7-.6-.44h.75zm-2.3 1.5.35.7h.75l-.6.44.23.7-.73-.5-.73.5.23-.7-.6-.44h.75z"/></svg>',
  ja: '<svg viewBox="0 0 21 15" width="20" height="14"><rect width="21" height="15" fill="#fff"/><circle cx="10.5" cy="7.5" r="4.2" fill="#bc002d"/></svg>',
  pl: '<svg viewBox="0 0 21 15" width="20" height="14"><rect width="21" height="7.5" fill="#fff"/><rect y="7.5" width="21" height="7.5" fill="#dc143c"/></svg>',
  ru: '<svg viewBox="0 0 21 15" width="20" height="14"><rect width="21" height="5" fill="#fff"/><rect y="5" width="21" height="5" fill="#0039a6"/><rect y="10" width="21" height="5" fill="#d52b1e"/></svg>',
  de: '<svg viewBox="0 0 21 15" width="20" height="14"><rect width="21" height="5" fill="#000"/><rect y="5" width="21" height="5" fill="#de0000"/><rect y="10" width="21" height="5" fill="#ffce00"/></svg>',
  es: '<svg viewBox="0 0 21 15" width="20" height="14"><rect width="21" height="15" fill="#c60b1e"/><rect y="3.75" width="21" height="7.5" fill="#ffc400"/></svg>',
  pt: '<svg viewBox="0 0 21 15" width="20" height="14"><rect width="21" height="15" fill="#009b3a"/><path fill="#fedd00" d="M10.5 1.6 19.2 7.5 10.5 13.4 1.8 7.5z"/><circle cx="10.5" cy="7.5" r="3.1" fill="#002776"/></svg>',
  ko: '<svg viewBox="0 0 21 15" width="20" height="14"><rect width="21" height="15" fill="#fff"/><circle cx="10.5" cy="7.5" r="3.2" fill="#cd2e3a"/><path fill="#0047a0" d="M10.5 7.5a3.2 3.2 0 1 1-3.2-3.2A3.2 3.2 0 0 0 10.5 7.5z"/></svg>',
  tr: '<svg viewBox="0 0 21 15" width="20" height="14"><rect width="21" height="15" fill="#e30a17"/><circle cx="8.2" cy="7.5" r="3.2" fill="#fff"/><circle cx="9.1" cy="7.5" r="2.55" fill="#e30a17"/><path fill="#fff" d="M12.55 7.5 10.7 8.7l.7-2.15-1.85-1.2h2.28l.72-2.15.72 2.15h2.28l-1.85 1.2.7 2.15z"/></svg>',
  vi: '<svg viewBox="0 0 21 15" width="20" height="14"><rect width="21" height="15" fill="#da251d"/><path fill="#ff0" d="m10.5 2.4 1.2 3.7h3.9l-3.15 2.3 1.2 3.7-3.15-2.3-3.15 2.3 1.2-3.7-3.15-2.3h3.9z"/></svg>',
  id: '<svg viewBox="0 0 21 15" width="20" height="14"><rect width="21" height="7.5" fill="#ce1126"/><rect y="7.5" width="21" height="7.5" fill="#fff"/></svg>',
  hi: '<svg viewBox="0 0 21 15" width="20" height="14"><rect width="21" height="5" fill="#ff9933"/><rect y="5" width="21" height="5" fill="#fff"/><rect y="10" width="21" height="5" fill="#138808"/><circle cx="10.5" cy="7.5" r="1.8" fill="none" stroke="#000080" stroke-width="0.7"/><circle cx="10.5" cy="7.5" r="0.4" fill="#000080"/></svg>',
  ar: '<svg viewBox="0 0 21 15" width="20" height="14"><rect width="21" height="15" fill="#00732f"/><rect y="5" width="21" height="5" fill="#fff"/><rect y="10" width="21" height="5" fill="#000"/><rect width="6" height="15" fill="#ff0000"/></svg>',
};

export function flagSvg(id: LangId): string {
  return FLAG_SVG[id] ?? FLAG_SVG.en;
}

function closeLangMenu(): void {
  const btn = document.querySelector<HTMLButtonElement>('#lang-btn');
  const menu = document.querySelector<HTMLElement>('#lang-menu');
  if (menu) menu.hidden = true;
  btn?.setAttribute('aria-expanded', 'false');
}

function openLangMenu(): void {
  const btn = document.querySelector<HTMLButtonElement>('#lang-btn');
  const menu = document.querySelector<HTMLElement>('#lang-menu');
  if (!btn || !menu) return;
  const settings = document.querySelector<HTMLElement>('#settings-menu');
  if (settings && !settings.hidden) {
    settings.hidden = true;
    document.querySelector('#settings-btn')?.setAttribute('aria-expanded', 'false');
  }
  menu.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
}

function syncLangUi(): void {
  const meta = LANG_BY_ID[current];
  const btn = document.querySelector<HTMLButtonElement>('#lang-btn');
  const flag = btn?.querySelector('.lang-flag');
  if (flag) flag.innerHTML = flagSvg(current);
  if (btn) {
    const label = `${meta.native}`;
    btn.title = label;
    btn.setAttribute('aria-label', label);
  }
  const select = document.querySelector<HTMLSelectElement>('#lang-select');
  if (select && select.value !== current) select.value = current;
  document.querySelectorAll<HTMLElement>('#lang-menu [data-lang]').forEach((el) => {
    const on = el.dataset.lang === current;
    el.setAttribute('aria-selected', on ? 'true' : 'false');
    el.classList.toggle('is-active', on);
  });
}

function fillLangMenu(menu: HTMLElement | null = document.querySelector('#lang-menu')): void {
  if (!menu) return;
  menu.innerHTML = LANGS.map((l) => `<button type="button" role="option" data-lang="${l.id}" aria-selected="${l.id === current ? 'true' : 'false'}" class="${l.id === current ? 'is-active' : ''}"><span class="lang-flag" aria-hidden="true">${flagSvg(l.id)}</span><span class="lang-name">${l.native}</span></button>`).join('');
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
  syncLangUi();
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
  fillLangSelect();
  fillLangMenu();
  applyDocument();
  const select = document.querySelector<HTMLSelectElement>('#lang-select');
  select?.addEventListener('change', () => {
    if (isLangId(select.value)) setLang(select.value);
  });
  const btn = document.querySelector<HTMLButtonElement>('#lang-btn');
  const menu = document.querySelector<HTMLElement>('#lang-menu');
  btn?.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (!menu) return;
    if (menu.hidden) openLangMenu();
    else closeLangMenu();
  });
  menu?.addEventListener('click', (ev) => {
    const opt = (ev.target as HTMLElement).closest<HTMLElement>('[data-lang]');
    if (!opt || !isLangId(opt.dataset.lang)) return;
    setLang(opt.dataset.lang);
    closeLangMenu();
  });
  document.addEventListener('click', (ev) => {
    if (!menu || menu.hidden) return;
    const t = ev.target;
    if (t instanceof Node && (menu.contains(t) || btn?.contains(t))) return;
    closeLangMenu();
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && menu && !menu.hidden) closeLangMenu();
  });
  document.querySelector('#settings-btn')?.addEventListener('click', () => closeLangMenu());
  return current;
}
