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
  | 'shortpos'
  | 'pricerange'
  | 'daterange'
  | 'datepricerange'
  | 'vline'
  | 'hray'
  | 'extline'
  | 'arrow'
  | 'pricelabel'
  | 'note'
  | 'callout'
  | 'ellipse'
  | 'triangle'
  | 'regress';

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
  | { id: string; type: 'shortpos'; entry: Point; stop: Point; target: Point }
  | { id: string; type: 'pricerange'; p1: Point; p2: Point }
  | { id: string; type: 'daterange'; p1: Point; p2: Point }
  | { id: string; type: 'datepricerange'; p1: Point; p2: Point }
  | { id: string; type: 'vline'; time: number }
  | { id: string; type: 'hray'; p1: Point; p2: Point }
  | { id: string; type: 'extline'; p1: Point; p2: Point }
  | { id: string; type: 'arrow'; p1: Point; p2: Point }
  | { id: string; type: 'pricelabel'; p: Point }
  | { id: string; type: 'note'; p: Point; text: string }
  | { id: string; type: 'callout'; p1: Point; p2: Point; text: string }
  | { id: string; type: 'ellipse'; p1: Point; p2: Point }
  | { id: string; type: 'triangle'; p1: Point; p2: Point; p3: Point }
  | { id: string; type: 'regress'; p1: Point; p2: Point };

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
  pricerange: 2,
  daterange: 2,
  datepricerange: 2,
  vline: 1,
  hray: 2,
  extline: 2,
  arrow: 2,
  pricelabel: 1,
  note: 1,
  callout: 2,
  ellipse: 2,
  triangle: 3,
  regress: 2,
};
