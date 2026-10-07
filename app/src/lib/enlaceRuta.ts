// Arma un enlace de Google Maps con varias paradas a la vez, para que el repartidor
// no tenga que abrir el mapa parada por parada.

import type { Punto } from "./ruta";

/** Google Maps acepta hasta 9 paradas intermedias más el destino final. */
export const MAX_PARADAS_ENLACE = 10;

export interface EnlaceRuta {
  url: string;
  /** Cuántas paradas lleva el enlace (si hay más, quedan para el siguiente tramo). */
  cantidad: number;
}

const coordenadas = (p: Punto): string => `${p.lat},${p.lng}`;

/**
 * Recibe las paradas YA ordenadas (con ubicación exacta) y devuelve el enlace de las primeras 10.
 * No lleva origen: Google Maps parte de donde está el repartidor en ese momento.
 * Cuando entrega esas paradas salen de la lista, así que el siguiente enlace cubre las que siguen.
 */
export function enlaceRutaGoogleMaps(paradas: Punto[]): EnlaceRuta | null {
  const tramo = paradas.slice(0, MAX_PARADAS_ENLACE);
  if (tramo.length === 0) return null;

  const destino = tramo[tramo.length - 1];
  const intermedias = tramo.slice(0, -1);

  const parametros = new URLSearchParams({ api: "1", destination: coordenadas(destino), travelmode: "motorcycle" });
  if (intermedias.length > 0) parametros.set("waypoints", intermedias.map(coordenadas).join("|"));

  return { url: `https://www.google.com/maps/dir/?${parametros.toString()}`, cantidad: tramo.length };
}
