import type { Punto } from "./ruta";

// Recuadro de la provincia de San Pedro de Macorís: lo que quede fuera es un error de copiado
const ZONA = { latMin: 18.3, latMax: 18.7, lngMin: -69.55, lngMax: -69.0 };

const NUMERO = "-?\\d{1,3}\\.\\d+";
// Un lugar marcado en Google Maps trae el punto exacto como !3d<lat>!4d<lng>
const PUNTO_MARCADO = new RegExp(`!3d(${NUMERO})!4d(${NUMERO})`);
// Centro de la vista (@lat,lng) o parámetro de búsqueda (q=lat,lng)
const PAR = new RegExp(`(?:@|q=|ll=)?(${NUMERO})\\s*[, ]\\s*(${NUMERO})`);

const dentroDeLaZona = (p: Punto) => p.lat >= ZONA.latMin && p.lat <= ZONA.latMax && p.lng >= ZONA.lngMin && p.lng <= ZONA.lngMax;

/**
 * Lee una ubicación pegada desde Google Maps: "18.4503, -69.3012" o un enlace largo.
 * Devuelve null si no se entiende o si cae fuera de la provincia (así se evita un error de copiado).
 */
export function leerCoordenadas(texto: string): Punto | null {
  const limpio = texto.trim();
  if (!limpio) return null;

  const marcado = limpio.match(PUNTO_MARCADO);
  const par = marcado ?? limpio.match(PAR);
  if (!par) return null;

  const punto = { lat: Number(par[1]), lng: Number(par[2]) };
  return dentroDeLaZona(punto) ? punto : null;
}
