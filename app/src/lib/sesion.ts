import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type RolUsuario = "dueno" | "organizador" | "repartidor";

export interface UsuarioActual {
  id: string;
  nombre: string;
  rol: RolUsuario;
  repartidorId: string | null;
}

/** Usuario con sesión iniciada y su rol; null si no hay sesión o fue desactivado. */
export const obtenerUsuarioActual = cache(async (): Promise<UsuarioActual | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("usuarios")
    .select("nombre, rol, repartidor_id, activo")
    .eq("id", user.id)
    .maybeSingle();

  if (!data || !data.activo) return null;
  return { id: user.id, nombre: data.nombre, rol: data.rol, repartidorId: data.repartidor_id };
});

export function esOficina(usuario: UsuarioActual): boolean {
  return usuario.rol === "dueno" || usuario.rol === "organizador";
}
