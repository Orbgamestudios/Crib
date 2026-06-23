const CACHE = 'crib-v119';
const SHELL = [
  './',
  'index.html',
  'style.css?v=84',
  'client.js?v=102',
  'icons.js?v=13',
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
const CDN_PEER = 'https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js';
const CDN_MQTT = 'https://unpkg.com/mqtt/dist/mqtt.min.js';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL)
        .then(() => Promise.all([
          c.add(CDN_PEER).catch(() => {}),
          c.add(CDN_MQTT).catch(() => {})
        ])))
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

// network-first so deploys reach players immediately; cache is the
// offline fallback (solo vs The House works with no connection)
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request))
  );
});
