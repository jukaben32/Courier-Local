import type { SupabaseClient } from "@supabase/supabase-js";

const BLOQUEO_PERMANENTE = "876000h";
const ESTADOS_POR_ENTREGAR = ["recibido", "notificado", "confirmado", "en_ruta", "intento_fallido"];

export interface ResultadoAcceso {
  error?: string;
  /** Paquetes que se quedaron sin entregar a nombre de alguien que ya no trabaja (hay que pasarlos a otro). */
  paquetesHuerfanos?: number;
}

/**
 * Da o quita el acceso a un usuario. Si es repartidor, también lo saca (o lo vuelve a meter) de la
 * asignación de paquetes nuevos. Hay que usar el cliente de administración.
 */
export async function fijarAcceso(admin: SupabaseClient, usuarioId: string, activo: boolean): Promise<ResultadoAcceso> {
  const { data: ficha, error } = await admin.from("usuarios").update({ activo }).eq("id", usuarioId).select("repartidor_id").maybeSingle();
  if (error) return { error: "No se pudo cambiar el estado." };

  // Además de la ficha, se bloquea el acceso para que no pueda renovar su sesión
  await admin.auth.admin.updateUserById(usuarioId, { ban_duration: activo ? "none" : BLOQUEO_PERMANENTE });

  const repartidorId = ficha?.repartidor_id as string | null | undefined;
  if (!repartidorId) return {};
  await admin.from("repartidores").update({ activo }).eq("id", repartidorId);
  if (activo) return {};

  const { count } = await admin
    .from("paquetes")
    .select("id", { count: "exact", head: true })
    .eq("repartidor_asignado_id", repartidorId)
    .in("estado", ESTADOS_POR_ENTREGAR);
  return { paquetesHuerfanos: count ?? 0 };
}
