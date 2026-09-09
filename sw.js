/* Darba Kalendārs — Service Worker
 * NEW versions install in background but do NOT activate until user taps «Atjaunināt».
 * No forced reloads mid-session.
 */
const APP_VERSION = '3.8.4';
const CACHE = 'darba-kalendars-v' + APP_VERSION;

const PRECACHE = [
  './',
  './index.html',
  './version.json',
  './manifest.webmanifest',
  './icons/icon-192-v375.png',
  './icons/icon-512-v375.png',
  './icons/apple-touch-icon-v375.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
      .catch(() => caches.open(CACHE).then((cache) =>
        // best-effort: at least shell
        cache.addAll(['./', './index.html', './version.json']).catch(() => {})
      ))
  );
  // Do NOT call skipWaiting() here — wait for user confirmation.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('darba-kalendars-') && k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Always network-first for version check (so update banner can fire)
  if (url.pathname.endsWith('version.json')) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // App shell: cache-first, then network
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        // only same-origin
        if (url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
