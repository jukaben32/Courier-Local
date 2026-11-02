// Lógica pura del respaldo con IA (sin llamadas de red ni base de datos, así se puede probar sola).
// Claude solo redacta una respuesta; no cambia nada en el sistema. Si no está seguro, pasa el caso
// a una persona, igual que hoy.

import { z } from "zod";

/** Modelo económico para respuestas de chat (la lectura de cédulas sigue con Opus en cedulaIA.ts). */
export const MODELO_RESPALDO = "claude-haiku-5-5";

/** Paquete abierto del cliente, tal como lo lee la conversación. */
export interface PaqueteContexto {
  id: string;
  estado: string;
  nombre_etiqueta: string;
  ventana_horaria: string | null;
  hora_preferida: string | null;
}

export const RespuestaIA = z.object({
  accion: z.enum(["responder", "pasar_a_persona"]),
  texto: z.string(),
});
export type RespuestaIA = z.infer<typeof RespuestaIA>;

/** Solo se activa con el interruptor explícito y con la clave configurada. Apagado por defecto. */
export function iaRespaldoActiva(entorno: Record<string, string | undefined> = process.env): boolean {
  return entorno.IA_RESPALDO_ACTIVA === "true" && Boolean(entorno.ANTHROPIC_API_KEY);
}

/** Resume los paquetes abiertos para dárselos a Claude como contexto. */
export function construirContexto(paquetes: PaqueteContexto[]): string {
  if (paquetes.length === 0) return "El cliente no tiene paquetes abiertos.";
  return paquetes
    .map((p) => {
      const horario = p.hora_preferida ?? p.ventana_horaria ?? "sin horario elegido";
      return `- Paquete "${p.nombre_etiqueta}": estado ${p.estado}, horario ${horario}.`;
    })
    .join("\n");
}

/** Instrucciones fijas. Aquí se decide qué puede y qué no puede decir el bot. */
export const INSTRUCCIONES_RESPALDO = [
  "Eres el asistente de WhatsApp de un servicio de paquetería local en San Pedro de Macorís.",
  "Responde en español dominicano sencillo, en mensajes cortos.",
  "Solo puedes informar sobre los paquetes que aparecen en el contexto.",
  "Nunca inventes fechas, horas, precios ni direcciones.",
  "Si el cliente pide cambiar horario, cancelar o algo que requiera una decisión, di que una persona lo confirmará y usa la acción pasar_a_persona.",
  "Si no entiendes el mensaje o no está claro, usa la acción pasar_a_persona.",
].join(" ");

/** Convierte la salida de Claude en algo seguro. Si no es válida, se pasa a una persona. */
export function interpretarSalida(salida: unknown): RespuestaIA {
  const valida = RespuestaIA.safeParse(salida);
  if (!valida.success) return { accion: "pasar_a_persona", texto: "" };
  if (valida.data.accion === "responder" && valida.data.texto.trim() === "") {
    return { accion: "pasar_a_persona", texto: "" };
  }
  return valida.data;
}
