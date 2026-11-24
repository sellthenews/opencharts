// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

/**
 * Narrow Yahoo Finance proxy for OpenCharts.
 * Only GET/OPTIONS, only two Yahoo paths, no forwarding of client headers or cookies.
 */

const ALLOWED_ORIGINS = new Set([
  'https://sellthenews.github.io',
  'http://127.0.0.1:4173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
]);

const UPSTREAMS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'] as const;

const SYMBOL_RE = /^[A-Za-z0-9.^=-]{1,20}$/;
const QUERY_RE = /^[A-Za-z0-9 .^=-]{1,40}$/;

const CHART_PARAMS: Record<string, RegExp> = {
  range: /^(1d|5d|1mo|3mo|6mo|1y|2y|5y|10y|ytd|max)$/,
  interval: /^(1m|2m|5m|15m|30m|60m|90m|1h|1d|5d|1wk|1mo|3mo)$/,
  period1: /^\d{1,12}$/,
  period2: /^\d{1,12}$/,
  includePrePost: /^(true|false|0|1)$/,
  events: /^(div|split|div,split|split,div)$/,
};

const SEARCH_PARAMS: Record<string, RegExp> = {
  q: QUERY_RE,
  quotesCount: /^([1-9]|1[0-9]|2[0-4])$/,
  newsCount: /^0$/,
};

const CACHE_TTL_S = 60;
const UA = 'OpenCharts/0.1 (https://sellthenews.github.io/opencharts/)';

export interface WorkerRuntime {
  cache?: Cache;
  waitUntil?: (p: Promise<unknown>) => void;
  fetch?: typeof fetch;
}

function corsHeaders(origin: string | null): Headers {
  const headers = new Headers();
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    headers.set('Access-Control-Max-Age', '86400');
    headers.set('Vary', 'Origin');
  }
  return headers;
}

function applyCors(headers: Headers, origin: string | null): void {
  const extra = corsHeaders(origin);
  extra.forEach((value, key) => headers.set(key, value));
}

function jsonError(status: number, message: string, origin: string | null): Response {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  applyCors(headers, origin);
  return new Response(JSON.stringify({ error: message }), { status, headers });
}

function validateQuery(url: URL, allowed: Record<string, RegExp>): string | null {
  for (const key of url.searchParams.keys()) {
    if (!(key in allowed)) return `Unknown query parameter: ${key}`;
    const value = url.searchParams.get(key) ?? '';
    if (!allowed[key]!.test(value)) return `Invalid value for ${key}`;
  }
  return null;
}

function parseChartPath(pathname: string): string | null {
  const match = /^\/v8\/finance\/chart\/([^/]+)$/.exec(pathname);
  if (!match) return null;
  let symbol = match[1] ?? '';
  try {
    symbol = decodeURIComponent(symbol);
  } catch {
    return null;
  }
  if (!SYMBOL_RE.test(symbol)) return null;
  return symbol;
}

function buildUpstreamPath(url: URL, symbol: string | null): string {
  if (symbol) {
    const next = new URL(`/v8/finance/chart/${encodeURIComponent(symbol)}`, 'https://example.invalid');
    url.searchParams.forEach((value, key) => next.searchParams.set(key, value));
    return `${next.pathname}${next.search}`;
  }
  return `/v1/finance/search${url.search}`;
}

async function fetchUpstream(pathAndQuery: string, runtime: WorkerRuntime): Promise<Response> {
  const doFetch = runtime.fetch ?? fetch;
  let lastError: Error | null = null;
  for (const base of UPSTREAMS) {
    const yahooUrl = `${base}${pathAndQuery}`;
    try {
      const res = await doFetch(yahooUrl, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': UA,
        },
        cf: { cacheTtl: CACHE_TTL_S, cacheEverything: true },
      } as RequestInit);
      if (res.status >= 500) {
        lastError = new Error(`Upstream HTTP ${res.status}`);
        continue;
      }
      return res;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError ?? new Error('Upstream unavailable');
}

async function cachedUpstream(pathAndQuery: string, runtime: WorkerRuntime): Promise<Response> {
  const cacheKeyUrl = `https://opencharts-proxy.cache${pathAndQuery}`;
  if (runtime.cache) {
    const hit = await runtime.cache.match(new Request(cacheKeyUrl, { method: 'GET' }));
    if (hit) return hit;
  }
  const upstream = await fetchUpstream(pathAndQuery, runtime);
  const contentType = upstream.headers.get('Content-Type') || 'application/json; charset=utf-8';
  const body = await upstream.arrayBuffer();
  const headers = new Headers({
    'Content-Type': contentType,
    'Cache-Control': `public, max-age=${CACHE_TTL_S}`,
  });
  const stored = new Response(body, { status: upstream.status, statusText: upstream.statusText, headers });
  if (runtime.cache && upstream.ok) {
    const put = runtime.cache.put(new Request(cacheKeyUrl, { method: 'GET' }), stored.clone());
    if (runtime.waitUntil) runtime.waitUntil(put);
    else await put;
  }
  return stored;
}

export async function handleRequest(request: Request, runtime: WorkerRuntime = {}): Promise<Response> {
  const origin = request.headers.get('Origin');

  if (request.method === 'OPTIONS') {
    const headers = corsHeaders(origin);
    headers.set('Cache-Control', 'public, max-age=86400');
    return new Response(null, { status: 204, headers });
  }

  if (request.method !== 'GET') {
    return jsonError(405, 'Method not allowed', origin);
  }

  const url = new URL(request.url);
  const symbol = parseChartPath(url.pathname);
  const isSearch = url.pathname === '/v1/finance/search';

  if (!symbol && !isSearch) {
    return jsonError(404, 'Not found', origin);
  }

  if (symbol) {
    const invalid = validateQuery(url, CHART_PARAMS);
    if (invalid) return jsonError(403, invalid, origin);
  } else {
    const invalid = validateQuery(url, SEARCH_PARAMS);
    if (invalid) return jsonError(403, invalid, origin);
    const q = url.searchParams.get('q') ?? '';
    if (!q) return jsonError(403, 'Missing q', origin);
  }

  try {
    const upstream = await cachedUpstream(buildUpstreamPath(url, symbol), runtime);
    const headers = new Headers();
    headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json; charset=utf-8');
    headers.set('Cache-Control', upstream.headers.get('Cache-Control') || `public, max-age=${CACHE_TTL_S}`);
    applyCors(headers, origin);
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(502, `Proxy error: ${message}`, origin);
  }
}

export default {
  async fetch(request: Request, _env: unknown, ctx: { waitUntil: (p: Promise<unknown>) => void }): Promise<Response> {
    const cache = typeof caches !== 'undefined' ? caches.default : undefined;
    return handleRequest(request, { cache, waitUntil: ctx.waitUntil.bind(ctx) });
  },
};
