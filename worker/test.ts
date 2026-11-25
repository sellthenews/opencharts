// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleRequest, resetRateLimit } from './index.ts';
import { ACCOUNTS_UNCONFIGURED, PBKDF2_ITERS, SESSION_COOKIE, type Env } from './accounts.ts';

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
  assert.equal(ok.headers.get('Access-Control-Allow-Methods'), 'GET, POST, PUT, OPTIONS');
  assert.equal(ok.headers.get('Access-Control-Allow-Credentials'), 'true');

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
  assert.ok(forwarded.get('User-Agent')?.startsWith('Swapwick/'));
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

class MemoryKV {
  private data = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }
  async put(key: string, value: string, _opts?: { expirationTtl?: number }): Promise<void> {
    this.data.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }
}

interface UserRec {
  id: string;
  email: string | null;
  password_hash: string | null;
  password_salt: string | null;
  password_iters: number | null;
  github_id: string | null;
  google_id: string | null;
  display_name: string | null;
  created_at: number;
}

class MemoryD1 {
  users: UserRec[] = [];
  prepare(sql: string) {
    const db = this;
    const bound: unknown[] = [];
    const stmt = {
      bind(...args: unknown[]) {
        bound.splice(0, bound.length, ...args);
        return stmt;
      },
      async first<T>(): Promise<T | null> {
        const rows = db.query(sql, bound);
        return (rows[0] as T) ?? null;
      },
      async run() {
        db.query(sql, bound);
        return { success: true };
      },
    };
    return stmt;
  }
  query(sql: string, bound: unknown[]): UserRec[] {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.startsWith('SELECT * FROM users WHERE')) {
      const col = /WHERE (\w+) = \?/.exec(s)?.[1];
      const value = bound[0];
      return this.users.filter((u) => (u as unknown as Record<string, unknown>)[col!] === value);
    }
    if (s.startsWith('INSERT INTO users')) {
      const email = bound[1] as string | null;
      if (email && this.users.some((u) => u.email === email)) throw new Error('UNIQUE');
      const github = bound[5] as string | null;
      if (github && this.users.some((u) => u.github_id === github)) throw new Error('UNIQUE');
      const google = bound[6] as string | null;
      if (google && this.users.some((u) => u.google_id === google)) throw new Error('UNIQUE');
      this.users.push({
        id: String(bound[0]),
        email,
        password_hash: bound[2] as string | null,
        password_salt: bound[3] as string | null,
        password_iters: bound[4] as number | null,
        github_id: github,
        google_id: google,
        display_name: bound[7] as string | null,
        created_at: Number(bound[8]),
      });
      return [];
    }
    if (s.startsWith('UPDATE users SET')) {
      const id = String(bound[bound.length - 1]);
      const user = this.users.find((u) => u.id === id);
      if (!user) return [];
      if (s.includes('github_id')) {
        user.github_id = String(bound[0]);
        user.email = user.email ?? (bound[1] as string | null);
        user.display_name = (bound[2] as string | null) ?? user.display_name;
      } else if (s.includes('google_id')) {
        user.google_id = String(bound[0]);
        user.email = user.email ?? (bound[1] as string | null);
        user.display_name = (bound[2] as string | null) ?? user.display_name;
      }
      return [];
    }
    throw new Error(`Unsupported SQL in test D1: ${s}`);
  }
}

function testEnv(): Env {
  return { DB: new MemoryD1() as unknown as D1Database, ACCOUNTS: new MemoryKV() as unknown as KVNamespace };
}

function cookieFrom(res: Response): string | null {
  const raw = res.headers.get('Set-Cookie') ?? '';
  const match = new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(raw);
  return match ? `${SESSION_COOKIE}=${match[1]}` : null;
}

