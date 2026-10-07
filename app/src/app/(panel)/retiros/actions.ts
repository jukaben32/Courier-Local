"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { esOficina, obtenerUsuarioActual } from "@/lib/sesion";
import { createAdminClient } from "@/lib/supabase/admin";

/** El organizador confirma que ya subió la prueba del retiro al programa del courier. */
export async function marcarRetiroSubido(entregaId: string): Promise<{ error?: string }> {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || !esOficina(usuario) || !z.string().uuid().safeParse(entregaId).success) {
    return { error: "No autorizado." };
  }

  const { error } = await createAdminClient()
    .from("entregas")
    .update({ cargado_en_courier: true, cargado_en_courier_en: new Date().toISOString() })
    .eq("id", entregaId)
    .eq("tipo", "retiro_oficina")
    .eq("cargado_en_courier", false);
  if (error) return { error: "No se pudo guardar. Intenta de nuevo." };

  revalidatePath("/retiros");
  redirect("/retiros");
}
