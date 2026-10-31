"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { MOTIVOS_SIN_SUBIR } from "@/lib/pruebasCourier";
import { obtenerUsuarioActual } from "@/lib/sesion";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface EstadoAccion {
  error?: string;
}


/** El repartidor confirma que ya subió la prueba al programa del courier. */
/**
 * El repartidor no pudo subir la prueba al courier en el momento. Queda el motivo (la oficina lo ve) y
 * la ruta deja de bloquearse, pero la prueba sigue contando como pendiente hasta que se suba.
 */
export async function marcarSinSubir(entregaId: string, motivo: string): Promise<EstadoAccion> {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || usuario.rol !== "repartidor" || !z.string().uuid().safeParse(entregaId).success) {
    return { error: "No autorizado." };
  }
  if (!(MOTIVOS_SIN_SUBIR as readonly string[]).includes(motivo)) return { error: "Datos inválidos." };

  // RLS: solo encuentra la entrega si es suya
  const supabase = await createClient();
  const { data: entrega } = await supabase.from("entregas").select("id").eq("id", entregaId).maybeSingle();
  if (!entrega) return { error: "No encontré esa entrega." };

  const { error } = await createAdminClient()
    .from("entregas")
    .update({ motivo_sin_subir: motivo })
    .eq("id", entregaId)
    .eq("cargado_en_courier", false);
  if (error) return { error: "No se pudo guardar. Intenta de nuevo." };

  revalidatePath("/ruta");
  redirect("/ruta");
}

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
