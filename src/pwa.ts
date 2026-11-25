// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 OpenCharts contributors

/** Register the production service worker and look for updates on focus. */
export function registerPwa(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  const start = (): void => {
    const script = new URL('sw.js', document.baseURI).href;
    void navigator.serviceWorker
      .register(script, { scope: './' })
      .then((reg) => {
        const check = async (): Promise<void> => {
          try {
            await fetch(new URL('version.json', document.baseURI).href, { cache: 'no-store' });
            await reg.update();
          } catch {
            /* offline or preview without version.json */
          }
        };
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void check();
        });
        void check();
      })
      .catch(() => {
        /* private mode, or a non-secure context */
      });
  };

  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start);
}
