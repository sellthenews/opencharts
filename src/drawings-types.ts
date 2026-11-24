// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

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
  | 'regress'
  | 'xabcd'
  | 'hs'
  | 'fibchan'
  | 'fibfan'
  | 'arc'
  | 'tripattern'
  | 'elliottimp'
  | 'elliottabc'
  | 'path'
  | 'brush'
  | 'flag'
  | 'forecast'
  | 'fibarcs'
  | 'fibspiral'
  | 'fibtz'
  | 'gannbox'
  | 'gannfan'
  | 'gannsq'
  | 'pitchfork';

export interface Point {
  time: number;
  price: number;
}

export type LinePattern = 'solid' | 'dashed' | 'dotted';

export interface DrawStyle {
  color?: string;
  width?: number;
  lineStyle?: LinePattern;
  locked?: boolean;
}

type DrawingShape =
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
  | { id: string; type: 'regress'; p1: Point; p2: Point }
  | { id: string; type: 'xabcd'; x: Point; a: Point; b: Point; c: Point; d: Point }
  | { id: string; type: 'hs'; ls: Point; n1: Point; head: Point; n2: Point; rs: Point }
  | { id: string; type: 'fibchan'; p1: Point; p2: Point; p3: Point }
  | { id: string; type: 'fibfan'; p1: Point; p2: Point }
  | { id: string; type: 'arc'; p1: Point; p2: Point; p3: Point }
  | { id: string; type: 'tripattern'; p1: Point; p2: Point; p3: Point; p4: Point }
  | { id: string; type: 'elliottimp'; points: Point[] }
  | { id: string; type: 'elliottabc'; points: Point[] }
  | { id: string; type: 'path'; points: Point[] }
  | { id: string; type: 'brush'; points: Point[] }
  | { id: string; type: 'flag'; p1: Point; p2: Point; p3: Point; p4: Point }
  | { id: string; type: 'forecast'; p1: Point; p2: Point }
  | { id: string; type: 'fibarcs'; p1: Point; p2: Point }
  | { id: string; type: 'fibspiral'; p1: Point; p2: Point }
  | { id: string; type: 'fibtz'; p1: Point; p2: Point }
  | { id: string; type: 'gannbox'; p1: Point; p2: Point }
  | { id: string; type: 'gannfan'; p1: Point; p2: Point }
  | { id: string; type: 'gannsq'; p1: Point; p2: Point }
  | { id: string; type: 'pitchfork'; p1: Point; p2: Point; p3: Point };

export type Drawing = DrawingShape & { style?: DrawStyle };

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
  xabcd: 5,
  hs: 5,
  fibchan: 3,
  fibfan: 2,
  arc: 3,
  tripattern: 4,
  elliottimp: 6,
  elliottabc: 3,
  path: Number.POSITIVE_INFINITY,
  brush: Number.POSITIVE_INFINITY,
  flag: 4,
  forecast: 2,
  fibarcs: 2,
  fibspiral: 2,
  fibtz: 2,
  gannbox: 2,
  gannfan: 2,
  gannsq: 2,
  pitchfork: 3,
};
