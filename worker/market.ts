// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

/**
 * Market-data cache policy and CoinGecko Demo credit budget for the Swapwick Worker.
 * Pure helpers (TTL tables) plus a small D1-backed daily/monthly credit counter.
 * The CoinGecko key itself is only ever read from env.COINGECKO_DEMO_KEY (a Worker secret).
 */

export const CG_ONCHAIN_BASE = 'https://api.coingecko.com/api/v3/onchain';

/** Demo plan is 10,000 calls/month. Stay well below it. */
export const DAILY_CREDITS = 300;
export const MONTHLY_CREDITS = 9000;
/** Lists and search use CoinGecko only while the day is under this share, so charts keep priority. */
export const LOW_PRIORITY_SHARE = 0.5;

export type GeckoKind = 'ohlcv' | 'detail' | 'icon' | 'search' | 'list';

export interface GeckoPolicy {
  kind: GeckoKind;
  ttl: number;
}

/** [tail, full] TTL seconds. CoinGecko / GeckoTerminal serve ~1 minute old data, so never go below 60 s. */
const OHLCV_TTL: Record<string, Record<number, [number, number]>> = {
  minute: { 1: [60, 60], 5: [60, 120], 15: [120, 300] },
  hour: { 1: [300, 600], 4: [600, 900] },
  day: { 1: [600, 1800] },
};
const OHLCV_DEFAULT: Record<string, [number, number]> = { minute: [120, 300], hour: [600, 900], day: [600, 1800] };
const HISTORY_FLOOR: Record<string, number> = { minute: 3600, hour: 6 * 3600, day: 6 * 3600 };
const TAIL_MAX_LIMIT = 200;

export function geckoPolicy(pathAndQuery: string): GeckoPolicy {
  const url = new URL(pathAndQuery, 'https://example.invalid');
  const path = url.pathname;
  const ohlcv = /\/ohlcv\/(day|hour|minute)$/.exec(path);
  if (ohlcv) {
    const tf = ohlcv[1]!;
    const aggregate = Number(url.searchParams.get('aggregate') ?? '1') || 1;
    const limit = Number(url.searchParams.get('limit') ?? '100') || 100;
    const pair = OHLCV_TTL[tf]?.[aggregate] ?? OHLCV_DEFAULT[tf]!;
    let ttl = limit <= TAIL_MAX_LIMIT ? pair[0] : pair[1];
    if (url.searchParams.has('before_timestamp')) ttl = Math.max(ttl, HISTORY_FLOOR[tf]!);
    return { kind: 'ohlcv', ttl };
  }
  if (/^\/search\/pools$/.test(path)) return { kind: 'search', ttl: 600 };
  if (/^\/networks\/[a-z0-9_]+\/pools\/[^/]+$/.test(path)) {
    // Pool detail with token metadata is only used for asset icons: static, so keep it for a day.
    if (url.searchParams.has('include')) return { kind: 'icon', ttl: 86400 };
    return { kind: 'detail', ttl: 120 };
  }
  if (path === '/networks') return { kind: 'list', ttl: 3600 };
  return { kind: 'list', ttl: 300 };
}

/** Longer TTL when credits run low or when CoinGecko is not serving (keyless GeckoTerminal is tighter). */
export function stretchTtl(ttl: number, share: number, viaCoinGecko: boolean, keyConfigured: boolean): number {
  if (!keyConfigured) return ttl;
  if (!viaCoinGecko) return ttl * 2;
  if (share >= 0.8) return ttl * 4;
  if (share >= 0.5) return ttl * 2;
  return ttl;
}

const YAHOO_INTERVAL_TTL: Record<string, number> = {
  '1m': 30,
  '2m': 60,
  '5m': 60,
  '15m': 120,
  '30m': 120,
  '60m': 300,
  '90m': 300,
  '1h': 300,
  '1d': 300,
  '5d': 900,
  '1wk': 900,
  '1mo': 900,
  '3mo': 900,
};

export function yahooTtl(url: URL): number {
  if (url.pathname === '/v1/finance/search') return 300;
  const interval = url.searchParams.get('interval') ?? '1d';
  const range = url.searchParams.get('range') ?? '';
  let ttl = YAHOO_INTERVAL_TTL[interval] ?? 60;
  if (range === '1d' || range === '5d') ttl = Math.min(ttl, 60); // ticker quote and short views stay fresh
  if (url.searchParams.has('period2')) ttl = Math.max(ttl, 3600); // older history page
  return ttl;
}

