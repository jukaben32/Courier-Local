import { clasificarRespuesta, type EntregaEnCola, type ResultadoEnvio } from "./colaOffline";

export interface RespuestaEntrega {
  resultado: ResultadoEnvio;
  entregaId?: string;
  /** Código del rechazo del servidor ("no_coincide", "ilegible"…), si lo hubo. */
  codigo?: string;
}

/** Envía una entrega al servidor (verifica la cédula y la registra). Sin señal devuelve "sin_conexion". */
export async function enviarEntrega(entrega: EntregaEnCola): Promise<RespuestaEntrega> {
  try {
    const respuesta = await fetch("/api/entrega", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paqueteId: entrega.paqueteId,
        imagen: entrega.imagen,
        origen: entrega.origen,
        recibeOtro: entrega.recibeOtro,
        receptorNombre: entrega.receptorNombre,
        lat: entrega.lat,
        lng: entrega.lng,
        momento: entrega.momento,
      }),
    });
    const cuerpo = (await respuesta.json().catch(() => ({}))) as { error?: string; entregaId?: string; codigo?: string };
    return { resultado: clasificarRespuesta(respuesta.status, cuerpo.error), entregaId: cuerpo.entregaId, codigo: cuerpo.codigo };
  } catch {
    return { resultado: { estado: "sin_conexion" } };
  }
}
