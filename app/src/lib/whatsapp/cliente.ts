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

/**
 * Envía por OpenWA, uno por uno y con una pausa al azar entre mensaje y mensaje (así no salen
 * ráfagas). Guarda el menú de opciones de cada mensaje para entender luego qué significa "3".
 */
async function enviarPorOpenWA(mensajes: MensajeSaliente[]): Promise<ResultadoEnvio[]> {
  const config = configOpenWA()!;
  const ritmo = ritmoDesdeEntorno();
  const remitente = remitenteDesdeEntorno();
  const configHoras = configHorasDesdeEntorno(process.env);
  const admin = createAdminClient();
  const resultados: ResultadoEnvio[] = [];

  for (let i = 0; i < mensajes.length; i += 1) {
    if (i > 0) await dormir(pausaEntreMensajes(ritmo));

    const mensaje = mensajes[i];
    const texto = aTextoPlano(mensaje.cuerpo, { remitente, config: configHoras });
    if (!texto) {
      resultados.push({ ok: false, error: "Este tipo de mensaje no se puede enviar por texto." });
      continue;
    }

    const resultado = await enviarTextoOpenWA(mensaje.telefono, texto.texto, config);
    resultados.push(resultado);

    if (resultado.ok && texto.opciones.length > 0) {
      const { error } = await admin
        .from("menus_whatsapp")
        .upsert({ telefono: mensaje.telefono, opciones: texto.opciones, creado_en: new Date().toISOString() });
      if (error) console.error("No se pudo guardar el menú de opciones:", error.message);
    }
  }
  return resultados;
}

/** Envía por YCloud o por OpenWA (o simula el envío). El resultado va en el mismo orden que los mensajes. */
export async function enviarPorWhatsApp(mensajes: MensajeSaliente[]): Promise<ResultadoEnvio[]> {
  if (mensajes.length === 0) return [];

  if (whatsappSimulado()) {
    return mensajes.map(() => ({ ok: true, id: `sim-${randomUUID()}` }));
  }

  if (usaOpenWA()) return enviarPorOpenWA(mensajes);

  return enviarMensajes(mensajes, {
    apiKey: process.env.YCLOUD_API_KEY!,
    desde: process.env.YCLOUD_WHATSAPP_NUMBER!,
  });
}
