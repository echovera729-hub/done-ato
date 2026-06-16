// Sage Planner — service worker v5
// Bumping to v5 forces old cached versions to be replaced immediately.

const CACHE = 'sage-v5';
const FONTS_CSS = 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Newsreader:ital,wght@0,400;0,500;1,400&display=swap';

// Allow the page to tell a waiting SW to activate immediately
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('install', (event) => {
  // skipWaiting() first so this SW activates immediately without waiting for
  // all old tabs to close — critical for single-page apps where users rarely
  // open a second tab.
  self.skipWaiting();

  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(['./', './index.html', './sw.js']).catch(() => {});
    try {
      const cssRes = await fetch(FONTS_CSS, { mode: 'cors' });
      if (cssRes.ok) {
        await cache.put(FONTS_CSS, cssRes.clone());
        const cssText = await cssRes.text();
        const urls = [...cssText.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]);
        await Promise.all(urls.map(async (u) => {
          try { const r = await fetch(u, { mode: 'cors' }); if (r.ok) await cache.put(u, r); } catch (e) {}
        }));
      }
    } catch (e) {}
  })());
});

self.addEventListener('activate', (event) => {
  // clients.claim() makes this SW control all open pages immediately,
  // so the new index.html is served without a reload.
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith((async () => {
    // Always try network first for the app shell (index.html + sw.js)
    // so updates are picked up immediately on next load.
    const isShell = req.mode === 'navigate' ||
      req.url.endsWith('/') ||
      req.url.endsWith('/index.html') ||
      req.url.endsWith('/sw.js');

    if (isShell) {
      try {
        const res = await fetch(req);
        if (res && res.status === 200) {
          const cache = await caches.open(CACHE);
          cache.put(req, res.clone());
        }
        return res;
      } catch (e) {
        // Offline — serve from cache
        const cached = await caches.match(req);
        if (cached) return cached;
        return caches.match('./index.html');
      }
    }

    // For all other assets (fonts, images): cache-first
    const cached = await caches.match(req);
    if (cached) return cached;

    try {
      const res = await fetch(req);
      if (res && (res.status === 200 || res.type === 'opaque')) {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
      }
      return res;
    } catch (e) {
      return caches.match('./index.html');
    }
  })());
});
