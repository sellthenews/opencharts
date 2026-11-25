// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleRequest, resetRateLimit } from './index.ts';

const PAGES = 'https://sellthenews.github.io';
const OTHER = 'https://evil.example';

function req(path: string, init: RequestInit & { origin?: string } = {}): Request {
  const headers = new Headers(init.headers);
  if (init.origin) headers.set('Origin', init.origin);
  if (init.headers && 'Cookie' in (init.headers as Record<string, string>)) {
    /* already set */
  }
  return new Request(`https://opencharts-proxy.workers.dev${path}`, { method: init.method ?? 'GET', headers });
}

test('OPTIONS from the Pages origin gets CORS, other origins do not', async () => {
  const ok = await handleRequest(req('/v8/finance/chart/AAPL', { method: 'OPTIONS', origin: PAGES }));
  assert.equal(ok.status, 204);
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'), PAGES);
  assert.equal(ok.headers.get('Access-Control-Allow-Methods'), 'GET, POST, OPTIONS');

  const local = await handleRequest(req('/v8/finance/chart/AAPL', { method: 'OPTIONS', origin: 'http://127.0.0.1:4173' }));
  assert.equal(local.status, 204);
  assert.equal(local.headers.get('Access-Control-Allow-Origin'), 'http://127.0.0.1:4173');

  const denied = await handleRequest(req('/v8/finance/chart/AAPL', { method: 'OPTIONS', origin: OTHER }));
  assert.equal(denied.status, 204);
  assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null);
});

test('non-GET, unknown paths and params are rejected', async () => {
  assert.equal((await handleRequest(req('/v8/finance/chart/AAPL', { method: 'POST', origin: PAGES }))).status, 405);
  assert.equal((await handleRequest(req('/v8/finance/chart/AAPL', { method: 'PUT' }))).status, 405);
  assert.equal((await handleRequest(req('/open?url=https://example.com'))).status, 404);
  assert.equal((await handleRequest(req('/v7/finance/quote?symbols=AAPL'))).status, 404);
  assert.equal((await handleRequest(req('/v8/finance/chart/AAPL/foo'))).status, 404);
  assert.equal((await handleRequest(req('/v8/finance/chart/THIS_SYMBOL_IS_WAY_TOO_LONG_FOR_US'))).status, 404);
  assert.equal((await handleRequest(req('/v8/finance/chart/AAPL?interval=1d&range=1y&foo=bar'))).status, 403);
  assert.equal((await handleRequest(req('/v8/finance/chart/AAPL?interval=1d&callback=alert'))).status, 403);
  assert.equal((await handleRequest(req('/v1/finance/search?q=AAPL&newsCount=5'))).status, 403);
  assert.equal((await handleRequest(req('/v1/finance/search?quotesCount=6'))).status, 403);
});

test('client cookies and headers are not forwarded upstream', async () => {
  let forwarded: Headers | undefined;
  const runtime = {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      forwarded = new Headers(init?.headers);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  };
  const headers = new Headers({
    Origin: PAGES,
    Cookie: 'session=secret',
    Authorization: 'Bearer stolen',
    'X-Forwarded-For': '1.2.3.4',
  });
  const res = await handleRequest(new Request('https://opencharts-proxy.workers.dev/v8/finance/chart/AAPL?interval=1d&range=1y', { headers }), runtime);
  assert.equal(res.status, 200);
  assert.ok(forwarded);
  assert.equal(forwarded.get('Cookie'), null);
  assert.equal(forwarded.get('Authorization'), null);
  assert.equal(forwarded.get('X-Forwarded-For'), null);
  assert.ok(forwarded.get('User-Agent')?.startsWith('OpenCharts/'));
});

test('GET chart/XRPN returns Yahoo data and Pages CORS', async () => {
  const res = await handleRequest(req('/v8/finance/chart/XRPN?interval=1d&range=1y', { origin: PAGES }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), PAGES);
  assert.ok((res.headers.get('Cache-Control') ?? '').includes('max-age=60'));
  const data = (await res.json()) as { chart?: { result?: Array<{ meta?: { symbol?: string }; timestamp?: number[] }> } };
  const result = data.chart?.result?.[0];
  assert.equal(result?.meta?.symbol, 'XRPN');
  assert.ok((result?.timestamp?.length ?? 0) > 10);
});

