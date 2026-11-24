// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

export interface ChartMenuHandlers {
  resetView: () => void;
  copyPrice: (price: number) => void;
  addAlert: (price: number) => void;
  clearDrawings: () => void;
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
      alertItem.textContent = lastPrice === null ? 'Add alert at this price' : `Add alert at ${label}`;
      alertItem.toggleAttribute('disabled', lastPrice === null);
    }
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
    }
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
