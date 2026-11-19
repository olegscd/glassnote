// Glassnote offline Service Worker — caches the app shell so iPad/Android Home Screen works 100% offline.
const CACHE = 'glassnote-offline-v1';
const ASSETS = ['./glassnote.html', './manifest.webmanifest', './icon.png', './vendor/pdfjs.js'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => Promise.allSettled(ASSETS.map(u => c.add(u)))).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never intercept Google Drive / OAuth / external calls
  if (url.pathname.startsWith('/ws/')) return;
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('./glassnote.html')))
  );
});
