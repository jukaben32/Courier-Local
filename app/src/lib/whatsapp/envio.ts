// Envío masivo de mensajes por la API de YCloud.
// Usa el endpoint ASÍNCRONO (POST /v2/whatsapp/messages): acepta hasta 200 mensajes por segundo y
// YCloud los entrega a Meta a ~60 por segundo, así que cientos de avisos salen en pocos segundos.
// No usar a la vez el endpoint "sendDirectly" con el mismo número (lo desaconseja YCloud).

const URL_MENSAJES = "https://api.ycloud.com/v2/whatsapp/messages";
const CONCURRENCIA_POR_DEFECTO = 20;
const INTENTOS_MAXIMOS = 4;
const ESPERA_BASE_MS = 500;

/** Mensaje listo para enviar. `cuerpo` trae el tipo (template, interactive, text) y su contenido. */
export interface MensajeSaliente {
  /** Teléfono de 10 dígitos de RD. */
  telefono: string;
  /** Referencia propia para rastrear el mensaje en los webhooks. */
  externalId?: string;
  cuerpo: Record<string, unknown>;
}

export interface ResultadoEnvio {
  ok: boolean;
  /** Id del mensaje en YCloud: sirve para cruzar los avisos de entregado/leído/fallido. */
  id?: string;
  error?: string;
}

export interface ConfigEnvio {
  apiKey: string;
  /** Número del negocio en formato +18095550000. */
  desde: string;
  concurrencia?: number;
  fetchFn?: typeof fetch;
  esperar?: (ms: number) => Promise<void>;
}

const dormir = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

function aE164(telefono: string): string {
  return `+1${telefono}`;
}

async function mensajeDeError(respuesta: Response): Promise<string> {
  try {
    const json = (await respuesta.json()) as { error?: { message?: string }; message?: string };
    return json.error?.message ?? json.message ?? `Error ${respuesta.status}`;
  } catch {
    return `Error ${respuesta.status}`;
  }
}

async function enviarUno(mensaje: MensajeSaliente, config: ConfigEnvio): Promise<ResultadoEnvio> {
  const hacerFetch = config.fetchFn ?? fetch;
  const esperar = config.esperar ?? dormir;
  const cuerpo = JSON.stringify({
    from: config.desde,
    to: aE164(mensaje.telefono),
    ...(mensaje.externalId ? { externalId: mensaje.externalId } : {}),
    ...mensaje.cuerpo,
  });

  let ultimoError = "No se pudo enviar el mensaje.";
  for (let intento = 0; intento < INTENTOS_MAXIMOS; intento += 1) {
    try {
      const respuesta = await hacerFetch(URL_MENSAJES, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": config.apiKey },
        body: cuerpo,
      });

      if (respuesta.ok) {
        const datos = (await respuesta.json()) as { id?: string };
        return { ok: true, id: datos.id };
      }

      // Demasiadas peticiones: YCloud dice cuántos segundos esperar en Retry-After
      if (respuesta.status === 429) {
        const segundos = Number(respuesta.headers.get("retry-after"));
        ultimoError = "WhatsApp está recibiendo demasiados mensajes a la vez.";
        await esperar(Number.isFinite(segundos) && segundos > 0 ? segundos * 1000 : ESPERA_BASE_MS * 2 ** intento);
        continue;
      }

      ultimoError = await mensajeDeError(respuesta);
      // Los errores 4xx (número inválido, plantilla no aprobada…) no mejoran reintentando
      if (respuesta.status < 500) return { ok: false, error: ultimoError };
    } catch {
      ultimoError = "No hubo conexión con YCloud.";
    }
    await esperar(ESPERA_BASE_MS * 2 ** intento);
  }
  return { ok: false, error: ultimoError };
}

/**
 * Envía todos los mensajes con un máximo de peticiones simultáneas. Un fallo no detiene el resto.
 * El resultado va en el mismo orden que la lista recibida.
 */
export async function enviarMensajes(
  mensajes: MensajeSaliente[],
  config: ConfigEnvio
): Promise<ResultadoEnvio[]> {
  const resultados: ResultadoEnvio[] = new Array(mensajes.length);
  const trabajadores = Math.max(1, Math.min(config.concurrencia ?? CONCURRENCIA_POR_DEFECTO, mensajes.length));
  let siguiente = 0;

  async function trabajar(): Promise<void> {
    while (siguiente < mensajes.length) {
      const posicion = siguiente;
      siguiente += 1;
      resultados[posicion] = await enviarUno(mensajes[posicion], config);
    }
  }

  await Promise.all(Array.from({ length: trabajadores }, trabajar));
  return resultados;
}

// ---- Constructores del cuerpo de cada tipo de mensaje ----

export function cuerpoPlantilla(
  nombre: string,
  parametros: string[]
): Record<string, unknown> {
  return {
    type: "template",
    template: {
      name: nombre,
      language: { code: "es" },
      components: parametros.length
        ? [{ type: "body", parameters: parametros.map((text) => ({ type: "text", text })) }]
        : [],
    },
  };
}

export function cuerpoTexto(texto: string): Record<string, unknown> {
  return { type: "text", text: { body: texto } };
}

/** Botones de respuesta (máximo 3, de hasta 20 caracteres): solo dentro de la ventana de 24 h. */
export function cuerpoBotones(
  texto: string,
  opciones: { id: string; titulo: string }[]
): Record<string, unknown> {
  if (opciones.length === 0 || opciones.length > 3) {
    throw new Error("WhatsApp permite de 1 a 3 botones por mensaje.");
  }
  return {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: texto },
      action: {
        buttons: opciones.map((o) => ({ type: "reply", reply: { id: o.id, title: o.titulo.slice(0, 20) } })),
      },
    },
  };
}

/** Pide al cliente que comparta su ubicación con un solo toque (mensaje interactivo de Meta). */
export function cuerpoPedirUbicacion(texto: string): Record<string, unknown> {
  return {
    type: "interactive",
    interactive: {
      type: "location_request_message",
      body: { text: texto },
      action: { name: "send_location" },
    },
  };
}
