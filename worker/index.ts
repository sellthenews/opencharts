// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

/**
 * Swapwick proxy Worker: Yahoo Finance plus optional DEX fallbacks.
 * Yahoo: only GET/OPTIONS, only two Yahoo paths.
 * DEX: allow-listed GeckoTerminal GET paths and official XRPL / Xahau JSON-RPC
 * methods. Client cookies or headers are never forwarded upstream.
 * Accounts: /auth/* and /sync, only when D1 and KV bindings are configured.
 * Per-account data is private; cookies are HttpOnly and never forwarded.
 */

import { tryHandleAccounts, type Env } from './accounts';
import {
  CG_ONCHAIN_BASE,
  allowBurst,
  buildXahauPairs,
  beyondDemoHistory,
  geckoPolicy,
  ledgerTtl,
  reserveCredit,
  sha256Hex,
  stretchTtl,
  yahooTtl,
} from './market';

const ALLOWED_ORIGINS = new Set([
  'https://swapwick.com',
  'https://www.swapwick.com',
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
const UA = 'Swapwick/0.2 (https://swapwick.com/)';
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
    headers.set('Access-Control-Expose-Headers', 'X-Swapwick-Cache, X-Swapwick-Upstream, X-Swapwick-Fallback');
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

async function fetchUpstream(pathAndQuery: string, runtime: WorkerRuntime, ttl: number): Promise<Response> {
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
        cf: { cacheTtl: ttl, cacheEverything: true },
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

function asJsonResponse(upstream: Response, body: ArrayBuffer, ttl: number): Response | null {
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
      'Cache-Control': `public, max-age=${ttl}`,
    },
  });
}

/** One upstream fetch per cache key at a time inside an isolate. */
const inflight = new Map<string, Promise<Response>>();

async function dedupe(key: string, load: () => Promise<Response>): Promise<Response> {
  let task = inflight.get(key);
  if (!task) {
    task = load().finally(() => inflight.delete(key));
    inflight.set(key, task);
  }
  return (await task).clone();
}

export interface MarketResult {
  res: Response;
  hit: boolean;
}

async function cacheMatch(runtime: WorkerRuntime, keyUrl: string): Promise<Response | null> {
  if (!runtime.cache) return null;
  return (await runtime.cache.match(new Request(keyUrl, { method: 'GET' }))) ?? null;
}

async function cachePut(runtime: WorkerRuntime, keyUrl: string, res: Response): Promise<void> {
  if (!runtime.cache) return;
  const put = runtime.cache.put(new Request(keyUrl, { method: 'GET' }), res);
  if (runtime.waitUntil) runtime.waitUntil(put);
  else await put;
}

function capMaxAge(cacheControl: string, cap: number): string {
  return cacheControl.replace(/max-age=(\d+)/, (_m, n: string) => `max-age=${Math.min(Number(n), cap)}`);
}

/**
 * Headers for the browser: the shared Cache API keeps the full TTL, but the browser only
 * reuses short-lived data for a short time so polling still sees fresh bars.
 */
