// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors
//
// Network-first for HTML and version.json so a new GitHub Pages deploy
// reaches users. Cache-first only for hashed /assets/ files (content-hashed
// by Vite, safe to keep). Cross-origin market-data requests are never
// intercepted. Scope is "./" so this works under the /opencharts/ base path.

const CACHE_ASSETS = 'opencharts-assets-v4';
const CACHE_PAGES = 'opencharts-pages-v4';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([CACHE_ASSETS, CACHE_PAGES]);
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('opencharts-') && !keep.has(key))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

function isHashedAsset(url) {
  return /\/assets\/[^/]+-[A-Za-z0-9_-]{6,}\.[a-z0-9]+$/i.test(url.pathname);
}

function isAlwaysFresh(url) {
  return /\/(version\.json|sw\.js|manifest\.webmanifest)$/i.test(url.pathname);
}

async function networkFirst(request, cacheName) {
  try {
    const fresh = await fetch(request);
    if (fresh.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const scope = self.registration.scope;
      const fallback =
        (await caches.match(new URL('./', scope))) ||
        (await caches.match(new URL('./index.html', scope)));
      if (fallback) return fallback;
    }
    throw err;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh.ok) {
    const cache = await caches.open(CACHE_ASSETS);
    cache.put(request, fresh.clone());
  }
  return fresh;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isAlwaysFresh(url)) {
    event.respondWith(fetch(request).catch(() => caches.match(request).then((r) => r || fetch(request))));
    return;
  }

  if (isHashedAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request, CACHE_PAGES));
});
