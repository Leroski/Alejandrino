import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Alejandrino — Biblioteca de grappling",
    short_name: "Alejandrino",
    description: "Guarda videos de grappling y clasifícalos después.",
    lang: "es",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#09090b",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // GET solo abre un borrador. Guardar requiere un toque y una sesión válida.
    share_target: {
      action: "/compartir",
      method: "GET",
      enctype: "application/x-www-form-urlencoded",
      params: { title: "title", text: "text", url: "url" },
    },
  };
}
