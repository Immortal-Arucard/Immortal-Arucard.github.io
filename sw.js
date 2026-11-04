const CACHE = 'drp-compass-v17';
const ASSETS = [
  '/',
  '/index.html',
  '/stats.html',
  '/privacy.html',
  '/terms.html',
  '/storage.js',
  '/vendor/supabase.js',
  '/manifest.webmanifest',
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
  // Stats data is a Supabase RPC. Never cache that host; only the page shell is cached.
  if (url.hostname === 'supabase.co' || url.hostname.endsWith('.supabase.co')) return;
  if (url.origin !== self.location.origin) return;

  const cacheKey = new Request(url.pathname);
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response && response.ok && response.type === 'basic') {
        const copy = response.clone();
        const cache = await caches.open(CACHE);
        await cache.put(cacheKey, copy);
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
