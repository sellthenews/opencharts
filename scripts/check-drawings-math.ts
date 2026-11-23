import { abcdPointD, abcdProject, fibExtensionPrice, FIB_EXTENSION } from '../src/drawings-math.ts';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}
function almost(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) <= eps;
}

const a = { time: 100, price: 10 };
const b = { time: 130, price: 16 };
const c = { time: 150, price: 12 };
const d = abcdPointD(a, b, c);
assert(d.time === 180, `D.time ${d.time}`);
assert(d.price === 18, `D.price ${d.price}`);

const d2 = abcdProject(a, b, c, 1);
assert(d2.time === d.time && d2.price === d.price, 'k=1 equals D');
const p1272 = abcdProject(a, b, c, 1.272);
assert(almost(p1272.price, 12 + 6 * 1.272) && almost(p1272.time, 150 + 30 * 1.272), '1.272 proj');
const p1618 = abcdProject(a, b, c, 1.618);
assert(almost(p1618.price, 12 + 6 * 1.618) && almost(p1618.time, 150 + 30 * 1.618), '1.618 proj');

const prices = FIB_EXTENSION.map((k) => fibExtensionPrice(a, b, c, k));
assert(almost(prices[0]!, 12), 'k=0 is C');
assert(almost(prices[3]!, 18), 'k=1 is C+(B-A)');
assert(almost(prices[5]!, 12 + 6 * 1.618), 'k=1.618');
assert(almost(prices[7]!, 12 + 6 * 2.618), 'k=2.618');

console.log('drawings-math ok', { d, p1272, p1618, prices });
