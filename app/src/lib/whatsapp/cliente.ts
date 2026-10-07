import "server-only";
import { randomUUID } from "node:crypto";
import { enviarMensajes, type MensajeSaliente, type ResultadoEnvio } from "./envio";

/**
 * Modo simulado: no sale ningún mensaje real. Se activa solo mientras falten las claves de
 * YCloud (YCLOUD_API_KEY y YCLOUD_WHATSAPP_NUMBER); el Simulador sirve para probar el flujo.
 */
export function whatsappSimulado(): boolean {
  return !process.env.YCLOUD_API_KEY || !process.env.YCLOUD_WHATSAPP_NUMBER;
}

/** Envía por YCloud (o simula el envío). El resultado va en el mismo orden que los mensajes. */
export async function enviarPorWhatsApp(mensajes: MensajeSaliente[]): Promise<ResultadoEnvio[]> {
  if (mensajes.length === 0) return [];

  if (whatsappSimulado()) {
    return mensajes.map(() => ({ ok: true, id: `sim-${randomUUID()}` }));
  }

  return enviarMensajes(mensajes, {
    apiKey: process.env.YCLOUD_API_KEY!,
    desde: process.env.YCLOUD_WHATSAPP_NUMBER!,
  });
}
