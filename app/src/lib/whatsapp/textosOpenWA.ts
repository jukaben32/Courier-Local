// Textos de los mensajes cuando se envían por OpenWA (WhatsApp sin plantillas ni botones).
// Reglas para no parecer spam: se presenta quién escribe, usa el nombre y la guía del cliente,
// no lleva enlaces ni promociones, es corto y da una salida fácil ("responde NO").
// El aviso de llegada tiene 3 redacciones que se alternan al azar, para que no salgan cientos
// de mensajes idénticos.

import { CONFIG_HORAS, bloquesDisponibles, textoBloque, type ConfigHoras } from "./horas";
import type { OpcionMenu } from "./menu";
import { PLANTILLAS } from "./plantillas";

export interface MensajeConMenu {
  texto: string;
  /** Opciones numeradas del mensaje; vacío si no espera una elección. */
  opciones: OpcionMenu[];
}

export const NOMBRE_REMITENTE_POR_DEFECTO = "Filpo Pack";

interface Contexto {
  ahora: Date;
  config: ConfigHoras;
  remitente: string;
  /** Número entre 0 y 1: elige la variante de redacción (inyectable para las pruebas). */
  azar: () => number;
}

type Linea = { texto: string; opcion: Omit<OpcionMenu, "numero"> };

/** Arma las líneas "1 - …" y las opciones numeradas, en el mismo orden. */
function construirMenu(lineas: Linea[]): { lineas: string; opciones: OpcionMenu[] } {
  const opciones = lineas.map((l, i) => ({ ...l.opcion, numero: i + 1 }) as OpcionMenu);
  return { lineas: lineas.map((l, i) => `${i + 1} - ${l.texto}`).join("\n"), opciones };
}

const LINEA_RETIRO: Linea = { texto: "Paso a buscarlo a la oficina", opcion: { tipo: "retiro" } };
const LINEA_OTRA_PERSONA: Linea = { texto: "Otra persona lo recibe", opcion: { tipo: "otra_persona" } };

function lineasHoras(ctx: Pick<Contexto, "ahora" | "config">): Linea[] {
  return bloquesDisponibles(ctx.ahora, ctx.config).map((hora) => ({
    texto: `Llévenmelo ${textoBloque(hora)}`,
    opcion: { tipo: "hora" as const, hora },
  }));
}

const PIE_HORA = 'También puedes escribir la hora, por ejemplo "4:30 pm".';
const PIE_SALIDA = "Si no esperas este paquete, responde NO.";

/** Menú de horas para cuando el cliente pide otro horario (sin retiro ni "otra persona"). */
export function menuSoloHoras(introduccion: string, ctx: Pick<Contexto, "ahora" | "config">): MensajeConMenu {
  const menu = construirMenu(lineasHoras(ctx));
  return { texto: `${introduccion}\n${menu.lineas}\n${PIE_HORA}`, opciones: menu.opciones };
}

function avisoLlegada(p: string[], ctx: Contexto): MensajeConMenu {
  const [nombre, guias, nombreCompleto] = p;
  const horas = lineasHoras(ctx);
  const menu = construirMenu([LINEA_RETIRO, ...horas, LINEA_OTRA_PERSONA]);
  const { remitente } = ctx;

  const variantes = [
    `Hola ${nombre} 👋, te escribe *${remitente}* (San Pedro de Macorís).\nTu paquete de Temu (${guias}) ya llegó. ¿Cómo prefieres recibirlo?`,
    `Buenas ${nombre}, soy de *${remitente}* en San Pedro de Macorís.\nYa tenemos tu paquete de Temu (${guias}). ¿Cómo lo quieres recibir?`,
    `${nombre}, buen día. Te saluda *${remitente}* (San Pedro de Macorís).\nLlegó tu paquete de Temu (${guias}). Dinos cómo lo prefieres:`,
  ];
  const cabecera = variantes[Math.min(variantes.length - 1, Math.floor(ctx.azar() * variantes.length))];

  const sinHoras = horas.length === 0 ? "\nPor hoy ya no hacemos entregas; mañana a primera hora te escribimos para coordinar." : "";
  const texto = [
    cabecera,
    "Responde solo con el número:",
    menu.lineas,
    ...(horas.length > 0 ? [PIE_HORA] : []),
    `Ten a mano la cédula de ${nombreCompleto}.${sinHoras}`,
    `Guarda este número para tus próximos avisos. ${PIE_SALIDA}`,
  ].join("\n");
  return { texto, opciones: menu.opciones };
}

