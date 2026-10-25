// Convierte los mensajes que arma la app (formato de Meta/YCloud: plantillas, botones, pedir
// ubicación) a texto plano con menú numerado, que es lo único que entiende OpenWA.
// Así conversacion.ts, recordatorios.ts y los avisos se reutilizan sin cambios.

import { CONFIG_HORAS, type ConfigHoras } from "./horas";
import {
  NOMBRE_REMITENTE_POR_DEFECTO,
  menuSoloHoras,
  textoDePlantilla,
  type MensajeConMenu,
} from "./textosOpenWA";

/** Mensaje propio de la versión OpenWA: texto + el menú de horas que quedan hoy. */
export const TIPO_MENU_HORAS = "menu_horas";

export function cuerpoMenuHoras(texto: string): Record<string, unknown> {
  return { type: TIPO_MENU_HORAS, text: texto };
}

export interface ContextoTexto {
  ahora?: Date;
  config?: ConfigHoras;
  remitente?: string;
  azar?: () => number;
}

interface CuerpoMeta {
  type?: string;
  text?: string | { body?: string };
  template?: { name?: string; components?: { parameters?: { text?: string }[] }[] };
  interactive?: { type?: string; body?: { text?: string } };
}

const INSTRUCCION_UBICACION = "Toca el clip 📎 > Ubicación > Enviar tu ubicación actual.";

/** null si el cuerpo no se puede representar como texto (no se envía). */
export function aTextoPlano(cuerpo: Record<string, unknown>, contexto: ContextoTexto = {}): MensajeConMenu | null {
  const c = cuerpo as CuerpoMeta;
  const ctx = {
    ahora: contexto.ahora ?? new Date(),
    config: contexto.config ?? CONFIG_HORAS,
    remitente: contexto.remitente ?? NOMBRE_REMITENTE_POR_DEFECTO,
    azar: contexto.azar ?? Math.random,
  };

  if (c.type === "text") {
    const texto = typeof c.text === "string" ? c.text : c.text?.body;
    return texto ? { texto, opciones: [] } : null;
  }

  if (c.type === TIPO_MENU_HORAS && typeof c.text === "string") {
    return menuSoloHoras(c.text, ctx);
  }

  if (c.type === "template" && c.template?.name) {
    const parametros = (c.template.components ?? []).flatMap((x) => (x.parameters ?? []).map((p) => p.text ?? ""));
    return textoDePlantilla(c.template.name, parametros, ctx);
  }

  if (c.type === "interactive" && c.interactive?.type === "location_request_message") {
    const texto = c.interactive.body?.text;
    return texto ? { texto: `${texto} ${INSTRUCCION_UBICACION}`, opciones: [] } : null;
  }

  // Los botones de franjas ya no se usan en OpenWA: el menú de horas los reemplaza
  if (c.type === "interactive" && c.interactive?.type === "button") {
    return menuSoloHoras(c.interactive.body?.text ?? "¿Cuándo te lo llevamos?", ctx);
  }

  return null;
}
