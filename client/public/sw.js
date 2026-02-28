/**
 * Service Worker for AbJee Travel
 * Optimized caching strategy for maximum performance
 */

const CACHE_VERSION = 'v1';
const CACHE_NAME = `abjee-travel-cache-${CACHE_VERSION}`;
const IMAGE_CACHE_NAME = `abjee-travel-images-${CACHE_VERSION}`;
const STATIC_CACHE_NAME = `abjee-travel-static-${CACHE_VERSION}`;
const RUNTIME_CACHE_NAME = `abjee-travel-runtime-${CACHE_VERSION}`;

// Max cache sizes to prevent bloat
const MAX_IMAGE_CACHE_SIZE = 60;
const MAX_RUNTIME_CACHE_SIZE = 30;

// Cache expiration times (in milliseconds)
const IMAGE_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const RUNTIME_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Assets to cache immediately on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/logo.jpg',
  '/manifest.json'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Helper: Trim cache to size limit
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    const keysToDelete = keys.slice(0, keys.length - maxItems);
    await Promise.all(keysToDelete.map(key => cache.delete(key)));
  }
}

// Helper: Check if cache entry is expired
function isCacheExpired(cachedResponse, maxAge) {
  if (!cachedResponse) return true;
  const dateHeader = cachedResponse.headers.get('sw-cache-date');
  if (!dateHeader) return true;
  const cacheDate = new Date(dateHeader).getTime();
  return Date.now() - cacheDate > maxAge;
}

// Helper: Add timestamp to cached response
function addCacheTimestamp(response) {
  const clonedResponse = response.clone();
  const headers = new Headers(clonedResponse.headers);
  headers.append('sw-cache-date', new Date().toISOString());
  return new Response(clonedResponse.body, {
    status: clonedResponse.status,
    statusText: clonedResponse.statusText,
    headers: headers
  });
}

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => {
            return !name.includes(CACHE_VERSION);
          })
          .map((name) => caches.delete(name))
      );
      
      // Trim caches to size limits
      await trimCache(IMAGE_CACHE_NAME, MAX_IMAGE_CACHE_SIZE);
      await trimCache(RUNTIME_CACHE_NAME, MAX_RUNTIME_CACHE_SIZE);
    })()
  );
  self.clients.claim();
});

// Fetch event - cache-first strategy for images, network-first for others
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome extensions, browser internals, and external APIs
  if (url.protocol === 'chrome-extension:' ||
      url.protocol === 'chrome:' ||
      url.protocol === 'about:' ||
      url.hostname.includes('firebase') || 
      url.hostname.includes('cloudinary') ||
      url.hostname.includes('googleapis')) {
    return;
  }

  // Cache strategy for images - cache-first with TTL
  if (request.destination === 'image' || 
      /\.(png|jpg|jpeg|svg|gif|webp|ico)$/i.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(IMAGE_CACHE_NAME);
        const cachedResponse = await cache.match(request);
        
        // Return cached if fresh
        if (cachedResponse && !isCacheExpired(cachedResponse, IMAGE_CACHE_TTL)) {
          return cachedResponse;
        }
        
        try {
          // Fetch from network
          const networkResponse = await fetch(request);
          
          if (networkResponse && networkResponse.status === 200) {
            const responseWithTimestamp = addCacheTimestamp(networkResponse);
            await cache.put(request, responseWithTimestamp.clone());
            await trimCache(IMAGE_CACHE_NAME, MAX_IMAGE_CACHE_SIZE);
            return responseWithTimestamp;
          }
          
          // Return stale cache if network fails
          return cachedResponse || networkResponse;
        } catch (error) {
          // Return cached version if available
          if (cachedResponse) {
            return cachedResponse;
          }
          return new Response('', { status: 408, statusText: 'Request timeout' });
        }
      })()
    );
    return;
  }

  // Cache strategy for videos - cache-first
  if (request.destination === 'video' || 
      /\.(mp4|webm|ogg)$/i.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(IMAGE_CACHE_NAME);
        const cachedResponse = await cache.match(request);
        
        if (cachedResponse) {
          return cachedResponse;
        }
        
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.status === 200) {
            await cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch (error) {
          return new Response('', { status: 408 });
        }
      })()
    );
    return;
  }

  // Stale-While-Revalidate for CSS/JS - show cached immediately, update in background
  if (request.destination === 'script' || 
      request.destination === 'style' ||
      url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.css')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE_NAME);
        const cachedResponse = await cache.match(request);
        
        // Fetch in background and update cache
        const fetchPromise = fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        });
        
        // Return cached immediately if available, otherwise wait for network
        return cachedResponse || fetchPromise;
      })()
    );
    return;
  }

  // Network-first strategy for HTML
  if (request.destination === 'document' || url.pathname.endsWith('.html')) {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(STATIC_CACHE_NAME);
            await cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch (error) {
          const cache = await caches.open(STATIC_CACHE_NAME);
          const cachedResponse = await cache.match(request);
          return cachedResponse || new Response('Offline', { status: 503 });
        }
      })()
    );
    return;
  }

  // Default: Stale-while-revalidate with runtime cache
  event.respondWith(
    (async () => {
      const cache = await caches.open(RUNTIME_CACHE_NAME);
      const cachedResponse = await cache.match(request);
      
      const fetchPromise = fetch(request).then((response) => {
        if (response && response.status === 200 && request.method === 'GET') {
          const responseWithTimestamp = addCacheTimestamp(response);
          cache.put(request, responseWithTimestamp.clone()).then(() => {
            trimCache(RUNTIME_CACHE_NAME, MAX_RUNTIME_CACHE_SIZE);
          });
          return responseWithTimestamp;
        }
        return response;
      }).catch(() => cachedResponse);
      
      return cachedResponse || fetchPromise;
    })()
  );
});