function recordatorio(p: string[], ctx: Contexto): MensajeConMenu {
  const [nombre, guias] = p;
  const menu = construirMenu([LINEA_RETIRO, ...lineasHoras(ctx)]);
  const cabecera =
    ctx.azar() < 0.5
      ? `Hola ${nombre}, te recuerda *${ctx.remitente}*: todavía tienes un paquete de Temu esperando (${guias}).`
      : `${nombre}, de *${ctx.remitente}*: tu paquete de Temu (${guias}) sigue pendiente de coordinar.`;
  return {
    texto: [cabecera, "Responde con el número:", menu.lineas, PIE_HORA, PIE_SALIDA].join("\n"),
    opciones: menu.opciones,
  };
}

function ultimoDia(p: string[], ctx: Contexto): MensajeConMenu {
  const [nombre, guias] = p;
  const menu = construirMenu([LINEA_RETIRO, ...lineasHoras(ctx)]);
  return {
    texto: [
      `${nombre}, hoy es el último día para recibir tu paquete de Temu (${guias}). Si no lo coordinamos hoy, será devuelto al courier.`,
      "Responde con el número:",
      menu.lineas,
      PIE_HORA,
    ].join("\n"),
    opciones: menu.opciones,
  };
}

function intentoFallido(p: string[], ctx: Contexto): MensajeConMenu {
  const [nombre, guias, intentos] = p;
  const menu = construirMenu([
    { texto: "Reprogramar la entrega", opcion: { tipo: "coordinar" } },
    LINEA_RETIRO,
  ]);
  return {
    texto: [
      `Hola ${nombre}, pasamos por tu paquete de Temu (${guias}) pero no pudimos entregarlo. Te quedan ${intentos} intento(s).`,
      "Responde con el número:",
      menu.lineas,
    ].join("\n"),
    opciones: menu.opciones,
  };
}

/** Texto de una plantilla de Meta con sus parámetros, en versión OpenWA. null si no existe. */
export function textoDePlantilla(
  nombre: string,
  parametros: string[],
  contexto: Partial<Contexto> = {}
): MensajeConMenu | null {
  const ctx: Contexto = {
    ahora: contexto.ahora ?? new Date(),
    config: contexto.config ?? CONFIG_HORAS,
    remitente: contexto.remitente ?? NOMBRE_REMITENTE_POR_DEFECTO,
    azar: contexto.azar ?? Math.random,
  };
  const [p0, p1, p2] = parametros;

  switch (nombre) {
    case PLANTILLAS.avisoLlegada.nombre:
      return avisoLlegada(parametros, ctx);
    case PLANTILLAS.recordatorio.nombre:
      return recordatorio(parametros, ctx);
    case PLANTILLAS.ultimoDia.nombre:
      return ultimoDia(parametros, ctx);
    case PLANTILLAS.intentoFallido.nombre:
      return intentoFallido(parametros, ctx);
    case PLANTILLAS.enCamino.nombre:
      return {
        texto: `Hola ${p0}, tu repartidor de *${ctx.remitente}* va en camino con tu paquete (${p1}). Ten lista la cédula de ${p2}.`,
        opciones: [],
      };
    case PLANTILLAS.entregado.nombre:
      return { texto: `Tu paquete de Temu (${p0}) fue entregado. ¡Gracias por recibirlo! — *${ctx.remitente}*`, opciones: [] };
    default:
      return null;
  }
}
