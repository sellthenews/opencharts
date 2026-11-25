// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

/**
 * OpenCharts proxy Worker: Yahoo Finance plus optional DEX fallbacks.
 * Yahoo: only GET/OPTIONS, only two Yahoo paths.
 * DEX: allow-listed GeckoTerminal GET paths and official XRPL / Xahau JSON-RPC
 * methods. Client cookies or headers are never forwarded upstream.
 * Accounts: /auth/* and /sync, only when D1 and KV bindings are configured.
 * Per-account data is private; cookies are HttpOnly and never forwarded.
 */

import { tryHandleAccounts, type Env } from './accounts';

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
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

const hits = new Map<string, number[]>();

export function resetRateLimit(): void {
  hits.clear();
}

function clientKey(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || 'local';
}

function rateLimited(request: Request, now = Date.now()): boolean {
  const key = clientKey(request);
  const recent = (hits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  return false;
}

export interface WorkerRuntime {
  cache?: Cache;
  waitUntil?: (p: Promise<unknown>) => void;
  fetch?: typeof fetch;
}

function corsHeaders(origin: string | null): Headers {
  const headers = new Headers();
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    headers.set('Access-Control-Allow-Credentials', 'true');
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

function asJsonResponse(upstream: Response, body: ArrayBuffer): Response | null {
  const contentType = upstream.headers.get('Content-Type') || '';
  if (contentType && !/json/i.test(contentType)) return null;
  const text = new TextDecoder().decode(body);
  try {
    JSON.parse(text);
  } catch {
    return null;
  }
  return new Response(text, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${CACHE_TTL_S}`,
    },
  });
}

async function cachedUpstream(pathAndQuery: string, runtime: WorkerRuntime): Promise<Response> {
  const cacheKeyUrl = `https://opencharts-proxy.cache${pathAndQuery}`;
  if (runtime.cache) {
    const hit = await runtime.cache.match(new Request(cacheKeyUrl, { method: 'GET' }));
    if (hit) return hit;
  }
  const upstream = await fetchUpstream(pathAndQuery, runtime);
  const body = await upstream.arrayBuffer();
  const stored = asJsonResponse(upstream, body);
  if (!stored) throw new Error('Upstream did not return JSON');
  if (runtime.cache && upstream.ok) {
    const put = runtime.cache.put(new Request(cacheKeyUrl, { method: 'GET' }), stored.clone());
    if (runtime.waitUntil) runtime.waitUntil(put);
    else await put;
  }
  return stored;
}


const GT_BASE = 'https://api.geckoterminal.com/api/v2';
const GT_NET = /^[a-z0-9_]{1,32}$/;
const GT_ADDR = /^[a-zA-Z0-9._-]{1,200}$/;
const GT_TF = /^(day|hour|minute)$/;
const GT_PARAMS: Record<string, RegExp> = {
  page: /^\d{1,3}$/,
  query: /^[A-Za-z0-9 ._\-/:#]{1,80}$/,
  q: /^[A-Za-z0-9 ._\-/:#]{1,80}$/,
  aggregate: /^\d{1,3}$/,
  limit: /^\d{1,4}$/,
  currency: /^(usd|token)$/,
  before_timestamp: /^\d{1,12}$/,
  network: GT_NET,
  include: /^[a-z,_]{0,80}$/,
  duration: /^(5m|15m|1h|6h|24h)$/,
};

const LEDGER_METHODS = new Set(['amm_info', 'account_tx', 'book_offers', 'ledger', 'server_info', 'account_info']);
const LEDGER_UPSTREAM: Record<string, readonly string[]> = {
  xrpl: ['https://xrplcluster.com/', 'https://s2.ripple.com:51234/'],
  xahau: ['https://xahau.network/', 'https://xahau.org/'],
};

function parseGtPath(pathname: string): string | null {
  if (!pathname.startsWith('/dex/gt/')) return null;
  const rest = pathname.slice('/dex/gt'.length);
  const parts = rest.split('/').filter(Boolean);
  if (parts[0] === 'search' && parts[1] === 'pools' && parts.length === 2) return rest;
  if (parts[0] !== 'networks' || parts.length < 1) return null;
  if (parts.length === 1) return rest;
  if (!GT_NET.test(parts[1]!)) return null;
  if (parts.length === 2) return rest;
  if (parts[2] === 'trending_pools' && parts.length === 3) return rest;
  if (parts[2] !== 'pools') return null;
  if (parts.length === 3) return rest;
  if (!GT_ADDR.test(parts[3]!) || parts[3] === '.' || parts[3] === '..' || parts[3]!.includes('..')) return null;
  if (parts.length === 4) return rest;
  if (parts[4] === 'ohlcv' && parts.length === 6 && GT_TF.test(parts[5]!)) return rest;
  return null;
}

function parseRpcNetwork(pathname: string): 'xrpl' | 'xahau' | null {
  if (pathname === '/dex/rpc/xrpl') return 'xrpl';
  if (pathname === '/dex/rpc/xahau') return 'xahau';
  return null;
}

const GT_LIST_TTL_S = 300;

function geckoCacheTtl(pathAndQuery: string): number {
  return /\/ohlcv\//.test(pathAndQuery) ? CACHE_TTL_S : GT_LIST_TTL_S;
}

async function proxyGecko(pathAndQuery: string, runtime: WorkerRuntime): Promise<Response> {
  const ttl = geckoCacheTtl(pathAndQuery);
  const cacheKeyUrl = `https://opencharts-proxy.cache/dex/gt${pathAndQuery}`;
  if (runtime.cache) {
    const hit = await runtime.cache.match(new Request(cacheKeyUrl, { method: 'GET' }));
    if (hit) return hit;
  }
  const doFetch = runtime.fetch ?? fetch;
  const upstream = `${GT_BASE}${pathAndQuery}`;
  const res = await doFetch(upstream, {
    method: 'GET',
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });
  const contentType = res.headers.get('Content-Type') || 'application/json; charset=utf-8';
  const body = await res.arrayBuffer();
  const stored = new Response(body, {
    status: res.status,
    statusText: res.statusText,
    headers: { 'Content-Type': contentType, 'Cache-Control': `public, max-age=${ttl}` },
  });
  if (runtime.cache && res.ok) {
    const put = runtime.cache.put(new Request(cacheKeyUrl, { method: 'GET' }), stored.clone());
    if (runtime.waitUntil) runtime.waitUntil(put);
    else await put;
  }
  return stored;
}

async function proxyLedger(network: 'xrpl' | 'xahau', payload: unknown, runtime: WorkerRuntime): Promise<Response> {
  const doFetch = runtime.fetch ?? fetch;
  let lastError: Error | null = null;
  for (const base of LEDGER_UPSTREAM[network]!) {
    try {
      const res = await doFetch(base, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': UA },
        body: JSON.stringify(payload),
      });
      if (res.status >= 500) {
        lastError = new Error(`Upstream HTTP ${res.status}`);
        continue;
      }
      const contentType = res.headers.get('Content-Type') || 'application/json; charset=utf-8';
      const body = await res.arrayBuffer();
      return new Response(body, {
        status: res.status,
        statusText: res.statusText,
        headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store' },
      });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError ?? new Error('Upstream unavailable');
}

export async function handleRequest(request: Request, runtime: WorkerRuntime = {}, env?: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  if (request.method === 'OPTIONS') {
    const headers = corsHeaders(origin);
    headers.set('Cache-Control', 'public, max-age=86400');
    return new Response(null, { status: 204, headers });
  }

  if (rateLimited(request)) {
    const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '60' });
    applyCors(headers, origin);
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers });
  }

  const accounts = await tryHandleAccounts(request, env, { origin, jsonError, applyCors });
  if (accounts) return accounts;

  const url = new URL(request.url);
  const gtPath = parseGtPath(url.pathname);
  const rpcNet = parseRpcNetwork(url.pathname);

  if (request.method === 'POST' && rpcNet) {
    let payload: { method?: unknown; params?: unknown };
    try {
      payload = (await request.json()) as { method?: unknown; params?: unknown };
    } catch {
      return jsonError(400, 'Invalid JSON', origin);
    }
    const method = typeof payload.method === 'string' ? payload.method : '';
    if (!LEDGER_METHODS.has(method)) return jsonError(403, 'Method not allowed', origin);
    const params = payload.params;
    if (params !== undefined && (!Array.isArray(params) || params.length > 1 || (params[0] != null && typeof params[0] !== 'object'))) {
      return jsonError(403, 'Invalid params', origin);
    }
    try {
      const upstream = await proxyLedger(rpcNet, { method, params: params ?? [{}] }, runtime);
      const headers = new Headers();
      headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json; charset=utf-8');
      headers.set('Cache-Control', 'no-store');
      applyCors(headers, origin);
      return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return jsonError(502, `Proxy error: ${message}`, origin);
    }
  }

  if (request.method !== 'GET') {
    return jsonError(405, 'Method not allowed', origin);
  }

  if (gtPath) {
    const invalid = validateQuery(url, GT_PARAMS);
    if (invalid) return jsonError(403, invalid, origin);
    try {
      const upstream = await proxyGecko(`${gtPath}${url.search}`, runtime);
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
    headers.set('Content-Type', 'application/json; charset=utf-8');
    headers.set('Cache-Control', upstream.headers.get('Cache-Control') || `public, max-age=${CACHE_TTL_S}`);
    applyCors(headers, origin);
    return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(502, `Proxy error: ${message}`, origin);
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: { waitUntil: (p: Promise<unknown>) => void }): Promise<Response> {
    const cache = typeof caches !== 'undefined' ? caches.default : undefined;
    return handleRequest(request, { cache, waitUntil: ctx.waitUntil.bind(ctx) }, env);
  },
};