function authReq(path: string, init: RequestInit & { origin?: string } = {}): Request {
  const headers = new Headers(init.headers);
  if (init.origin !== undefined) headers.set('Origin', init.origin);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return new Request(`https://opencharts-proxy.workers.dev${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body,
  });
}

test('accounts return 503 until D1 and KV bindings are configured', async () => {
  const res = await handleRequest(authReq('/auth/me', { origin: PAGES }));
  assert.equal(res.status, 503);
  const body = (await res.json()) as { error?: string };
  assert.equal(body.error, ACCOUNTS_UNCONFIGURED);
});

test('email signup sets an HttpOnly session cookie and hashes the password with PBKDF2', async () => {
  const env = testEnv();
  const res = await handleRequest(
    authReq('/auth/register', {
      method: 'POST',
      origin: PAGES,
      body: JSON.stringify({ email: 'Ada@Example.com', password: 'correct-horse' }),
    }),
    {},
    env,
  );
  assert.equal(res.status, 201);
  const setCookie = res.headers.get('Set-Cookie') ?? '';
  assert.match(setCookie, new RegExp(`${SESSION_COOKIE}=[0-9a-f]+`, 'i'));
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /Secure/i);
  assert.match(setCookie, /SameSite=None/i);
  assert.doesNotMatch(setCookie, /correct-horse/);
  const body = (await res.json()) as { user?: { email?: string; providers?: string[] } };
  assert.equal(body.user?.email, 'ada@example.com');
  assert.deepEqual(body.user?.providers, ['password']);

  const db = env.DB as unknown as MemoryD1;
  assert.equal(db.users.length, 1);
  assert.notEqual(db.users[0]!.password_hash, 'correct-horse');
  assert.equal(db.users[0]!.password_iters, PBKDF2_ITERS);
  assert.ok((db.users[0]!.password_salt ?? '').length >= 16);
  assert.doesNotMatch(JSON.stringify(db.users[0]), /correct-horse/);
});

test('user B cannot read or overwrite user A drawings', async () => {
  const env = testEnv();
  const origin = { origin: PAGES };
  const a = await handleRequest(
    authReq('/auth/register', { method: 'POST', ...origin, body: JSON.stringify({ email: 'a@example.com', password: 'password-a' }) }),
    {},
    env,
  );
  const b = await handleRequest(
    authReq('/auth/register', { method: 'POST', ...origin, body: JSON.stringify({ email: 'b@example.com', password: 'password-b' }) }),
    {},
    env,
  );
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  const cookieA = cookieFrom(a);
  const cookieB = cookieFrom(b);
  assert.ok(cookieA && cookieB);

  const payload = { data: { 'opencharts:drawings:kraken:XRPUSD': '[{"id":"secret-of-a"}]' } };
  const putA = await handleRequest(
    authReq('/sync', { method: 'PUT', ...origin, headers: { Cookie: cookieA, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
    {},
    env,
  );
  assert.equal(putA.status, 200);

  const getB = await handleRequest(authReq('/sync', { ...origin, headers: { Cookie: cookieB } }), {}, env);
  assert.equal(getB.status, 200);
  const bodyB = (await getB.json()) as { data?: Record<string, string> };
  assert.deepEqual(bodyB.data, {});
  assert.ok(!JSON.stringify(bodyB).includes('secret-of-a'));

  const getA = await handleRequest(authReq('/sync', { ...origin, headers: { Cookie: cookieA } }), {}, env);
  const bodyA = (await getA.json()) as { data?: Record<string, string> };
  assert.equal(bodyA.data?.['opencharts:drawings:kraken:XRPUSD'], '[{"id":"secret-of-a"}]');

  const overwrite = await handleRequest(
    authReq('/sync', {
      method: 'PUT',
      ...origin,
      headers: { Cookie: cookieB, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { 'opencharts:drawings:kraken:XRPUSD': '[{"id":"from-b"}]' } }),
    }),
    {},
    env,
  );
  assert.equal(overwrite.status, 200);
  const stillA = await handleRequest(authReq('/sync', { ...origin, headers: { Cookie: cookieA } }), {}, env);
  const stillABody = (await stillA.json()) as { data?: Record<string, string> };
  assert.equal(stillABody.data?.['opencharts:drawings:kraken:XRPUSD'], '[{"id":"secret-of-a"}]');

  const noCookie = await handleRequest(authReq('/sync', { ...origin }), {}, env);
  assert.equal(noCookie.status, 401);

  const wrong = await handleRequest(
    authReq('/auth/login', { method: 'POST', ...origin, body: JSON.stringify({ email: 'a@example.com', password: 'wrong-password' }) }),
    {},
    env,
  );
  assert.equal(wrong.status, 401);
  assert.equal((wrong.headers.get('Set-Cookie') ?? '').includes(SESSION_COOKIE + '='), false);

  const login = await handleRequest(
    authReq('/auth/login', { method: 'POST', ...origin, body: JSON.stringify({ email: 'a@example.com', password: 'password-a' }) }),
    {},
    env,
  );
  assert.equal(login.status, 200);
  const cookieLogin = cookieFrom(login);
  assert.ok(cookieLogin);
  const me = await handleRequest(authReq('/auth/me', { ...origin, headers: { Cookie: cookieLogin } }), {}, env);
  const meBody = (await me.json()) as { user?: { email?: string } };
  assert.equal(meBody.user?.email, 'a@example.com');
});


test('XRPL GeckoTerminal pool addresses with dots are allowed and list responses are cached', async () => {
  let hits = 0;
  const store = new Map<string, Response>();
  const runtime = {
    cache: {
      match: async (req: Request) => store.get(new URL(String(req.url)).toString()) ?? undefined,
      put: async (req: Request, res: Response) => {
        store.set(new URL(String(req.url)).toString(), res);
      },
    } as unknown as Cache,
    fetch: async (input: RequestInfo | URL) => {
      hits += 1;
      return new Response(JSON.stringify({ data: { attributes: { name: 'RLUSD / XRP' } } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  };
  const path = '/dex/gt/networks/xrpl/pools/524C555344000000000000000000000000000000.rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De_XRP/ohlcv/day?aggregate=1&limit=10&currency=token';
  const first = await handleRequest(req(path), runtime);
  assert.equal(first.status, 200);
  const second = await handleRequest(req(path), runtime);
  assert.equal(second.status, 200);
  assert.equal(hits, 1);

  const list = await handleRequest(req('/dex/gt/networks/xrpl/pools?page=1'), runtime);
  assert.equal(list.status, 200);
  assert.ok((list.headers.get('Cache-Control') ?? '').includes('max-age=300'));
});
