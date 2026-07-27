const VERSION = 'v10';
const CACHE   = 'musete-' + VERSION;

const CORE = [
  './',
  './index.html',
  './manifest.json',
  './logo.png',
  './js/supabase.js',
  './js/elo.js',
  './js/players.js',
  './js/leaderboard.js',
  './js/matches.js',
  './js/history.js',
  './js/playerdetail.js',
  './js/pairings.js',
  './js/app.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)));
  // No skipWaiting — la página decide cuándo activar (ver #update-banner en app.js)
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Solo cachear recursos del mismo origen (no interceptar las llamadas a Supabase)
  if (!e.request.url.startsWith(self.location.origin)) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// La página envía SKIP_WAITING cuando el usuario pulsa "Actualizar"
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
