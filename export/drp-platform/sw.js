const CACHE = 'drp-platform-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/assets/site.css',
  '/assets/site.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/assets/illustrations/issue-01.png',
  '/assets/illustrations/issue-02.png',
  '/assets/illustrations/issue-03.png',
  '/assets/illustrations/issue-04.png',
  '/assets/illustrations/issue-05.png',
  '/assets/illustrations/issue-06.png',
  '/assets/illustrations/issue-07.png',
  '/assets/illustrations/issue-08.png',
  '/assets/illustrations/issue-09.png',
  '/assets/illustrations/issue-10.png',
  '/assets/illustrations/issue-11.png',
  '/assets/illustrations/issue-12.png',
  '/assets/illustrations/issue-13.png',
  '/assets/illustrations/issue-14.png',
  '/assets/illustrations/issue-15.png',
  '/assets/illustrations/issue-16.png',
  '/assets/illustrations/issue-17.png',
  '/assets/illustrations/issue-18.png',
  '/assets/illustrations/issue-19.png',
  '/assets/illustrations/issue-20.png',
  '/assets/illustrations/issue-21.png',
  '/assets/illustrations/issue-22.png',
  '/assets/illustrations/issue-23.png',
  '/assets/illustrations/issue-24.png',
  '/assets/illustrations/issue-25.png',
  '/assets/illustrations/issue-26.png',
  '/assets/illustrations/issue-27.png',
  '/assets/illustrations/issue-28.png',
  '/assets/illustrations/issue-29.png',
  '/assets/illustrations/issue-30.png'
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
