// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Swapwick contributors

/** DEX side panel for the XRP Ledger and Xahau: book, depth, trade, swap, AMM and account. */

import { t, onLangChange } from '../i18n';
import { escapeHtml } from '../html';
import { ledgerRpc } from '../sources/ledger-rpc';
import { amountValue, getDexNetwork, type LedgerAmount } from '../sources/dex-networks';
import { lookupDexPair } from '../sources/dex';
import { CLASSIC_ADDRESS_RE, decodeXrplCurrency, type DexPairRef } from '../sources/ledger-tokens';
import { depthCurve, estimateFill, fetchOrderBook, groupLevels, spread, type OrderBook } from './book';
import { fetchAccount, fetchHistory, fetchOpenOffers, findPath, type AccountSnapshot } from './account';
import {
  NATIVE,
  amount as ledgerAmount,
  buildAmmDeposit,
  buildAmmWithdraw,
  buildCancel,
  buildOffer,
  buildSwap,
  buildTrustSet,
  explorerAccountUrl,
  explorerTxUrl,
  isNative,
  withLastLedger,
  type Asset,
  type LedgerId,
  type TxJson,
} from './tx';
import { connectXaman, disconnectXaman, initXaman, onXamanChange, signWithXaman, xamanState } from './xaman';
import { xahauTokenInfo } from './xahau-pairs';
import { lookalikeWarning, type IssuerFlags } from './issuers';

type Tab = 'book' | 'trade' | 'swap' | 'amm' | 'account';

const WATCH_KEY = 'opencharts:dex-watch-address';

function fmt(n: number | null | undefined, digits = 6): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return Number(n.toPrecision(digits)).toString();
}

