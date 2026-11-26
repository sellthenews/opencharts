// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

/** Per-account auth and private drawing sync. No secrets are hard-coded. */

export const SESSION_COOKIE = 'opencharts_session';
export const PBKDF2_ITERS = 100_000;
export const SESSION_TTL_S = 60 * 60 * 24 * 30;
export const SYNC_MAX_BYTES = 2_000_000;
export const ACCOUNTS_UNCONFIGURED = 'Accounts are not configured on this Worker yet';

const STORAGE_PREFIX = 'opencharts:';
const SKIP_SYNC = new Set(['opencharts:stocks-proxy']);

export interface Env {
  DB?: D1Database;
  ACCOUNTS?: KVNamespace;
  SESSION_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  APP_ORIGIN?: string;
  /** CoinGecko Demo API key, stored as a Worker secret. Never commit or log it. */
  COINGECKO_DEMO_KEY?: string;
}

export interface UserRow {
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

export interface AccountHelpers {
  origin: string | null;
  jsonError: (status: number, message: string, origin: string | null) => Response;
  applyCors: (headers: Headers, origin: string | null) => void;
}

export function accountsConfigured(env: Env | undefined): env is Env & { DB: D1Database; ACCOUNTS: KVNamespace } {
  return Boolean(env?.DB && env.ACCOUNTS);
}

export function publicUser(row: UserRow): { id: string; email: string | null; displayName: string | null; providers: string[] } {
  const providers: string[] = [];
  if (row.password_hash) providers.push('password');
  if (row.github_id) providers.push('github');
  if (row.google_id) providers.push('google');
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    providers,
  };
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function hashPassword(password: string, salt: Uint8Array, iterations = PBKDF2_ITERS): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256);
  return new Uint8Array(bits);
}

export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return null;
  return email;
}

function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return bytesToHex(buf);
}

function isHttps(request: Request): boolean {
  if (new URL(request.url).protocol === 'https:') return true;
  const origin = request.headers.get('Origin') ?? '';
  return origin.startsWith('https:');
}

export function buildSessionCookie(token: string, request: Request, maxAge = SESSION_TTL_S): string {
  const parts = [`${SESSION_COOKIE}=${token}`, 'Path=/', 'HttpOnly', `Max-Age=${maxAge}`];
  if (isHttps(request)) {
    parts.push('Secure', 'SameSite=None');
  } else {
    parts.push('SameSite=Lax');
  }
  return parts.join('; ');
}

export function clearSessionCookie(request: Request): string {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'Max-Age=0'];
  if (isHttps(request)) parts.push('Secure', 'SameSite=None');
  else parts.push('SameSite=Lax');
  return parts.join('; ');
}

export function readSessionToken(request: Request): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) {
      const value = rest.join('=').trim();
      return /^[0-9a-f]{32,128}$/i.test(value) ? value : null;
    }
  }
  return null;
}

async function getUserBy(db: D1Database, column: 'id' | 'email' | 'github_id' | 'google_id', value: string): Promise<UserRow | null> {
  const allowed = { id: 'id', email: 'email', github_id: 'github_id', google_id: 'google_id' } as const;
  const col = allowed[column];
  const row = await db.prepare(`SELECT * FROM users WHERE ${col} = ?`).bind(value).first<UserRow>();
  return row ?? null;
}

async function insertUser(db: D1Database, row: UserRow): Promise<void> {
  await db
    .prepare(
      'INSERT INTO users (id, email, password_hash, password_salt, password_iters, github_id, google_id, display_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(
      row.id,
      row.email,
      row.password_hash,
      row.password_salt,
      row.password_iters,
      row.github_id,
      row.google_id,
      row.display_name,
      row.created_at,
    )
    .run();
}

