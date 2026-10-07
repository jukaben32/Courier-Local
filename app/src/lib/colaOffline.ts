// Cola de entregas para cuando el celular no tiene señal: la foto y los datos se guardan en el
// teléfono y se envían solos cuando vuelve la conexión.

export interface EntregaEnCola {
  /** Id local de esta entrada. */
  id: string;
  paqueteId: string;
  guia: string;
  nombre: string;
  /** Foto de la cédula en base64 (JPEG). */
  imagen: string;
  origen: "fisica_en_entrega" | "captura_whatsapp";
  recibeOtro: boolean;
  receptorNombre?: string;
  lat?: number;
  lng?: number;
  /** Momento real de la entrega (ISO): se conserva aunque se envíe horas después. */
  momento: string;
  /** Mensaje cuando el servidor rechazó la entrega y hace falta que una persona la revise. */
  error?: string;
}

export interface Almacen {
  listar(): Promise<EntregaEnCola[]>;
  guardar(entrega: EntregaEnCola): Promise<void>;
  borrar(id: string): Promise<void>;
}

export type ResultadoEnvio =
  | { estado: "ok" }
  | { estado: "sin_conexion" }
  | { estado: "rechazada"; mensaje: string };

export type Enviar = (entrega: EntregaEnCola) => Promise<ResultadoEnvio>;

export interface ResumenSincronizacion {
  enviadas: number;
  pendientes: number;
  conError: number;
}

/**
 * Envía en orden las entregas guardadas. Se detiene en la primera sin conexión (las demás
 * tampoco saldrían). Una entrega rechazada por el servidor (cédula que no coincide, por ejemplo)
 * no se reintenta: queda marcada con su motivo para que la revise una persona.
 */
export async function sincronizar(almacen: Almacen, enviar: Enviar): Promise<ResumenSincronizacion> {
  let enviadas = 0;
  const cola = (await almacen.listar()).sort((a, b) => a.momento.localeCompare(b.momento));

  for (const entrega of cola) {
    if (entrega.error) continue;

    const resultado = await enviar(entrega);
    if (resultado.estado === "ok") {
      await almacen.borrar(entrega.id);
      enviadas += 1;
    } else if (resultado.estado === "rechazada") {
      await almacen.guardar({ ...entrega, error: resultado.mensaje });
    } else {
      break;
    }
  }

  const restantes = await almacen.listar();
  return {
    enviadas,
    pendientes: restantes.filter((e) => !e.error).length,
    conError: restantes.filter((e) => e.error).length,
  };
}

/** Traduce la respuesta del servidor a lo que la cola necesita saber. */
export function clasificarRespuesta(estadoHttp: number, mensaje: string | undefined): ResultadoEnvio {
  if (estadoHttp >= 200 && estadoHttp < 300) return { estado: "ok" };
  // Sesión vencida o fallas del servidor: se reintenta más tarde
  if (estadoHttp === 401 || estadoHttp === 403 || estadoHttp >= 500) return { estado: "sin_conexion" };
  return { estado: "rechazada", mensaje: mensaje ?? "El servidor rechazó la entrega." };
}
