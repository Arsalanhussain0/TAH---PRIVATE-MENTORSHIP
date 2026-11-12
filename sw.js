
// TAH Portal Service Worker
// Cache version: Update this whenever you publish a new release.

const CACHE_PREFIX = 'tah-portal-';
const CACHE_VERSION = 'v2';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;

// Portal files
const APP_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// INSTALL
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    await Promise.all(
      APP_FILES.map(async (file) => {
        try {
          const url = new URL(file, self.registration.scope);
          const response = await fetch(url, {
            cache: 'reload'
          });

          if (response.ok && response.type === 'basic') {
            await cache.put(url, response);
          }
        } catch (error) {
          console.warn('TAH Cache Error:', file, error);
        }
      })
    );

    await self.skipWaiting();
  })());
});

// ACTIVATE
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();

    await Promise.all(
      cacheNames.map((name) => {
        if (
          name.startsWith(CACHE_PREFIX) &&
          name !== CACHE_NAME
        ) {
          return caches.delete(name);
        }
      })
    );

    await self.clients.claim();
  })());
});

// FETCH
// Always try the latest online version first.
// Use cached files only when offline.

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  // Do not interfere with video streaming.
  if (request.headers.has('range')) return;

  const url = new URL(request.url);

  // Ignore external websites and video providers.
  if (url.origin !== self.location.origin) return;

  const isNavigation = request.mode === 'navigate';

  const isStaticFile = [
    'style',
    'script',
    'image',
    'font',
    'manifest'
  ].includes(request.destination);

  const isAppFile = APP_FILES.some((file) => {
    return new URL(file, self.registration.scope).pathname === url.pathname;
  });

  if (!isNavigation && !isStaticFile && !isAppFile) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    try {
      const response = await fetch(request);

      if (
        response &&
        response.ok &&
        response.type === 'basic'
      ) {
        await cache.put(request, response.clone());
      }

      return response;

    } catch (error) {
      const cachedResponse = await cache.match(request);

      if (cachedResponse) {
        return cachedResponse;
      }

      // Offline fallback
      if (isNavigation) {
        const offlinePage = await cache.match(
          new URL('./index.html', self.registration.scope).href
        );

        if (offlinePage) return offlinePage;
      }

      return new Response(
        'You are offline. Please check your internet connection.',
        {
          status: 503,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8'
          }
        }
      );
    }
  })());
});
