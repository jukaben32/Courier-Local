// Qué servicio manda los WhatsApp. Por defecto YCloud (API oficial de Meta); en la versión de
// prueba se pone WHATSAPP_PROVEEDOR=openwa para usar la pasarela OpenWA.

import { configHorasDesdeEntorno } from "./horas";
import type { ConfigOpenWA } from "./openwa";

export function usaOpenWA(env: Record<string, string | undefined> = process.env): boolean {
  return env.WHATSAPP_PROVEEDOR === "openwa";
}

/** Máximo de cuentas de WhatsApp (sesiones de OpenWA) que se usan a la vez. */
export const MAX_CUENTAS = 8;

/** Ids de las sesiones: OPENWA_SESSION_IDS="uno,dos,..." (hasta 8) o, como antes, OPENWA_SESSION_ID. */
export function sesionesOpenWA(env: Record<string, string | undefined> = process.env): string[] {
  const crudo = env.OPENWA_SESSION_IDS?.trim() ? env.OPENWA_SESSION_IDS : (env.OPENWA_SESSION_ID ?? "");
  const ids = crudo.split(",").map((s) => s.trim()).filter(Boolean);
  return [...new Set(ids)].slice(0, MAX_CUENTAS);
}

/** Una configuración por cuenta de WhatsApp; vacía si falta alguna variable (entonces queda en modo simulado). */
export function configsOpenWA(env: Record<string, string | undefined> = process.env): ConfigOpenWA[] {
  const { OPENWA_URL, OPENWA_API_KEY } = env;
  const ids = sesionesOpenWA(env);
  if (!OPENWA_URL || !OPENWA_API_KEY || ids.length === 0) return [];
  return ids.map((sessionId) => ({ url: OPENWA_URL.replace(/\/$/, ""), apiKey: OPENWA_API_KEY, sessionId }));
}

/** Configuración de la primera cuenta, o null si falta alguna variable (entonces queda en modo simulado). */
export function configOpenWA(env: Record<string, string | undefined> = process.env): ConfigOpenWA | null {
  return configsOpenWA(env)[0] ?? null;
}

export function remitenteDesdeEntorno(env: Record<string, string | undefined> = process.env): string {
  return env.NOMBRE_REMITENTE?.trim() || "Filpo Pack";
}

export { configHorasDesdeEntorno };

function numero(valor: string | undefined, porDefecto: number, minimo = 0): number {
  const n = Number(valor);
  return Number.isFinite(n) && n >= minimo ? n : porDefecto;
}

/** Ritmo de envío: variables ENVIO_* (ver .env.local). */
export interface ConfigRitmo {
  horaDesde: number;
  horaHasta: number;
  porTandaMin: number;
  porTandaMax: number;
  pausaMinSegundos: number;
  pausaMaxSegundos: number;
  topeDiario: number;
  fallosSeguidosParaFrenar: number;
  recordatoriosPorLlamada: number;
}

export function ritmoDesdeEntorno(env: Record<string, string | undefined> = process.env): ConfigRitmo {
  const porTandaMin = numero(env.ENVIO_POR_TANDA_MIN, 2, 1);
  const pausaMin = numero(env.ENVIO_PAUSA_MIN_S, 20, 0);
  return {
    horaDesde: numero(env.ENVIO_HORA_DESDE, 8),
    horaHasta: numero(env.ENVIO_HORA_HASTA, 19),
    porTandaMin,
    porTandaMax: Math.max(porTandaMin, numero(env.ENVIO_POR_TANDA_MAX, 4, 1)),
    pausaMinSegundos: pausaMin,
    pausaMaxSegundos: Math.max(pausaMin, numero(env.ENVIO_PAUSA_MAX_S, 50, 0)),
    topeDiario: numero(env.ENVIO_TOPE_DIARIO, 200, 1),
    fallosSeguidosParaFrenar: numero(env.ENVIO_FALLOS_PARA_FRENAR, 5, 1),
    recordatoriosPorLlamada: numero(env.ENVIO_RECORDATORIOS_POR_LLAMADA, 3, 0),
  };
}
