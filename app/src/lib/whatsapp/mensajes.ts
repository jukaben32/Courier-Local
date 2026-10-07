import { normalizarTelefonoRD } from "@/lib/telefono";
import { accionDeBoton } from "./plantillas";

export interface Franja {
  codigo: string;
  hora_inicio: string; // "HH:MM:SS"
  hora_fin: string;
}

export interface Opcion {
  id: string;
  titulo: string;
}

const PREFIJO_FRANJA = "franja:";

/** Hora local de RD como "HH:MM", para comparar con el fin de cada franja. */
export function horaLocalRD(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Santo_Domingo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(ahora);
}

/** Solo se ofrecen las franjas que todavía no terminaron (el día que llega el camión no hay mañana). */
export function franjasDisponibles(franjas: Franja[], horaActual: string): Franja[] {
  return franjas.filter((f) => f.hora_fin.slice(0, 5) > horaActual);
}

function hora12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const sufijo = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${sufijo}`;
}

/** "9:00 am a 12:00 pm": cabe en los 20 caracteres que permite un botón de WhatsApp. */
export function tituloFranja(franja: Franja): string {
  return `${hora12(franja.hora_inicio)} a ${hora12(franja.hora_fin)}`;
}

/** Botones del mensaje de franjas (WhatsApp admite 3 como máximo). */
export function opcionesFranjas(franjas: Franja[]): Opcion[] {
  return franjas.slice(0, 3).map((f) => ({ id: `${PREFIJO_FRANJA}${f.codigo}`, titulo: tituloFranja(f) }));
}

export function codigoDeFranja(opcionId: string): string | null {
  return opcionId.startsWith(PREFIJO_FRANJA) ? opcionId.slice(PREFIJO_FRANJA.length) : null;
}

// ---- Lo que escribe el cliente, ya interpretado ----

export type Entrante =
  | { telefono: string; tipo: "accion"; accion: string }
  | { telefono: string; tipo: "franja"; codigo: string }
  | { telefono: string; tipo: "ubicacion"; lat: number; lng: number }
  | { telefono: string; tipo: "texto"; texto: string };

interface MensajeYCloud {
  from?: string;
  type?: string;
  text?: { body?: string };
  button?: { payload?: string; text?: string };
  interactive?: { button_reply?: { id?: string }; list_reply?: { id?: string } };
  location?: { latitude?: number; longitude?: number };
}

/** Interpreta un mensaje entrante de YCloud. Devuelve null si no es de un número de RD o no se entiende. */
export function interpretarEntrante(mensaje: MensajeYCloud): Entrante | null {
  const telefono = mensaje.from ? normalizarTelefonoRD(mensaje.from) : null;
  if (!telefono) return null;

  if (mensaje.type === "location") {
    const { latitude, longitude } = mensaje.location ?? {};
    if (typeof latitude === "number" && typeof longitude === "number") {
      return { telefono, tipo: "ubicacion", lat: latitude, lng: longitude };
    }
    return null;
  }

  if (mensaje.type === "interactive") {
    const id = mensaje.interactive?.button_reply?.id ?? mensaje.interactive?.list_reply?.id;
    if (!id) return null;
    const codigo = codigoDeFranja(id);
    return codigo ? { telefono, tipo: "franja", codigo } : { telefono, tipo: "accion", accion: id };
  }

  if (mensaje.type === "button") {
    const accion = accionDeBoton(mensaje.button?.text ?? "") ?? mensaje.button?.payload ?? null;
    if (!accion) return null;
    const codigo = codigoDeFranja(accion);
    return codigo ? { telefono, tipo: "franja", codigo } : { telefono, tipo: "accion", accion };
  }

  if (mensaje.type === "text" && mensaje.text?.body) {
    return { telefono, tipo: "texto", texto: mensaje.text.body };
  }
  return null;
}

export type EstadoMensaje = "enviado" | "entregado" | "leido" | "fallido";

const ESTADOS_YCLOUD: Record<string, EstadoMensaje> = {
  accepted: "enviado",
  sent: "enviado",
  delivered: "entregado",
  read: "leido",
  failed: "fallido",
};

export type EventoYCloud =
  | { eventoId: string; clase: "entrante"; entrante: Entrante | null }
  | { eventoId: string; clase: "estado"; mensajeId: string; estado: EstadoMensaje; error: string | null };

/** Convierte el cuerpo de un webhook de YCloud en un evento propio; null si no nos interesa. */
export function interpretarEvento(cuerpo: unknown): EventoYCloud | null {
  const evento = cuerpo as {
    id?: string;
    type?: string;
    whatsappInboundMessage?: MensajeYCloud;
    whatsappMessage?: { id?: string; status?: string; errorMessage?: string };
  };
  if (!evento?.id || !evento.type) return null;

  if (evento.type === "whatsapp.inbound_message.received" && evento.whatsappInboundMessage) {
    return { eventoId: evento.id, clase: "entrante", entrante: interpretarEntrante(evento.whatsappInboundMessage) };
  }

  if (evento.type === "whatsapp.message.updated" && evento.whatsappMessage?.id) {
    const estado = ESTADOS_YCLOUD[evento.whatsappMessage.status ?? ""];
    if (!estado) return null;
    return {
      eventoId: evento.id,
      clase: "estado",
      mensajeId: evento.whatsappMessage.id,
      estado,
      error: evento.whatsappMessage.errorMessage ?? null,
    };
  }
  return null;
}
