import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifica la cabecera `YCloud-Signature` ("t=<timestamp>,s=<firma>"): HMAC-SHA256 del texto
 * `${timestamp}.${cuerpo_crudo}` usando el secreto del webhook. El cuerpo debe ser exactamente
 * el que llegó, sin volver a convertirlo a JSON.
 *
 * No se rechaza por antigüedad del timestamp: YCloud reintenta los envíos fallidos hasta por
 * unas 8 horas y no documenta si el timestamp se renueva. La protección contra repeticiones
 * se hace guardando el id de cada evento ya procesado.
 */
export function firmaYCloudValida(cuerpoCrudo: string, cabecera: string | null, secreto: string): boolean {
  if (!cabecera || !secreto) return false;

  const partes = new Map<string, string>();
  for (const trozo of cabecera.split(",")) {
    const igual = trozo.indexOf("=");
    if (igual > 0) partes.set(trozo.slice(0, igual).trim(), trozo.slice(igual + 1).trim());
  }
  const timestamp = partes.get("t");
  const recibida = partes.get("s");
  if (!timestamp || !recibida) return false;

  const esperada = createHmac("sha256", secreto).update(`${timestamp}.${cuerpoCrudo}`).digest("hex");
  const a = Buffer.from(recibida);
  const b = Buffer.from(esperada);
  return a.length === b.length && timingSafeEqual(a, b);
}