test('non-JSON upstream is rejected and a burst from one IP is rate limited', async () => {
  resetRateLimit();
  const bad = await handleRequest(req('/v8/finance/chart/AAPL?interval=1d&range=1d', { origin: PAGES }), {
    fetch: async () => new Response('<html>nope</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
  });
  assert.equal(bad.status, 502);
  const body = (await bad.json()) as { error?: string };
  assert.match(body.error ?? '', /JSON/);

  resetRateLimit();
  const runtime = {
    fetch: async () => new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
  };
  const burst = (path: string) => {
    const headers = new Headers({ Origin: PAGES, 'CF-Connecting-IP': '203.0.113.9' });
    return new Request(`https://opencharts-proxy.workers.dev${path}`, { headers });
  };
  for (let i = 0; i < 60; i++) {
    const res = await handleRequest(burst('/v8/finance/chart/AAPL?interval=1d&range=1d'), runtime);
    assert.equal(res.status, 200);
  }
  const blocked = await handleRequest(burst('/v8/finance/chart/AAPL?interval=1d&range=1d'), runtime);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('Access-Control-Allow-Origin'), PAGES);
  assert.equal(blocked.headers.get('Retry-After'), '60');
});

test('GET search for a GPW ticker returns quotes', async () => {
  const res = await handleRequest(req('/v1/finance/search?q=PKN.WA&quotesCount=6&newsCount=0', { origin: 'http://127.0.0.1:4173' }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'http://127.0.0.1:4173');
  const data = (await res.json()) as { quotes?: Array<{ symbol?: string; quoteType?: string }> };
  assert.ok((data.quotes ?? []).some((q) => q.symbol === 'PKN.WA'));
});


test('DEX GeckoTerminal paths are allow-listed and cookies are not forwarded', async () => {
  let forwarded: { url?: string; headers?: Headers; method?: string } = {};
  const runtime = {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      forwarded = { url: String(input), headers: new Headers(init?.headers), method: init?.method ?? 'GET' };
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  };
  const ok = await handleRequest(
    new Request('https://opencharts-proxy.workers.dev/dex/gt/networks/eth/pools/0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640/ohlcv/hour?aggregate=1&limit=10&currency=token', {
      headers: { Origin: PAGES, Cookie: 'session=secret' },
    }),
    runtime,
  );
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'), PAGES);
  assert.ok(forwarded.url?.startsWith('https://api.geckoterminal.com/api/v2/networks/eth/pools/'));
  assert.equal(forwarded.headers?.get('Cookie'), null);
  assert.equal(forwarded.headers?.get('Authorization'), null);

  assert.equal((await handleRequest(req('/dex/gt/networks/ETH/pools'), runtime)).status, 404);
  assert.equal((await handleRequest(req('/dex/gt/../admin'), runtime)).status, 404);
  assert.equal((await handleRequest(req('/dex/gt/networks/eth/pools/0xabc/ohlcv/week'), runtime)).status, 404);
  assert.equal((await handleRequest(req('/dex/gt/networks/eth/pools?foo=1'), runtime)).status, 403);
});

test('ledger RPC proxy only allows official read methods and official hosts', async () => {
  let forwarded: { url?: string; body?: string; headers?: Headers } = {};
  const runtime = {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      forwarded = { url: String(input), body: String(init?.body ?? ''), headers: new Headers(init?.headers) };
      return new Response(JSON.stringify({ result: { status: 'success', info: { network_id: 0 } } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  };
  const ok = await handleRequest(
    new Request('https://opencharts-proxy.workers.dev/dex/rpc/xrpl', {
      method: 'POST',
      headers: { Origin: PAGES, 'Content-Type': 'application/json', Cookie: 'session=secret' },
      body: JSON.stringify({ method: 'amm_info', params: [{ amm_account: 'rhWTXC2m2gGGA9WozUaoMm6kLAVPb1tcS3' }] }),
    }),
    runtime,
  );
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'), PAGES);
  assert.equal(forwarded.url, 'https://xrplcluster.com/');
  assert.equal(forwarded.headers?.get('Cookie'), null);
  assert.match(forwarded.body ?? '', /amm_info/);

  const submit = await handleRequest(
    new Request('https://opencharts-proxy.workers.dev/dex/rpc/xrpl', {
      method: 'POST',
      headers: { Origin: PAGES, 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'submit', params: [{ tx_blob: 'abc' }] }),
    }),
    runtime,
  );
  assert.equal(submit.status, 403);

  const xahau = await handleRequest(
    new Request('https://opencharts-proxy.workers.dev/dex/rpc/xahau', {
      method: 'POST',
      headers: { Origin: PAGES, 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: 'book_offers', params: [{}] }),
    }),
    runtime,
  );
  assert.equal(xahau.status, 200);
  assert.equal(forwarded.url, 'https://xahau.network/');
});
