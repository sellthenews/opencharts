// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import { getStocksProxyUrl } from './config';
import { lookupDexPair } from './sources/dex';
import { GECKO_API, currencyCode } from './sources/dex-networks';

const CACHE_KEY = 'opencharts:asset-icons:v1';
const CACHE_MAX = 500;
const HIT_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 24 * 60 * 60 * 1000;

const CRYPTO_QUOTES = new Set([
  'USD', 'USDT', 'USDC', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'KRW',
  'BTC', 'ETH', 'BNB', 'XRP', 'SOL', 'DOGE', 'TRX', 'DAI', 'EURT', 'USDCE',
]);

const CRYPTO_SLUG: Record<string, string> = {
  XBT: 'btc',
  WETH: 'eth',
  WBTC: 'btc',
  WBNB: 'bnb',
  WAVAX: 'avax',
  WMATIC: 'matic',
  WPOL: 'matic',
  POL: 'matic',
  WSOL: 'sol',
  WTRX: 'trx',
  STETH: 'eth',
  WSTETH: 'eth',
};

interface CacheEntry {
  url: string | null;
  at: number;
}

const memory = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<string | null>>();
let observer: IntersectionObserver | null = null;

function now(): number {
  return Date.now();
}

function isFresh(entry: CacheEntry): boolean {
  const ttl = entry.url ? HIT_TTL_MS : MISS_TTL_MS;
  return now() - entry.at < ttl;
}

function readDisk(): Record<string, CacheEntry> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeDisk(): void {
  try {
    const rows = [...memory.entries()]
      .filter(([, v]) => isFresh(v))
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, CACHE_MAX);
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(rows)));
  } catch {
    /* quota or private mode */
  }
}

function cacheGet(key: string): CacheEntry | undefined {
  const mem = memory.get(key);
  if (mem && isFresh(mem)) return mem;
  const disk = readDisk()[key];
  if (disk && isFresh(disk)) {
    memory.set(key, disk);
    return disk;
  }
  return undefined;
}

function cacheSet(key: string, url: string | null): void {
  memory.set(key, { url, at: now() });
  writeDisk();
}

export function cacheKey(sourceId: string, pairId: string): string {
  return `${sourceId}:${pairId}`;
}

/** Visible base ticker used for the letter fallback and most logo lookups. */
export function baseTicker(label: string, pairId = ''): string {
  const fromLabel = label.split(/[/\s]/)[0]?.trim() ?? '';
  const raw = fromLabel || pairId.split(/[/-]/)[0] || pairId;
  const ticker = raw.replace(/XBT/gi, 'BTC').replace(/[^A-Za-z0-9]+/g, '');
  return ticker.toUpperCase() || '?';
}

export function assetLetter(label: string, pairId = ''): string {
  return (baseTicker(label, pairId).match(/[A-Za-z0-9]/)?.[0] ?? '?').toUpperCase();
}

/** Stable pastel background so the letter fallback is recognizable. */
export function assetColor(label: string, pairId = ''): string {
  const text = baseTicker(label, pairId);
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 33 + text.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue} 42% 38%)`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function assetIconHtml(sourceId: string, pairId: string, label: string): string {
  const letter = assetLetter(label, pairId);
  const color = assetColor(label, pairId);
  const cached = cacheGet(cacheKey(sourceId, pairId));
  const img = cached?.url
    ? `<img src="${escapeHtml(cached.url)}" alt="" draggable="false" />`
    : '';
  const ready = cached?.url ? ' has-img' : '';
  return `<span class="asset-icon${ready}" data-icon-source="${escapeHtml(sourceId)}" data-icon-pair="${escapeHtml(pairId)}" data-icon-label="${escapeHtml(label)}" style="--asset-icon-bg:${color}" aria-hidden="true"><span class="asset-icon-letter">${escapeHtml(letter)}</span>${img}</span>`;
}

function cryptoSlug(ticker: string): string {
  const upper = ticker.toUpperCase();
  return CRYPTO_SLUG[upper] ?? upper.toLowerCase();
}

function looksLikeCryptoPair(sourceId: string, pairId: string, label: string): boolean {
  if (sourceId === 'kraken' || sourceId === 'binance' || sourceId === 'coinbase' || sourceId === 'bitstamp') return true;
  if (sourceId === 'dex') return true;
  const tag = `${label} ${pairId}`.toUpperCase();
  if (CRYPTO_QUOTES.has(tag.split(/[/-]/).pop() ?? '')) return true;
  return false;
}

function cryptoIconUrls(ticker: string): string[] {
  const slug = cryptoSlug(ticker);
  if (!slug || slug === '?') return [];
  return [
    `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/${slug}.svg`,
    `https://assets.coincap.io/assets/icons/${slug}@2x.png`,
  ];
}

