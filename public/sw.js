// ZRNote — Service Worker
//
// Deliberately minimal. The previous version cached EVERY GET response into a
// single shared cache, including authenticated dashboard HTML and /api/
// responses. On a shared device that hands one user's meetings to the next, and
// it also served stale pages after every deploy. Recording needs the network
// anyway, so offline support is limited to static assets plus an offline page.
//
// Its real job is to make ZRNote installable: Chrome on Android only offers a
// true PWA install when a service worker with a fetch handler is registered.
// Once installed, the recording tab is far less likely to be discarded by the
// system while the screen is off.

// Al subir VERSION se borran TODAS las cachés anteriores (ver `activate`).
// Hay que subirla siempre que cambie un recurso estático de raíz — los iconos,
// el manifiesto, la página offline —, porque esos ficheros NO llevan hash en
// el nombre y la URL no cambia con el contenido.
//
// v4: los iconos de marca se cambiaron en la v1.7.0 pero esta versión seguía
// en `v3` desde la v1.5.0. Como `/icon-512.png` se servía en cache-first sin
// revalidar, las PWA instaladas conservaban el icono ANTERIOR a la marca para
// siempre. De ahí que la app instalada "no tuviera logo".
const VERSION = 'zrnote-v4';
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = '/offline.html';

// Only things that are byte-identical for every user.
const PRECACHE = [OFFLINE_URL, '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      // One missing file must not abort the whole install.
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/**
 * Recursos INMUTABLES de verdad: el nombre del fichero lleva un hash del
 * contenido, así que si el contenido cambia, la URL cambia. Cachear para
 * siempre es correcto y no puede quedarse obsoleto.
 */
function isImmutableAsset(url) {
  return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/ffmpeg/');
}

/**
 * Recursos estáticos que SÍ pueden cambiar bajo la misma URL: los iconos de la
 * app, el manifiesto, las fuentes de la carpeta pública.
 *
 * Antes entraban en el mismo saco que los anteriores y se servían cache-first
 * sin revalidar nunca. Como `/icon-512.png` no lleva hash, cambiar el icono no
 * cambiaba la URL: la copia vieja se servía indefinidamente y las PWA ya
 * instaladas se quedaban con el logo anterior. Estos van con
 * stale-while-revalidate: se responde al instante con lo cacheado y se
 * actualiza por detrás, así el cambio entra en la siguiente visita.
 */
function isMutableAsset(url) {
  return /\.(png|svg|ico|webmanifest|woff2?)$/.test(url.pathname) || url.pathname === '/manifest.json';
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never touch other origins or the API — those must always be live.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (isImmutableAsset(url)) {
    // Cache-first: la URL lleva hash, no puede quedarse obsoleta.
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (isMutableAsset(url)) {
    // Stale-while-revalidate: se responde ya con lo cacheado (rápido, y
    // funciona sin conexión) pero SIEMPRE se pide la versión nueva por detrás.
    // Así un icono cambiado entra solo en la siguiente visita, sin depender de
    // que alguien se acuerde de subir VERSION.
    event.respondWith(
      caches.match(request).then((cached) => {
        const fresh = fetch(request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          // Sin red: si hay copia cacheada ya se devolvió; si no, propaga el fallo.
          .catch(() => cached);

        return cached || fresh;
      }),
    );
    return;
  }

  // Pages: always network. If the network is down show the offline page rather
  // than a browser error — but never a cached copy of somebody's dashboard.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
  }
});
