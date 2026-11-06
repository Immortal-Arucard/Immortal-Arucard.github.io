const CACHE = 'twgi-v36';
const ASSETS = [
  '/',
  '/index.html',
  '/assets/site.css',
  '/assets/site.js',
  '/philosophy/',
  '/philosophy/index.html',
  '/philosophy/politics/',
  '/philosophy/politics/index.html',
  '/religion/',
  '/religion/index.html',
  '/science/',
  '/science/index.html',
  '/recreation/',
  '/recreation/index.html',
  '/building/',
  '/building/index.html',
  '/trading/',
  '/trading/index.html',
  '/philosophy/religion/',
  '/philosophy/religion/index.html',
  '/philosophy/science/',
  '/philosophy/science/index.html',
  '/philosophy/recreation/',
  '/philosophy/recreation/index.html',
  '/philosophy/building/',
  '/philosophy/building/index.html',
  '/philosophy/trading/',
  '/philosophy/trading/index.html',
  '/philosophy/politics/democratic/',
  '/philosophy/politics/democratic/index.html',
  '/philosophy/politics/democratic/american/',
  '/philosophy/politics/democratic/american/index.html',
  '/philosophy/politics/democratic/american/drp/',
  '/philosophy/politics/democratic/american/drp/index.html',
  '/philosophy/politics/democratic/american/drp/platform/',
  '/philosophy/politics/democratic/american/drp/platform/index.html',
  '/philosophy/politics/democratic/american/drp/compass/',
  '/philosophy/politics/democratic/american/drp/compass/index.html',
  '/compass/index.html',
  '/stats.html',
  '/privacy.html',
  '/terms.html',
  '/storage.js',
  '/vendor/supabase.js',
  '/manifest.webmanifest',
  '/philosophy/politics/democratic/american/drp/compass/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/twgi-icon-192.png',
  '/icons/twgi-icon-512.png',
  '/icons/twgi-icon-maskable-512.png',
  '/icons/twgi-apple-touch-icon.png',
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
  '/assets/illustrations/issue-30.png',
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

  // /compass and /compass/ are the shortcut page. Keep them on the file
  // itself so a directory redirect is not stored in place of the shell,
  // and so an offline miss does not fall through to the site home.
  const shells = {
    '/compass': '/compass/index.html',
    '/compass/': '/compass/index.html',
    '/religion': '/religion/index.html',
    '/religion/': '/religion/index.html',
    '/science': '/science/index.html',
    '/science/': '/science/index.html',
    '/recreation': '/recreation/index.html',
    '/recreation/': '/recreation/index.html',
    '/building': '/building/index.html',
    '/building/': '/building/index.html',
    '/trading': '/trading/index.html',
    '/trading/': '/trading/index.html',
    '/philosophy/religion': '/philosophy/religion/index.html',
    '/philosophy/religion/': '/philosophy/religion/index.html',
    '/philosophy/science': '/philosophy/science/index.html',
    '/philosophy/science/': '/philosophy/science/index.html',
    '/philosophy/recreation': '/philosophy/recreation/index.html',
    '/philosophy/recreation/': '/philosophy/recreation/index.html',
    '/philosophy/building': '/philosophy/building/index.html',
    '/philosophy/building/': '/philosophy/building/index.html',
    '/philosophy/trading': '/philosophy/trading/index.html',
    '/philosophy/trading/': '/philosophy/trading/index.html'
  };
  const pathname = shells[url.pathname] || url.pathname;
  const cacheKey = new Request(pathname);
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response && response.ok && response.type === 'basic' && !response.redirected) {
        const copy = response.clone();
        const cache = await caches.open(CACHE);
        try { await cache.put(cacheKey, copy); } catch (e) { /* a bad cache write must not block the redirect */ }
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