async function readSession(env: { ACCOUNTS: KVNamespace }, request: Request): Promise<{ userId: string } | null> {
  const token = readSessionToken(request);
  if (!token) return null;
  const raw = await env.ACCOUNTS.get(`sess:${token}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { userId?: string; exp?: number };
    if (!parsed.userId || (parsed.exp && parsed.exp * 1000 < Date.now())) {
      await env.ACCOUNTS.delete(`sess:${token}`);
      return null;
    }
    return { userId: parsed.userId };
  } catch {
    return null;
  }
}

async function createSession(env: { ACCOUNTS: KVNamespace }, userId: string): Promise<string> {
  const token = randomToken(32);
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_S;
  await env.ACCOUNTS.put(`sess:${token}`, JSON.stringify({ userId, exp }), { expirationTtl: SESSION_TTL_S });
  return token;
}

function jsonOk(helpers: AccountHelpers, body: unknown, status: number, extra?: (headers: Headers) => void): Response {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  helpers.applyCors(headers, helpers.origin);
  extra?.(headers);
  return new Response(JSON.stringify(body), { status, headers });
}

function sanitizeSyncData(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key.startsWith(STORAGE_PREFIX) || SKIP_SYNC.has(key)) continue;
    if (typeof value !== 'string') return null;
    out[key] = value;
  }
  return out;
}

export async function tryHandleAccounts(request: Request, env: Env | undefined, helpers: AccountHelpers): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith('/auth') && path !== '/sync') return null;

  if (!accountsConfigured(env)) {
    return helpers.jsonError(503, ACCOUNTS_UNCONFIGURED, helpers.origin);
  }

  if (path === '/auth/register' && request.method === 'POST') return register(request, env, helpers);
  if (path === '/auth/login' && request.method === 'POST') return login(request, env, helpers);
  if (path === '/auth/logout' && request.method === 'POST') return logout(request, env, helpers);
  if (path === '/auth/me' && request.method === 'GET') return me(request, env, helpers);
  if (path === '/auth/github' && request.method === 'GET') return oauthStart(request, env, helpers, 'github');
  if (path === '/auth/google' && request.method === 'GET') return oauthStart(request, env, helpers, 'google');
  if (path === '/auth/github/callback' && request.method === 'GET') return oauthCallback(request, env, helpers, 'github');
  if (path === '/auth/google/callback' && request.method === 'GET') return oauthCallback(request, env, helpers, 'google');
  if (path === '/sync' && request.method === 'GET') return getSync(request, env, helpers);
  if (path === '/sync' && request.method === 'PUT') return putSync(request, env, helpers);

  return helpers.jsonError(405, 'Method not allowed', helpers.origin);
}

async function parseJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function register(request: Request, env: Env & { DB: D1Database; ACCOUNTS: KVNamespace }, helpers: AccountHelpers): Promise<Response> {
  const body = await parseJson(request);
  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : null;
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!email) return helpers.jsonError(400, 'Enter a valid email address', helpers.origin);
  if (password.length < 8 || password.length > 200) return helpers.jsonError(400, 'Password must be at least 8 characters', helpers.origin);
  if (await getUserBy(env.DB, 'email', email)) return helpers.jsonError(409, 'An account with this email already exists', helpers.origin);

  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = await hashPassword(password, salt, PBKDF2_ITERS);
  const row: UserRow = {
    id: randomToken(16),
    email,
    password_hash: bytesToHex(hash),
    password_salt: bytesToHex(salt),
    password_iters: PBKDF2_ITERS,
    github_id: null,
    google_id: null,
    display_name: email,
    created_at: Date.now(),
  };
  try {
    await insertUser(env.DB, row);
  } catch {
    return helpers.jsonError(409, 'An account with this email already exists', helpers.origin);
  }
  const token = await createSession(env, row.id);
  return jsonOk(helpers, { user: publicUser(row) }, 201, (headers) => {
    headers.append('Set-Cookie', buildSessionCookie(token, request));
  });
}

async function login(request: Request, env: Env & { DB: D1Database; ACCOUNTS: KVNamespace }, helpers: AccountHelpers): Promise<Response> {
  const body = await parseJson(request);
  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : null;
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!email || !password) return helpers.jsonError(400, 'Email and password are required', helpers.origin);
  const row = await getUserBy(env.DB, 'email', email);
  const dummySalt = new Uint8Array(16);
  const hash = row?.password_hash && row.password_salt
    ? await hashPassword(password, hexToBytes(row.password_salt), row.password_iters || PBKDF2_ITERS)
    : await hashPassword(password, dummySalt, PBKDF2_ITERS);
  const expected = row?.password_hash ? hexToBytes(row.password_hash) : new Uint8Array(hash.length);
  if (!row?.password_hash || !timingSafeEqual(hash, expected)) {
    return helpers.jsonError(401, 'Invalid email or password', helpers.origin);
  }
  const token = await createSession(env, row.id);
  return jsonOk(helpers, { user: publicUser(row) }, 200, (headers) => {
    headers.append('Set-Cookie', buildSessionCookie(token, request));
  });
}

async function logout(request: Request, env: Env & { ACCOUNTS: KVNamespace }, helpers: AccountHelpers): Promise<Response> {
  const token = readSessionToken(request);
  if (token) await env.ACCOUNTS.delete(`sess:${token}`);
  return jsonOk(helpers, { ok: true }, 200, (headers) => {
    headers.append('Set-Cookie', clearSessionCookie(request));
  });
}

async function requireUser(request: Request, env: Env & { DB: D1Database; ACCOUNTS: KVNamespace }, helpers: AccountHelpers): Promise<UserRow | Response> {
  const session = await readSession(env, request);
  if (!session) return helpers.jsonError(401, 'Not signed in', helpers.origin);
  const row = await getUserBy(env.DB, 'id', session.userId);
  if (!row) return helpers.jsonError(401, 'Not signed in', helpers.origin);
  return row;
}

async function me(request: Request, env: Env & { DB: D1Database; ACCOUNTS: KVNamespace }, helpers: AccountHelpers): Promise<Response> {
  const row = await requireUser(request, env, helpers);
  if (row instanceof Response) return row;
  return jsonOk(helpers, { user: publicUser(row) }, 200);
}

async function getSync(request: Request, env: Env & { DB: D1Database; ACCOUNTS: KVNamespace }, helpers: AccountHelpers): Promise<Response> {
  const row = await requireUser(request, env, helpers);
  if (row instanceof Response) return row;
  const raw = await env.ACCOUNTS.get(`data:${row.id}`);
  if (!raw) return jsonOk(helpers, { updatedAt: null, data: {} }, 200);
  try {
    const parsed = JSON.parse(raw) as { updatedAt?: number; data?: unknown };
    const data = sanitizeSyncData(parsed.data) ?? {};
    return jsonOk(helpers, { updatedAt: parsed.updatedAt ?? null, data }, 200);
  } catch {
    return jsonOk(helpers, { updatedAt: null, data: {} }, 200);
  }
}

async function putSync(request: Request, env: Env & { DB: D1Database; ACCOUNTS: KVNamespace }, helpers: AccountHelpers): Promise<Response> {
  const row = await requireUser(request, env, helpers);
  if (row instanceof Response) return row;
  const text = await request.text();
  if (text.length > SYNC_MAX_BYTES) return helpers.jsonError(413, 'Sync payload is too large', helpers.origin);
  let body: { data?: unknown; updatedAt?: unknown; force?: unknown };
  try {
    body = JSON.parse(text) as { data?: unknown; updatedAt?: unknown; force?: unknown };
  } catch {
    return helpers.jsonError(400, 'Invalid JSON', helpers.origin);
  }
  const data = sanitizeSyncData(body.data);
  if (!data) return helpers.jsonError(400, 'Invalid sync data', helpers.origin);
  const existingRaw = await env.ACCOUNTS.get(`data:${row.id}`);
  let existingAt = 0;
  if (existingRaw) {
    try {
      existingAt = Number((JSON.parse(existingRaw) as { updatedAt?: number }).updatedAt) || 0;
    } catch {
      existingAt = 0;
    }
  }
  const clientAt = typeof body.updatedAt === 'number' ? body.updatedAt : 0;
  if (existingAt && clientAt && existingAt > clientAt && body.force !== true) {
    const existing = JSON.parse(existingRaw!) as { updatedAt?: number; data?: unknown };
    return jsonOk(helpers, { error: 'Newer data is on the server', updatedAt: existing.updatedAt, data: sanitizeSyncData(existing.data) ?? {} }, 409);
  }
  const updatedAt = Date.now();
  await env.ACCOUNTS.put(`data:${row.id}`, JSON.stringify({ updatedAt, data }));
  return jsonOk(helpers, { updatedAt, data }, 200);
}

async function oauthStart(request: Request, env: Env & { ACCOUNTS: KVNamespace }, helpers: AccountHelpers, provider: 'github' | 'google'): Promise<Response> {
  const id = provider === 'github' ? env.GITHUB_CLIENT_ID : env.GOOGLE_CLIENT_ID;
  const secret = provider === 'github' ? env.GITHUB_CLIENT_SECRET : env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) return helpers.jsonError(503, `${provider} sign-in is not configured yet`, helpers.origin);
  const state = randomToken(16);
  const appReturn = appOrigin(env, request);
  await env.ACCOUNTS.put(`oauth:${state}`, JSON.stringify({ provider, appReturn }), { expirationTtl: 600 });
  const callback = new URL(`/auth/${provider}/callback`, request.url).toString();
  const auth = provider === 'github'
    ? new URL('https://github.com/login/oauth/authorize')
    : new URL('https://accounts.google.com/o/oauth2/v2/auth');
  auth.searchParams.set('client_id', id);
  auth.searchParams.set('redirect_uri', callback);
  auth.searchParams.set('state', state);
  if (provider === 'github') {
    auth.searchParams.set('scope', 'read:user user:email');
  } else {
    auth.searchParams.set('response_type', 'code');
    auth.searchParams.set('scope', 'openid email profile');
  }
  const headers = new Headers({ Location: auth.toString(), 'Cache-Control': 'no-store' });
  helpers.applyCors(headers, helpers.origin);
  return new Response(null, { status: 302, headers });
}

async function oauthCallback(request: Request, env: Env & { DB: D1Database; ACCOUNTS: KVNamespace }, helpers: AccountHelpers, provider: 'github' | 'google'): Promise<Response> {
  const url = new URL(request.url);
  const err = url.searchParams.get('error');
  const state = url.searchParams.get('state') ?? '';
  const code = url.searchParams.get('code') ?? '';
  const stored = state ? await env.ACCOUNTS.get(`oauth:${state}`) : null;
  if (stored) await env.ACCOUNTS.delete(`oauth:${state}`);
  const meta = stored ? (JSON.parse(stored) as { provider?: string; appReturn?: string }) : null;
  const dest = meta?.appReturn || appOrigin(env, request);
  if (err || !code || !meta || meta.provider !== provider) {
    return redirectApp(helpers, dest, 'oauth_failed');
  }
  try {
    const profile = await fetchOAuthProfile(request, env, provider, code);
    if (!profile.id) return redirectApp(helpers, dest, 'oauth_failed');
    const column = provider === 'github' ? 'github_id' : 'google_id';
    let row = await getUserBy(env.DB, column, profile.id);
    if (!row && profile.email) row = await getUserBy(env.DB, 'email', profile.email);
    if (row) {
      const sql = provider === 'github'
        ? 'UPDATE users SET github_id = ?, email = COALESCE(email, ?), display_name = COALESCE(?, display_name) WHERE id = ?'
        : 'UPDATE users SET google_id = ?, email = COALESCE(email, ?), display_name = COALESCE(?, display_name) WHERE id = ?';
      await env.DB.prepare(sql).bind(profile.id, profile.email, profile.name, row.id).run();
      row = (await getUserBy(env.DB, 'id', row.id)) ?? row;
    } else {
      row = {
        id: randomToken(16),
        email: profile.email,
        password_hash: null,
        password_salt: null,
        password_iters: null,
        github_id: provider === 'github' ? profile.id : null,
        google_id: provider === 'google' ? profile.id : null,
        display_name: profile.name || profile.email,
        created_at: Date.now(),
      };
      await insertUser(env.DB, row);
    }
    const token = await createSession(env, row.id);
    return redirectApp(helpers, dest, 'ok', buildSessionCookie(token, request));
  } catch {
    return redirectApp(helpers, dest, 'oauth_failed');
  }
}

function appOrigin(env: Env, request: Request): string {
  if (env.APP_ORIGIN) return env.APP_ORIGIN.replace(/\/$/, '') + '/';
  const origin = request.headers.get('Origin');
  if (origin === 'https://swapwick.com' || origin === 'https://www.swapwick.com') return origin + '/';
  if (origin === 'https://sellthenews.github.io') return 'https://sellthenews.github.io/opencharts/';
  if (origin) return origin + '/';
  return 'https://swapwick.com/';
}

function redirectApp(helpers: AccountHelpers, dest: string, status: string, cookie?: string): Response {
  const target = new URL(dest);
  target.hash = status === 'ok' ? 'account=ok' : `account=${status}`;
  const headers = new Headers({ Location: target.toString(), 'Cache-Control': 'no-store' });
  helpers.applyCors(headers, helpers.origin);
  if (cookie) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 302, headers });
}

async function fetchOAuthProfile(request: Request, env: Env, provider: 'github' | 'google', code: string): Promise<{ id: string; email: string | null; name: string | null }> {
  const callback = new URL(`/auth/${provider}/callback`, request.url).toString();
  if (provider === 'github') {
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: callback,
      }),
    });
    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    if (!tokenJson.access_token) throw new Error('No GitHub token');
    const userRes = await fetch('https://api.github.com/user', {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${tokenJson.access_token}`, 'User-Agent': 'Swapwick' },
    });
    const user = (await userRes.json()) as { id?: number; login?: string; name?: string; email?: string };
    let email = user.email ?? null;
    if (!email) {
      const emailsRes = await fetch('https://api.github.com/user/emails', {
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${tokenJson.access_token}`, 'User-Agent': 'Swapwick' },
      });
      const emails = (await emailsRes.json()) as { email?: string; primary?: boolean; verified?: boolean }[];
      email = emails.find((e) => e.primary && e.verified)?.email ?? emails.find((e) => e.verified)?.email ?? null;
    }
    return { id: String(user.id ?? ''), email: email ? normalizeEmail(email) : null, name: user.name || user.login || null };
  }
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID ?? '',
      client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
      code,
      grant_type: 'authorization_code',
      redirect_uri: callback,
    }),
  });
  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  if (!tokenJson.access_token) throw new Error('No Google token');
  const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  const user = (await userRes.json()) as { sub?: string; email?: string; name?: string };
  return { id: String(user.sub ?? ''), email: user.email ? normalizeEmail(user.email) : null, name: user.name ?? null };
}
