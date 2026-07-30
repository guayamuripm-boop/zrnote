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

const VERSION = 'zrnote-v3';
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

function isCacheableAsset(url) {
  // Build output and icons: content-hashed or static, never user-specific.
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/ffmpeg/') ||
    /\.(png|svg|ico|woff2?)$/.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never touch other origins or the API — those must always be live.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (isCacheableAsset(url)) {
    // Cache-first: these URLs are immutable.
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

  // Pages: always network. If the network is down show the offline page rather
  // than a browser error — but never a cached copy of somebody's dashboard.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
  }
});
