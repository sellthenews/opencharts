// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

import type { Tool } from './drawings-types';
import { onLangChange, t } from './i18n';

export const TOOL_ICONS: Record<string, string> = {
  "cursor": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M3.2 1.8 4.1 13.2l3.1-3.2 3.6 4.4 1.8-1.5-3.6-4.3 4.5-.4z\"/></svg>",
  "trend": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" d=\"M2 13 14 3\"/><circle cx=\"2\" cy=\"13\" r=\"1.15\" fill=\"currentColor\"/><circle cx=\"14\" cy=\"3\" r=\"1.15\" fill=\"currentColor\"/></svg>",
  "hline": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" d=\"M1 8h14\"/><circle cx=\"8\" cy=\"8\" r=\"1.15\" fill=\"currentColor\"/></svg>",
  "orderline": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" d=\"M1 10h14\"/><rect x=\"1.5\" y=\"2.5\" width=\"8\" height=\"4\" rx=\"1\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"/></svg>",
  "rect": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><rect fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" stroke-linejoin=\"round\" x=\"3\" y=\"4\" width=\"10\" height=\"8\"/></svg>",
  "ray": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" d=\"M2.2 13 14 3.2\"/><circle cx=\"2.2\" cy=\"13\" r=\"1.15\" fill=\"currentColor\"/></svg>",
  "channel": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" d=\"M2 11.2 14 5.2M2 14.2 14 8.2\"/><circle cx=\"2\" cy=\"11.2\" r=\"1\" fill=\"currentColor\"/><circle cx=\"14\" cy=\"5.2\" r=\"1\" fill=\"currentColor\"/></svg>",
  "fib": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.65\" stroke-linecap=\"round\" d=\"M2 13.2h12M2 10.2h12M2 7.6h12M2 5.2h12M2 2.8h12\"/><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.65\" stroke-linecap=\"round\" d=\"M3.2 13.2 12.8 2.8\"/><circle cx=\"3.2\" cy=\"13.2\" r=\".95\" fill=\"currentColor\"/><circle cx=\"12.8\" cy=\"2.8\" r=\".95\" fill=\"currentColor\"/></svg>",
  "fibext": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.65\" stroke-linecap=\"round\" d=\"M2 13.2h12M2 9.6h12M2 6.4h12M2 3.2h12\"/><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.65\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M3 12.2 6.2 5.2 8.6 9.4 13 3.6\"/><circle cx=\"3\" cy=\"12.2\" r=\".9\" fill=\"currentColor\"/><circle cx=\"6.2\" cy=\"5.2\" r=\".9\" fill=\"currentColor\"/><circle cx=\"8.6\" cy=\"9.4\" r=\".9\" fill=\"currentColor\"/></svg>",
  "abcd": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M3 12 6.5 4 10 12 13 5\"/></svg>",
  "text": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M3 4h10M8 4v9\"/></svg>",
  "longpos": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M4 13V8h4v5H4zm4-2v2h4v-2H8zM5 6.5 8 3l3 3.5\"/><path fill=\"currentColor\" opacity=\".4\" d=\"M4 8h4v5H4z\"/></svg>",
  "shortpos": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M4 3v5h4V3H4zm4 0v3h4V3H8zM5 9.5 8 13l3-3.5\"/><path fill=\"currentColor\" opacity=\".4\" d=\"M8 3h4v3H8z\"/></svg>",
  "pricerange": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" d=\"M2 5h12M2 11h12\"/><path fill=\"currentColor\" opacity=\".38\" d=\"M2 5h12v6H2z\"/></svg>",
  "daterange": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" d=\"M5 2v12M11 2v12\"/><path fill=\"currentColor\" opacity=\".38\" d=\"M5 2h6v12H5z\"/></svg>",
  "datepricerange": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><rect fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" x=\"3\" y=\"4\" width=\"10\" height=\"8\"/><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" d=\"M3 8h10M8 4v8\"/></svg>",
  "vline": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" d=\"M8 1v14\"/><circle cx=\"8\" cy=\"8\" r=\"1.15\" fill=\"currentColor\"/></svg>",
  "hray": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" d=\"M3 8h12\"/><circle cx=\"3\" cy=\"8\" r=\"1.2\" fill=\"currentColor\"/></svg>",
  "extline": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" d=\"M1 13 15 3\"/></svg>",
  "arrow": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" d=\"M2 13 11.2 4.6\"/><path fill=\"currentColor\" d=\"m13.4 2.6-5.1.6 2.6 2.6z\"/></svg>",
  "pricelabel": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><rect fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" x=\"3\" y=\"5\" width=\"10\" height=\"6\" rx=\"1\"/><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" d=\"M6 8h4\"/></svg>",
  "note": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linejoin=\"round\" d=\"M4 3.5h6.5L12.5 6v6.5H4z\"/><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" d=\"M10.5 3.5V6H13\"/></svg>",
  "callout": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><rect fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" x=\"5\" y=\"2.5\" width=\"9\" height=\"6\" rx=\"1\"/><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" d=\"M7 8.5 4 13\"/></svg>",
  "ellipse": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><ellipse fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" cx=\"8\" cy=\"8\" rx=\"6\" ry=\"4\"/></svg>",
  "triangle": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linejoin=\"round\" d=\"M8 2.5 14 13.5H2z\"/></svg>",
  "regress": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" d=\"M2 12.5 14 5.5M2 14.5 14 7.5M2 10.5 14 3.5\"/></svg>",
  "xabcd": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linejoin=\"round\" d=\"M1.5 11 4.5 4 8 12 11.5 5 14.5 10\"/></svg>",
  "hs": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linejoin=\"round\" d=\"M1.5 10 4 6.5 6.5 10 8 3.5 9.5 10 12 6.5 14.5 10\"/><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-dasharray=\"2 1.5\" d=\"M1.5 10h13\"/></svg>",
  "fibchan": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.65\" stroke-linecap=\"round\" d=\"M2 13.2 14 7.2M2 10.2 14 4.2M2 7.2 14 1.2\"/><circle cx=\"2\" cy=\"13.2\" r=\".95\" fill=\"currentColor\"/><circle cx=\"14\" cy=\"7.2\" r=\".95\" fill=\"currentColor\"/></svg>",
  "fibfan": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.65\" stroke-linecap=\"round\" d=\"M2 13.5h12.5M2 13.5 14 10M2 13.5 12.5 5.5M2 13.5 9 2.5\"/><circle cx=\"2\" cy=\"13.5\" r=\"1\" fill=\"currentColor\"/></svg>",
  "arc": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" d=\"M2.5 11c1.5-6 9.5-6 11 0\"/></svg>",
  "tripattern": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" d=\"M1.5 13 13 3M1.5 4 13 12\"/></svg>",
  "elliottimp": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linejoin=\"round\" d=\"M1 12 3.5 8 5.5 10 8.5 3 11 7 15 4\"/></svg>",
  "elliottabc": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linejoin=\"round\" d=\"M2 12 7 4 10 9 14 5\"/></svg>",
  "path": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linejoin=\"round\" d=\"M2 12 5 6 8 9 12 4 14 7\"/></svg>",
  "brush": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" d=\"M3 13c2-5 4-1 6-6 1.2 2 2.2.5 4-3\"/></svg>",
  "flag": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" d=\"M4 14V4l8 1.5-1 4-7 1.2\"/></svg>",
  "forecast": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-dasharray=\"2 2\" d=\"M2 12 14 4\"/></svg>",
  "fibarcs": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.65\" d=\"M2 13c2-8 10-8 12 0M2 13c1.4-5 6.6-5 8 0M2 13c.8-2.8 3.2-2.8 4 0\"/></svg>",
  "fibspiral": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" d=\"M8 8c0-2 2-2 2 0s-4 3.5-4 0 6-6 6 0\"/></svg>",
  "fibtz": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" d=\"M3 2v12M6 2v12M10 2v12M14 2v12\"/></svg>",
  "gannbox": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><rect fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" x=\"3\" y=\"3\" width=\"10\" height=\"10\"/><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.45\" d=\"M3 8h10M8 3v10M3 3l10 10\"/></svg>",
  "gannfan": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" d=\"M2 14h12M2 14 14 10M2 14 10 2M2 14 14 2\"/></svg>",
  "gannsq": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><rect fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" x=\"3\" y=\"3\" width=\"10\" height=\"10\"/><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.45\" d=\"M3 3l10 10M13 3 3 13\"/></svg>",
  "pitchfork": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" d=\"M2 12 14 5M5 14 15 7M5 10 15 3\"/></svg>",
  "measure": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" d=\"M2.2 13.5 13.5 2.2\"/><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" d=\"M4.2 11.5 5.4 10.3M6.4 9.3 7.6 8.1M8.6 7.1 9.8 5.9\"/></svg>",
  "zoom": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><circle cx=\"7\" cy=\"7\" r=\"4.2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"/><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" d=\"m10.2 10.2 3.3 3.3M7 5v4M5 7h4\"/></svg>",
  "magnet": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M4.2 2.5v5.2a3.8 3.8 0 0 0 7.6 0V2.5\"/><path fill=\"currentColor\" d=\"M3.3 2.5h2.6v2.2H3.3zm6.8 0h2.6v2.2H10.1z\"/></svg>",
  "lock": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><rect x=\"3.5\" y=\"7.5\" width=\"9\" height=\"6.5\" rx=\"1.2\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"/><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" d=\"M5.5 7.5V5.2a2.5 2.5 0 0 1 5 0v2.3\"/></svg>",
  "hide": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M2 8s2.5-4.5 6-4.5S14 8 14 8s-2.5 4.5-6 4.5S2 8 2 8z\"/><circle cx=\"8\" cy=\"8\" r=\"1.8\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\"/></svg>",
  "undo": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M5.5 3.5 2.5 6.5l3 3M2.8 6.5h6.7a3.5 3.5 0 0 1 0 7H7\"/></svg>",
  "redo": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M10.5 3.5l3 3-3 3M13.2 6.5H6.5a3.5 3.5 0 0 0 0 7H9\"/></svg>",
  "trash": "<svg viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M3 5h10M5.5 5V3.5h5V5M6 7v5M8 7v5M10 7v5M4.5 5l.6 8h6l.6-8\"/></svg>",
};

