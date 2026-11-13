// TAH Portal PWA: cache only public icons/manifest, never auth pages or API data.
const CACHE_NAME = "tah-public-v3";
const PUBLIC_ASSETS = ["/manifest.json", "/icon-192.png", "/icon-512.png"];
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(PUBLIC_ASSETS.map(async path => {
      try { const response = await fetch(path, {cache:"reload"}); if(response.ok) await cache.put(path,response); } catch(e) {}
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET" || req.headers.has("range")) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !PUBLIC_ASSETS.includes(url.pathname)) return;
  event.respondWith((async () => {
    try { const response = await fetch(req); if(response.ok) (await caches.open(CACHE_NAME)).put(req,response.clone()); return response; }
    catch(e) { return (await caches.match(req)) || Response.error(); }
  })());
});
