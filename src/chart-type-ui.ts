// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

import { applyStaticDom, onLangChange, t } from './i18n';
import { CHART_TYPE_GROUPS, CHART_TYPE_LABEL, type ChartTypeId } from './chart-types';

export function syncChartTypeChrome(type: ChartTypeId): void {
  const btn = document.querySelector<HTMLButtonElement>('#chart-type-btn');
  if (btn) {
    const label = t(CHART_TYPE_LABEL[type]);
    btn.title = `${t('toolbar.chartTypeTitle')} — ${label}`;
    btn.setAttribute('aria-label', btn.title);
    btn.dataset.chartType = type;
  }
  document.querySelectorAll<HTMLButtonElement>('#chart-type-menu [data-chart-type]').forEach((el) => {
    const on = el.dataset.chartType === type;
    el.classList.toggle('is-active', on);
    el.setAttribute('aria-checked', on ? 'true' : 'false');
  });
}

export function fillChartTypeMenu(): void {
  const menu = document.querySelector<HTMLElement>('#chart-type-list');
  if (!menu) return;
  const parts: string[] = [];
  for (const group of CHART_TYPE_GROUPS) {
    parts.push(`<p class="chart-type-heading" data-i18n="${group.labelKey}"></p>`);
    parts.push('<div class="chart-type-grid" role="none">');
    for (const id of group.types) {
      parts.push(
        `<button type="button" role="menuitemradio" data-chart-type="${id}" data-i18n="${CHART_TYPE_LABEL[id]}"></button>`,
      );
    }
    parts.push('</div>');
  }
  menu.innerHTML = parts.join('');
  applyStaticDom(menu);
}

export function initChartTypeMenu(opts: { getType: () => ChartTypeId; setType: (type: ChartTypeId) => void }): void {
  const wrap = document.querySelector<HTMLElement>('#chart-type-wrap');
  const btn = document.querySelector<HTMLButtonElement>('#chart-type-btn');
  const menu = document.querySelector<HTMLElement>('#chart-type-menu');
  if (!wrap || !btn || !menu) return;

  fillChartTypeMenu();
  syncChartTypeChrome(opts.getType());

  const close = (): void => {
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  };

  const open = (): void => {
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
  };

  btn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (menu.hidden) open();
    else close();
  });

  menu.addEventListener('click', (ev) => {
    const target = ev.target as HTMLElement | null;
    if (target?.closest('[data-close-chart-type]')) {
      close();
      return;
    }
    const item = target?.closest<HTMLButtonElement>('[data-chart-type]');
    if (!item?.dataset.chartType) return;
    opts.setType(item.dataset.chartType as ChartTypeId);
    close();
  });

  document.addEventListener('pointerdown', (ev) => {
    if (menu.hidden) return;
    const node = ev.target as Node | null;
    if (node && wrap.contains(node)) return;
    close();
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !menu.hidden) close();
  });

  onLangChange(() => {
    applyStaticDom(menu);
    syncChartTypeChrome(opts.getType());
  });
}
