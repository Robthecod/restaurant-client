const CACHE_NAME = 'chauka-local-v1';

// Assets to cache on install (restaurant app screens + shared assets)
const PRECACHE = [
  '/',
  '/css/style.css',
  '/js/motion.js',
  '/manifest.json',
  '/app/hub/',
  '/app/hub/hub.css',
  '/app/hub/hub.js',
  '/app/waiter/',
  '/app/waiter/waiter.css',
  '/app/waiter/waiter.js',
  '/app/kitchen/',
  '/app/kitchen/kitchen.css',
  '/app/kitchen/kitchen.js',
  '/app/manager/',
  '/app/manager/manager.css',
  '/app/manager/manager.js',
  '/app/customer/',
  '/app/customer/customer.css',
  '/app/customer/customer.js',
  '/app/js/socket-client.js',
  '/app/js/license-client.js',
  '/app/js/table-map.js',
];

// Install event — cache core assets
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE);
    })
  );
});

// Activate event — clean old caches & take control immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        );
      }),
      clients.claim(),
    ])
  );
});

// Fetch event — network-first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Skip Socket.io and API calls — don't intercept, let the browser handle normally
  if (
    event.request.url.includes('/socket.io/') ||
    event.request.url.includes('/api/')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, clone);
        });
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
