'use client';

import { useEffect } from 'react';

/**
 * Registers `/sw.js`.
 *
 * The service worker file has existed in `public/` since the beginning but
 * nothing ever called `register()`, so ZRNote was not an installable PWA at
 * all: Chrome on Android requires a registered worker with a fetch handler
 * before it offers a real install (as opposed to a plain shortcut). That
 * matters for recording — an installed app is treated as a proper app by the
 * system and its tab is much less likely to be discarded while the screen is
 * off.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    // A worker registered from a dev server caches build output that changes on
    // every save, which produces confusing stale-asset bugs.
    if (process.env.NODE_ENV !== 'production') return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('[ZRNote] No se pudo registrar el service worker:', err);
      });
    };

    // Wait for load so registration never competes with the first paint.
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}