/** Seconds a ledger JSON-RPC read may be reused. 0 means do not cache. */
export function ledgerTtl(method: string, params: unknown): number {
  const p = (Array.isArray(params) ? params[0] : undefined) as Record<string, unknown> | undefined;
  const pinned = (v: unknown) => (typeof v === 'number' && v >= 0) || (typeof v === 'string' && /^\d+$/.test(v));
  if (p && (typeof p.ledger_hash === 'string' || pinned(p.ledger_index))) return 3600;
  if (method === 'account_tx' && p && pinned(p.ledger_index_min) && pinned(p.ledger_index_max)) return 3600;
  switch (method) {
    case 'server_info':
    case 'ledger':
      return 10;
    case 'amm_info':
    case 'book_offers':
    case 'account_info':
      return 15;
    case 'account_tx':
      return 60;
    default:
      return 0;
  }
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/* ---------- burst guard: Demo allows 100 calls/min, stay far below it ---------- */

const BURST_PER_MINUTE = 40;
let burst: number[] = [];

/** True when another CoinGecko call fits in this isolate's last minute. */
export function allowBurst(now = Date.now()): boolean {
  burst = burst.filter((t) => now - t < 60_000);
  if (burst.length >= BURST_PER_MINUTE) return false;
  burst.push(now);
  return true;
}

/* ---------- CoinGecko credit budget (D1, with an in-memory fallback) ---------- */

export interface BudgetDb {
  prepare(sql: string): {
    bind(...values: unknown[]): { run(): Promise<unknown>; first<T = unknown>(): Promise<T | null> };
    run(): Promise<unknown>;
  };
}

let tableReady: Promise<void> | null = null;
const memory = new Map<string, number>();
const MEMORY_DAILY = 100; // per isolate, only used when D1 is unavailable

export function resetBudgetForTests(): void {
  tableReady = null;
  burst = [];
  memory.clear();
}

export interface Reservation {
  ok: boolean;
  /** Share of the daily budget already used (0..1+). */
  share: number;
}

function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

async function ensureTable(db: BudgetDb): Promise<void> {
  if (!tableReady) {
    tableReady = db
      .prepare('CREATE TABLE IF NOT EXISTS api_budget (day TEXT PRIMARY KEY, used INTEGER NOT NULL DEFAULT 0)')
      .run()
      .then(() => undefined);
    tableReady.catch(() => {
      tableReady = null;
    });
  }
  return tableReady;
}

/** Counts one CoinGecko call against today's and this month's budget; false when it would exceed either. */
export async function reserveCredit(
  db: BudgetDb | undefined,
  priority: 'high' | 'low',
  now = new Date(),
  waitUntil?: (p: Promise<unknown>) => void,
): Promise<Reservation> {
  const day = dayKey(now);
  const cap = priority === 'low' ? Math.floor(DAILY_CREDITS * LOW_PRIORITY_SHARE) : DAILY_CREDITS;
  if (db) {
    try {
      await ensureTable(db);
      const today = await db.prepare('SELECT used FROM api_budget WHERE day = ?').bind(day).first<{ used: number }>();
      const month = await db
        .prepare('SELECT COALESCE(SUM(used), 0) AS used FROM api_budget WHERE day LIKE ?')
        .bind(`${day.slice(0, 7)}-%`)
        .first<{ used: number }>();
      const usedDay = Number(today?.used ?? 0);
      const usedMonth = Number(month?.used ?? 0);
      const share = usedDay / DAILY_CREDITS;
      if (usedDay >= cap || usedMonth >= MONTHLY_CREDITS) return { ok: false, share: Math.max(share, usedMonth >= MONTHLY_CREDITS ? 1 : share) };
      const write = db
        .prepare('INSERT INTO api_budget (day, used) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET used = used + 1')
        .bind(day)
        .run();
      if (waitUntil) waitUntil(write.catch(() => undefined));
      else await write;
      return { ok: true, share: (usedDay + 1) / DAILY_CREDITS };
    } catch {
      /* fall through to the in-memory guard */
    }
  }
  const used = memory.get(day) ?? 0;
  if (used >= Math.min(cap, MEMORY_DAILY)) return { ok: false, share: 1 };
  memory.set(day, used + 1);
  return { ok: true, share: (used + 1) / DAILY_CREDITS };
}