export interface ToolDef {
  id: Tool;
  name: string;
  title: string;
  shortcut?: string;
  section?: string;
}

function groupLabel(id: string): string {
  return t(id === 'shapes' ? 'group.icons' : `group.${id}`);
}

const SECTION_KEY: Record<string, string> = {
  LINES: 'section.lines',
  CHANNELS: 'section.channels',
  FIBONACCI: 'section.fibonacci',
  GANN: 'section.gann',
  PATTERNS: 'section.patterns',
  ELLIOTT: 'section.elliott',
  FORECASTING: 'section.forecasting',
  MEASURERS: 'section.measurers',
  TEXT: 'section.text',
  SHAPES: 'section.shapes',
};

export function toolTooltip(id: string): string {
  const def = (TOOL_DEFS as Record<string, ToolDef | undefined>)[id];
  if (!def) return '';
  const name = t(`tool.${id}`);
  if (def.shortcut) return `${name} (${def.shortcut})`;
  const hintKey = `tool.${id}.hint`;
  const hint = t(hintKey);
  return hint && hint !== hintKey ? `${name} — ${hint}` : name;
}

export interface RailGroup {
  id: string;
  label: string;
  defaultTool: Tool;
  sections: { title: string | null; tools: Tool[] }[];
}

const FAV_KEY = 'opencharts:favorites';
const FAV_KEY_V2 = 'opencharts:favorites-v2';
const LAST_KEY = 'opencharts:rail-last';
const DEFAULT_FAV_TOP = 72;

