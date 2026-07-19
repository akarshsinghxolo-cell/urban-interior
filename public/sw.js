const MAP_CACHE = 'rdash-map-tiles-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (!/tile\.openstreetmap\.org|tile\.openstreetmap\.fr/.test(url.hostname))
        return;
    event.respondWith(caches.open(MAP_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        const network = fetch(event.request).then((response) => {
            if (response.ok || response.type === "opaque")
                cache.put(event.request, response.clone());
            return response;
        }).catch(() => cached);
        return cached || network;
    }));
});
