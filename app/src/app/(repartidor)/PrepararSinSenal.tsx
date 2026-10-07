"use client";

import { useEffect } from "react";

const MAX_PANTALLAS = 40;
const SIMULTANEAS = 3;

async function traer(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { credentials: "same-origin" });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

/**
 * Registra el modo sin señal y, con conexión, deja guardadas las pantallas de entrega de cada
 * parada (y su código) para poder abrirlas aunque después se pierda la señal.
 */
export function PrepararSinSenal({ rutas }: { rutas: string[] }) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let cancelado = false;

    async function preparar() {
      await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      if (!navigator.onLine) return;

      const pendientes = rutas.slice(0, MAX_PANTALLAS);
      const yaPedidos = new Set<string>();
      async function trabajar() {
        while (!cancelado && pendientes.length > 0) {
          const ruta = pendientes.shift()!;
          const html = await traer(ruta);
          // El código de la pantalla (JS y CSS) también se descarga para que funcione sin conexión
          for (const archivo of html?.match(/\/_next\/static\/[^"'\\\s]+\.(?:js|css)/g) ?? []) {
            if (!yaPedidos.has(archivo)) {
              yaPedidos.add(archivo);
              await traer(archivo);
            }
          }
        }
      }
      await Promise.all(Array.from({ length: SIMULTANEAS }, trabajar));
    }

    void preparar().catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, [rutas]);

  return null;
}