/** Default set used for first visits and the one-time v2 favorites migration. */
export const DEFAULT_FAV_TOOLS: Tool[] = [
  'brush',
  'channel',
  'fib',
  'xabcd',
  'fibext',
  'callout',
  'trend',
  'rect',
  'path',
  'ray',
  'abcd',
  'pricerange',
  'daterange',
  'hray',
  'elliottimp',
  'ellipse',
  'elliottabc',
  'flag',
  'longpos',
  'arrow',
  'datepricerange',
  'text',
  'note',
];

export const TOOL_DEFS: Record<Tool, ToolDef> = {
  cursor: { id: 'cursor', name: 'Cursor', title: 'Cursor' },
  trend: { id: 'trend', name: 'Trend Line', title: 'Trend Line (Alt+T)', shortcut: 'Alt+T' },
  hline: { id: 'hline', name: 'Horizontal Line', title: 'Horizontal Line (Alt+H)', shortcut: 'Alt+H' },
  orderline: { id: 'orderline', name: 'Order line', title: 'Order line — named horizontal level' },
  hray: { id: 'hray', name: 'Horizontal Ray', title: 'Horizontal Ray — two clicks' },
  vline: { id: 'vline', name: 'Vertical Line', title: 'Vertical Line (Alt+V)', shortcut: 'Alt+V' },
  ray: { id: 'ray', name: 'Ray', title: 'Ray — two clicks, extends' },
  extline: { id: 'extline', name: 'Extended Line', title: 'Extended Line — two clicks' },
  arrow: { id: 'arrow', name: 'Arrow', title: 'Arrow — two clicks' },
  channel: { id: 'channel', name: 'Parallel Channel', title: 'Parallel Channel — three clicks' },
  regress: { id: 'regress', name: 'Regression Trend', title: 'Regression Trend — two clicks' },
  fib: { id: 'fib', name: 'Fib Retracement', title: 'Fib Retracement (Alt+F)', shortcut: 'Alt+F' },
  fibext: { id: 'fibext', name: 'Trend-Based Fib Extension', title: 'Trend-Based Fib Extension — three points A, B, C' },
  fibchan: { id: 'fibchan', name: 'Fib Channel', title: 'Fib Channel — three clicks' },
  fibfan: { id: 'fibfan', name: 'Fib Fan', title: 'Fib Fan — two clicks' },
  fibarcs: { id: 'fibarcs', name: 'Fib Arcs', title: 'Fib Arcs — two clicks' },
  fibspiral: { id: 'fibspiral', name: 'Fib Spiral', title: 'Fib Spiral — two clicks' },
  fibtz: { id: 'fibtz', name: 'Fib Time Zone', title: 'Fib Time Zone — two clicks' },
  pitchfork: { id: 'pitchfork', name: "Andrews' Pitchfork", title: "Andrews' Pitchfork — three clicks" },
  gannbox: { id: 'gannbox', name: 'Gann Box', title: 'Gann Box — two clicks' },
  gannfan: { id: 'gannfan', name: 'Gann Fan', title: 'Gann Fan — two clicks' },
  gannsq: { id: 'gannsq', name: 'Gann Square', title: 'Gann Square — two clicks' },
  abcd: { id: 'abcd', name: 'AB=CD', title: 'AB=CD Pattern — three points A, B, C' },
  xabcd: { id: 'xabcd', name: 'XABCD Pattern', title: 'XABCD Pattern — five harmonic points' },
  hs: { id: 'hs', name: 'Head and Shoulders', title: 'Head and Shoulders — five points' },
  tripattern: { id: 'tripattern', name: 'Triangle Pattern', title: 'Triangle Pattern — two lines, four points' },
  elliottimp: { id: 'elliottimp', name: 'Elliott Impulse', title: 'Elliott Impulse Wave — six points 0–5' },
  elliottabc: { id: 'elliottabc', name: 'Elliott Correction', title: 'Elliott Correction Wave — three points A, B, C' },
  flag: { id: 'flag', name: 'Flag', title: 'Flag — pole and three parallelogram corners' },
  longpos: { id: 'longpos', name: 'Long Position', title: 'Long Position — entry, stop, target' },
  shortpos: { id: 'shortpos', name: 'Short Position', title: 'Short Position — entry, stop, target' },
  forecast: { id: 'forecast', name: 'Forecast', title: 'Forecast — two clicks, line extends' },
  pricerange: { id: 'pricerange', name: 'Price Range', title: 'Price Range — two clicks' },
  daterange: { id: 'daterange', name: 'Date Range', title: 'Date Range — two clicks' },
  datepricerange: { id: 'datepricerange', name: 'Date and Price Range', title: 'Date and Price Range — two clicks' },
  brush: { id: 'brush', name: 'Brush', title: 'Brush — click and drag to draw' },
  path: { id: 'path', name: 'Path', title: 'Path — click to add points, Enter or double-click to finish' },
  text: { id: 'text', name: 'Text', title: 'Text — click and type' },
  note: { id: 'note', name: 'Note', title: 'Note — click and type' },
  callout: { id: 'callout', name: 'Callout', title: 'Callout — anchor, box, and text' },
  pricelabel: { id: 'pricelabel', name: 'Price Label', title: 'Price Label — one click' },
  rect: { id: 'rect', name: 'Rectangle', title: 'Rectangle — two clicks' },
  ellipse: { id: 'ellipse', name: 'Ellipse', title: 'Ellipse — two clicks' },
  triangle: { id: 'triangle', name: 'Triangle', title: 'Triangle — three clicks' },
  arc: { id: 'arc', name: 'Arc', title: 'Arc — three clicks' },
};

