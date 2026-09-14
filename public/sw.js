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
// v5: se añade /notas-sin-conexion al precache y a las reglas de fetch. Es la
// primera navegación (no un icono suelto) que este service worker sirve desde
// caché — hace falta subir VERSION para que la instalación vuelva a correr y
// la incluya, no basta con que el fetch handler la reconozca.
// v6: se intercepta el POST del share sheet a /share-target (Web Share Target)
// — sin bump de VERSION el sistema operativo seguiría llamando al SW anterior
// y ese POST no llegaría a ninguna parte.
const VERSION = 'zrnote-v6';
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = '/offline.html';
// La única navegación de /dashboard que este SW puede cachear con seguridad.
// Es segura PORQUE su HTML es idéntico para cualquier visitante — no vive
// bajo dashboard/layout.tsx, así que no lleva nada específico de una cuenta
// horneado en el marcado — y todo lo personal (las actas) lo lee del
// IndexedDB del propio navegador después de cargar el script, nunca del HTML
// sin ella. Ver el comentario en notas-sin-conexion/page.tsx. Ninguna otra
// navegación de /dashboard cumple esa condición, así que ninguna otra entra
// aquí: siguen siendo network-only con offline.html como único fallback, tal
// como ya razona el resto de este fichero.
const OFFLINE_SHELL_URL = '/notas-sin-conexion';

// Only things that are byte-identical for every user.
const PRECACHE = [OFFLINE_URL, OFFLINE_SHELL_URL, '/manifest.json', '/icon-192.png', '/icon-512.png'];

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

// ────────────────────────────────────────────────────────────────────────────
// Web Share Target: cuando el usuario está en Notas de Voz (u otra
// grabadora) y toca Compartir → ZRNote, el sistema operativo hace un POST
// multipart/form-data con el audio a la URL declarada en manifest.json.
// El SW guarda el fichero en un IndexedDB dedicado y redirige a la página
// /share-target, que se encarga de crear la reunión y consumir el fichero
// para el flujo de subida existente.
// ────────────────────────────────────────────────────────────────────────────
const SHARE_STASH_DB = 'zrnote-share-stash';
const SHARE_STASH_STORE = 'shared';
const SHARE_STASH_SLOT = 'pending';

function openShareStashDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SHARE_STASH_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(SHARE_STASH_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function stashSharedFile(file) {
  const db = await openShareStashDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(SHARE_STASH_STORE, 'readwrite');
    tx.objectStore(SHARE_STASH_STORE).put({
      id: SHARE_STASH_SLOT,
      file,
      name: file.name || 'audio',
      type: file.type || 'audio/mpeg',
      size: file.size,
      receivedAt: Date.now(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('audio');
    if (file && typeof file === 'object' && 'size' in file && file.size > 0) {
      await stashSharedFile(file);
    }
  } catch {
    // Si algo se rompió, /share-target lo detectará al no encontrar nada
    // en el depósito y le pedirá al usuario que reintente.
  }
  // 303 See Other: navegación GET a la página, con el POST descartado del
  // historial (el usuario no verá "confirmar reenvío" al pulsar atrás).
  return Response.redirect('/share-target', 303);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // El share target es lo único no-GET que este SW responde.
  if (
    request.method === 'POST' &&
    url.origin === self.location.origin &&
    url.pathname === '/share-target'
  ) {
    event.respondWith(handleShareTarget(request));
    return;
  }

  if (request.method !== 'GET') return;

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

  // The one navigable exception: /notas-sin-conexion, precached and served
  // stale-while-revalidate exactly like the mutable assets above. Every other
  // page keeps the strict rule below it — network-only, offline.html as the
  // only fallback — because every other page DOES carry someone's account in
  // its HTML, and a cached copy of it is a cached copy of their meetings.
  if (request.mode === 'navigate' && url.pathname === OFFLINE_SHELL_URL) {
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
          .catch(() => cached);
        return cached || fresh;
      }),
    );
    return;
  }

  // Every other page: always network. If the network is down show the offline
  // page rather than a browser error — but never a cached copy of somebody's
  // dashboard.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
  }
});
