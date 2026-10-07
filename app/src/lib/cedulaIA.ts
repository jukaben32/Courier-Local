import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { IaNoConfigurada } from "./etiqueta";

const CedulaLeida = z.object({
  legible: z.boolean().describe("true solo si la foto es una cédula dominicana y se lee con claridad"),
  nombre: z.string().nullable().describe("Nombres y apellidos completos tal como están impresos"),
  numero: z.string().nullable().describe("Número de cédula (11 dígitos, con o sin guiones)"),
});

export type CedulaLeida = z.infer<typeof CedulaLeida>;

/**
 * Lee la foto de una cédula dominicana (o su captura en pantalla) y devuelve el nombre y el número.
 * Lo que no se vea con claridad se devuelve como null; nunca se adivinan dígitos.
 */
export async function leerCedula(imagenBase64: string): Promise<CedulaLeida> {
  if (!process.env.ANTHROPIC_API_KEY) throw new IaNoConfigurada();

  const client = new Anthropic();
  const respuesta = await client.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 1000,
    system:
      "Lees fotos de cédulas de identidad de República Dominicana. Copia nombre y número exactamente " +
      "como están impresos. Si la imagen no es una cédula, está borrosa o un dato no se ve completo, " +
      "pon legible=false o el dato como null. Nunca adivines ni completes dígitos.",
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imagenBase64 } },
          { type: "text", text: "Extrae el nombre completo y el número de cédula." },
        ],
      },
    ],
    output_config: { effort: "low", format: zodOutputFormat(CedulaLeida) },
  });

  if (!respuesta.parsed_output) throw new Error("No se pudo leer la cédula.");
  return respuesta.parsed_output;
}