export const RAIL_GROUPS: RailGroup[] = [
  {
    id: 'cursor',
    label: 'Cursor',
    defaultTool: 'cursor',
    sections: [{ title: null, tools: ['cursor'] }],
  },
  {
    id: 'lines',
    label: 'Lines',
    defaultTool: 'trend',
    sections: [
      { title: 'LINES', tools: ['trend', 'hline', 'orderline', 'hray', 'vline', 'ray', 'extline', 'arrow'] },
      { title: 'CHANNELS', tools: ['channel', 'regress'] },
    ],
  },
  {
    id: 'fib',
    label: 'Fibonacci and channels',
    defaultTool: 'fib',
    sections: [
      { title: 'FIBONACCI', tools: ['fib', 'fibext', 'fibchan', 'fibfan', 'fibarcs', 'fibspiral', 'fibtz'] },
    ],
  },
  {
    id: 'patterns',
    label: 'Patterns',
    defaultTool: 'abcd',
    sections: [
      { title: 'PATTERNS', tools: ['abcd', 'xabcd', 'hs', 'tripattern', 'flag'] },
    ],
  },
  {
    id: 'forecast',
    label: 'Forecasting and measurers',
    defaultTool: 'longpos',
    sections: [
      { title: 'FORECASTING', tools: ['longpos', 'shortpos', 'forecast'] },
      { title: 'MEASURERS', tools: ['pricerange', 'daterange', 'datepricerange'] },
    ],
  },
  {
    id: 'brush',
    label: 'Brush',
    defaultTool: 'brush',
    sections: [{ title: null, tools: ['brush', 'path'] }],
  },
  {
    id: 'text',
    label: 'Text',
    defaultTool: 'text',
    sections: [{ title: 'TEXT', tools: ['text', 'note', 'callout', 'pricelabel'] }],
  },
  {
    id: 'shapes',
    label: 'Icons',
    defaultTool: 'rect',
    sections: [{ title: 'SHAPES', tools: ['rect', 'ellipse', 'triangle', 'arc'] }],
  },
  {
    id: 'more',
    label: 'More',
    defaultTool: 'gannfan',
    sections: [
      { title: 'GANN', tools: ['gannbox', 'gannfan', 'gannsq'] },
      { title: 'ELLIOTT', tools: ['elliottimp', 'elliottabc'] },
      { title: 'CHANNELS', tools: ['pitchfork'] },
    ],
  },
];

interface FavState {
  v: 2;
  tools: Tool[];
  x: number;
  y: number;
  collapsed?: boolean;
}

export interface ToolRailOptions {
  rail: HTMLElement;
  flyout: HTMLElement;
  favBar: HTMLElement;
  onTool: (tool: Tool) => void;
  getCursorMode: () => 'cross' | 'dot' | 'arrow';
  setCursorMode: (mode: 'cross' | 'dot' | 'arrow') => void;
  getMagnet: () => boolean;
  setMagnet: (on: boolean) => void;
  onLockAll: () => void;
  onHideAll: () => void;
  onClearAll: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  isLockedAll: () => boolean;
  isHidden: () => boolean;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

function isToolId(id: unknown): id is Tool {
  return typeof id === 'string' && id in TOOL_DEFS && id !== 'cursor';
}

function mergeDefaultFav(existing: readonly Tool[]): Tool[] {
  const seen = new Set<Tool>(DEFAULT_FAV_TOOLS);
  const extras = existing.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return [...DEFAULT_FAV_TOOLS, ...extras];
}

function parseFavTools(raw: string | null): Tool[] | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<FavState>;
    if (!Array.isArray(p.tools)) return null;
    return p.tools.filter(isToolId);
  } catch {
    return null;
  }
}

