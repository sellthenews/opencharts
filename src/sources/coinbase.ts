import { aggregateCandles, sortDedup } from './aggregate';
import { changePct, fetchJson } from './http';
import type { Candle, DataSource, IntervalId, PairId, Ticker } from './types';
import { MAX_CANDLES, nativeOf, pairsFromNative } from './types';

/** Coinbase Exchange public candles: granularity in seconds. No native 4h / 1W / 1M. */
const NATIVE_GRANULARITY: Partial<Record<IntervalId, number>> = {
  '1h': 3600,
  '1D': 86400,
};

const PAGE = 300;

/** [time, low, high, open, close, volume] */
type CoinbaseRow = [number, number, number, number, number, number];

function rowToCandle(row: CoinbaseRow): Candle {
  return {
    time: Number(row[0]),
    open: Number(row[3]),
    high: Number(row[2]),
    low: Number(row[1]),
    close: Number(row[4]),
    volume: Number(row[5]),
  };
}

async function fetchGranularity(
  product: string,
  granularity: number,
  maxCandles = MAX_CANDLES,
): Promise<Candle[]> {
  const collected: Candle[] = [];
  let end = Math.floor(Date.now() / 1000);
  let guard = 0;
  while (collected.length < maxCandles && guard < 16) {
    guard += 1;
    const start = end - granularity * PAGE;
    const url =
      `https://api.exchange.coinbase.com/products/${encodeURIComponent(product)}/candles` +
      `?granularity=${granularity}&start=${new Date(start * 1000).toISOString()}` +
      `&end=${new Date(end * 1000).toISOString()}`;
    const rows = await fetchJson<CoinbaseRow[]>(url);
    if (!rows.length) break;
    collected.push(...rows.map(rowToCandle));
    const oldest = Math.min(...rows.map((r) => Number(r[0])));
    if (oldest >= end) break;
    end = oldest;
    if (rows.length < 10) break;
  }
  return sortDedup(collected);
}

export const coinbase: DataSource = {
  id: 'coinbase',
  name: 'Coinbase',
  pairs: pairsFromNative({
    XRPUSD: 'XRP-USD',
    BTCUSD: 'BTC-USD',
    ETHUSD: 'ETH-USD',
  }),
  nativeIntervals: ['1h', '1D'],
  async fetchCandles(pairId: PairId, interval: IntervalId): Promise<Candle[]> {
    const product = nativeOf(this, pairId);
    if (interval === '4h') {
      const hourly = await fetchGranularity(product, 3600);
      return aggregateCandles(hourly, '4h');
    }
    if (interval === '1W' || interval === '1M') {
      const daily = await fetchGranularity(product, 86400);
      return aggregateCandles(daily, interval);
    }
    const gran = NATIVE_GRANULARITY[interval];
    if (!gran) throw new Error(`Coinbase: brak interwału ${interval}`);
    return fetchGranularity(product, gran);
  },
  async fetchTicker(pairId: PairId): Promise<Ticker> {
    const product = nativeOf(this, pairId);
    const url = `https://api.exchange.coinbase.com/products/${encodeURIComponent(product)}/stats`;
    const data = await fetchJson<{ last: string; open: string }>(url);
    const last = Number(data.last);
    return { last, change24hPct: changePct(last, Number(data.open)) };
  },
};
