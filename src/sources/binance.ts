import { fetchJson } from './http';
import { sortDedup } from './aggregate';
import type { Candle, DataSource, IntervalId, PairId, Ticker } from './types';
import { MAX_CANDLES, nativeOf, pairsFromNative } from './types';

const NATIVE: Record<IntervalId, string> = {
  '1h': '1h',
  '4h': '4h',
  '1D': '1d',
  '1W': '1w',
  '1M': '1M',
};

type BinanceRow = [
  number,
  string,
  string,
  string,
  string,
  string,
  ...unknown[],
];

function rowToCandle(row: BinanceRow): Candle {
  return {
    time: Math.floor(row[0] / 1000),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
  };
}

async function fetchKlines(symbol: string, interval: string, maxCandles = MAX_CANDLES): Promise<Candle[]> {
  const collected: Candle[] = [];
  let endTime: number | undefined;
  while (collected.length < maxCandles) {
    const url = new URL('https://api.binance.com/api/v3/klines');
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', interval);
    url.searchParams.set('limit', '1000');
    if (endTime !== undefined) url.searchParams.set('endTime', String(endTime));
    const rows = await fetchJson<BinanceRow[]>(url.toString());
    if (!rows.length) break;
    const batch = rows.map(rowToCandle);
    collected.push(...batch);
    if (rows.length < 1000) break;
    const oldestOpen = rows[0][0];
    const nextEnd = oldestOpen - 1;
    if (endTime !== undefined && nextEnd >= endTime) break;
    endTime = nextEnd;
  }
  return sortDedup(collected);
}

export const binance: DataSource = {
  id: 'binance',
  name: 'Binance',
  pairs: pairsFromNative({
    XRPUSD: 'XRPUSDT',
    BTCUSD: 'BTCUSDT',
    ETHUSD: 'ETHUSDT',
  }),
  nativeIntervals: ['1h', '4h', '1D', '1W', '1M'],
  async fetchCandles(pairId: PairId, interval: IntervalId): Promise<Candle[]> {
    return fetchKlines(nativeOf(this, pairId), NATIVE[interval]);
  },
  async fetchTicker(pairId: PairId): Promise<Ticker> {
    const symbol = nativeOf(this, pairId);
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`;
    const data = await fetchJson<{ lastPrice: string; priceChangePercent: string }>(url);
    const last = Number(data.lastPrice);
    const change = Number(data.priceChangePercent);
    return { last, change24hPct: Number.isFinite(change) ? change : null };
  },
};
