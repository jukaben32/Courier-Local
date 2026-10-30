// Lee el rango de horas que el cliente escribe para recibir su paquete: "entre 2 y 4 de la tarde",
// "de 10 a 11", "a las 4", "por la tarde", "mañana en la mañana", "cualquier hora".
// Función pura (recibe la hora actual) para poder probarla sin reloj.

import { CONFIG_HORAS, interpretarHora, type ConfigHoras } from "./horas";
import { horaLocalRD } from "./mensajes";

export interface RangoHoras {
  /** Hora de inicio (24 h). */
  desde: number;
  /** Hora de fin (24 h). */
  hasta: number;
  /** "manana" si lo pidió así o si lo que pidió ya pasó hoy. */
  dia: "hoy" | "manana";
}

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[–—]/g, "-")
    .trim();
}

const PARTE_MANANA = /\b(?:por|en|de|durante|a) la manana\b/g;
const RANGO = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:a|y|hasta|-)\s*(?:las\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/;

/**
 * Devuelve el rango pedido, ya recortado al horario de entrega, o null si no se entiende
 * (o si queda fuera del horario). Si lo pedido ya pasó hoy, se pasa a mañana.
 */
export function interpretarRango(texto: string, ahora: Date, config: ConfigHoras = CONFIG_HORAS): RangoHoras | null {
  // "por la mañana" es una parte del día; "mañana" suelta es el día siguiente
  const original = normalizar(texto);
  const t = original.replace(PARTE_MANANA, " enlamanana ");
  const enLaManana = t !== original;
  let dia: RangoHoras["dia"] = /\bmanana\b/.test(t) ? "manana" : "hoy";
  const esTarde = /\b(?:por|en|de|durante|a) la (?:tarde|noche)\b/.test(t);

  const resolver = (hora: number, marca: string | undefined): number => {
    if (marca === "pm") return hora < 12 ? hora + 12 : hora;
    if (marca === "am") return hora === 12 ? 0 : hora;
    if (esTarde && hora < 12) return hora + 12;
    if (enLaManana) return hora;
    return hora >= 1 && hora <= 8 ? hora + 12 : hora; // "de 3 a 5" = tarde
  };

  let desde: number | null = null;
  let hasta: number | null = null;

  const rango = t.match(RANGO);
  if (rango) {
    const [, h1, , marca1, h2, min2, marca2] = rango;
    const fin = resolver(Number(h2), marca2);
    // "10 a 2 pm": el inicio toma la marca del final solo si queda antes que el final
    const conMarcaDelFinal = !marca1 && marca2 ? resolver(Number(h1), marca2) : null;
    const inicio = conMarcaDelFinal !== null && conMarcaDelFinal < fin ? conMarcaDelFinal : resolver(Number(h1), marca1);
    desde = inicio;
    hasta = Number(min2 ?? 0) > 0 ? fin + 1 : fin;
  } else if (/\b(?:cualquier hora|cualquier momento|todo el dia|cuando sea|a cualquier hora)\b/.test(t)) {
    desde = config.desde;
    hasta = config.hasta;
  } else if (/\bmediodia\b/.test(t)) {
    desde = 12;
    hasta = 14;
  } else {
    const unica = interpretarHora(texto, config);
    if (unica.hora !== null && !unica.fuera) {
      desde = unica.hora;
      hasta = unica.hora + 1;
    } else if (enLaManana) {
      desde = config.desde;
      hasta = 12;
    } else if (/\b(?:por|en|de|durante|a) la tarde\b/.test(t)) {
      desde = 12;
      hasta = 18;
    } else if (/\b(?:por|en|de|durante|a) la noche\b/.test(t)) {
      desde = 17;
      hasta = config.hasta;
    }
  }
  if (desde === null || hasta === null) return null;

  desde = Math.max(desde, config.desde);
  hasta = Math.min(hasta, config.hasta);
  if (hasta <= desde) return null;

  if (dia === "hoy") {
    // Lo que ya pasó (o queda a menos del margen) no se puede cumplir hoy: se pasa a mañana
    const [h, m] = horaLocalRD(ahora).split(":").map(Number);
    const primera = Math.ceil((h * 60 + m + config.margenMinutos) / 60);
    if (hasta <= primera) dia = "manana";
    else desde = Math.max(desde, primera);
  }
  return { desde, hasta, dia };
}
