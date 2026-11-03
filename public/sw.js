/* Aypik SW — installabilité Android. Pas de cache de documents (nonce CSP). */
const SW_VERSION = '20261017-standalone';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  // Pas de clients.claim() : revendiquer la page pendant l’ouverture
  // standalone laisse l’écran d’accueil bloqué sur le logo.
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
  );
});

// Listener fetch requis pour l’installabilité Chrome Android.
// Ne pas intercepter les navigations : un respondWith(fetch()) — et a fortiori
// deux listeners identiques — peut renvoyer une page vide au reload (iOS).
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    const ua = event.request.headers.get('user-agent') || '';
    // iOS n’a pas besoin du worker pour l’écran d’accueil. Le retirer
    // évite qu’il gèle le prochain lancement sur le splash.
    if (/iPhone|iPad|iPod/i.test(ua)) {
      event.waitUntil(self.registration.unregister());
    }
    return;
  }
  void SW_VERSION;
});
