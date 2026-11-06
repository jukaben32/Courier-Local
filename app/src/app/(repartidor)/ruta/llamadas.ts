"use server";

import { revalidatePath } from "next/cache";
import { esResultadoLlamada } from "@/lib/demora";
import { obtenerUsuarioActual } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";

export interface EstadoLlamada {
  ok?: boolean;
  error?: string;
}

/** Anota una llamada al cliente: quién llamó, a qué teléfono y qué pasó. */
export async function registrarLlamada(_previo: EstadoLlamada, formData: FormData): Promise<EstadoLlamada> {
  const usuario = await obtenerUsuarioActual();
  if (!usuario) return { error: "Tu sesión venció. Entra de nuevo." };

  const paqueteId = String(formData.get("paquete_id") ?? "");
  const telefono = String(formData.get("telefono") ?? "").replace(/[^0-9+]/g, "").slice(0, 20);
  const resultado = formData.get("resultado");
  const nota = String(formData.get("nota") ?? "").trim().slice(0, 300);
  if (!paqueteId || !telefono) return { error: "Falta el paquete o el teléfono." };
  if (!esResultadoLlamada(resultado)) return { error: "Elige qué pasó con la llamada." };

  const supabase = await createClient();
  const { error } = await supabase.from("llamadas").insert({
    paquete_id: paqueteId,
    repartidor_id: usuario.repartidorId,
    usuario_id: usuario.id,
    telefono,
    resultado,
    nota: nota || null,
  });
  if (error) return { error: "No se pudo guardar la llamada. Intenta de nuevo." };

  revalidatePath("/ruta");
  revalidatePath("/paquetes");
  return { ok: true };
}
