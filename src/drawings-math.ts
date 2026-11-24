// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import type { Point } from './drawings-types';

export const FIB_RETRACEMENT = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;
export const FIB_EXTENSION = [0, 0.382, 0.618, 1, 1.272, 1.618, 2, 2.618] as const;
export const ABCD_PROJECTIONS = [1, 1.272, 1.618] as const;

/** D such that vector CD = AB in price and time (1:1). */
export function abcdPointD(a: Point, b: Point, c: Point): Point {
  return {
    time: c.time + (b.time - a.time),
    price: c.price + (b.price - a.price),
  };
}

/** Projection of AB from C by factor k (k=1 is D). */
export function abcdProject(a: Point, b: Point, c: Point, k: number): Point {
  return {
    time: c.time + (b.time - a.time) * k,
    price: c.price + (b.price - a.price) * k,
  };
}

/** Trend-based fib extension price: C + (B - A) * k. */
export function fibExtensionPrice(a: Point, b: Point, c: Point, k: number): number {
  return c.price + (b.price - a.price) * k;
}

export function fibRetracementPrice(p1: Point, p2: Point, k: number): number {
  return p1.price + (p2.price - p1.price) * k;
}

export function translatePoint(p: Point, dTime: number, dPrice: number): Point {
  return { time: p.time + dTime, price: p.price + dPrice };
}
