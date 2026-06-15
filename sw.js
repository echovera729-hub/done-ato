// Sage Planner — service worker
// Caches the app shell and the Google Fonts files so the app works fully offline.

const CACHE = 'sage-v4';
const FONTS_CSS = 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Newsreader:ital,wght@0,400;0,500;1,400&display=swap';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);

    // Cache the app shell itself
    await cache.addAll(['./', './index.html']).catch(() => {});

    // Pre-fetch the Google Fonts stylesheet, then every font file (woff2) it
    // references, so the real fonts render even on the first offline launch.
    try {
      const cssRes = await fetch(FONTS_CSS, { mode: 'cors' });
      if (cssRes.ok) {
        await cache.put(FONTS_CSS, cssRes.clone());
        const cssText = await cssRes.text();
        const urls = [...cssText.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]);
        await Promise.all(urls.map(async (u) => {
          try {
            const r = await fetch(u, { mode: 'cors' });
            if (r.ok) await cache.put(u, r);
          } catch (err) {}
        }));
      }
    } catch (err) {}
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;

    try {
      const res = await fetch(req);
      // Cache successful same-origin responses AND opaque cross-origin ones
      // (e.g. fonts requested via <link>, fetched by the browser in no-cors mode).
      if (res && (res.status === 200 || res.type === 'opaque')) {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
      }
      return res;
    } catch (err) {
      // Offline and not cached — fall back to the app shell for page navigations
      if (req.mode === 'navigate') {
        return caches.match('./index.html') || caches.match('./');
      }
      throw err;
    }
  })());
});
