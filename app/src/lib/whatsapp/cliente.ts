import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarMensajes, type MensajeSaliente, type ResultadoEnvio } from "./envio";
import { pausaEntreMensajes } from "./goteo";
import { enviarTextoOpenWA } from "./openwa";
import { aTextoPlano } from "./textoPlano";
import {
  configHorasDesdeEntorno,
  configOpenWA,
  configsOpenWA,
  remitenteDesdeEntorno,
  ritmoDesdeEntorno,
  usaOpenWA,
} from "./proveedor";

/**
 * Modo simulado: no sale ningún mensaje real. Se activa solo mientras falten las claves del
 * proveedor (YCLOUD_API_KEY y YCLOUD_WHATSAPP_NUMBER, o las OPENWA_* si se usa OpenWA);
 * el Simulador sirve para probar el flujo.
 */
export function whatsappSimulado(): boolean {
  if (usaOpenWA()) return configOpenWA() === null;
  return !process.env.YCLOUD_API_KEY || !process.env.YCLOUD_WHATSAPP_NUMBER;
}

const dormir = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

/** Cuenta que ya le escribió antes a cada teléfono (para que una persona hable siempre con la misma). */
async function cuentasPrevias(admin: ReturnType<typeof createAdminClient>, telefonos: string[]): Promise<Map<string, string>> {
  const { data } = await admin.from("menus_whatsapp").select("telefono, sesion").in("telefono", telefonos);
  const previas = new Map<string, string>();
  for (const fila of (data ?? []) as { telefono: string; sesion: string | null }[]) {
    if (fila.sesion) previas.set(fila.telefono, fila.sesion);
  }
  return previas;
}

export interface OpcionesEnvio {
  /** Fuerza la cuenta (sesión de OpenWA) que manda. Sin esto se usa la que ya le escribió a esa persona. */
  sesionId?: string;
}

/**
 * Envía por OpenWA, uno por uno y con una pausa al azar entre mensaje y mensaje (así no salen
 * ráfagas). Guarda el menú de opciones de cada mensaje para entender luego qué significa "3", y
 * qué cuenta le escribió a cada persona.
 */
async function enviarPorOpenWA(mensajes: MensajeSaliente[], opciones: OpcionesEnvio): Promise<ResultadoEnvio[]> {
  const configs = configsOpenWA();
  const porSesion = new Map(configs.map((c) => [c.sessionId, c]));
  const ritmo = ritmoDesdeEntorno();
  const remitente = remitenteDesdeEntorno();
  const configHoras = configHorasDesdeEntorno(process.env);
  const admin = createAdminClient();
  const resultados: ResultadoEnvio[] = [];

  const previas = opciones.sesionId
    ? new Map<string, string>()
    : await cuentasPrevias(admin, [...new Set(mensajes.map((m) => m.telefono))]);

  for (let i = 0; i < mensajes.length; i += 1) {
    if (i > 0) await dormir(pausaEntreMensajes(ritmo));

    const mensaje = mensajes[i];
    const config = porSesion.get(opciones.sesionId ?? previas.get(mensaje.telefono) ?? "") ?? configs[0];

    const texto = aTextoPlano(mensaje.cuerpo, { remitente, config: configHoras });
    if (!texto) {
      resultados.push({ ok: false, error: "Este tipo de mensaje no se puede enviar por texto.", sesion: config.sessionId });
      continue;
    }

    const resultado = { ...(await enviarTextoOpenWA(mensaje.telefono, texto.texto, config)), sesion: config.sessionId };
    resultados.push(resultado);

    if (resultado.ok && texto.opciones.length > 0) {
      const { error } = await admin.from("menus_whatsapp").upsert({
        telefono: mensaje.telefono,
        opciones: texto.opciones,
        sesion: config.sessionId,
        creado_en: new Date().toISOString(),
      });
      if (error) console.error("No se pudo guardar el menú de opciones:", error.message);
    }
  }
  return resultados;
}

/** Envía por YCloud o por OpenWA (o simula el envío). El resultado va en el mismo orden que los mensajes. */
export async function enviarPorWhatsApp(
  mensajes: MensajeSaliente[],
  opciones: OpcionesEnvio = {}
): Promise<ResultadoEnvio[]> {
  if (mensajes.length === 0) return [];

  if (whatsappSimulado()) {
    return mensajes.map(() => ({ ok: true, id: `sim-${randomUUID()}` }));
  }

  if (usaOpenWA()) return enviarPorOpenWA(mensajes, opciones);

  return enviarMensajes(mensajes, {
    apiKey: process.env.YCLOUD_API_KEY!,
    desde: process.env.YCLOUD_WHATSAPP_NUMBER!,
  });
}
