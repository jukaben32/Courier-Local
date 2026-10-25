// Cliente de OpenWA (pasarela de WhatsApp en https://github.com/jukaben32/OpenWA).
// Envía texto y entiende los avisos (webhooks) que OpenWA manda a la app.

import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizarTelefonoRD } from "@/lib/telefono";
import type { ResultadoEnvio } from "./envio";

const INTENTOS_MAXIMOS = 3;
const ESPERA_BASE_MS = 1000;

export interface ConfigOpenWA {
  /** Dirección de OpenWA, por ejemplo http://localhost:2785 */
  url: string;
  apiKey: string;
  sessionId: string;
  fetchFn?: typeof fetch;
  esperar?: (ms: number) => Promise<void>;
}

const dormir = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

/** "8295550123" -> "18295550123@c.us" */
export function chatIdDeTelefono(telefono: string): string {
  return `1${telefono}@c.us`;
}

async function mensajeDeError(respuesta: Response): Promise<string> {
  try {
    const json = (await respuesta.json()) as { message?: string | string[]; error?: string };
    const mensaje = Array.isArray(json.message) ? json.message.join(", ") : json.message;
    return mensaje ?? json.error ?? `Error ${respuesta.status}`;
  } catch {
    return `Error ${respuesta.status}`;
  }
}

/** Envía un texto. Reintenta si OpenWA no responde o está saturado; no reintenta los errores 4xx. */
export async function enviarTextoOpenWA(
  telefono: string,
  texto: string,
  config: ConfigOpenWA
): Promise<ResultadoEnvio> {
  const hacerFetch = config.fetchFn ?? fetch;
  const esperar = config.esperar ?? dormir;
  const url = `${config.url}/api/sessions/${encodeURIComponent(config.sessionId)}/messages/send-text`;
  const cuerpo = JSON.stringify({ chatId: chatIdDeTelefono(telefono), text: texto });

  let ultimoError = "No se pudo enviar el mensaje.";
  for (let intento = 0; intento < INTENTOS_MAXIMOS; intento += 1) {
    try {
      const respuesta = await hacerFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": config.apiKey },
        body: cuerpo,
      });

      if (respuesta.ok) {
        const datos = (await respuesta.json()) as { messageId?: string };
        return { ok: true, id: datos.messageId };
      }

      ultimoError = await mensajeDeError(respuesta);
      if (respuesta.status === 429) {
        const segundos = Number(respuesta.headers.get("retry-after"));
        await esperar(Number.isFinite(segundos) && segundos > 0 ? segundos * 1000 : ESPERA_BASE_MS * 2 ** intento);
        continue;
      }
      // Número inválido, sesión desconectada, clave sin permiso…: reintentar no lo arregla
      if (respuesta.status < 500) return { ok: false, error: ultimoError };
    } catch {
      ultimoError = "No hubo conexión con OpenWA.";
    }
    await esperar(ESPERA_BASE_MS * 2 ** intento);
  }
  return { ok: false, error: ultimoError };
}

export interface EstadoSesionOpenWA {
  /** true si la sesión está lista para enviar y WhatsApp no le puso restricción. */
  lista: boolean;
  motivo?: string;
}

/** Pregunta a OpenWA si el número está conectado y sin restricciones de WhatsApp. */
export async function estadoSesionOpenWA(config: ConfigOpenWA): Promise<EstadoSesionOpenWA> {
  const hacerFetch = config.fetchFn ?? fetch;
  try {
    const respuesta = await hacerFetch(`${config.url}/api/sessions/${encodeURIComponent(config.sessionId)}`, {
      headers: { "X-API-Key": config.apiKey },
    });
    if (!respuesta.ok) return { lista: false, motivo: `OpenWA respondió ${respuesta.status} al consultar la sesión.` };
    const sesion = (await respuesta.json()) as { status?: string; restriction?: unknown };
    if (sesion.status !== "ready") return { lista: false, motivo: `El WhatsApp no está conectado (estado: ${sesion.status ?? "desconocido"}).` };
    if (sesion.restriction) return { lista: false, motivo: "WhatsApp puso una restricción al número: no se envía nada hasta revisarla." };
    return { lista: true };
  } catch {
    return { lista: false, motivo: "No hay conexión con OpenWA (¿está encendido?)." };
  }
}

