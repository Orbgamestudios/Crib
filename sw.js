const CACHE = 'crib-v3';
const SHELL = [
  './',
  'index.html',
  'style.css?v=3',
  'client.js?v=3',
  'icons.js',
  'lib/cards.js',
  'lib/scoring.js',
  'lib/jokers.js',
  'lib/game.js',
  'net/host.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];
const CDN = 'https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL)
        // cross-origin precache is best-effort: never block install on the CDN
        .then(() => c.add(CDN).catch(() => {})))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => hit ||
      fetch(e.request).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
    )
  );
});
