/* Offline shell. Hashed build assets are immutable, so cache-first; the shell
   itself is network-first so a new deploy lands the moment you are online,
   while the game still opens with no connection at all.

   NOTE: Cache Storage is scoped to the ORIGIN, not this worker's path — and
   this origin (github.io user pages) is shared with other project sites. Every
   cache operation here must therefore stay inside the poker-trainer- prefix. */
const CACHE = 'poker-trainer-v2';

self.addEventListener('install', (e) => {
  // Precache the shell AND the hashed assets it references, so the app opens
  // offline after a single visit. The hashes are not knowable statically, so
  // they are parsed out of the fetched shell.
  e.waitUntil((async () => {
    try {
      const c = await caches.open(CACHE);
      const shell = await fetch('./');
      if (shell.ok) {
        await c.put('./', shell.clone());
        const html = await shell.text();
        const assets = [...html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)].map((m) => m[1]);
        await c.addAll(assets);
      }
    } catch {
      /* offline install warm-up is best effort; the fetch handler still works */
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k.startsWith('poker-trainer-') && k !== CACHE)
          .map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  if (url.pathname.includes('/assets/')) {
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const hit = await c.match(e.request);
        if (hit) return hit;
        const r = await fetch(e.request);
        if (r.ok) c.put(e.request, r.clone());
        return r;
      }),
    );
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok) {
          // Clone BEFORE any async hop: once the page starts streaming the
          // body, clone() throws and the shell would never get cached.
          const copy = r.clone();
          e.waitUntil(
            caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {}),
          );
        }
        return r;
      })
      .catch(async () =>
        (await caches.match(e.request))
          // The app-shell fallback is for NAVIGATIONS only; handing HTML to a
          // manifest or JSON fetch would be worse than failing cleanly.
          ?? (e.request.mode === 'navigate' ? caches.match('./') : Response.error()),
      ),
  );
});
