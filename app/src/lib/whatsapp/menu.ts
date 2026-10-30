// Menú numerado de las respuestas por texto (OpenWA no tiene botones).
// Cada mensaje con opciones guarda su menú (tabla menus_whatsapp); cuando el cliente responde "3"
// se busca qué era la opción 3 de ESE menú. Funciones puras, sin base de datos.

import { ACCION_COORDINAR, ACCION_OTRA_PERSONA, ACCION_RETIRO } from "./plantillas";
import { CONFIG_HORAS, type ConfigHoras } from "./horas";
import { interpretarRango } from "./rango";
import type { Entrante } from "./mensajes";

export type OpcionMenu =
  | { numero: number; tipo: "retiro" }
  | { numero: number; tipo: "otra_persona" }
  | { numero: number; tipo: "coordinar" }
  | { numero: number; tipo: "hora"; hora: number };

/** Lo que entendimos del cliente, sin su teléfono (se lo pone quien llama). */
export type EntranteSinTelefono = Entrante extends infer E ? (E extends { telefono: string } ? Omit<E, "telefono"> : never) : never;

export type Interpretacion =
  | { tipo: "entrante"; entrante: EntranteSinTelefono }
  | { tipo: "rechazo" };

function limpiar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9:\s]/g, " ") // quita emojis, teclas "2️⃣", puntuación
    .replace(/\s+/g, " ")
    .trim();
}

function deOpcion(opcion: OpcionMenu): EntranteSinTelefono {
  switch (opcion.tipo) {
    case "retiro":
      return { tipo: "accion", accion: ACCION_RETIRO };
    case "otra_persona":
      return { tipo: "accion", accion: ACCION_OTRA_PERSONA };
    case "coordinar":
      return { tipo: "accion", accion: ACCION_COORDINAR };
    case "hora":
      return { tipo: "hora", hora: opcion.hora };
  }
}

const RECHAZOS = /^(no|no espero( nada| ese paquete| paquete)?|no es mio|no es mi paquete|numero equivocado|equivocado|error)$/;

/**
 * Interpreta lo que escribió el cliente: el número de una opción, una hora ("4:30 pm") o una
 * palabra clave. Devuelve null si no se entiende (en ese caso no se responde: lo lee una persona).
 */
export function interpretarRespuestaTexto(
  texto: string,
  opciones: OpcionMenu[],
  config: ConfigHoras = CONFIG_HORAS,
  ahora: Date = new Date()
): Interpretacion | null {
  const t = limpiar(texto);
  if (!t) return null;
  if (RECHAZOS.test(t)) return { tipo: "rechazo" };

  // Un número suelto es SIEMPRE una opción del menú ("4" = opción 4, no las 4 de la tarde)
  if (/^\d{1,2}$/.test(t)) {
    const opcion = opciones.find((o) => o.numero === Number(t));
    return opcion ? { tipo: "entrante", entrante: deOpcion(opcion) } : null;
  }

  // Pasar por la oficina manda sobre cualquier hora que escriba ("paso a buscarlo a las 3")
  if (/\b(oficina|buscarlo|buscar|recoger|recojo|paso a buscar)\b/.test(t)) {
    return { tipo: "entrante", entrante: { tipo: "accion", accion: ACCION_RETIRO } };
  }

  // La hora escrita ("entre 2 y 4", "por la tarde", "mañana a las 9") manda sobre "otra persona":
  // si dice las dos cosas, se toma la hora y el mensaje de cierre ya recuerda la cédula.
  const rango = interpretarRango(texto, ahora, config);
  if (rango) return { tipo: "entrante", entrante: { tipo: "rango", ...rango } };

  if (/\b(otra persona|alguien mas|un familiar|mi (esposa|esposo|hijo|hija|mama|papa|hermano|hermana|vecino))\b/.test(t)) {
    return { tipo: "entrante", entrante: { tipo: "accion", accion: ACCION_OTRA_PERSONA } };
  }
  return null;
}