function short(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function code(asset: Asset): string {
  return decodeXrplCurrency(asset.currency);
}

function num(el: HTMLInputElement | null): number {
  const v = Number(String(el?.value ?? '').replace(',', '.'));
  return Number.isFinite(v) ? v : NaN;
}

export interface DexPanelApi {
  setPair(sourceId: string, pairId: string): void;
  setVisible(on: boolean): void;
}

export function initDexPanel(root: HTMLElement, opts: { onNetwork: (ledger: LedgerId) => void }): DexPanelApi {
  let ledger: LedgerId = 'xrpl';
  let pair: DexPairRef | null = null;
  let base: Asset = { currency: 'XRP' };
  let quote: Asset = { currency: 'RLUSD' };
  let tab: Tab = 'book';
  let book: OrderBook | null = null;
  let bookErr = '';
  let visible = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let account: AccountSnapshot | null = null;
  let accountErr = '';
  let flags: IssuerFlags[] = [];
  let side: 'buy' | 'sell' = 'buy';
  let orderType: 'limit' | 'market' = 'limit';
  let preview: { tx: TxJson; summary: string[]; warn: string[] } | null = null;
  let signNote = '';
  let amm: { reserveA: number; reserveB: number; lpSupply: number; lpCurrency: string; lpIssuer: string; fee: number; account: string } | null = null;
  let ammErr = '';
  let pairSeq = 0;

  root.innerHTML = `
    <div class="dex-head">
      <div class="dex-net" role="tablist" aria-label="Ledger">
        <button type="button" role="tab" data-dex-net="xrpl">XRPL</button>
        <button type="button" role="tab" data-dex-net="xahau">Xahau</button>
      </div>
      <button type="button" id="xaman-btn" class="xaman-btn" disabled></button>
    </div>
    <div class="dex-pair" id="dex-pair"></div>
    <div class="dex-tabs" role="tablist">
      <button type="button" role="tab" data-dex-tab="book"></button>
      <button type="button" role="tab" data-dex-tab="trade"></button>
      <button type="button" role="tab" data-dex-tab="swap"></button>
      <button type="button" role="tab" data-dex-tab="amm"></button>
      <button type="button" role="tab" data-dex-tab="account"></button>
    </div>
    <div class="dex-body" id="dex-body"></div>
    <p class="dex-foot" id="dex-foot"></p>`;

  const body = root.querySelector<HTMLElement>('#dex-body')!;
  const pairEl = root.querySelector<HTMLElement>('#dex-pair')!;
  const xamanBtn = root.querySelector<HTMLButtonElement>('#xaman-btn')!;
  const foot = root.querySelector<HTMLElement>('#dex-foot')!;

  function watchAddress(): string {
    return xamanState().account ?? localStorage.getItem(WATCH_KEY) ?? '';
  }

  function paintStatic(): void {
    root.querySelectorAll<HTMLElement>('[data-dex-net]').forEach((b) => {
      const on = b.dataset.dexNet === ledger;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const labels: Record<Tab, string> = { book: t('dex.tabBook'), trade: t('dex.tabTrade'), swap: t('dex.tabSwap'), amm: 'AMM', account: t('dex.tabAccount') };
    root.querySelectorAll<HTMLButtonElement>('[data-dex-tab]').forEach((b) => {
      const id = b.dataset.dexTab as Tab;
      b.textContent = labels[id];
      b.hidden = id === 'amm' && ledger !== 'xrpl';
      b.classList.toggle('is-active', id === tab);
      b.setAttribute('aria-selected', id === tab ? 'true' : 'false');
    });
    foot.textContent = t('dex.footNote');
    paintXaman();
  }

  function paintXaman(): void {
    const s = xamanState();
    xamanBtn.classList.toggle('is-connected', Boolean(s.account));
    if (!s.configured) {
      xamanBtn.disabled = true;
      xamanBtn.textContent = t('dex.connect');
      xamanBtn.title = t('dex.xamanNotReady');
    } else if (s.account) {
      xamanBtn.disabled = false;
      xamanBtn.textContent = short(s.account);
      xamanBtn.title = t('dex.disconnect');
    } else {
      xamanBtn.disabled = s.busy;
      xamanBtn.textContent = t('dex.connect');
      xamanBtn.title = t('dex.connect');
    }
  }

  function paintPair(): void {
    if (!pair) {
      pairEl.innerHTML = `<span class="dex-muted">${escapeHtml(t('dex.pickPair'))}</span>`;
      return;
    }
    const badges: string[] = [];
    for (const f of flags) {
      const tok = f.issuer === base.issuer ? code(base) : code(quote);
      const parts: string[] = [];
      if (f.verified) parts.push(`<span class="dex-badge ok">${escapeHtml(t('dex.verified'))}</span>`);
      if (f.domain) parts.push(`<span class="dex-badge">${escapeHtml(f.domain)}</span>`);
      if (f.blackholed) parts.push(`<span class="dex-badge ok">${escapeHtml(t('dex.blackholed'))}</span>`);
      if (f.globalFreeze) parts.push(`<span class="dex-badge bad">${escapeHtml(t('dex.frozen'))}</span>`);
      if (f.clawback) parts.push(`<span class="dex-badge warn">${escapeHtml(t('dex.clawback'))}</span>`);
      if (f.requireAuth) parts.push(`<span class="dex-badge warn">${escapeHtml(t('dex.requireAuth'))}</span>`);
      if (f.hooks) parts.push(`<span class="dex-badge warn">Hook</span>`);
      if (f.holders) parts.push(`<span class="dex-badge">${escapeHtml(t('dex.holders', { n: fmt(f.holders) }))}</span>`);
      const warn = f.lookalike ? `<p class="dex-warn" role="note">${escapeHtml(t('dex.lookalike', { code: tok }))}</p>` : '';
      badges.push(
        `<div class="dex-issuer"><span class="dex-muted">${escapeHtml(tok)} · <a href="${explorerAccountUrl(ledger, f.issuer)}" target="_blank" rel="noopener noreferrer">${escapeHtml(short(f.issuer))}</a></span> ${parts.join(' ')}</div>${warn}`,
      );
    }
    pairEl.innerHTML = `<strong>${escapeHtml(code(base))}/${escapeHtml(code(quote))}</strong> <span class="dex-muted">${ledger === 'xahau' ? 'Xahau' : 'XRPL'}</span>${badges.join('')}`;
  }

  /* ---------------- data ---------------- */

  async function resolveAssets(ref: DexPairRef): Promise<{ base: Asset; quote: Asset }> {
    const native = NATIVE[ref.networkId === 'xahau' ? 'xahau' : 'xrpl'];
    const side = (cur: string, issuer?: string): Asset => (!issuer && (cur === native || cur === 'XRP' || cur === 'XAH') ? { currency: native } : { currency: cur, issuer });
    if (ref.kind === 'amm' && ref.account && (ref.quote === 'QUOTE' || !ref.quoteIssuer && !ref.baseIssuer)) {
      const net = getDexNetwork('xrpl')!;
      const info = await ledgerRpc<{ amm?: { amount?: LedgerAmount; amount2?: LedgerAmount } }>(net, 'amm_info', { amm_account: ref.account, ledger_index: 'validated' });
      const a = amountValue(info.amm?.amount, 'XRP');
      const b = amountValue(info.amm?.amount2, 'XRP');
      const rawA = info.amm?.amount;
      const rawB = info.amm?.amount2;
      const assetOf = (raw: LedgerAmount | undefined, v: typeof a): Asset =>
        typeof raw === 'string' || !raw ? { currency: 'XRP' } : { currency: raw.currency, issuer: raw.issuer ?? v?.issuer };
      return { base: assetOf(rawA, a), quote: assetOf(rawB, b) };
    }
    return { base: side(ref.base, ref.baseIssuer), quote: side(ref.quote, ref.quoteIssuer) };
  }

  async function loadIssuerFlags(seq: number): Promise<void> {
    const net = getDexNetwork(ledger);
    if (!net) return;
    const tokens = [base, quote].filter((a) => a.issuer) as Array<Required<Asset>>;
    const out: IssuerFlags[] = [];
    for (const tok of tokens) {
      const f: IssuerFlags = { issuer: tok.issuer, globalFreeze: false, clawback: false, requireAuth: false, blackholed: false, hooks: false, lookalike: lookalikeWarning(tok.currency, tok.issuer) };
      const meta = ledger === 'xahau' ? xahauTokenInfo(tok.currency, tok.issuer) : undefined;
      if (meta) {
        f.verified = meta.verified;
        f.blackholed = meta.blackholed;
        f.holders = meta.holders;
      }
      try {
        const info = await ledgerRpc<{ account_data?: Record<string, unknown> }>(net, 'account_info', { account: tok.issuer, ledger_index: 'validated' });
        const d = info.account_data ?? {};
        const fl = Number(d.Flags ?? 0);
        f.globalFreeze = Boolean(fl & 0x00400000);
        f.requireAuth = Boolean(fl & 0x00040000);
        f.clawback = Boolean(fl & 0x80000000);
        // Master key disabled and no regular key: nobody can sign for the issuer again.
        if (fl & 0x00100000 && !d.RegularKey) f.blackholed = true;
        if (typeof d.Domain === 'string' && d.Domain) {
          try {
            f.domain = decodeURIComponent(d.Domain.replace(/[0-9A-F]{2}/gi, '%$&')).slice(0, 48);
          } catch {
            /* ignore undecodable domain */
          }
        }
        f.hooks = Boolean(d.HookNamespaces || d.HookStateCount);
      } catch {
        /* flags stay unknown */
      }
      out.push(f);
    }
    if (seq !== pairSeq) return;
    flags = out;
    paintPair();
  }

  async function loadBook(): Promise<void> {
    const seq = pairSeq;
    try {
      const next = await fetchOrderBook(ledger, base, quote);
      if (seq !== pairSeq) return;
      book = next;
      bookErr = '';
    } catch (err) {
      if (seq !== pairSeq) return;
      bookErr = err instanceof Error ? err.message : String(err);
    }
    if (tab === 'book' || tab === 'trade') render();
  }

  async function loadAccount(): Promise<void> {
    const addr = watchAddress();
    if (!CLASSIC_ADDRESS_RE.test(addr)) {
      account = null;
      return;
    }
    try {
      account = await fetchAccount(ledger, addr);
      accountErr = '';
    } catch (err) {
      account = null;
      accountErr = err instanceof Error ? err.message : String(err);
    }
  }

  async function loadAmm(): Promise<void> {
    amm = null;
    ammErr = '';
    if (ledger !== 'xrpl') return;
    const net = getDexNetwork('xrpl')!;
    const spec = (a: Asset) => (isNative(a, 'xrpl') ? { currency: 'XRP' } : { currency: ledgerAmountCurrency(a), issuer: a.issuer });
    try {
      const res = await ledgerRpc<{ amm?: { account?: string; amount?: LedgerAmount; amount2?: LedgerAmount; lp_token?: { currency: string; issuer: string; value: string }; trading_fee?: number } }>(net, 'amm_info', {
        asset: spec(base),
        asset2: spec(quote),
        ledger_index: 'validated',
      });
      const a = amountValue(res.amm?.amount, 'XRP');
      const b = amountValue(res.amm?.amount2, 'XRP');
      if (!res.amm || !a || !b || !res.amm.lp_token) throw new Error(t('dex.noPool'));
      const flipped = decodeXrplCurrency(a.currency).toUpperCase() !== code(base).toUpperCase();
      amm = {
        reserveA: flipped ? b.value : a.value,
        reserveB: flipped ? a.value : b.value,
        lpSupply: Number(res.amm.lp_token.value),
        lpCurrency: res.amm.lp_token.currency,
        lpIssuer: res.amm.lp_token.issuer,
        fee: Number(res.amm.trading_fee ?? 0) / 1000,
        account: String(res.amm.account ?? ''),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ammErr = /actNotFound|ammNotFound|not found/i.test(msg) ? t('dex.noPool') : msg;
    }
  }

  function ledgerAmountCurrency(a: Asset): string {
    const amt = ledgerAmount(a, 1, 'xrpl');
    return typeof amt === 'string' ? 'XRP' : amt.currency;
  }

  function startPolling(): void {
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      if (!visible || document.hidden) return;
      if (tab === 'book' || tab === 'trade') void loadBook();
    }, 8000);
  }

  /* ---------------- rendering ---------------- */

  function bookHtml(): string {
    if (!book) return `<p class="dex-muted">${escapeHtml(bookErr || t('dex.loading'))}</p>`;
    const asks = groupLevels(book.asks, 12).reverse();
    const bids = groupLevels(book.bids, 12);
    const max = Math.max(1, ...asks.map((l) => l.size), ...bids.map((l) => l.size));
    const row = (l: { price: number; size: number }, kind: 'ask' | 'bid') =>
      `<button type="button" class="dex-lvl ${kind}" data-price="${l.price}" style="--w:${Math.round((l.size / max) * 100)}%"><span>${fmt(l.price)}</span><span>${fmt(l.size)}</span><span>${fmt(l.price * l.size)}</span></button>`;
    const s = spread(book);
    const empty = !book.asks.length && !book.bids.length ? `<p class="dex-muted">${escapeHtml(t('dex.emptyBook'))}</p>` : '';
    return `<div class="dex-book">
      <div class="dex-lvl head"><span>${escapeHtml(t('dex.price'))} (${escapeHtml(code(quote))})</span><span>${escapeHtml(t('dex.size'))} (${escapeHtml(code(base))})</span><span>${escapeHtml(t('dex.total'))}</span></div>
      ${asks.map((l) => row(l, 'ask')).join('')}
      <div class="dex-spread">${escapeHtml(t('dex.spread'))}: ${s.pct != null ? `${s.pct.toFixed(3)}%` : '—'} · ${escapeHtml(t('dex.bid'))} ${fmt(s.bid)} · ${escapeHtml(t('dex.ask'))} ${fmt(s.ask)}</div>
      ${bids.map((l) => row(l, 'bid')).join('')}
      ${empty}
    </div>
    <canvas id="dex-depth" class="dex-depth" width="320" height="140" aria-label="${escapeHtml(t('dex.depth'))}"></canvas>`;
  }

  function drawDepth(): void {
    const canvas = body.querySelector<HTMLCanvasElement>('#dex-depth');
    if (!canvas || !book) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 320;
    const h = canvas.clientHeight || 140;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const curve = depthCurve(book, 0.25);
    if (curve.mid == null || (!curve.bids.length && !curve.asks.length)) return;
    const prices = [...curve.bids.map((p) => p[0]), ...curve.asks.map((p) => p[0])];
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    const top = Math.max(...curve.bids.map((p) => p[1]), ...curve.asks.map((p) => p[1]), 1e-12);
    const x = (p: number) => (hi === lo ? w / 2 : ((p - lo) / (hi - lo)) * (w - 8) + 4);
    const y = (v: number) => h - 14 - (v / top) * (h - 22);
    const style = getComputedStyle(root);
    const area = (pts: Array<[number, number]>, color: string, fromMid: boolean) => {
      if (!pts.length) return;
      ctx.beginPath();
      ctx.moveTo(x(curve.mid!), h - 14);
      let prev = 0;
      for (const [p, v] of pts) {
        ctx.lineTo(x(p), y(prev));
        ctx.lineTo(x(p), y(v));
        prev = v;
      }
      const end = fromMid ? lo : hi;
      ctx.lineTo(x(end), y(prev));
      ctx.lineTo(x(end), h - 14);
      ctx.closePath();
      ctx.fillStyle = `${color}33`;
      ctx.strokeStyle = color;
      ctx.fill();
      ctx.stroke();
    };
    area(curve.bids, style.getPropertyValue('--up').trim() || '#26a69a', true);
    area(curve.asks, style.getPropertyValue('--down').trim() || '#ef5350', false);
    ctx.fillStyle = style.getPropertyValue('--muted').trim() || '#888';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(fmt(lo), 4, h - 2);
    const midText = fmt(curve.mid);
    ctx.fillText(midText, w / 2 - ctx.measureText(midText).width / 2, h - 2);
    const hiText = fmt(hi);
    ctx.fillText(hiText, w - 4 - ctx.measureText(hiText).width, h - 2);
  }

  function balanceOf(a: Asset): number | null {
    if (!account) return null;
    if (isNative(a, ledger)) return Math.max(0, account.native - account.reserve);
    const line = account.lines.find((l) => l.issuer === a.issuer && decodeXrplCurrency(l.currency).toUpperCase() === code(a).toUpperCase());
    return line ? line.value : 0;
  }

  function hasLine(a: Asset): boolean {
    if (isNative(a, ledger) || !account) return true;
    return account.lines.some((l) => l.issuer === a.issuer && decodeXrplCurrency(l.currency).toUpperCase() === code(a).toUpperCase());
  }

  function previewHtml(): string {
    if (!preview) return signNote ? `<p class="dex-note" role="status">${signNote}</p>` : '';
    const s = xamanState();
    const signLabel = !s.configured ? t('dex.xamanNotReady') : !s.account ? t('dex.connectFirst') : t('dex.sign');
    return `<div class="dex-preview" role="region" aria-label="${escapeHtml(t('dex.preview'))}">
      <h3>${escapeHtml(t('dex.preview'))}</h3>
      <ul>${preview.summary.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>
      ${preview.warn.map((w) => `<p class="dex-warn">${escapeHtml(w)}</p>`).join('')}
      <details><summary>JSON</summary><pre>${escapeHtml(JSON.stringify(preview.tx, null, 2))}</pre></details>
      <button type="button" class="dex-sign" data-dex-sign ${s.configured && s.account ? '' : 'disabled'}>${escapeHtml(signLabel)}</button>
      ${signNote ? `<p class="dex-note">${signNote}</p>` : ''}
    </div>`;
  }

  function accountAddressForTx(): string {
    return xamanState().account ?? watchAddress() ?? '';
  }

  function tradeHtml(): string {
    const bal = (a: Asset) => {
      const v = balanceOf(a);
      return v == null ? '' : `<span class="dex-muted">${escapeHtml(t('dex.available'))}: ${fmt(v)} ${escapeHtml(code(a))}</span>`;
    };
    const s = book ? spread(book) : { bid: null, ask: null };
    const ref = side === 'buy' ? s.ask : s.bid;
    return `<form class="dex-form" data-dex-form="trade" novalidate>
      <div class="dex-seg"><button type="button" data-side="buy" class="${side === 'buy' ? 'is-active buy' : ''}">${escapeHtml(t('dex.buy'))} ${escapeHtml(code(base))}</button><button type="button" data-side="sell" class="${side === 'sell' ? 'is-active sell' : ''}">${escapeHtml(t('dex.sell'))} ${escapeHtml(code(base))}</button></div>
      <div class="dex-seg small"><button type="button" data-otype="limit" class="${orderType === 'limit' ? 'is-active' : ''}">${escapeHtml(t('dex.limit'))}</button><button type="button" data-otype="market" class="${orderType === 'market' ? 'is-active' : ''}">${escapeHtml(t('dex.market'))}</button></div>
      ${orderType === 'limit'
        ? `<label>${escapeHtml(t('dex.price'))} (${escapeHtml(code(quote))}) <input name="price" inputmode="decimal" autocomplete="off" value="${ref != null ? fmt(ref, 8) : ''}" /></label>`
        : `<label>${escapeHtml(t('dex.slippage'))} (%) <input name="slip" inputmode="decimal" value="1" /></label>`}
      <label>${escapeHtml(t('dex.size'))} (${escapeHtml(code(base))}) <input name="size" inputmode="decimal" autocomplete="off" /></label>
      <p class="dex-est" data-dex-est></p>
      ${side === 'buy' ? bal(quote) : bal(base)}
      <button type="submit" class="dex-go ${side}">${escapeHtml(t('dex.review'))}</button>
    </form>${previewHtml()}`;
  }

  function swapAssets(): Asset[] {
    const list: Asset[] = [{ currency: NATIVE[ledger] }];
    for (const a of [base, quote]) if (!isNative(a, ledger)) list.push(a);
    if (account) for (const l of account.lines) if (l.value > 0 && !list.some((x) => x.issuer === l.issuer && x.currency === l.currency)) list.push({ currency: l.currency, issuer: l.issuer });
    return list;
  }

  function assetKey(a: Asset): string {
    return a.issuer ? `${a.currency}.${a.issuer}` : a.currency;
  }

  function assetFromKey(key: string): Asset {
    const [currency, issuer] = key.split('.');
    return issuer ? { currency: currency!, issuer } : { currency: currency! };
  }

  function swapHtml(): string {
    const list = swapAssets();
    const opt = (a: Asset, sel: boolean) => `<option value="${escapeHtml(assetKey(a))}"${sel ? ' selected' : ''}>${escapeHtml(code(a))}${a.issuer ? ` · ${escapeHtml(short(a.issuer))}` : ''}</option>`;
    return `<form class="dex-form" data-dex-form="swap" novalidate>
      <label>${escapeHtml(t('dex.from'))} <select name="from">${list.map((a) => opt(a, assetKey(a) === assetKey(quote))).join('')}</select></label>
      <label>${escapeHtml(t('dex.to'))} <select name="to">${list.map((a) => opt(a, assetKey(a) === assetKey(base))).join('')}</select></label>
      <label>${escapeHtml(t('dex.receive'))} <input name="receive" inputmode="decimal" autocomplete="off" /></label>
      <label>${escapeHtml(t('dex.slippage'))} (%) <input name="slip" inputmode="decimal" value="1" /></label>
      <p class="dex-muted">${escapeHtml(t('dex.swapNote'))}</p>
      <button type="submit" class="dex-go">${escapeHtml(t('dex.findRoute'))}</button>
    </form>${previewHtml()}`;
  }

  function ammHtml(): string {
    if (ledger !== 'xrpl') return `<p class="dex-muted">${escapeHtml(t('dex.noAmmXahau'))}</p>`;
    if (!amm && !ammErr) return `<p class="dex-muted">${escapeHtml(t('dex.loading'))}</p>`;
    if (!amm) return `<p class="dex-muted">${escapeHtml(ammErr)}</p>`;
    const price = amm.reserveA > 0 ? amm.reserveB / amm.reserveA : 0;
    const lp = account?.lines.find((l) => l.issuer === amm!.account && l.currency === amm!.lpCurrency)?.value ?? 0;
    const share = amm.lpSupply > 0 ? lp / amm.lpSupply : 0;
    return `<dl class="dex-dl">
      <dt>${escapeHtml(t('dex.pool'))}</dt><dd>${fmt(amm.reserveA)} ${escapeHtml(code(base))} + ${fmt(amm.reserveB)} ${escapeHtml(code(quote))}</dd>
      <dt>${escapeHtml(t('dex.price'))}</dt><dd>${fmt(price)} ${escapeHtml(code(quote))}</dd>
      <dt>${escapeHtml(t('dex.fee'))}</dt><dd>${amm.fee.toFixed(3)}%</dd>
      <dt>LP</dt><dd>${fmt(lp)} (${(share * 100).toFixed(4)}%)</dd>
    </dl>
    <form class="dex-form" data-dex-form="amm-deposit" novalidate>
      <h3>${escapeHtml(t('dex.deposit'))}</h3>
      <label>${escapeHtml(code(base))} <input name="a" inputmode="decimal" autocomplete="off" /></label>
      <label>${escapeHtml(code(quote))} <input name="b" inputmode="decimal" autocomplete="off" placeholder="${escapeHtml(t('dex.autoRatio'))}" /></label>
      <button type="submit" class="dex-go">${escapeHtml(t('dex.review'))}</button>
    </form>
    <form class="dex-form" data-dex-form="amm-withdraw" novalidate>
      <h3>${escapeHtml(t('dex.withdraw'))}</h3>
      <label>LP <input name="lp" inputmode="decimal" autocomplete="off" placeholder="${escapeHtml(t('dex.allLp'))}" /></label>
      <button type="submit" class="dex-go">${escapeHtml(t('dex.review'))}</button>
    </form>${previewHtml()}`;
  }

  let offersHtml = '';
  let historyHtml = '';

  function accountHtml(): string {
    const addr = watchAddress();
    const top = `<form class="dex-form dex-watch" data-dex-form="watch" novalidate>
      <label>${escapeHtml(t('dex.address'))} <input name="addr" value="${escapeHtml(addr)}" placeholder="r…" autocomplete="off" spellcheck="false" /></label>
      <button type="submit">${escapeHtml(t('dex.show'))}</button>
    </form>`;
    if (!CLASSIC_ADDRESS_RE.test(addr)) return `${top}<p class="dex-muted">${escapeHtml(t('dex.addressHint'))}</p>`;
    if (accountErr) return `${top}<p class="dex-warn">${escapeHtml(accountErr)}</p>`;
    if (!account) return `${top}<p class="dex-muted">${escapeHtml(t('dex.loading'))}</p>`;
    if (!account.exists) return `${top}<p class="dex-muted">${escapeHtml(t('dex.notActivated'))}</p>`;
    const lines = account.lines
      .map(
        (l) => `<tr><td>${escapeHtml(decodeXrplCurrency(l.currency))}<br><span class="dex-muted">${escapeHtml(short(l.issuer ?? ''))}</span></td><td>${fmt(l.value)}</td><td>${l.frozen ? `<span class="dex-badge bad">${escapeHtml(t('dex.frozen'))}</span>` : ''}${
          l.value === 0 ? `<button type="button" class="dex-mini" data-trust-remove="${escapeHtml(`${l.currency}.${l.issuer}`)}">${escapeHtml(t('dex.remove'))}</button>` : ''
        }</td></tr>`,
      )
      .join('');
    const need = [base, quote].filter((a) => !hasLine(a));
    const addLine = need
      .map((a) => `<button type="button" class="dex-mini" data-trust-add="${escapeHtml(assetKey(a))}">${escapeHtml(t('dex.addLine', { code: code(a) }))}</button>`)
      .join(' ');
    return `${top}
      <dl class="dex-dl">
        <dt>${escapeHtml(NATIVE[ledger])}</dt><dd>${fmt(account.native)} <span class="dex-muted">(${escapeHtml(t('dex.reserve'))} ${fmt(account.reserve)})</span></dd>
      </dl>
      <h3>${escapeHtml(t('dex.trustlines'))} (${account.lines.length})</h3>
      ${addLine ? `<p>${addLine}</p>` : ''}
      <table class="dex-table"><tbody>${lines || `<tr><td class="dex-muted">${escapeHtml(t('dex.none'))}</td></tr>`}</tbody></table>
      <h3>${escapeHtml(t('dex.openOrders'))}</h3>
      <div data-dex-offers>${offersHtml || `<p class="dex-muted">${escapeHtml(t('dex.loading'))}</p>`}</div>
      <h3>${escapeHtml(t('dex.history'))}</h3>
      <div data-dex-history>${historyHtml || `<p class="dex-muted">${escapeHtml(t('dex.loading'))}</p>`}</div>
      ${previewHtml()}`;
  }

  async function loadOffersAndHistory(): Promise<void> {
    const addr = watchAddress();
    if (!CLASSIC_ADDRESS_RE.test(addr) || !account?.exists) return;
    const [offers, history] = await Promise.allSettled([fetchOpenOffers(ledger, addr), fetchHistory(ledger, addr)]);
    if (offers.status === 'fulfilled') {
      offersHtml = offers.value.length
        ? `<table class="dex-table"><tbody>${offers.value
            .map(
              (o) => `<tr><td>${escapeHtml(t('dex.give'))} ${fmt(o.gets.value)} ${escapeHtml(decodeXrplCurrency(o.gets.currency))}<br>${escapeHtml(t('dex.get'))} ${fmt(o.pays.value)} ${escapeHtml(decodeXrplCurrency(o.pays.currency))}</td><td><button type="button" class="dex-mini" data-cancel="${o.seq}">${escapeHtml(t('dex.cancel'))}</button></td></tr>`,
            )
            .join('')}</tbody></table>`
        : `<p class="dex-muted">${escapeHtml(t('dex.none'))}</p>`;
    } else offersHtml = `<p class="dex-warn">${escapeHtml(String(offers.reason))}</p>`;
    if (history.status === 'fulfilled') {
      historyHtml = history.value.length
        ? `<table class="dex-table"><tbody>${history.value
            .map(
              (h) => `<tr><td>${escapeHtml(h.type)}<br><span class="dex-muted">${h.time ? new Date(h.time * 1000).toLocaleString() : ''}</span></td><td>${escapeHtml(h.summary)}</td><td class="${h.result === 'tesSUCCESS' ? 'ok' : 'bad'}"><a href="${explorerTxUrl(ledger, h.hash)}" target="_blank" rel="noopener noreferrer">${escapeHtml(h.result === 'tesSUCCESS' ? '✓' : h.result)}</a></td></tr>`,
            )
            .join('')}</tbody></table>`
        : `<p class="dex-muted">${escapeHtml(t('dex.none'))}</p>`;
    } else historyHtml = `<p class="dex-warn">${escapeHtml(String(history.reason))}</p>`;
    if (tab === 'account') render();
  }

  function render(): void {
    paintStatic();
    let html = '';
    if (tab === 'book') html = bookHtml();
    else if (tab === 'trade') html = tradeHtml();
    else if (tab === 'swap') html = swapHtml();
    else if (tab === 'amm') html = ammHtml();
    else html = accountHtml();
    // Keep what the user typed across refreshes of the same form.
    const kept = new Map<string, string>();
    body.querySelectorAll<HTMLInputElement | HTMLSelectElement>('form [name]').forEach((el) => kept.set(`${el.form?.dataset.dexForm}:${el.name}`, el.value));
    body.innerHTML = html;
    body.querySelectorAll<HTMLInputElement | HTMLSelectElement>('form [name]').forEach((el) => {
      const v = kept.get(`${el.form?.dataset.dexForm}:${el.name}`);
      if (v !== undefined && v !== '') el.value = v;
    });
    if (tab === 'book') drawDepth();
    if (tab === 'trade') updateEstimate();
  }

  function updateEstimate(): void {
    const form = body.querySelector<HTMLFormElement>('[data-dex-form="trade"]');
    const out = body.querySelector<HTMLElement>('[data-dex-est]');
    if (!form || !out) return;
    const size = num(form.querySelector('[name="size"]'));
    if (!(size > 0)) {
      out.textContent = '';
      return;
    }
    if (orderType === 'limit') {
      const price = num(form.querySelector('[name="price"]'));
      out.textContent = price > 0 ? `${t('dex.total')}: ${fmt(size * price)} ${code(quote)}` : '';
      return;
    }
    const fill = book ? estimateFill(book, side, size) : null;
    out.textContent = fill
      ? `≈ ${fmt(fill.cost)} ${code(quote)} · ${t('dex.avgPrice')} ${fmt(fill.avgPrice)}${fill.partial ? ` · ${t('dex.partial', { n: fmt(fill.filled) })}` : ''}`
      : t('dex.emptyBook');
  }

  /* ---------------- previews ---------------- */

  function requireAccount(): string | null {
    const addr = accountAddressForTx();
    if (!CLASSIC_ADDRESS_RE.test(addr)) {
      preview = null;
      signNote = escapeHtml(t('dex.needAddress'));
      render();
      return null;
    }
    return addr;
  }

  function setPreview(tx: TxJson, summary: string[], warn: string[] = []): void {
    for (const a of [base, quote]) if (!hasLine(a) && /OfferCreate|Payment|AMMDeposit/.test(tx.TransactionType)) warn.push(t('dex.needLine', { code: code(a) }));
    if (ledger === 'xahau') summary.push(t('dex.netXahau'));
    preview = { tx, summary, warn };
    signNote = '';
    render();
    body.querySelector('.dex-preview')?.scrollIntoView({ block: 'nearest' });
  }

  function previewTrade(form: HTMLFormElement): void {
    const addr = requireAccount();
    if (!addr) return;
    const size = num(form.querySelector('[name="size"]'));
    let price: number;
    const warn: string[] = [];
    if (orderType === 'limit') price = num(form.querySelector('[name="price"]'));
    else {
      const slip = Math.max(0, Math.min(50, num(form.querySelector('[name="slip"]')) || 1)) / 100;
      const fill = book ? estimateFill(book, side, size) : null;
      if (!fill) {
        signNote = escapeHtml(t('dex.emptyBook'));
        render();
        return;
      }
      if (fill.partial) warn.push(t('dex.partial', { n: fmt(fill.filled) }));
      price = side === 'buy' ? fill.worstPrice * (1 + slip) : fill.worstPrice * (1 - slip);
    }
    try {
      const tx = buildOffer({ ledger, account: addr, side, base, quote, size, price, type: orderType });
      const verb = side === 'buy' ? t('dex.buy') : t('dex.sell');
      setPreview(
        tx,
        [
          `${verb} ${fmt(size)} ${code(base)} ${orderType === 'market' ? t('dex.market').toLowerCase() : t('dex.limit').toLowerCase()}`,
          `${orderType === 'market' ? t('dex.worstPrice') : t('dex.price')}: ${fmt(price)} ${code(quote)}`,
          `${side === 'buy' ? t('dex.youPayMax') : t('dex.youGetMin')}: ${fmt(size * price)} ${code(quote)}`,
          orderType === 'limit' ? t('dex.limitNote') : t('dex.marketNote'),
          t('dex.feeNote'),
        ],
        warn,
      );
    } catch (err) {
      signNote = escapeHtml(err instanceof Error ? err.message : String(err));
      render();
    }
  }

  async function previewSwap(form: HTMLFormElement): Promise<void> {
    const addr = requireAccount();
    if (!addr) return;
    const from = assetFromKey(form.querySelector<HTMLSelectElement>('[name="from"]')!.value);
    const to = assetFromKey(form.querySelector<HTMLSelectElement>('[name="to"]')!.value);
    const receive = num(form.querySelector('[name="receive"]'));
    const slip = Math.max(0, Math.min(50, num(form.querySelector('[name="slip"]')) || 1)) / 100;
    if (assetKey(from) === assetKey(to) || !(receive > 0)) {
      signNote = escapeHtml(t('dex.badSwap'));
      render();
      return;
    }
    signNote = escapeHtml(t('dex.findingRoute'));
    preview = null;
    render();
    try {
      const quoteRes = await findPath(ledger, addr, isNative(from, ledger) ? { currency: NATIVE[ledger] } : { currency: ledgerAmountCurrencyOn(from), issuer: from.issuer }, ledgerAmount(to, receive, ledger));
      if (!quoteRes) throw new Error(t('dex.noRoute'));
      const sendMax = quoteRes.sourceAmount * (1 + slip);
      const tx = buildSwap({ ledger, account: addr, from, to, receive, sendMax, paths: quoteRes.paths });
      setPreview(tx, [
        `${t('dex.receive')}: ${fmt(receive)} ${code(to)}`,
        `${t('dex.estimate')}: ${fmt(quoteRes.sourceAmount)} ${code(from)}`,
        `${t('dex.youPayMax')}: ${fmt(sendMax)} ${code(from)}`,
        t('dex.routeNote', { n: quoteRes.paths.length }),
        t('dex.feeNote'),
      ]);
    } catch (err) {
      preview = null;
      const msg = err instanceof Error ? err.message : String(err);
      signNote = escapeHtml(/actNotFound/i.test(msg) ? t('dex.notActivated') : msg);
      render();
    }
  }

  function ledgerAmountCurrencyOn(a: Asset): string {
    const amt = ledgerAmount(a, 1, ledger);
    return typeof amt === 'string' ? NATIVE[ledger] : amt.currency;
  }

  function previewDeposit(form: HTMLFormElement): void {
    const addr = requireAccount();
    if (!addr || !amm) return;
    const a = num(form.querySelector('[name="a"]'));
    let b = num(form.querySelector('[name="b"]'));
    if (!(a > 0)) return;
    if (!(b > 0)) b = amm.reserveA > 0 ? (a * amm.reserveB) / amm.reserveA : NaN;
    try {
      const tx = buildAmmDeposit(addr, base, quote, a, b);
      setPreview(tx, [`${t('dex.deposit')}: ${fmt(a)} ${code(base)} + ${fmt(b)} ${code(quote)}`, t('dex.ammNote'), t('dex.feeNote')]);
    } catch (err) {
      signNote = escapeHtml(err instanceof Error ? err.message : String(err));
      render();
    }
  }

  function previewWithdraw(form: HTMLFormElement): void {
    const addr = requireAccount();
    if (!addr || !amm) return;
    const lp = num(form.querySelector('[name="lp"]'));
    const tx = lp > 0 ? buildAmmWithdraw(addr, base, quote, { lpTokens: lp, lpCurrency: amm.lpCurrency, lpIssuer: amm.lpIssuer }) : buildAmmWithdraw(addr, base, quote, { all: true });
    setPreview(tx, [lp > 0 ? `${t('dex.withdraw')}: ${fmt(lp)} LP` : t('dex.withdrawAll'), t('dex.feeNote')]);
  }

  async function sign(): Promise<void> {
    if (!preview) return;
    const net = getDexNetwork(ledger)!;
    try {
      const led = await ledgerRpc<{ ledger_index?: number; ledger?: { ledger_index?: string | number } }>(net, 'ledger', { ledger_index: 'validated' });
      const idx = Number(led.ledger_index ?? led.ledger?.ledger_index);
      const tx = Number.isFinite(idx) ? withLastLedger(preview.tx, idx) : preview.tx;
      signNote = escapeHtml(t('dex.openXaman'));
      render();
      const res = await signWithXaman(ledger, tx, preview.summary[0] ?? 'Swapwick', (url) => {
        signNote = `${escapeHtml(t('dex.openXaman'))} <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Xaman</a>`;
        render();
      });
      if (!res.signed) signNote = escapeHtml(t('dex.rejected'));
      else {
        signNote = `${escapeHtml(t('dex.submitted'))}${res.txid ? ` <a href="${explorerTxUrl(ledger, res.txid)}" target="_blank" rel="noopener noreferrer">${escapeHtml(short(res.txid))}</a>` : ''}`;
        preview = null;
        void refreshAccount();
        void loadBook();
      }
    } catch (err) {
      signNote = escapeHtml(err instanceof Error ? err.message : String(err));
    }
    render();
  }

  async function refreshAccount(): Promise<void> {
    offersHtml = '';
    historyHtml = '';
    account = null;
    accountErr = '';
    if (tab === 'account') render();
    await loadAccount();
    render();
    void loadOffersAndHistory();
    if (tab === 'amm') {
      await loadAmm();
      render();
    }
  }

  /* ---------------- events ---------------- */

  root.addEventListener('click', (ev) => {
    const el = ev.target as HTMLElement;
    const net = el.closest<HTMLElement>('[data-dex-net]');
    if (net) {
      const id = net.dataset.dexNet as LedgerId;
      if (id !== ledger) opts.onNetwork(id);
      return;
    }
    const tb = el.closest<HTMLElement>('[data-dex-tab]');
    if (tb) {
      tab = tb.dataset.dexTab as Tab;
      preview = null;
      signNote = '';
      render();
      if (tab === 'book' || tab === 'trade') void loadBook();
      if (tab === 'account' || tab === 'swap' || tab === 'trade') void refreshAccount();
      if (tab === 'amm') {
        void loadAmm().then(render);
        void loadAccount().then(render);
      }
      return;
    }
    const sideBtn = el.closest<HTMLElement>('[data-side]');
    if (sideBtn) {
      side = sideBtn.dataset.side as 'buy' | 'sell';
      preview = null;
      render();
      return;
    }
    const ot = el.closest<HTMLElement>('[data-otype]');
    if (ot) {
      orderType = ot.dataset.otype as 'limit' | 'market';
      preview = null;
      render();
      return;
    }
    const lvl = el.closest<HTMLElement>('.dex-lvl[data-price]');
    if (lvl) {
      tab = 'trade';
      orderType = 'limit';
      side = lvl.classList.contains('ask') ? 'buy' : 'sell';
      render();
      const input = body.querySelector<HTMLInputElement>('[name="price"]');
      if (input) input.value = fmt(Number(lvl.dataset.price), 8);
      return;
    }
    if (el.closest('[data-dex-sign]')) {
      void sign();
      return;
    }
    const cancel = el.closest<HTMLElement>('[data-cancel]');
    if (cancel) {
      const addr = requireAccount();
      if (addr) setPreview(buildCancel(ledger, addr, Number(cancel.dataset.cancel)), [t('dex.cancelOrder', { n: cancel.dataset.cancel ?? '' }), t('dex.feeNote')]);
      return;
    }
    const add = el.closest<HTMLElement>('[data-trust-add]');
    if (add) {
      const addr = requireAccount();
      const a = assetFromKey(add.dataset.trustAdd!);
      if (addr) setPreview(buildTrustSet(ledger, addr, a, 1e15), [t('dex.addLine', { code: code(a) }), t('dex.reserveNote'), t('dex.feeNote')]);
      return;
    }
    const rm = el.closest<HTMLElement>('[data-trust-remove]');
    if (rm) {
      const addr = requireAccount();
      const a = assetFromKey(rm.dataset.trustRemove!);
      if (addr) setPreview(buildTrustSet(ledger, addr, a, 0), [t('dex.removeLine', { code: code(a) }), t('dex.feeNote')]);
    }
  });

  root.addEventListener('input', (ev) => {
    if ((ev.target as HTMLElement).closest('[data-dex-form="trade"]')) updateEstimate();
  });

  root.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const form = ev.target as HTMLFormElement;
    const kind = form.dataset.dexForm;
    if (kind === 'trade') previewTrade(form);
    else if (kind === 'swap') void previewSwap(form);
    else if (kind === 'amm-deposit') previewDeposit(form);
    else if (kind === 'amm-withdraw') previewWithdraw(form);
    else if (kind === 'watch') {
      const v = (form.querySelector<HTMLInputElement>('[name="addr"]')?.value ?? '').trim();
      if (v && !CLASSIC_ADDRESS_RE.test(v)) {
        accountErr = t('dex.badAddress');
        account = null;
        render();
        return;
      }
      if (v) localStorage.setItem(WATCH_KEY, v);
      else localStorage.removeItem(WATCH_KEY);
      accountErr = '';
      void refreshAccount();
    }
  });

  xamanBtn.addEventListener('click', () => {
    const s = xamanState();
    if (!s.configured) return;
    void (s.account ? disconnectXaman() : connectXaman()).catch((err) => {
      signNote = escapeHtml(err instanceof Error ? err.message : String(err));
      render();
    });
  });

  onXamanChange(() => {
    paintXaman();
    if (visible) void refreshAccount();
  });
  void initXaman();
  onLangChange(() => {
    if (visible) render();
  });

  return {
    setPair(sourceId: string, pairId: string): void {
      if (sourceId !== 'dex') return;
      const ref = lookupDexPair(pairId);
      if (!ref || (ref.networkId !== 'xrpl' && ref.networkId !== 'xahau')) return;
      if (pair?.id === ref.id) return;
      pair = ref;
      ledger = ref.networkId as LedgerId;
      if (ledger !== 'xrpl' && tab === 'amm') tab = 'book';
      pairSeq += 1;
      const seq = pairSeq;
      book = null;
      bookErr = '';
      flags = [];
      preview = null;
      signNote = '';
      amm = null;
      ammErr = '';
      render();
      void resolveAssets(ref)
        .then((assets) => {
          if (seq !== pairSeq) return;
          base = assets.base;
          quote = assets.quote;
          paintPair();
          void loadIssuerFlags(seq);
          if (visible) {
            void loadBook();
            void refreshAccount();
          }
        })
        .catch((err) => {
          bookErr = err instanceof Error ? err.message : String(err);
          render();
        });
      paintPair();
    },
    setVisible(on: boolean): void {
      visible = on;
      if (on) {
        startPolling();
        render();
        if (pair) {
          void loadBook();
          void refreshAccount();
        }
      } else if (timer) {
        clearInterval(timer);
        timer = undefined;
      }
    },
  };
}
