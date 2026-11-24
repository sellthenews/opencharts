// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

export interface ChartMenuHandlers {
  resetView: () => void;
  copyPrice: (price: number) => void;
  addAlert: (price: number) => void;
  alertMenuLabel?: (price: number | null) => string;
  clearDrawings: () => void;
  exportDrawings?: () => void;
  importDrawings?: () => void;
  extendFib?: () => void;
  watchlistLabel?: () => string;
  isOnWatchlist?: () => boolean;
  toggleWatchlist?: () => void;
  canOpenSettings?: () => boolean;
  openSettings?: () => void;
}

function formatPrice(price: number): string {
  if (Math.abs(price) >= 1000) return price.toFixed(2);
  if (Math.abs(price) >= 1) return price.toFixed(4);
  return price.toFixed(6);
}

export function initChartMenu(
  wrap: HTMLElement,
  menu: HTMLElement,
  priceAt: (clientX: number, clientY: number) => number | null,
  handlers: ChartMenuHandlers,
): { close: () => void } {
  let lastPrice: number | null = null;

  function close(): void {
    menu.hidden = true;
  }

  function open(ev: MouseEvent): void {
    ev.preventDefault();
    lastPrice = priceAt(ev.clientX, ev.clientY);
    const priceItem = menu.querySelector<HTMLElement>('[data-chart-menu="copy-price"]');
    const alertItem = menu.querySelector<HTMLElement>('[data-chart-menu="add-alert"]');
    const label = lastPrice === null ? '—' : formatPrice(lastPrice);
    if (priceItem) {
      priceItem.textContent = lastPrice === null ? 'Copy price' : `Copy price (${label})`;
      priceItem.toggleAttribute('disabled', lastPrice === null);
    }
    if (alertItem) {
      alertItem.textContent = handlers.alertMenuLabel?.(lastPrice) ?? (lastPrice === null ? 'Add alert' : `Add alert at ${label}`);
      const disabled = lastPrice === null && !handlers.alertMenuLabel?.(lastPrice);
      alertItem.toggleAttribute('disabled', disabled);
    }
    const watchItem = menu.querySelector<HTMLElement>('[data-chart-menu="watchlist"]');
    if (watchItem) {
      const symbol = handlers.watchlistLabel?.() ?? 'symbol';
      const onList = handlers.isOnWatchlist?.() ?? false;
      watchItem.textContent = onList ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`;
    }
    const settingsItem = menu.querySelector<HTMLElement>('[data-chart-menu="settings"]');
    if (settingsItem) settingsItem.hidden = !handlers.canOpenSettings?.();
    menu.hidden = false;
    const pad = 8;
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    const x = Math.min(ev.clientX, window.innerWidth - w - pad);
    const y = Math.min(ev.clientY, window.innerHeight - h - pad);
    menu.style.left = `${Math.max(pad, x)}px`;
    menu.style.top = `${Math.max(pad, y)}px`;
  }

  wrap.addEventListener('contextmenu', (ev) => open(ev));

  menu.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('[data-chart-menu]');
    if (!btn || btn.hasAttribute('disabled')) return;
    const action = btn.dataset.chartMenu;
    if (action === 'reset') handlers.resetView();
    else if (action === 'copy-price' && lastPrice !== null) handlers.copyPrice(lastPrice);
    else if (action === 'add-alert' && lastPrice !== null) handlers.addAlert(lastPrice);
    else if (action === 'clear-drawings') {
      if (window.confirm('Remove all drawings from this chart?')) handlers.clearDrawings();
    } else if (action === 'export') handlers.exportDrawings?.();
    else if (action === 'import') handlers.importDrawings?.();
    else if (action === 'extend') handlers.extendFib?.();
    else if (action === 'watchlist') handlers.toggleWatchlist?.();
    else if (action === 'settings') handlers.openSettings?.();
    close();
  });

  document.addEventListener('mousedown', (ev) => {
    if (menu.hidden) return;
    if (!menu.contains(ev.target as Node)) close();
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !menu.hidden) {
      ev.preventDefault();
      close();
    }
  });

  window.addEventListener('blur', () => close());
  window.addEventListener('resize', () => close());

  return { close };
}
