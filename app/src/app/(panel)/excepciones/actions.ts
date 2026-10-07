"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { esOficina, obtenerUsuarioActual } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";

export interface EstadoResolucion {
  error?: string;
}

const MOTIVO_MINIMO = 5;
const ESTADOS_ENTREGABLES = ["recibido", "notificado", "confirmado", "en_ruta", "intento_fallido"];

/**
 * Un organizador decide una solicitud de excepción de cédula. Siempre deja escrito el motivo.
 * Al autorizar se registra la entrega a nombre del repartidor, con la excepción y quién la autorizó
 * (el pago del repartidor y la prueba para el courier funcionan igual que en una entrega normal).
 */
export async function resolverExcepcion(
  solicitudId: string,
  decision: "aprobar" | "rechazar",
  motivo: string
): Promise<EstadoResolucion> {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || !esOficina(usuario) || !z.string().uuid().safeParse(solicitudId).success) return { error: "No autorizado." };

  const razon = motivo.trim();
  if (razon.length < MOTIVO_MINIMO) return { error: "Escribe el motivo de tu decisión (al menos unas palabras)." };

  const supabase = await createClient();
  const nuevoEstado = decision === "aprobar" ? "aprobada" : "rechazada";

  // Se "toma" la solicitud primero: si otro organizador ya la resolvió, no hay nada que actualizar
  const { data: solicitud } = await supabase
    .from("solicitudes_excepcion")
    .update({ estado: nuevoEstado, resuelto_por: usuario.id, motivo_resolucion: razon, resuelta_en: new Date().toISOString() })
    .eq("id", solicitudId)
    .eq("estado", "pendiente")
    .select("id, paquete_id, repartidor_id, foto_url, nombre_en_cedula, cedula_leida")
    .maybeSingle();
  if (!solicitud) return { error: "Esta solicitud ya fue resuelta." };

  if (decision === "aprobar") {
    const { data: paquete } = await supabase.from("paquetes").select("estado").eq("id", solicitud.paquete_id).maybeSingle();
    const { error } =
      paquete && ESTADOS_ENTREGABLES.includes(paquete.estado)
        ? await supabase.from("entregas").insert({
            paquete_id: solicitud.paquete_id,
            repartidor_id: solicitud.repartidor_id,
            tipo: "domicilio",
            resultado: "entregado",
            foto_cedula_destinatario_url: solicitud.foto_url,
            cedula_origen: "fisica_en_entrega",
            nombre_en_cedula: solicitud.nombre_en_cedula,
            cedula_leida: solicitud.cedula_leida,
            cedula_coincide: false,
            excepcion_motivo: razon,
            excepcion_autorizada_por: usuario.id,
            receptor_es_destinatario: true,
          })
        : { error: { message: "El paquete ya no se puede entregar." } };

    if (error) {
      // Se devuelve la solicitud a pendiente para que no quede "aprobada" sin entrega
      await supabase.from("solicitudes_excepcion").update({ estado: "pendiente" }).eq("id", solicitudId);
      return { error: error.message.includes("sector") ? "El paquete no tiene sector asignado." : "No se pudo registrar la entrega. Revisa el estado del paquete." };
    }
  }

  revalidatePath("/excepciones");
  revalidatePath("/paquetes");
  return {};
}
