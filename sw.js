const CACHE_NAME = 'esn-pwa-v2';
const ASSETS = [
  '.',
  'index.html',
  'style.css',
  'app.js',
  'questions.json',
  'manifest.webmanifest',
  'assets/icon-192.png',
  'assets/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => k !== CACHE_NAME ? caches.delete(k) : Promise.resolve()));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      // Cache successful GET requests
      if (req.method === 'GET' && fresh.ok) {
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (e) {
      // Offline fallback to cached index
      return (await cache.match('index.html')) || cached;
    }
  })());
});
