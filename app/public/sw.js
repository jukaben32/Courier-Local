// Service worker de Courier Local (solo para la app del repartidor).
// Objetivo: que la ruta y las pantallas de entrega abran aunque el celular se quede sin señal.
// Las pantallas se piden primero a internet y, si no hay señal, se usa la última copia guardada.
// Nunca se guardan las llamadas a /api/ ni las páginas de la oficina.
const CACHE = "courier-local-v1";
const PAGINAS = /^\/(ruta|entrega\/[^/]+|subir\/[^/]+)$/;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    (async () => {
      for (const nombre of await caches.keys()) {
        if (nombre !== CACHE) await caches.delete(nombre);
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (evento) => {
  const peticion = evento.request;
  if (peticion.method !== "GET") return;
  const url = new URL(peticion.url);
  if (url.origin !== self.location.origin) return;

  // Código de la app: no cambia mientras el nombre sea el mismo, así que se guarda y se reutiliza
  if (url.pathname.startsWith("/_next/static/")) {
    evento.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const guardada = await cache.match(url.href);
        if (guardada) return guardada;
        const respuesta = await fetch(peticion);
        if (respuesta.ok) await cache.put(url.href, respuesta.clone());
        return respuesta;
      })()
    );
    return;
  }

  // Pantallas completas del repartidor (no las cargas parciales _rsc de la navegación interna)
  if (PAGINAS.test(url.pathname) && !url.searchParams.has("_rsc")) {
    evento.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const respuesta = await fetch(peticion);
          if (respuesta.ok) await cache.put(url.pathname, respuesta.clone());
          return respuesta;
        } catch {
          const guardada = await cache.match(url.pathname, { ignoreVary: true });
          if (guardada) return guardada;
          return new Response(
            "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>" +
              "<body style='font-family:sans-serif;padding:24px'><h2>Sin señal</h2>" +
              "<p>Esta pantalla no se guardó antes. Vuelve a abrirla cuando tengas conexión.</p></body>",
            { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
          );
        }
      })()
    );
  }
});