function stockIconUrls(ticker: string): string[] {
  const sym = ticker.toUpperCase().replace(/\./g, '-');
  if (!sym || sym === '?') return [];
  return [
    `https://assets.parqet.com/logos/symbol/${encodeURIComponent(sym)}`,
    `https://images.financialmodelingprep.com/symbol/${encodeURIComponent(sym)}.png`,
  ];
}

function probeImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const done = (ok: boolean): void => {
      img.onload = null;
      img.onerror = null;
      resolve(ok);
    };
    const timer = window.setTimeout(() => done(false), 8000);
    img.onload = () => {
      window.clearTimeout(timer);
      done(img.naturalWidth > 1);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      done(false);
    };
    img.referrerPolicy = 'no-referrer';
    img.src = url;
  });
}

async function firstWorkingImage(urls: string[]): Promise<string | null> {
  for (const url of urls) {
    if (await probeImage(url)) return url;
  }
  return null;
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function xrplMetaUrl(currency: string, issuer: string): string {
  const code = currencyCode(currency) || currency;
  return `https://s1.xrplmeta.org/token/${encodeURIComponent(code)}:${encodeURIComponent(issuer)}`;
}

function iconFromXrplMeta(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const meta = (body as { meta?: { token?: { icon?: unknown } } }).meta;
  const icon = meta?.token?.icon;
  return typeof icon === 'string' && icon.startsWith('https://') ? icon : null;
}

async function resolveXrplIcon(pairId: string, label: string): Promise<string | null> {
  const ticker = baseTicker(label, pairId);
  const pair = lookupDexPair(pairId);
  const native = pair?.networkId === 'xahau' ? 'XAH' : 'XRP';
  if (pair?.baseIssuer) {
    const body = await fetchJson(xrplMetaUrl(pair.base, pair.baseIssuer));
    const icon = iconFromXrplMeta(body);
    if (icon) return icon;
  }
  if (ticker !== native && pair?.quoteIssuer && pair.quote.toUpperCase() === ticker) {
    const body = await fetchJson(xrplMetaUrl(pair.quote, pair.quoteIssuer));
    const icon = iconFromXrplMeta(body);
    if (icon) return icon;
  }
  return firstWorkingImage(cryptoIconUrls(ticker));
}

async function geckoJson(path: string): Promise<unknown | null> {
  // Worker first: it caches icon lookups for a day and keeps the public GeckoTerminal quota free.
  const urls: string[] = [];
  const proxy = getStocksProxyUrl();
  if (proxy) urls.push(`${proxy}/dex/gt${path}`);
  urls.push(`${GECKO_API}${path}`);
  for (const url of urls) {
    const body = await fetchJson(url);
    if (body) return body;
  }
  return null;
}

function geckoImageFromPool(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const row = body as {
    data?: { relationships?: { base_token?: { data?: { id?: string } } } };
    included?: { id?: string; attributes?: { image_url?: string } }[];
  };
  const baseId = row.data?.relationships?.base_token?.data?.id;
  const included = row.included ?? [];
  const token = included.find((item) => item.id === baseId) ?? included[0];
  const image = token?.attributes?.image_url;
  if (typeof image === 'string' && image.startsWith('http') && !image.includes('missing.png')) return image;
  return null;
}

async function resolveGeckoIcon(pairId: string, label: string): Promise<string | null> {
  const pair = lookupDexPair(pairId);
  if (pair?.address && pair.networkId) {
    const body = await geckoJson(`/networks/${encodeURIComponent(pair.networkId)}/pools/${encodeURIComponent(pair.address)}?include=base_token`);
    const image = geckoImageFromPool(body);
    if (image && (await probeImage(image))) return image;
  }
  return firstWorkingImage(cryptoIconUrls(baseTicker(label, pairId)));
}

async function resolveUrl(sourceId: string, pairId: string, label: string): Promise<string | null> {
  const ticker = baseTicker(label, pairId);
  if (sourceId === 'dex') {
    if (pairId.startsWith('gt:')) return resolveGeckoIcon(pairId, label);
    if (pairId.startsWith('amm:') || pairId.startsWith('book:')) return resolveXrplIcon(pairId, label);
    return firstWorkingImage(cryptoIconUrls(ticker));
  }
  if (looksLikeCryptoPair(sourceId, pairId, label)) {
    return firstWorkingImage(cryptoIconUrls(ticker));
  }
  const stock = await firstWorkingImage(stockIconUrls(ticker));
  if (stock) return stock;
  return firstWorkingImage(cryptoIconUrls(ticker));
}

export async function resolveAssetIconUrl(sourceId: string, pairId: string, label: string): Promise<string | null> {
  const key = cacheKey(sourceId, pairId);
  const cached = cacheGet(key);
  if (cached) return cached.url;
  const pending = inflight.get(key);
  if (pending) return pending;
  const task = resolveUrl(sourceId, pairId, label)
    .then((url) => {
      cacheSet(key, url);
      return url;
    })
    .catch(() => {
      cacheSet(key, null);
      return null;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, task);
  return task;
}

function applyIcon(el: HTMLElement, url: string | null): void {
  el.querySelector('img')?.remove();
  if (!url) {
    el.classList.remove('has-img');
    return;
  }
  const img = document.createElement('img');
  img.alt = '';
  img.draggable = false;
  img.referrerPolicy = 'no-referrer';
  img.src = url;
  img.addEventListener('error', () => {
    img.remove();
    el.classList.remove('has-img');
  });
  el.append(img);
  el.classList.add('has-img');
}

async function fillIcon(el: HTMLElement): Promise<void> {
  const sourceId = el.dataset.iconSource ?? '';
  const pairId = el.dataset.iconPair ?? '';
  const label = el.dataset.iconLabel ?? el.textContent ?? '';
  if (!sourceId || !pairId) return;
  const url = await resolveAssetIconUrl(sourceId, pairId, label);
  if (!el.isConnected) return;
  applyIcon(el, url);
}

function getObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === 'undefined') return null;
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          observer?.unobserve(el);
          void fillIcon(el);
        }
      },
      { rootMargin: '80px', threshold: 0.01 },
    );
  }
  return observer;
}

/** Lazy-load logos for icon placeholders in a rendered list. */
export function hydrateAssetIcons(root: ParentNode = document): void {
  const nodes = root.querySelectorAll<HTMLElement>('.asset-icon[data-icon-source]');
  const io = getObserver();
  for (const el of nodes) {
    const sourceId = el.dataset.iconSource ?? '';
    const pairId = el.dataset.iconPair ?? '';
    const cached = sourceId && pairId ? cacheGet(cacheKey(sourceId, pairId)) : undefined;
    if (cached?.url && !el.querySelector('img')) applyIcon(el, cached.url);
    if (cached) continue;
    if (io) io.observe(el);
    else void fillIcon(el);
  }
}
