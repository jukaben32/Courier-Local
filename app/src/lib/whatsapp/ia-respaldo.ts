import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { ESTADOS_CON_RUTA, paquetesDelCliente, responder } from "./conversacion";
import { cuerpoTexto } from "./envio";
import {
  INSTRUCCIONES_RESPALDO,
  MODELO_RESPALDO,
  RespuestaIA,
  construirContexto,
  iaRespaldoActiva,
  interpretarSalida,
  type PaqueteContexto,
} from "./ia-respaldo-logica";

type Admin = ReturnType<typeof createAdminClient>;

/** Pide a Claude una respuesta para el texto del cliente, con el contexto de sus paquetes. */
async function redactarRespuesta(texto: string, paquetes: PaqueteContexto[]) {
  const client = new Anthropic();
  const respuesta = await client.messages.parse({
    model: MODELO_RESPALDO,
    max_tokens: 300, // respuestas cortas: limita el costo
    system: INSTRUCCIONES_RESPALDO,
    messages: [
      {
        role: "user",
        content: `Contexto del cliente:\n${construirContexto(paquetes)}\n\nMensaje del cliente:\n${texto}`,
      },
    ],
    output_config: { format: zodOutputFormat(RespuestaIA) },
  });
  return interpretarSalida(respuesta.parsed_output);
}

/**
 * Respaldo para mensajes que el menú no entiende. Si la IA está apagada, si el cliente no tiene
 * paquetes abiertos o si Claude falla, no hace nada y el mensaje lo lee una persona.
 */
export async function responderConIA(admin: Admin, telefono: string, texto: string): Promise<void> {
  if (!iaRespaldoActiva()) return;

  const paquetes = await paquetesDelCliente(admin, telefono, ESTADOS_CON_RUTA);
  if (paquetes.length === 0) return;

  let salida;
  try {
    salida = await redactarRespuesta(texto, paquetes);
  } catch (error) {
    // Error de la IA: se registra sin datos del cliente y la persona lo atiende
    console.error("Respaldo IA falló:", error instanceof Error ? error.message : "desconocido");
    return;
  }
  if (salida.accion === "pasar_a_persona") return;

  await admin.from("mensajes_whatsapp").insert({
    paquete_id: paquetes[0].id,
    telefono,
    direccion: "entrante",
    tipo: "respuesta",
    estado: "entregado",
    contenido: texto,
  });
  await responder(admin, telefono, paquetes[0].id, {
    tipo: "respuesta",
    cuerpo: cuerpoTexto(salida.texto),
    resumen: salida.texto,
  });
}
