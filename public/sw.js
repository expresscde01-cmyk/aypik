/* Aypik SW — installabilité Android. Pas de cache de documents (nonce CSP). */
const SW_VERSION = '20260906-reload';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Listener fetch requis pour l’installabilité Chrome Android.
// Ne pas intercepter les navigations : un respondWith(fetch()) — et a fortiori
// deux listeners identiques — peut renvoyer une page vide au reload (iOS).
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    return;
  }
  void SW_VERSION;
});
