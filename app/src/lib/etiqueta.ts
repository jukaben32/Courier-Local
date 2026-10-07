import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const EtiquetaLeida = z.object({
  guia: z.string().nullable().describe("Número de guía o código de seguimiento impreso en la etiqueta"),
  nombre: z.string().nullable().describe("Nombre completo del destinatario, tal como está impreso"),
  telefono: z.string().nullable().describe("Teléfono del destinatario, tal como está impreso"),
  direccion: z.string().nullable().describe("Dirección de entrega completa"),
  sector: z.string().nullable().describe("Sector de la lista que mejor coincide con la dirección, o null si ninguno"),
  contenido: z.string().nullable().describe("Descripción corta del contenido si la etiqueta lo dice"),
});

export type EtiquetaLeida = z.infer<typeof EtiquetaLeida>;
export type TipoImagen = "image/jpeg" | "image/png" | "image/webp";

export class IaNoConfigurada extends Error {
  constructor() {
    super("Falta ANTHROPIC_API_KEY en las variables de entorno del servidor.");
  }
}

/**
 * Lee una foto de etiqueta de paquete y devuelve los datos del destinatario.
 * Lo que la etiqueta no muestre claramente se devuelve como null: nunca se inventa.
 */
export async function leerEtiqueta(
  imagenBase64: string,
  tipo: TipoImagen,
  sectores: string[]
): Promise<EtiquetaLeida> {
  if (!process.env.ANTHROPIC_API_KEY) throw new IaNoConfigurada();

  const client = new Anthropic();
  const respuesta = await client.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 2000,
    system:
      "Lees fotos de etiquetas de paquetes de un courier en República Dominicana. " +
      "Copia los datos exactamente como están impresos. Si un dato no se ve con claridad, " +
      "devuélvelo como null; nunca adivines ni completes números.",
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: tipo, data: imagenBase64 } },
          {
            type: "text",
            text:
              "Extrae los datos de esta etiqueta. Para el campo sector, elige de esta lista el que " +
              `mejor coincida con la dirección (o null si ninguno encaja):\n${sectores.join("\n")}`,
          },
        ],
      },
    ],
    output_config: { effort: "low", format: zodOutputFormat(EtiquetaLeida) },
  });

  if (!respuesta.parsed_output) throw new Error("No se pudo leer la etiqueta.");
  return respuesta.parsed_output;
}