function marketResponse(result: MarketResult, origin: string | null, clientCap?: number): Response {
  const { res, hit } = result;
  const headers = new Headers();
  headers.set('Content-Type', res.headers.get('Content-Type') || 'application/json; charset=utf-8');
  const stored = res.headers.get('Cache-Control') || `public, max-age=${CACHE_TTL_S}`;
  headers.set('Cache-Control', clientCap ? capMaxAge(stored, clientCap) : stored);
  const upstream = res.headers.get('X-Swapwick-Upstream');
  if (upstream) headers.set('X-Swapwick-Upstream', upstream);
  const fallback = res.headers.get('X-Swapwick-Fallback');
  if (fallback) headers.set('X-Swapwick-Fallback', fallback);
  headers.set('X-Swapwick-Cache', hit ? 'HIT' : 'MISS');
  applyCors(headers, origin);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

async function cachedUpstream(pathAndQuery: string, ttl: number, runtime: WorkerRuntime, peeked = false): Promise<MarketResult> {
  const cacheKeyUrl = `https://opencharts-proxy.cache${pathAndQuery}`;
  if (!peeked) {
    const hit = await cacheMatch(runtime, cacheKeyUrl);
    if (hit) return { res: hit, hit: true };
  }
  const res = await dedupe(cacheKeyUrl, async () => {
    const upstream = await fetchUpstream(pathAndQuery, runtime, ttl);
    const body = await upstream.arrayBuffer();
    const stored = asJsonResponse(upstream, body, ttl);
    if (!stored) throw new Error('Upstream did not return JSON');
    if (upstream.ok) await cachePut(runtime, cacheKeyUrl, stored.clone());
    return stored;
  });
  return { res, hit: false };
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

const LEDGER_METHODS = new Set(['amm_info', 'account_tx', 'book_offers', 'ledger', 'server_info', 'account_info', 'account_lines', 'account_offers', 'ripple_path_find']);
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

/** After a CoinGecko 401/403/429/5xx, skip it for a while and use keyless GeckoTerminal. */
let cgBlockedUntil = 0;

export function resetGeckoStateForTests(): void {
  cgBlockedUntil = 0;
  cgActive = 0;
  cgWaiters.length = 0;
  inflight.clear();
}

/** At most a few CoinGecko calls in flight per isolate, so a page full of icons cannot trip its burst limits. */
const CG_CONCURRENCY = 4;
let cgActive = 0;
const cgWaiters: Array<() => void> = [];

async function withCgSlot<T>(task: () => Promise<T>): Promise<T> {
  if (cgActive >= CG_CONCURRENCY) await new Promise<void>((resolve) => cgWaiters.push(resolve));
  cgActive += 1;
  try {
    return await task();
  } finally {
    cgActive -= 1;
    cgWaiters.shift()?.();
  }
}

interface CgResult {
  res: Response | null;
  /** Why CoinGecko was not used (for the X-Swapwick-Fallback header). */
  reason?: string;
}

async function fetchCoinGecko(pathAndQuery: string, apiKey: string, runtime: WorkerRuntime): Promise<CgResult> {
  const doFetch = runtime.fetch ?? fetch;
  return withCgSlot(async () => {
    const now = Date.now();
    try {
      const res = await doFetch(`${CG_ONCHAIN_BASE}${pathAndQuery}`, {
        method: 'GET',
        headers: { Accept: 'application/json', 'User-Agent': UA, 'x-cg-demo-api-key': apiKey },
      });
      if (res.ok) return { res };
      if (res.status === 429) {
        const wait = Number(res.headers.get('Retry-After'));
        const seconds = Number.isFinite(wait) && wait > 0 ? Math.min(Math.max(wait, 15), 300) : 60;
        cgBlockedUntil = now + seconds * 1000;
      } else if (res.status === 401 || res.status === 403) {
        // The Demo plan only serves the last 180 days of OHLCV; that 401 is about this request, not the key.
        const text = await res.text().catch(() => '');
        if (/past \d+ days|upgrade to the/i.test(text)) return { res: null, reason: 'cg-plan-limit' };
        cgBlockedUntil = now + 15 * 60_000;
      } else if (res.status >= 500) cgBlockedUntil = now + 60_000;
      return { res: null, reason: `cg-${res.status}` };
    } catch {
      cgBlockedUntil = now + 60_000;
      return { res: null, reason: 'cg-network' };
    }
  });
}

async function loadGecko(pathAndQuery: string, cacheKeyUrl: string, runtime: WorkerRuntime, env?: Env): Promise<Response> {
  const policy = geckoPolicy(pathAndQuery);
  const apiKey = env?.COINGECKO_DEMO_KEY;
  let upstream: Response | null = null;
  let source: 'coingecko' | 'geckoterminal' = 'geckoterminal';
  let share = 0;
  let reason = apiKey ? '' : 'no-key';
  if (apiKey) {
    if (Date.now() < cgBlockedUntil) reason = 'cooldown';
    else if (beyondDemoHistory(pathAndQuery)) reason = 'history'; // older than the Demo plan's 180 days
    else if (!allowBurst()) reason = 'burst';
    else {
      const priority = policy.kind === 'ohlcv' || policy.kind === 'detail' ? 'high' : 'low';
      const reservation = await reserveCredit(env?.DB, priority, new Date(), runtime.waitUntil);
      share = reservation.share;
      if (!reservation.ok) reason = 'budget';
      else {
        const result = await fetchCoinGecko(pathAndQuery, apiKey, runtime);
        upstream = result.res;
        if (upstream) source = 'coingecko';
        else reason = result.reason ?? 'cg-error';
      }
    }
  }
  if (!upstream) {
    const doFetch = runtime.fetch ?? fetch;
    upstream = await doFetch(`${GT_BASE}${pathAndQuery}`, {
      method: 'GET',
      headers: { Accept: 'application/json', 'User-Agent': UA },
    });
  }
  const contentType = upstream.headers.get('Content-Type') || 'application/json; charset=utf-8';
  const body = await upstream.arrayBuffer();
  let ttl = 0;
  if (upstream.ok) ttl = stretchTtl(policy.ttl, share, source === 'coingecko', Boolean(apiKey));
  else if (upstream.status === 404) ttl = 30; // do not spend credits repeatedly on a missing pool
  const stored = new Response(body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': ttl > 0 ? `public, max-age=${ttl}` : 'no-store',
      'X-Swapwick-Upstream': source,
      ...(source === 'geckoterminal' && reason ? { 'X-Swapwick-Fallback': reason } : {}),
    },
  });
  if (ttl > 0) await cachePut(runtime, cacheKeyUrl, stored.clone());
  return stored;
}

