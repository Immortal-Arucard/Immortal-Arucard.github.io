const CACHE = 'drp-compass-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/stats.html',
  '/manifest.webmanifest',
  '/assets/site.css',
  '/assets/site.js',
  '/storage.js',
  '/vendor/supabase.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.hostname === 'supabase.co' || url.hostname.endsWith('.supabase.co')) return;
  if (url.origin !== self.location.origin) return;
  const cacheKey = new Request(url.pathname);
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response && response.ok && response.type === 'basic' && !response.redirected) {
        const copy = response.clone();
        const cache = await caches.open(CACHE);
        try { await cache.put(cacheKey, copy); } catch (e) {}
      }
      return response;
    } catch (err) {
      return (await caches.match(cacheKey))
        || (await caches.match('/index.html'))
        || (await caches.match('/'))
        || Response.error();
    }
  })());
});
