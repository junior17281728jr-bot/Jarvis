// App instalable: guarda la interfaz para que abra rápido. Los datos siempre se piden al servidor.
const SHELL = ['/', '/styles.css', '/boot.js', '/app.js', '/icon.svg', '/manifest.webmanifest'];
self.addEventListener('install', e => e.waitUntil(caches.open('jv-v29').then(c => c.addAll(SHELL))));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== 'jv-v29').map(k => caches.delete(k))))));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.pathname.startsWith('/api/') || e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => { const c = r.clone(); caches.open('jv-v29').then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