// ---- Avisos (webhooks) que manda OpenWA ----

/** Firma de OpenWA: "sha256=<hmac del cuerpo crudo>" en el encabezado X-OpenWA-Signature. */
export function firmaOpenWAValida(cuerpoCrudo: string, encabezado: string | null, secreto: string): boolean {
  if (!encabezado) return false;
  const esperada = `sha256=${createHmac("sha256", secreto).update(cuerpoCrudo).digest("hex")}`;
  const a = Buffer.from(encabezado);
  const b = Buffer.from(esperada);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type EstadoMensajeOpenWA = "enviado" | "entregado" | "leido" | "fallido";

export type EventoOpenWA =
  | {
      eventoId: string;
      clase: "entrante";
      telefono: string;
      texto: string | null;
      ubicacion: { lat: number; lng: number } | null;
    }
  | { eventoId: string; clase: "estado"; mensajeIds: string[]; estado: EstadoMensajeOpenWA };

const ESTADOS: Record<string, EstadoMensajeOpenWA> = {
  sent: "enviado",
  delivered: "entregado",
  read: "leido",
  failed: "fallido",
};

interface CuerpoWebhook {
  event?: string;
  idempotencyKey?: string;
  deliveryId?: string;
  data?: {
    id?: string;
    messageId?: string;
    status?: string;
    body?: string;
    type?: string;
    from?: string;
    chatId?: string;
    senderPhone?: string | null;
    fromMe?: boolean;
    isGroup?: boolean;
    kind?: string;
    location?: { latitude?: number; longitude?: number };
  };
}

/** Teléfono de RD (10 dígitos) de quien escribió; null si es un grupo, un estado o un número extranjero. */
function telefonoDeEntrante(data: NonNullable<CuerpoWebhook["data"]>): string | null {
  if (data.fromMe || data.isGroup) return null;
  if (data.kind && data.kind !== "individual") return null;
  const candidato = data.senderPhone ?? (data.chatId?.endsWith("@c.us") ? data.chatId.split("@")[0] : null);
  return candidato ? normalizarTelefonoRD(candidato) : null;
}

/** Convierte el cuerpo de un webhook de OpenWA en un evento propio; null si no interesa. */
export function interpretarEventoOpenWA(cuerpo: unknown): EventoOpenWA | null {
  const c = cuerpo as CuerpoWebhook;
  const eventoId = c?.idempotencyKey ?? c?.deliveryId;
  if (!c?.event || !eventoId || !c.data) return null;

  if (c.event === "message.received") {
    const telefono = telefonoDeEntrante(c.data);
    if (!telefono) return null;
    const { latitude, longitude } = c.data.location ?? {};
    const ubicacion =
      c.data.type === "location" && typeof latitude === "number" && typeof longitude === "number"
        ? { lat: latitude, lng: longitude }
        : null;
    const texto = c.data.type === "chat" || c.data.type === "text" ? (c.data.body ?? null) : null;
    if (!ubicacion && !texto) return null;
    return { eventoId, clase: "entrante", telefono, texto, ubicacion };
  }

  if (c.event === "message.ack" || c.event === "message.failed") {
    const estado = c.event === "message.failed" ? "fallido" : ESTADOS[c.data.status ?? ""];
    const mensajeIds = [c.data.messageId, c.data.id].filter((x): x is string => typeof x === "string");
    if (!estado || mensajeIds.length === 0) return null;
    return { eventoId, clase: "estado", mensajeIds, estado };
  }
  return null;
}
