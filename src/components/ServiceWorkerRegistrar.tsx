'use client';

import { useEffect } from 'react';

/**
 * Registers `/sw.js` y, además, FUERZA que una versión nueva entre en la misma
 * visita.
 *
 * El service worker existía desde el principio pero nada llamaba a
 * `register()`, así que ZRNote no era una PWA instalable. Y una vez registrado,
 * tampoco se comprobaba si había una versión nueva ni se recargaba al activarla:
 * el usuario podía quedarse con la copia vieja cacheada (por ejemplo, la antigua
 * pantalla «sin conexión») hasta vaciar datos a mano. Ahora:
 *
 *   1. Al cargar se llama a `registration.update()` para comprobar YA si hay una
 *      versión nueva, en vez de esperar a la comprobación periódica del navegador.
 *   2. Cuando el nuevo worker toma el control (`controllerchange`) se recarga la
 *      página UNA vez, de modo que la app pasa a la versión nueva sola. El
 *      `sw.js` ya hace `skipWaiting()` + `clients.claim()`, así que esto cierra
 *      el círculo: desplegar algo llega al teléfono en la siguiente apertura con
 *      internet, sin pasos manuales.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    // A worker registered from a dev server caches build output that changes on
    // every save, which produces confusing stale-asset bugs.
    if (process.env.NODE_ENV !== 'production') return;

    // Sólo recargamos si YA había un worker controlando antes: en la primera
    // instalación `controllerchange` también se dispara, y recargar ahí sería un
    // parpadeo innecesario (y, sin la guarda, un bucle).
    const hadController = !!navigator.serviceWorker.controller;
    let refreshing = false;
    const onControllerChange = () => {
      if (!hadController || refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        // Comprueba YA si hay una versión nueva en vez de esperar a que el
        // navegador lo haga por su cuenta (puede tardar hasta 24 h).
        void reg.update().catch(() => {});
      } catch (err) {
        console.warn('[ZRNote] No se pudo registrar el service worker:', err);
      }
    };

    // Wait for load so registration never competes with the first paint.
    if (document.readyState === 'complete') void register();
    else window.addEventListener('load', register, { once: true });

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'retry-uploads') {
        window.dispatchEvent(new CustomEvent('zrnote:retry-uploads'));
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  return null;
}
