// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Wykresy contributors

export type Tool =
  | 'cursor'
  | 'trend'
  | 'hline'
  | 'rect'
  | 'ray'
  | 'channel'
  | 'fib'
  | 'fibext'
  | 'abcd'
  | 'text'
  | 'longpos'
  | 'shortpos';

export interface Point {
  time: number;
  price: number;
}

export type Drawing =
  | { id: string; type: 'trend'; p1: Point; p2: Point }
  | { id: string; type: 'hline'; price: number }
  | { id: string; type: 'rect'; p1: Point; p2: Point }
  | { id: string; type: 'ray'; p1: Point; p2: Point }
  | { id: string; type: 'channel'; p1: Point; p2: Point; p3: Point }
  | { id: string; type: 'fib'; p1: Point; p2: Point }
  | { id: string; type: 'fibext'; a: Point; b: Point; c: Point; extendRight: boolean }
  | { id: string; type: 'abcd'; a: Point; b: Point; c: Point }
  | { id: string; type: 'text'; p: Point; text: string }
  | { id: string; type: 'longpos'; entry: Point; stop: Point; target: Point }
  | { id: string; type: 'shortpos'; entry: Point; stop: Point; target: Point };

export const TOOLS_POINTS: Record<Tool, number> = {
  cursor: 0,
  hline: 1,
  text: 1,
  trend: 2,
  rect: 2,
  ray: 2,
  fib: 2,
  channel: 3,
  fibext: 3,
  abcd: 3,
  longpos: 3,
  shortpos: 3,
};
