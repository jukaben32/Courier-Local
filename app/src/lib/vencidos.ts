import "server-only";
import { nivelPlazo } from "@/lib/plazo";
import { createAdminClient } from "@/lib/supabase/admin";

const ESTADOS_ABIERTOS = ["recibido", "notificado", "confirmado", "en_ruta", "intento_fallido", "retiro_oficina"];
// Un paquete con más de 2 días no puede estar aún dentro del plazo de 3 días: sirve para no traer todo
const MARGEN_PREVIO_MS = 48 * 60 * 60 * 1000;

export interface ResumenVencidos {
  devueltos: number;
}

/**
 * Pasa a "devuelto" lo que ya agotó los 3 días del courier (se cuenta por días de calendario de RD:
 * el tercer día es el último intento y a la medianoche se cierra). Si hubo intentos fallidos el motivo
 * es "no localizable"; si el cliente nunca respondió, "sin respuesta". Ninguno resta puntos al repartidor.
 */
export async function cerrarVencidos(ahora: Date = new Date()): Promise<ResumenVencidos> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("paquetes")
    .select("id, fecha_recibido, intentos_realizados")
    .in("estado", ESTADOS_ABIERTOS)
    .lt("fecha_recibido", new Date(ahora.getTime() - MARGEN_PREVIO_MS).toISOString());

  const vencidos = (data ?? []).filter((p) => nivelPlazo(new Date(p.fecha_recibido), ahora) === "vencido");
  const conIntentos = vencidos.filter((p) => p.intentos_realizados > 0).map((p) => p.id);
  const sinIntentos = vencidos.filter((p) => p.intentos_realizados === 0).map((p) => p.id);
  const fecha = ahora.toISOString();

  if (conIntentos.length > 0) {
    await admin.from("paquetes").update({ estado: "devuelto", motivo_devolucion: "no_localizable", fecha_devolucion: fecha }).in("id", conIntentos);
  }
  if (sinIntentos.length > 0) {
    await admin.from("paquetes").update({ estado: "devuelto", motivo_devolucion: "sin_respuesta_destinatario", fecha_devolucion: fecha }).in("id", sinIntentos);
  }
  return { devueltos: vencidos.length };
}
