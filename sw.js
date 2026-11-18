// Service Worker: hält die App-Dateien vor, damit sie sofort und auch ohne Netz startet.
// Bei JEDER Änderung an index.html, Manifest oder Icons CACHE hochzählen, sonst sehen Geräte die neue Version nicht.
// Eine neue Version wartet, bis der Nutzer „Jetzt aktualisieren“ tippt.
const CACHE = 'jobstapel-v6';
const ASSETS = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'];

async function install() {
  const c = await caches.open(CACHE);
  // cache: 'reload' umgeht den HTTP-Cache des Browsers, sonst landet evtl. eine alte Datei in der neuen Version
  await Promise.all(ASSETS.map(async u => {
    const r = await fetch(new Request(u, { cache: 'reload' }));
    if (!r.ok) throw new Error(u + ' ' + r.status);
    await c.put(u, r);
  }));
}
self.addEventListener('install', e => {
  e.waitUntil(install());
  // Beim allerersten Besuch sofort aktiv werden; bei Updates wartet die neue Version auf den Nutzer
  if (!self.registration.active) self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
// Eigene Dateien: erst Cache, sonst Netz. Die Jobsuche (anderer Server) läuft immer direkt übers Netz.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(e.request, { ignoreSearch: true });
    return hit || fetch(e.request);
  })().catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || Response.error())));
});