async function proxyGecko(pathAndQuery: string, runtime: WorkerRuntime, env?: Env, peeked = false): Promise<MarketResult> {
  const cacheKeyUrl = `https://opencharts-proxy.cache/dex/gt${pathAndQuery}`;
  if (!peeked) {
    const hit = await cacheMatch(runtime, cacheKeyUrl);
    if (hit) return { res: hit, hit: true };
  }
  const res = await dedupe(cacheKeyUrl, () => loadGecko(pathAndQuery, cacheKeyUrl, runtime, env));
  return { res, hit: false };
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

interface RpcCall {
  network: 'xrpl' | 'xahau';
  payload: { method: string; params: unknown[] };
}

type RpcParse = { call: RpcCall } | { error: Response };

function parseRpcBody(payload: { method?: unknown; params?: unknown }, network: 'xrpl' | 'xahau', origin: string | null): RpcParse {
  const method = typeof payload.method === 'string' ? payload.method : '';
  if (!LEDGER_METHODS.has(method)) return { error: jsonError(403, 'Method not allowed', origin) };
  const params = payload.params;
  if (params !== undefined && (!Array.isArray(params) || params.length > 1 || (params[0] != null && typeof params[0] !== 'object'))) {
    return { error: jsonError(403, 'Invalid params', origin) };
  }
  return { call: { network, payload: { method, params: (params as unknown[] | undefined) ?? [{}] } } };
}

async function rpcCacheKey(call: RpcCall): Promise<string> {
  const hash = await sha256Hex(JSON.stringify(call.payload));
  return `https://opencharts-proxy.cache/dex/rpc/${call.network}/${hash}`;
}

/** Read-only ledger RPC with a short shared cache; errors and non-success results are never stored. */
async function cachedLedger(call: RpcCall, runtime: WorkerRuntime, peeked = false): Promise<MarketResult> {
  const ttl = ledgerTtl(call.payload.method, call.payload.params);
  const keyUrl = await rpcCacheKey(call);
  if (ttl > 0 && !peeked) {
    const hit = await cacheMatch(runtime, keyUrl);
    if (hit) return { res: hit, hit: true };
  }
  const res = await dedupe(`${keyUrl}#${ttl}`, async () => {
    const upstream = await proxyLedger(call.network, call.payload, runtime);
    if (ttl > 0 && upstream.ok) {
      const text = await upstream.clone().text();
      let success = false;
      try {
        success = (JSON.parse(text) as { result?: { status?: string } }).result?.status === 'success';
      } catch {
        success = false;
      }
      if (success) {
        const stored = new Response(text, {
          status: 200,
          headers: {
            'Content-Type': upstream.headers.get('Content-Type') || 'application/json; charset=utf-8',
            'Cache-Control': `public, max-age=${ttl}`,
          },
        });
        await cachePut(runtime, keyUrl, stored);
      }
    }
    return upstream;
  });
  return { res, hit: false };
}

function rpcResponse(result: MarketResult, origin: string | null): Response {
  const headers = new Headers();
  headers.set('Content-Type', result.res.headers.get('Content-Type') || 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Swapwick-Cache', result.hit ? 'HIT' : 'MISS');
  applyCors(headers, origin);
  return new Response(result.res.body, { status: result.res.status, statusText: result.res.statusText, headers });
}

interface MarketRoute {
  kind: 'yahoo' | 'gecko';
  pathAndQuery: string;
  ttl: number;
  clientCap: number | undefined;
}

/** Resolve a cacheable GET route without touching the network. Null when invalid or not a market path. */
function marketRoute(url: URL): MarketRoute | null {
  const gtPath = parseGtPath(url.pathname);
  if (gtPath) {
    if (validateQuery(url, GT_PARAMS)) return null;
    const pathAndQuery = `${gtPath}${url.search}`;
    const policy = geckoPolicy(pathAndQuery);
    const live = policy.kind === 'ohlcv' || policy.kind === 'detail';
    return { kind: 'gecko', pathAndQuery, ttl: policy.ttl, clientCap: live ? 30 : undefined };
  }
  const symbol = parseChartPath(url.pathname);
  const isSearch = url.pathname === '/v1/finance/search';
  if (!symbol && !isSearch) return null;
  if (validateQuery(url, symbol ? CHART_PARAMS : SEARCH_PARAMS)) return null;
  if (isSearch && !url.searchParams.get('q')) return null;
  return { kind: 'yahoo', pathAndQuery: buildUpstreamPath(url, symbol), ttl: yahooTtl(url), clientCap: 60 };
}

async function peekRoute(route: MarketRoute, runtime: WorkerRuntime): Promise<Response | null> {
  const keyUrl = route.kind === 'gecko' ? `https://opencharts-proxy.cache/dex/gt${route.pathAndQuery}` : `https://opencharts-proxy.cache${route.pathAndQuery}`;
  return cacheMatch(runtime, keyUrl);
}

const XAHAU_PAIRS_KEY = 'https://opencharts-proxy.cache/dex/xahau/pairs/v1';
const XAHAU_PAIRS_TTL = 1800;

async function fetchJson(url: string, runtime: WorkerRuntime): Promise<unknown> {
  const f = runtime.fetch ?? fetch;
  const res = await f(url, { headers: { Accept: 'application/json', 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${new URL(url).host}`);
  return res.json();
}

async function cachedXahauPairs(runtime: WorkerRuntime): Promise<MarketResult> {
  const hit = await cacheMatch(runtime, XAHAU_PAIRS_KEY);
  if (hit) return { res: hit, hit: true };
  const res = await dedupe(XAHAU_PAIRS_KEY, async () => {
    const tokens: Array<Record<string, unknown>> = [];
    for (let page = 1; page <= 4; page++) {
      const body = (await fetchJson(`https://xahauindex.dev/v1/tokens?per_page=250&sort=trust_count&page=${page}`, runtime)) as { data?: Array<Record<string, unknown>>; meta?: { count?: number } };
      tokens.push(...(body.data ?? []));
      if (!body.data?.length || tokens.length >= (body.meta?.count ?? 0)) break;
    }
    let tickers: Array<Record<string, unknown>> = [];
    try {
      tickers = (await fetchJson('https://data.xahau.network/v1/iou/ticker_data/all?interval=30d', runtime)) as Array<Record<string, unknown>>;
      if (!Array.isArray(tickers)) tickers = [];
    } catch {
      tickers = [];
    }
    const built = buildXahauPairs(tokens, tickers);
    const out = new Response(JSON.stringify({ updated: Math.floor(Date.now() / 1000), ...built }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${XAHAU_PAIRS_TTL}` },
    });
    await cachePut(runtime, XAHAU_PAIRS_KEY, out.clone());
    return out;
  });
  return { res: res.clone(), hit: false };
}

export async function handleRequest(request: Request, runtime: WorkerRuntime = {}, env?: Env): Promise<Response> {
  const origin = request.headers.get('Origin');

  if (request.method === 'OPTIONS') {
    const headers = corsHeaders(origin);
    headers.set('Cache-Control', 'public, max-age=86400');
    return new Response(null, { status: 204, headers });
  }

  const url = new URL(request.url);
  const rpcNet = parseRpcNetwork(url.pathname);

  // Cache hits are cheap and never count toward the per-IP limit.
  let route: MarketRoute | null = null;
  let rpcCall: RpcCall | null = null;
  let rpcPeek: MarketResult | null = null;
  if (request.method === 'GET') {
    route = marketRoute(url);
    if (route) {
      const hit = await peekRoute(route, runtime);
      if (hit) return marketResponse({ res: hit, hit: true }, origin, route.clientCap);
    }
  } else if (request.method === 'POST' && rpcNet) {
    try {
      const parsed = parseRpcBody((await request.clone().json()) as { method?: unknown; params?: unknown }, rpcNet, origin);
      if ('call' in parsed) {
        rpcCall = parsed.call;
        if (ledgerTtl(rpcCall.payload.method, rpcCall.payload.params) > 0) {
          const hit = await cacheMatch(runtime, await rpcCacheKey(rpcCall));
          if (hit) rpcPeek = { res: hit, hit: true };
        }
      }
    } catch {
      /* handled below with the normal checks */
    }
    if (rpcPeek) return rpcResponse(rpcPeek, origin);
  }

  if (rateLimited(request)) {
    const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '60' });
    applyCors(headers, origin);
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429, headers });
  }

  const accounts = await tryHandleAccounts(request, env, { origin, jsonError, applyCors });
  if (accounts) return accounts;

  if (request.method === 'POST' && rpcNet) {
    let payload: { method?: unknown; params?: unknown };
    try {
      payload = (await request.json()) as { method?: unknown; params?: unknown };
    } catch {
      return jsonError(400, 'Invalid JSON', origin);
    }
    const parsed = parseRpcBody(payload, rpcNet, origin);
    if ('error' in parsed) return parsed.error;
    try {
      return rpcResponse(await cachedLedger(parsed.call, runtime, true), origin);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return jsonError(502, `Proxy error: ${message}`, origin);
    }
  }

  if (request.method !== 'GET') {
    return jsonError(405, 'Method not allowed', origin);
  }

  if (url.pathname === '/xaman/config') {
    const key = (env?.XAMAN_API_KEY ?? '').trim();
    const apiKey = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key) ? key : null;
    const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' });
    applyCors(headers, origin);
    return new Response(JSON.stringify({ apiKey }), { status: 200, headers });
  }

  if (url.pathname === '/dex/xahau/pairs') {
    try {
      return marketResponse(await cachedXahauPairs(runtime), origin, 600);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return jsonError(502, `Proxy error: ${message}`, origin);
    }
  }

  const gtPath = parseGtPath(url.pathname);
  if (gtPath) {
    const invalid = validateQuery(url, GT_PARAMS);
    if (invalid) return jsonError(403, invalid, origin);
    if (!route) return jsonError(404, 'Not found', origin);
    try {
      return marketResponse(await proxyGecko(route.pathAndQuery, runtime, env, true), origin, route.clientCap);
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

  if (!route) return jsonError(404, 'Not found', origin);
  try {
    return marketResponse(await cachedUpstream(route.pathAndQuery, route.ttl, runtime, true), origin, route.clientCap);
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
