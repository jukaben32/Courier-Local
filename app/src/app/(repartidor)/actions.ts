"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { obtenerUsuarioActual } from "@/lib/sesion";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface EstadoAccion {
  error?: string;
}

const MOTIVOS_FALLO = ["No había nadie", "No contesta el teléfono", "No encontré la dirección", "Rechazó el paquete", "Pidió otro día"] as const;

/** El repartidor confirma que ya subió la prueba al programa del courier. */
export async function marcarSubidoAlCourier(entregaId: string): Promise<EstadoAccion> {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.rol !== "repartidor" || !z.string().uuid().safeParse(entregaId).success) {
    return { error: "No autorizado." };
  }

  // RLS: solo encuentra la entrega si es suya
  const supabase = await createClient();
  const { data: entrega } = await supabase.from("entregas").select("id").eq("id", entregaId).maybeSingle();
  if (!entrega) return { error: "No encontré esa entrega." };

  // El repartidor no tiene permiso de editar entregas, así que el cambio lo hace el servidor
  const { error } = await createAdminClient()
    .from("entregas")
    .update({ cargado_en_courier: true, cargado_en_courier_en: new Date().toISOString() })
    .eq("id", entregaId)
    .eq("cargado_en_courier", false);
  if (error) return { error: "No se pudo guardar. Intenta de nuevo." };

  revalidatePath("/ruta");
  redirect("/ruta");
}

/** El repartidor fue al lugar y no pudo entregar: cuenta como uno de los 3 intentos. */
export async function registrarIntentoFallido(paqueteId: string, motivo: string): Promise<EstadoAccion> {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.rol !== "repartidor" || !usuario.repartidorId) return { error: "No autorizado." };
  if (!z.string().uuid().safeParse(paqueteId).success || !(MOTIVOS_FALLO as readonly string[]).includes(motivo)) {
    return { error: "Datos inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("entregas").insert({
    paquete_id: paqueteId,
    repartidor_id: usuario.repartidorId,
    tipo: "domicilio",
    resultado: "intento_fallido",
    motivo_fallo: motivo,
  });
  if (error) return { error: "No se pudo registrar el intento." };

  revalidatePath("/ruta");
  redirect("/ruta");
}
