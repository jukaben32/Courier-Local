import "server-only";

// Salida automática de la prueba de entrega hacia el courier de origen.
// Mientras el courier no ofrezca una vía oficial, no hay nada configurado y la subida sigue siendo
// manual (pantalla "Subir al courier"). Cuando la haya (su API, un correo o WhatsApp puenteado con n8n,
// etc.), basta con apuntar COURIER_WEBHOOK_URL a ese puente: la foto sale en el instante de la entrega.

export interface PruebaEntrega {
  entregaId: string;
  guia: string;
  nombre: string;
  cedula: string;
  repartidor: string;
  /** Momento de la entrega (ISO). */
  momento: string;
  /** JPEG en base64. */
  fotoBase64: string;
}

export type ResultadoCanal = { ok: true } | { ok: false; motivo: string };

const ESPERA_MS = 15_000;

/**
 * Manda la prueba al canal del courier. Nunca lanza: devuelve el motivo si no salió, y la entrega
 * sigue su camino manual (el repartidor la sube desde su pantalla como hasta ahora).
 */
export async function enviarPruebaAlCourier(
  prueba: PruebaEntrega,
  env: Record<string, string | undefined> = process.env,
  hacerFetch: typeof fetch = fetch
): Promise<ResultadoCanal> {
  const url = env.COURIER_WEBHOOK_URL?.trim();
  if (!url) return { ok: false, motivo: "sin_canal" };

  try {
    const respuesta = await hacerFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env.COURIER_WEBHOOK_TOKEN ? { Authorization: `Bearer ${env.COURIER_WEBHOOK_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        entrega_id: prueba.entregaId,
        guia: prueba.guia,
        nombre: prueba.nombre,
        cedula: prueba.cedula,
        repartidor: prueba.repartidor,
        momento: prueba.momento,
        foto_tipo: "image/jpeg",
        foto_base64: prueba.fotoBase64,
      }),
      signal: AbortSignal.timeout(ESPERA_MS),
    });
    return respuesta.ok ? { ok: true } : { ok: false, motivo: `El canal respondió ${respuesta.status}` };
  } catch (error) {
    return { ok: false, motivo: error instanceof Error ? error.message : "No hubo conexión con el canal" };
  }
}
