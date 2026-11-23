import { aggregateCandles, sortDedup } from './aggregate';
import { changePct, fetchJson } from './http';
import type { Candle, DataSource, IntervalId, PairId, Ticker } from './types';
import { MAX_CANDLES, nativeOf, pairsFromNative } from './types';

const STEP: Record<Exclude<IntervalId, '1W' | '1M'>, number> = {
  '1h': 3600,
  '4h': 14400,
  '1D': 86400,
};

interface BitstampOhlcResponse {
  data?: {
    ohlc?: Array<{
      timestamp: string;
      open: string;
      high: string;
      low: string;
      close: string;
      volume: string;
    }>;
  };
}

function toCandle(row: NonNullable<NonNullable<BitstampOhlcResponse['data']>['ohlc']>[number]): Candle {
  return {
    time: Number(row.timestamp),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume),
  };
}

async function fetchStep(pair: string, step: number, maxCandles = MAX_CANDLES): Promise<Candle[]> {
  const collected: Candle[] = [];
  let end: number | undefined;
  let guard = 0;
  while (collected.length < maxCandles && guard < 12) {
    guard += 1;
    const url = new URL(`https://www.bitstamp.net/api/v2/ohlc/${encodeURIComponent(pair)}/`);
    url.searchParams.set('step', String(step));
    url.searchParams.set('limit', '1000');
    if (end !== undefined) url.searchParams.set('end', String(end));
    const data = await fetchJson<BitstampOhlcResponse>(url.toString());
    const rows = data.data?.ohlc ?? [];
    if (!rows.length) break;
    collected.push(...rows.map(toCandle));
    const oldest = Math.min(...rows.map((r) => Number(r.timestamp)));
    if (end !== undefined && oldest >= end) break;
    end = oldest - 1;
    if (rows.length < 50) break;
  }
  return sortDedup(collected);
}

export const bitstamp: DataSource = {
  id: 'bitstamp',
  name: 'Bitstamp',
  pairs: pairsFromNative({
    XRPUSD: 'xrpusd',
    BTCUSD: 'btcusd',
    ETHUSD: 'ethusd',
  }),
  nativeIntervals: ['1h', '4h', '1D'],
  async fetchCandles(pairId: PairId, interval: IntervalId): Promise<Candle[]> {
    const pair = nativeOf(this, pairId);
    if (interval === '1W' || interval === '1M') {
      const daily = await fetchStep(pair, STEP['1D']);
      return aggregateCandles(daily, interval);
    }
    return fetchStep(pair, STEP[interval]);
  },
  async fetchTicker(pairId: PairId): Promise<Ticker> {
    const pair = nativeOf(this, pairId);
    const url = `https://www.bitstamp.net/api/v2/ticker/${encodeURIComponent(pair)}/`;
    const data = await fetchJson<{ last: string; percent_change_24?: string; open_24?: string; open?: string }>(url);
    const last = Number(data.last);
    const pct = Number(data.percent_change_24);
    if (Number.isFinite(pct)) return { last, change24hPct: pct };
    const open = Number(data.open_24 ?? data.open);
    return { last, change24hPct: changePct(last, open) };
  },
};
