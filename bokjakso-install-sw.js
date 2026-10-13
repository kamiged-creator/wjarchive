// Lightweight pass-through worker for installing the main Bokjakso website.
// No offline caching, private data storage, or chat message interception.
self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (new URL(event.request.url).origin !== self.location.origin) return;
  // Always use the server response so homepage/editor changes stay current.
  event.respondWith(fetch(event.request));
});