function loadFav(): { state: FavState; stored: boolean; placed: boolean } {
  try {
    const v2raw = localStorage.getItem(FAV_KEY_V2);
    if (v2raw) {
      const p = JSON.parse(v2raw) as Partial<FavState>;
      if (Array.isArray(p.tools)) {
        const placed = typeof p.x === 'number' && typeof p.y === 'number';
        return {
          state: {
            v: 2,
            tools: p.tools.filter(isToolId),
            x: typeof p.x === 'number' ? p.x : 8,
            y: typeof p.y === 'number' ? p.y : DEFAULT_FAV_TOP,
            collapsed: p.collapsed === true,
          },
          stored: true,
          placed,
        };
      }
    }
    const legacyTools = parseFavTools(localStorage.getItem(FAV_KEY));
    if (legacyTools) {
      const state: FavState = { v: 2, tools: mergeDefaultFav(legacyTools), x: 0, y: DEFAULT_FAV_TOP };
      saveFav(state);
      return { state, stored: true, placed: false };
    }
  } catch {
    /* ignore */
  }
  return { state: { v: 2, tools: [...DEFAULT_FAV_TOOLS], x: 0, y: DEFAULT_FAV_TOP }, stored: false, placed: false };
}

function saveFav(state: FavState): void {
  try {
    localStorage.setItem(FAV_KEY_V2, JSON.stringify({ ...state, v: 2 }));
  } catch {
    /* quota */
  }
}

function loadLast(): Record<string, Tool> {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as Record<string, string>;
    const out: Record<string, Tool> = {};
    for (const [k, v] of Object.entries(p)) {
      if (v in TOOL_DEFS) out[k] = v as Tool;
    }
    return out;
  } catch {
    return {};
  }
}

