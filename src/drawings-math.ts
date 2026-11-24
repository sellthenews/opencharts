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

/** Trend-based fib extension price: 0 at C, k at C + k*(B − A). Reverse uses (A − B). */
export function fibExtensionPrice(a: Point, b: Point, c: Point, k: number, reverse = false): number {
  const delta = reverse ? a.price - b.price : b.price - a.price;
  return c.price + delta * k;
}

/**
 * Fib retracement price in TradingView order: level 1 is the first point,
 * level 0 is the second. Levels k > 1 continue past the first point, away from 0.
 * Pass reverse=true to put 0 on the first point instead.
 */
export function fibRetracementPrice(p1: Point, p2: Point, k: number, reverse = false): number {
  const start = reverse ? p2 : p1;
  const end = reverse ? p1 : p2;
  return end.price + (start.price - end.price) * k;
}

export function translatePoint(p: Point, dTime: number, dPrice: number): Point {
  return { time: p.time + dTime, price: p.price + dPrice };
}
