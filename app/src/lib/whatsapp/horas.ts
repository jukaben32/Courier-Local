// Horas exactas de entrega para la versión de prueba con OpenWA.
// En vez de las 3 franjas fijas, el cliente elige un bloque de una hora entre las 9 am y las 7 pm
// (o escribe la hora). Todo son funciones puras para poder probarlas sin reloj ni base de datos.

import { horaLocalRD } from "./mensajes";

export interface ConfigHoras {
  /** Primera hora en que se puede entregar (24 h). */
  desde: number;
  /** Hora límite: el último bloque termina a esta hora (24 h). */
  hasta: number;
  /** Un bloque solo se ofrece si empieza al menos tantos minutos después de ahora. */
  margenMinutos: number;
}

export const CONFIG_HORAS: ConfigHoras = { desde: 9, hasta: 19, margenMinutos: 30 };

function entero(valor: string | undefined, porDefecto: number): number {
  const n = Number(valor);
  return Number.isInteger(n) && n >= 0 && n <= 24 ? n : porDefecto;
}

export function configHorasDesdeEntorno(env: Record<string, string | undefined>): ConfigHoras {
  const desde = entero(env.ENTREGA_HORA_DESDE, CONFIG_HORAS.desde);
  const hasta = entero(env.ENTREGA_HORA_HASTA, CONFIG_HORAS.hasta);
  return hasta > desde ? { ...CONFIG_HORAS, desde, hasta } : CONFIG_HORAS;
}

/** Minutos desde la medianoche, en hora de RD. */
function minutosLocales(ahora: Date): number {
  const [h, m] = horaLocalRD(ahora).split(":").map(Number);
  return h * 60 + m;
}

/** Horas de inicio (24 h) de los bloques que todavía se pueden elegir. */
export function bloquesDisponibles(ahora: Date, config: ConfigHoras = CONFIG_HORAS): number[] {
  const minimo = minutosLocales(ahora) + config.margenMinutos;
  const bloques: number[] = [];
  for (let hora = config.desde; hora < config.hasta; hora += 1) {
    if (hora * 60 >= minimo) bloques.push(hora);
  }
  return bloques;
}

function sufijo(hora: number): string {
  return hora >= 12 && hora < 24 ? "pm" : "am";
}

/** 13 -> "1", 12 -> "12", 0 -> "12". */
function numero12(hora: number): string {
  return String(hora % 12 === 0 ? 12 : hora % 12);
}

/** "4 pm a 5 pm", para mostrar al cliente y al repartidor. */
export function etiquetaBloque(hora: number): string {
  return `${numero12(hora)} ${sufijo(hora)} a ${numero12(hora + 1)} ${sufijo(hora + 1)}`;
}

/** "entre 1 y 2 pm"; si el bloque cruza mediodía: "entre 11 am y 12 pm". */
export function textoBloque(hora: number): string {
  const fin = hora + 1;
  if (sufijo(hora) === sufijo(fin)) return `entre ${numero12(hora)} y ${numero12(fin)} ${sufijo(fin)}`;
  return `entre ${numero12(hora)} ${sufijo(hora)} y ${numero12(fin)} ${sufijo(fin)}`;
}

/** "16:00:00" -> 16 (la columna paquetes.hora_preferida es de tipo time). */
export function horaDeColumna(valor: string | null): number | null {
  if (!valor) return null;
  const hora = Number(valor.slice(0, 2));
  return Number.isInteger(hora) ? hora : null;
}

export function columnaDeHora(hora: number): string {
  return `${String(hora).padStart(2, "0")}:00:00`;
}

/**
 * Franja de la tabla `franjas` que contiene esa hora. La tabla no se toca (la usa el programa
 * original): la columna ventana_horaria solo necesita una franja válida.
 */
export function franjaDeHora(hora: number): "AM" | "MID" | "PM" {
  if (hora < 12) return "AM";
  if (hora < 15) return "MID";
  return "PM";
}

export interface HoraEscrita {
  /** Hora de inicio del bloque (24 h) o null si no se encontró una hora. */
  hora: number | null;
  /** El cliente escribió una hora, pero fuera del horario de entrega. */
  fuera: boolean;
}

const SIN_HORA: HoraEscrita = { hora: null, fuera: false };

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\./g, "")
    .trim();
}

/**
 * Lee una hora escrita a mano: "4:30 pm", "4pm", "16:00", "a las 4 de la tarde".
 * Un número suelto NO es una hora (es la opción del menú), salvo que lo acompañe "las", "pm"…
 */
export function interpretarHora(texto: string, config: ConfigHoras = CONFIG_HORAS): HoraEscrita {
  const t = normalizar(texto);

  const conMinutos = t.match(/\b(\d{1,2})\s*[:h]\s*(\d{2})\b\s*(am|pm)?/);
  const conLas = t.match(/\blas?\s+(\d{1,2})\b\s*(am|pm)?/);
  const conSufijo = t.match(/\b(\d{1,2})\s*(am|pm)\b/);
  const coincidencia = conMinutos ?? conSufijo ?? conLas;
  if (!coincidencia) return SIN_HORA;

  let hora = Number(coincidencia[1]);
  const marca = conMinutos ? coincidencia[3] : coincidencia[2];
  if (hora > 24) return SIN_HORA;

  if (marca === "pm" && hora < 12) hora += 12;
  else if (marca === "am" && hora === 12) hora = 0;
  else if (!marca) {
    if (/\b(tarde|noche)\b/.test(t) && hora < 12) hora += 12;
    else if (!/\b(manana)\b/.test(t) && hora >= 1 && hora <= 8) hora += 12; // "a las 4" = 4 pm
  }

  return { hora, fuera: hora < config.desde || hora >= config.hasta };
}
