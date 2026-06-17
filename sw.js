// Service Worker — persists tour frames across page reloads
const CACHE = 'vt360-v1';
const FRAME_RE = /\/frames-web\/frame_\d+\.jpg/;

self.addEventListener('fetch', event => {
  if (!FRAME_RE.test(event.request.url)) return;

  event.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(event.request).then(hit => {
        if (hit) return hit;
        return fetch(event.request).then(res => {
          if (res.ok) cache.put(event.request, res.clone());
          return res;
        });
      })
    )
  );
});

// Remove old cache versions
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
});
