import type { MetadataRoute } from "next";

// Permite "Añadir a la pantalla de inicio": la app se abre a pantalla completa, como una app del celular
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Courier Local",
    short_name: "Courier Local",
    description: "Gestión de entregas de última milla en San Pedro de Macorís",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "es",
    background_color: "#0f1b2d",
    theme_color: "#0f1b2d",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
