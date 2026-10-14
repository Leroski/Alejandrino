"use strict";
// Solo guarda la pantalla de prueba. Nunca recibe ni almacena archivos de video.
const CACHE = "alejandrino-local-probe-shell-v1";
const PAGE = new URL("prueba-local.html", self.location.href).href;
const MARKER = "alejandrino-local-probe-v1";

async function validPage(response) {
  return response.ok && !response.redirected &&
    (response.headers.get("content-type") || "").includes("text/html") &&
    (await response.clone().text()).includes(MARKER);
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const response = await fetch(PAGE, { cache: "no-store" });
    if (!(await validPage(response))) throw new Error("No se pudo guardar la pantalla de prueba.");
    await (await caches.open(CACHE)).put(PAGE, response);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  const page = new URL(PAGE);
  // El resto de las rutas de Alejandrino no se intercepta ni se añade a la caché.
  if (event.request.method !== "GET" || url.origin !== page.origin || url.pathname !== page.pathname) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (await validPage(response)) return response;
    } catch { /* Sin red: recuperar exclusivamente esta pantalla. */ }
    // No recrea una caché eliminada por el botón de limpieza de la prueba.
    if ((await caches.keys()).includes(CACHE)) {
      const response = await (await caches.open(CACHE)).match(PAGE);
      if (response) return response;
    }
    return new Response("La prueba sin conexión no está preparada. Vuelve a abrirla con Internet.", {
      status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  })());
});
