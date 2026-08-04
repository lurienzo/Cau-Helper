/* CAU Helper - service worker
   Strategia:
   - shell dell'app (index.html, manifest, icone): stale-while-revalidate, cosi l'app
     apre istantaneamente e si aggiorna in background;
   - font Google: cache-first con salvataggio a runtime, per funzionare offline dopo
     il primo caricamento online;
   - tutto il resto: rete con fallback alla cache.
   I dati clinici sono dentro index.html (payload cifrato): non serve altro per l'offline. */

const VER = 'cauh-v4.5';
const SHELL = VER + '-shell';
const RUNTIME = VER + '-rt';

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-maskable.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== SHELL && k !== RUNTIME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function isShell(url) {
  return url.origin === self.location.origin &&
    (url.pathname.endsWith('/') ||
     url.pathname.endsWith('/index.html') ||
     url.pathname.endsWith('/manifest.webmanifest') ||
     url.pathname.endsWith('.svg'));
}

function isFont(url) {
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // shell: stale-while-revalidate
  if (isShell(url)) {
    event.respondWith(
      caches.open(SHELL).then(cache =>
        cache.match(req, { ignoreSearch: true }).then(hit => {
          const net = fetch(req).then(res => {
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          }).catch(() => hit);
          return hit || net;
        })
      )
    );
    return;
  }

  // font: cache-first, salvati al primo caricamento online
  if (isFont(url)) {
    event.respondWith(
      caches.open(RUNTIME).then(cache =>
        cache.match(req).then(hit => hit || fetch(req).then(res => {
          if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
          return res;
        }).catch(() => hit))
      )
    );
    return;
  }

  // resto: rete, con fallback alla cache se offline
  event.respondWith(
    fetch(req).catch(() => caches.match(req, { ignoreSearch: true }))
  );
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