function saveLast(map: Record<string, Tool>): void {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

function icon(id: string): string {
  return TOOL_ICONS[id] ?? TOOL_ICONS.cursor ?? '';
}

const STAR = '<svg class="star-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.2 9.7 6l4.1.3-3.1 2.6 1 4-3.7-2.2L4.3 12.9l1-4L2.2 6.3 6.3 6z"/></svg>';

export function initToolRail(opts: ToolRailOptions): { setActive: (tool: Tool) => void; refreshActions: () => void; refreshHistory: () => void; closeFlyout: () => void } {
  const last = { ...Object.fromEntries(RAIL_GROUPS.map((g) => [g.id, g.defaultTool])), ...loadLast() };
  const loadedFav = loadFav();
  let fav = loadedFav.state;
  let favPlaced = loadedFav.placed;
  let active: Tool = 'cursor';
  let openMenu: string | null = null;

  function lastOf(groupId: string): Tool {
    const g = RAIL_GROUPS.find((x) => x.id === groupId);
    const saved = last[groupId];
    const tools = g?.sections.flatMap((s) => s.tools) ?? [];
    if (saved && tools.includes(saved)) return saved;
    return g?.defaultTool ?? 'cursor';
  }

  function remember(tool: Tool): void {
    const g = RAIL_GROUPS.find((gr) => gr.sections.some((s) => s.tools.includes(tool)));
    if (!g) return;
    last[g.id] = tool;
    saveLast(last);
  }

  function renderRail(): void {
    const groups = RAIL_GROUPS.map((g) => {
      const tool = lastOf(g.id);
      const idAttr = g.id === 'cursor' ? ' id="cursor-tool"' : '';
      const activeCls = active === tool || (g.id === 'cursor' && active === 'cursor') ? ' is-active' : '';
      return `<div class="rail-slot">
        <button type="button" class="rail-btn${activeCls}" data-rail-group="${g.id}" data-tool="${tool}"${idAttr} title="${toolTooltip(tool)}" aria-label="${groupLabel(g.id)}">
          <span class="rail-icon">${icon(tool)}</span>
        </button>
        <button type="button" class="rail-caret" data-rail-caret="${g.id}" title="${t('rail.groupMenu', { name: groupLabel(g.id) })}" aria-label="${t('rail.openGroupMenu', { name: groupLabel(g.id) })}" aria-expanded="${openMenu === g.id ? 'true' : 'false'}"></button>
      </div>`;
    }).join('');

    const measureActive = active === 'datepricerange' ? ' is-active' : '';
    const magnetActive = opts.getMagnet() ? ' is-active' : '';
    const lockActive = opts.isLockedAll() ? ' is-active' : '';
    const hideActive = opts.isHidden() ? ' is-active' : '';

    opts.rail.innerHTML = `
      <div class="rail-top">${groups}</div>
      <div class="rail-spacer"></div>
      <div class="rail-history">
        <button type="button" class="rail-btn" id="rail-undo" data-rail-action="undo" title="${t('status.undo')} (Ctrl+Z)" aria-label="${t('status.undo')}"${opts.canUndo() ? '' : ' disabled'}><span class="rail-icon">${icon('undo')}</span></button>
        <button type="button" class="rail-btn" id="rail-redo" data-rail-action="redo" title="${t('status.redo')} (Ctrl+Y)" aria-label="${t('status.redo')}"${opts.canRedo() ? '' : ' disabled'}><span class="rail-icon">${icon('redo')}</span></button>
      </div>
      <div class="rail-bottom">
        <div class="rail-slot">
          <button type="button" class="rail-btn${measureActive}" data-rail-action="measure" data-tool="datepricerange" title="${t('rail.measureTitle')}" aria-label="${t('rail.measure')}"><span class="rail-icon">${icon('measure')}</span></button>
        </div>
        <div class="rail-slot">
          <button type="button" class="rail-btn" data-rail-action="zoom" title="${t('rail.zoom')}" aria-label="${t('rail.zoom')}"><span class="rail-icon">${icon('zoom')}</span></button>
          <button type="button" class="rail-caret" data-rail-caret="zoom" title="${t('rail.zoomMenu')}" aria-label="${t('rail.openZoomMenu')}"></button>
        </div>
        <div class="rail-slot">
          <button type="button" class="rail-btn${magnetActive}" id="magnet-btn" data-rail-action="magnet" title="${t('rail.magnetTitle')}" aria-label="${t('rail.magnet')}" aria-pressed="${opts.getMagnet() ? 'true' : 'false'}"><span class="rail-icon">${icon('magnet')}</span></button>
          <button type="button" class="rail-caret" data-rail-caret="magnet" title="${t('rail.magnetModes')}" aria-label="${t('rail.magnetModes')}"></button>
        </div>
        <button type="button" class="rail-btn${lockActive}" data-rail-action="lock" title="${t('rail.lockAll')}" aria-label="${t('rail.lockAll')}" aria-pressed="${opts.isLockedAll() ? 'true' : 'false'}"><span class="rail-icon">${icon('lock')}</span></button>
        <button type="button" class="rail-btn${hideActive}" data-rail-action="hide" title="${t('rail.hideAll')}" aria-label="${t('rail.hideAll')}" aria-pressed="${opts.isHidden() ? 'true' : 'false'}"><span class="rail-icon">${icon('hide')}</span></button>
        <button type="button" class="rail-btn rail-danger btn-danger" data-rail-action="trash" title="${t('rail.removeAll')}" aria-label="${t('rail.removeAll')}"><span class="rail-icon">${icon('trash')}</span></button>
      </div>`;
  }

  function persistFav(): void {
    favPlaced = true;
    saveFav(fav);
  }

  function centerFavIfNeeded(): void {
    if (favPlaced || opts.favBar.hidden || !fav.tools.length) return;
    const parent = opts.favBar.offsetParent as HTMLElement | null;
    const pw = parent?.clientWidth ?? opts.favBar.parentElement?.clientWidth ?? window.innerWidth;
    const maxX = Math.max(0, pw - opts.favBar.offsetWidth);
    fav.x = Math.min(8, maxX);
    fav.y = DEFAULT_FAV_TOP;
    opts.favBar.style.left = `${fav.x}px`;
    opts.favBar.style.top = `${fav.y}px`;
  }

  function renderFav(): void {
    if (!fav.tools.length) {
      opts.favBar.hidden = true;
      opts.favBar.innerHTML = '';
      return;
    }
    opts.favBar.hidden = false;
    if (favPlaced) {
      opts.favBar.style.left = `${fav.x}px`;
      opts.favBar.style.top = `${fav.y}px`;
    }
    const items = fav.tools
      .map((id) => {
        const cls = id === active ? ' is-active' : '';
        return `<button type="button" class="fav-btn${cls}" data-tool="${id}" title="${toolTooltip(id)}" aria-label="${t(`tool.${id}`)}">${icon(id)}</button>`;
      })
      .join('');
    const collapseLabel = fav.collapsed ? t('draw.expandBar') : t('draw.collapseBar');
    opts.favBar.classList.toggle('is-collapsed', Boolean(fav.collapsed));
    opts.favBar.innerHTML = `<button type="button" class="fav-handle" id="fav-handle" title="${t('rail.favDrag')}" aria-label="${t('rail.favDrag')}">
        <span></span><span></span><span></span><span></span><span></span><span></span>
      </button><div class="fav-items">${items}</div>
      <button type="button" class="fav-collapse" id="fav-collapse" title="${collapseLabel}" aria-label="${collapseLabel}" aria-expanded="${fav.collapsed ? 'false' : 'true'}">${fav.collapsed ? '▸' : '▾'}</button>`;
    if (!favPlaced) requestAnimationFrame(() => centerFavIfNeeded());
  }

  function closeFlyout(): void {
    openMenu = null;
    opts.flyout.hidden = true;
    opts.flyout.innerHTML = '';
    opts.rail.querySelectorAll('[data-rail-caret]').forEach((el) => el.setAttribute('aria-expanded', 'false'));
  }

  function placeFlyout(anchor: HTMLElement): void {
    const railBox = opts.rail.getBoundingClientRect();
    const btnBox = anchor.getBoundingClientRect();
    opts.flyout.hidden = false;
    const fw = opts.flyout.offsetWidth || 260;
    const fh = opts.flyout.offsetHeight || 200;
    let left = Math.round(railBox.right);
    let top = btnBox.top;
    if (top + fh > window.innerHeight - 8) top = Math.max(8, window.innerHeight - fh - 8);
    if (left + fw > window.innerWidth - 8) left = railBox.left - fw;
    opts.flyout.style.left = `${left}px`;
    opts.flyout.style.top = `${top}px`;
  }

  function starBtn(tool: Tool): string {
    const on = fav.tools.includes(tool);
    return `<button type="button" class="star-btn${on ? ' is-on' : ''}" data-star="${tool}" title="${on ? t('rail.removeFav') : t('rail.addFav')}" aria-pressed="${on ? 'true' : 'false'}" aria-label="${on ? t('rail.removeFav') : t('rail.addFav')}">${STAR}</button>`;
  }

  function openGroupMenu(groupId: string, anchor: HTMLElement): void {
    const g = RAIL_GROUPS.find((x) => x.id === groupId);
    if (!g) return;
    openMenu = groupId;
    if (groupId === 'cursor') {
      const mode = opts.getCursorMode();
      opts.flyout.innerHTML = `<div class="fly-section"><div class="fly-h">${t('group.cursor')}</div>
        <button type="button" class="fly-row${mode === 'cross' ? ' is-active' : ''}" data-cursor-mode="cross"><span class="fly-ico">${icon('cursor')}</span><span class="fly-name">${t('rail.cross')}</span></button>
        <button type="button" class="fly-row${mode === 'dot' ? ' is-active' : ''}" data-cursor-mode="dot"><span class="fly-ico">${icon('cursor')}</span><span class="fly-name">${t('rail.dot')}</span></button>
        <button type="button" class="fly-row${mode === 'arrow' ? ' is-active' : ''}" data-cursor-mode="arrow"><span class="fly-ico">${icon('cursor')}</span><span class="fly-name">${t('rail.arrow')}</span></button>
      </div>`;
    } else {
      opts.flyout.innerHTML = g.sections
        .map((sec, i) => {
          const head = sec.title ? `<div class="fly-h">${t(SECTION_KEY[sec.title] ?? sec.title)}</div>` : i === 0 ? '' : `<div class="fly-h"></div>`;
          const rows = sec.tools
            .map((id) => {
              return `<div class="fly-row${id === active ? ' is-active' : ''}" role="menuitem" data-tool="${id}" title="${toolTooltip(id)}">
                <span class="fly-ico">${icon(id)}</span><span class="fly-name">${t(`tool.${id}`)}</span>${starBtn(id)}
              </div>`;
            })
            .join('');
          return `<div class="fly-section">${head}${rows}</div>`;
        })
        .join('');
    }
    placeFlyout(anchor);
    opts.rail.querySelectorAll('[data-rail-caret]').forEach((el) => {
      el.setAttribute('aria-expanded', el.getAttribute('data-rail-caret') === groupId ? 'true' : 'false');
    });
  }

  function openActionMenu(kind: 'zoom' | 'magnet', anchor: HTMLElement): void {
    openMenu = kind;
    if (kind === 'zoom') {
      opts.flyout.innerHTML = `<div class="fly-section"><div class="fly-h">${t('rail.zoom')}</div>
        <button type="button" class="fly-row" data-rail-cmd="zoom-in"><span class="fly-name">${t('rail.zoomIn')}</span></button>
        <button type="button" class="fly-row" data-rail-cmd="zoom-out"><span class="fly-name">${t('rail.zoomOut')}</span></button>
        <button type="button" class="fly-row" data-rail-cmd="fit"><span class="fly-name">${t('rail.fit')}</span></button>
      </div>`;
    } else {
      const on = opts.getMagnet();
      opts.flyout.innerHTML = `<div class="fly-section"><div class="fly-h">${t('rail.magnet')}</div>
        <button type="button" class="fly-row${on ? '' : ' is-active'}" data-rail-cmd="magnet-off"><span class="fly-name">${t('rail.magnetOff')}</span></button>
        <button type="button" class="fly-row${on ? ' is-active' : ''}" data-rail-cmd="magnet-on"><span class="fly-name">${t('rail.magnetOn')}</span></button>
      </div>`;
    }
    placeFlyout(anchor);
  }

  function setActive(tool: Tool): void {
    active = tool;
    remember(tool);
    renderRail();
    renderFav();
    if (openMenu && RAIL_GROUPS.some((g) => g.id === openMenu)) {
      const caret = opts.rail.querySelector<HTMLElement>(`[data-rail-caret="${openMenu}"]`);
      if (caret) openGroupMenu(openMenu, caret);
    }
  }

  function toggleFav(tool: Tool): void {
    const i = fav.tools.indexOf(tool);
    if (i >= 0) fav.tools.splice(i, 1);
    else fav.tools.push(tool);
    persistFav();
    renderFav();
    if (openMenu) {
      const caret = opts.rail.querySelector<HTMLElement>(`[data-rail-caret="${openMenu}"]`);
      if (caret && RAIL_GROUPS.some((g) => g.id === openMenu)) openGroupMenu(openMenu, caret);
    }
  }

  function pickTool(tool: Tool): void {
    setActive(tool);
    closeFlyout();
    opts.onTool(tool);
  }

  opts.rail.addEventListener('click', (ev) => {
    const star = (ev.target as HTMLElement).closest<HTMLElement>('[data-star]');
    if (star) return;
    const caret = (ev.target as HTMLElement).closest<HTMLElement>('[data-rail-caret]');
    if (caret) {
      ev.preventDefault();
      ev.stopPropagation();
      const id = caret.getAttribute('data-rail-caret') ?? '';
      if (openMenu === id) {
        closeFlyout();
        return;
      }
      if (id === 'zoom' || id === 'magnet') openActionMenu(id, caret);
      else openGroupMenu(id, caret);
      return;
    }
    const action = (ev.target as HTMLElement).closest<HTMLElement>('[data-rail-action]');
    if (action) {
      const act = action.getAttribute('data-rail-action');
      if (act === 'measure') pickTool('datepricerange');
      else if (act === 'zoom') openActionMenu('zoom', action);
      else if (act === 'magnet') {
        opts.setMagnet(!opts.getMagnet());
        renderRail();
      } else if (act === 'lock') {
        opts.onLockAll();
        renderRail();
      } else if (act === 'hide') {
        opts.onHideAll();
        renderRail();
      } else if (act === 'trash') opts.onClearAll();
      else if (act === 'undo') opts.onUndo();
      else if (act === 'redo') opts.onRedo();
      return;
    }
    const groupBtn = (ev.target as HTMLElement).closest<HTMLElement>('[data-rail-group]');
    if (groupBtn) {
      const gid = groupBtn.getAttribute('data-rail-group') ?? '';
      if (gid === 'cursor') {
        pickTool('cursor');
        return;
      }
      pickTool(lastOf(gid));
    }
  });

  opts.flyout.addEventListener('click', (ev) => {
    const star = (ev.target as HTMLElement).closest<HTMLElement>('[data-star]');
    if (star) {
      ev.preventDefault();
      ev.stopPropagation();
      const id = star.getAttribute('data-star') as Tool | null;
      if (id) toggleFav(id);
      return;
    }
    const mode = (ev.target as HTMLElement).closest<HTMLElement>('[data-cursor-mode]');
    if (mode) {
      const m = (mode.getAttribute('data-cursor-mode') ?? 'cross') as 'cross' | 'dot' | 'arrow';
      opts.setCursorMode(m);
      pickTool('cursor');
      return;
    }
    const cmd = (ev.target as HTMLElement).closest<HTMLElement>('[data-rail-cmd]');
    if (cmd) {
      const c = cmd.getAttribute('data-rail-cmd');
      if (c === 'zoom-in') opts.onZoomIn();
      else if (c === 'zoom-out') opts.onZoomOut();
      else if (c === 'fit') opts.onFit();
      else if (c === 'magnet-on') {
        opts.setMagnet(true);
        renderRail();
      } else if (c === 'magnet-off') {
        opts.setMagnet(false);
        renderRail();
      }
      closeFlyout();
      return;
    }
    const row = (ev.target as HTMLElement).closest<HTMLElement>('#rail-flyout [data-tool]');
    if (!row) return;
    const tool = row.getAttribute('data-tool') as Tool | null;
    if (tool) pickTool(tool);
  });

  opts.favBar.addEventListener('click', (ev) => {
    if ((ev.target as HTMLElement).closest('#fav-collapse')) {
      ev.preventDefault();
      ev.stopPropagation();
      fav.collapsed = !fav.collapsed;
      saveFav(fav);
      renderFav();
      return;
    }
    if ((ev.target as HTMLElement).closest('.fav-handle')) return;
    const btn = (ev.target as HTMLElement).closest<HTMLElement>('[data-tool]');
    const tool = btn?.getAttribute('data-tool') as Tool | null;
    if (tool) pickTool(tool);
  });

  let drag: { dx: number; dy: number } | null = null;
  opts.favBar.addEventListener('mousedown', (ev) => {
    if (!(ev.target as HTMLElement).closest('.fav-handle')) return;
    ev.preventDefault();
    const box = opts.favBar.getBoundingClientRect();
    const parent = opts.favBar.offsetParent as HTMLElement | null;
    const prect = parent?.getBoundingClientRect() ?? { left: 0, top: 0 };
    drag = { dx: ev.clientX - box.left + prect.left, dy: ev.clientY - box.top + prect.top };
    // simpler: store pointer offset within parent
    drag = { dx: ev.clientX - (prect.left + fav.x), dy: ev.clientY - (prect.top + fav.y) };
  });
  window.addEventListener('mousemove', (ev) => {
    if (!drag) return;
    const parent = opts.favBar.offsetParent as HTMLElement | null;
    const prect = parent?.getBoundingClientRect() ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    const maxX = Math.max(0, (parent?.clientWidth ?? window.innerWidth) - opts.favBar.offsetWidth);
    const maxY = Math.max(0, (parent?.clientHeight ?? window.innerHeight) - opts.favBar.offsetHeight);
    fav.x = Math.min(maxX, Math.max(0, ev.clientX - prect.left - drag.dx));
    fav.y = Math.min(maxY, Math.max(0, ev.clientY - prect.top - drag.dy));
    opts.favBar.style.left = `${fav.x}px`;
    opts.favBar.style.top = `${fav.y}px`;
  });
  window.addEventListener('mouseup', () => {
    if (!drag) return;
    drag = null;
    persistFav();
  });

  document.addEventListener('mousedown', (ev) => {
    if (opts.flyout.hidden) return;
    const t = ev.target as Node;
    if (opts.flyout.contains(t) || opts.rail.contains(t)) return;
    closeFlyout();
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !opts.flyout.hidden) {
      ev.preventDefault();
      closeFlyout();
    }
  });

  window.addEventListener('resize', () => {
    if (!favPlaced) centerFavIfNeeded();
  });

  renderRail();
  renderFav();
  onLangChange(() => {
    renderRail();
    renderFav();
    if (openMenu) {
      const caret = opts.rail.querySelector<HTMLElement>(`[data-rail-caret="${openMenu}"]`);
      if (!caret) return;
      if (openMenu === 'zoom' || openMenu === 'magnet') openActionMenu(openMenu, caret);
      else openGroupMenu(openMenu, caret);
    }
  });

  return {
    setActive,
    refreshActions: () => renderRail(),
    refreshHistory: () => {
      const u = opts.rail.querySelector<HTMLButtonElement>('#rail-undo');
      const r = opts.rail.querySelector<HTMLButtonElement>('#rail-redo');
      if (u) u.disabled = !opts.canUndo();
      if (r) r.disabled = !opts.canRedo();
    },
    closeFlyout,
  };
}
