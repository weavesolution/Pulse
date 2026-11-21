/* Pulse — service worker.
   VERSION must match APP_VERSION in index.html. Bump both on every release:
   the app reads this file to tell old installs that an update is waiting. */
const VERSION = '1.2.0';
const CACHE = 'pulse-' + VERSION;

const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './img/icon-192.png', './img/icon-512.png', './img/icon-maskable-512.png', './img/apple-touch-icon.png',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.all(SHELL.map(u => c.add(new Request(u, {cache: 'reload'})).catch(() => {}))))
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

/* One cache key per page, without query or hash. */
function pageKey(url){
  const u = new URL(url);
  let p = u.pathname;
  if (p.endsWith('/')) p += 'index.html';
  return u.origin + p;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Sheet calls are always live; sw.js is read live for the update check.
  if (url.hostname.includes('script.google.com') || url.hostname.includes('googleusercontent.com')) return;
  if (url.origin === self.location.origin && url.pathname.endsWith('/sw.js')) return;

  // Pages: network first, but give up after 3.5 s on a weak signal and open
  // the saved copy, while the network copy still refreshes the cache.
  if (req.mode === 'navigate') {
    const key = pageKey(req.url);
    const net = fetch(req).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(key, copy)); }
      return res;
    });
    e.respondWith(new Promise(resolve => {
      let done = false;
      const fallback = () => caches.match(key).then(hit => hit || caches.match(pageKey(self.registration.scope + 'index.html')));
      const timer = setTimeout(() => {
        fallback().then(hit => { if (hit && !done) { done = true; resolve(hit); } });
      }, 3500);
      net.then(res => { if (!done) { done = true; clearTimeout(timer); resolve(res); } })
         .catch(() => fallback().then(hit => { if (!done) { done = true; clearTimeout(timer);
            resolve(hit || new Response('Offline', {status: 503})); } }));
    }));
    e.waitUntil(net.catch(() => {}));
    return;
  }

  // Everything else (icons, fonts, jsPDF): cache first, refresh in the background.
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
