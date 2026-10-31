import { normalizar } from "./rango";

// Palabras que delatan una dirección o una referencia de cómo llegar
const PISTAS =
  /\b(calle|avenida|av|frente|esquina|residencial|edificio|apto|apartamento|sector|barrio|detras|entrando|urbanizacion|carretera|km|colmado|iglesia|escuela|colegio|callejon|manzana|torre|ferreteria|farmacia|supermercado|gasolinera|parque|cancha|porton|verja)\b|\b(?:casa|numero|nro|no)\s*#?\s*\d|#\s*\d|\bcasa\s+(?:de\s+)?color\b|\bcasa\s+(?:azul|verde|blanca|amarilla|rosada|gris|naranja|roja)\b/;
const HORA = /\b(\d{1,2}\s*(am|pm)|\d{1,2}:\d{2}|a las|entre las|cualquier hora)\b/;

/** ¿Lo escrito parece una dirección con la que el repartidor pueda llegar? (no una hora, un saludo ni un "ok") */
export function pareceDireccion(texto: string): boolean {
  const t = normalizar(texto);
  return t.split(/\s+/).filter(Boolean).length >= 4 && PISTAS.test(t);
}

/** ¿El texto, además de la dirección, trae una hora explícita? Entonces también se interpreta como hora. */
export function traeHoraExplicita(texto: string): boolean {
  return HORA.test(normalizar(texto));
}
