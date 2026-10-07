// Catálogo de plantillas de WhatsApp de Courier Local.
//
// Una plantilla es un mensaje con texto fijo y huecos {{1}}, {{2}}… que Meta revisa y aprueba UNA
// vez. Solo con plantillas aprobadas se puede escribirle primero a un cliente. Cuando el cliente
// responde, se abre una ventana de 24 horas donde ya se puede escribir con mensajes libres
// (botones de franjas, pedir ubicación, confirmaciones) sin plantilla.

export const ACCION_COORDINAR = "coordinar";
export const ACCION_RETIRO = "retiro";
export const ACCION_OTRA_PERSONA = "otra_persona";

// Botones de horario dentro de las plantillas. El texto es el que ve el cliente; la acción lleva el
// código de la franja (tabla "franjas"). Si se cambian las franjas hay que recrear estas plantillas en Meta.
const BTN_AM = { texto: "9:00 am a 12:00 pm", accion: "franja:AM" };
const BTN_MID = { texto: "12:00 pm a 3:00 pm", accion: "franja:MID" };
const BTN_PM = { texto: "3:00 pm a 6:00 pm", accion: "franja:PM" };

export interface PlantillaDef {
  nombre: string;
  idioma: "es";
  categoria: "UTILITY";
  cuerpo: string;
  /** Un valor de ejemplo por cada {{n}}, en orden: Meta los exige para aprobar la plantilla. */
  ejemplos: string[];
  /** Botones de respuesta rápida (máximo 25 caracteres cada uno). */
  botones: { texto: string; accion: string }[];
}

export const PLANTILLAS = {
  avisoLlegada: {
    nombre: "aviso_paquete_llegada",
    idioma: "es",
    categoria: "UTILITY",
    // El camión llega al mediodía, así que el primer día solo se ofrecen las franjas de la tarde.
    // El 98 % pide entrega a domicilio: el horario va directo, sin preguntar antes cómo quiere recibirlo.
    cuerpo:
      "Hola {{1}}, tu paquete de Temu ({{2}}) ya llegó a San Pedro de Macorís. ¿Cuándo te lo llevamos? " +
      "Ten a mano la cédula de {{3}}: se la pedirá el repartidor.",
    ejemplos: ["María", "guía CR2026-48213", "María Altagracia Pérez"],
    botones: [BTN_MID, BTN_PM, { texto: "Otra persona lo recibe", accion: ACCION_OTRA_PERSONA }],
  },
  recordatorio: {
    nombre: "recordatorio_coordinar",
    idioma: "es",
    categoria: "UTILITY",
    cuerpo:
      "Hola {{1}}, todavía tienes un paquete de Temu esperando ({{2}}). " +
      "Elige el horario en que te lo llevamos.",
    ejemplos: ["María", "guía CR2026-48213"],
    botones: [BTN_AM, BTN_MID, BTN_PM, { texto: "Paso a buscarlo", accion: ACCION_RETIRO }],
  },
  ultimoDia: {
    nombre: "ultimo_dia_paquete",
    idioma: "es",
    categoria: "UTILITY",
    cuerpo:
      "{{1}}, hoy es el último día para recibir tu paquete de Temu ({{2}}). " +
      "Si no lo coordinamos hoy, será devuelto al courier. Elige tu horario:",
    ejemplos: ["María", "guía CR2026-48213"],
    botones: [BTN_MID, BTN_PM, { texto: "Paso a buscarlo", accion: ACCION_RETIRO }],
  },
  enCamino: {
    nombre: "repartidor_en_camino",
    idioma: "es",
    categoria: "UTILITY",
    cuerpo:
      "Hola {{1}}, tu repartidor va en camino con tu paquete ({{2}}). " +
      "Ten lista la cédula de {{3}}.",
    ejemplos: ["María", "guía CR2026-48213", "María Altagracia Pérez"],
    botones: [],
  },
  entregado: {
    nombre: "paquete_entregado",
    idioma: "es",
    categoria: "UTILITY",
    cuerpo: "Tu paquete de Temu ({{1}}) fue entregado. ¡Gracias por recibirlo!",
    ejemplos: ["guía CR2026-48213"],
    botones: [],
  },
  intentoFallido: {
    nombre: "intento_fallido_reprogramar",
    idioma: "es",
    categoria: "UTILITY",
    cuerpo:
      "Hola {{1}}, pasamos por tu paquete de Temu ({{2}}) pero no pudimos entregarlo. " +
      "Te quedan {{3}} intento(s). ¿Quieres reprogramar?",
    ejemplos: ["María", "guía CR2026-48213", "2"],
    botones: [
      { texto: "Reprogramar entrega", accion: ACCION_COORDINAR },
      { texto: "Paso a buscarlo", accion: ACCION_RETIRO },
    ],
  },
} as const satisfies Record<string, PlantillaDef>;

/** "guía A1" para un paquete; "3 paquetes (A1, A2, A3)" para varios; sin lista si son muchos. */
export function textoGuias(guias: string[]): string {
  if (guias.length === 1) return `guía ${guias[0]}`;
  if (guias.length <= 3) return `${guias.length} paquetes: ${guias.join(", ")}`;
  return `${guias.length} paquetes`;
}

export function primerNombre(nombreCompleto: string): string {
  return nombreCompleto.trim().split(/\s+/)[0];
}

/** Valores de los huecos {{1}}, {{2}}… del aviso de llegada. */
export function parametrosAvisoLlegada(nombreEtiqueta: string, guias: string[]): string[] {
  return [primerNombre(nombreEtiqueta), textoGuias(guias), nombreEtiqueta.trim()];
}

/** Las plantillas con botones rápidos devuelven el texto del botón; se traduce a una acción. */
export function accionDeBoton(textoBoton: string): string | null {
  const limpio = textoBoton
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  for (const plantilla of Object.values(PLANTILLAS)) {
    for (const boton of plantilla.botones) {
      const textoAccion = boton.texto
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase();
      if (textoAccion === limpio) return boton.accion;
    }
  }
  return null;
}

// Textos libres (solo se pueden enviar dentro de la ventana de 24 h abierta por el cliente)
export const TEXTOS = {
  pedirFranja: "¿En qué horario te lo llevamos? Toca una opción:",
  franjaPasada: "Ese horario ya pasó. Elige otro de los disponibles:",
  sinFranjas: "Hoy ya no quedan horarios de entrega. Mañana a primera hora te escribimos para coordinar. ¡Gracias!",
  pedirUbicacion:
    "Comparte la ubicación exacta donde estarás recibiendo el paquete 📍. " +
    "Aunque ya tengamos tu dirección, a veces estás en otro lugar y así llegamos directo.",
  sinPaquetes: "No tengo paquetes tuyos pendientes por coordinar. Si crees que es un error, llama a la oficina.",
  retiro: "Perfecto. Te esperamos en la oficina hoy hasta las 4:00 pm. Lleva tu cédula.",
  otraPersona:
    "Sin problema. Quien reciba el paquete debe llevar la cédula de la persona a nombre de quien viene " +
    "(la física, o una foto de ella que tú le envíes). Sin esa cédula no podemos entregarlo.",
  usarBotones:
    "Para coordinar tu entrega usa los botones de los mensajes anteriores. " +
    "Si necesitas hablar con una persona, llama a la oficina.",
} as const;

export function textoUbicacionRecibida(horario: string | null, nombreEtiqueta: string): string {
  const cuando = horario ? ` en el horario de ${horario}` : "";
  return `Ubicación recibida ✅ Tu repartidor pasará${cuando}. Ten lista la cédula de ${nombreEtiqueta.trim()}.`;
}
