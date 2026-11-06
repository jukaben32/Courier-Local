"use server";

import { revalidatePath } from "next/cache";
import { esOficina, obtenerUsuarioActual } from "@/lib/sesion";
import { createAdminClient } from "@/lib/supabase/admin";

/** Deja solo los dígitos (y el + inicial). Vacío = sin teléfono. */
function limpiar(valor: FormDataEntryValue | null): string | null {
  const texto = String(valor ?? "").trim();
  if (!texto) return null;
  const limpio = texto.replace(/(?!^\+)[^0-9]/g, "");
  return limpio.length >= 7 && limpio.length <= 15 ? limpio : "invalido";
}

export async function guardarTelefonosRepartidor(formData: FormData): Promise<void> {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || !esOficina(usuario)) return;

  const id = String(formData.get("id") ?? "");
  const telefono = limpiar(formData.get("telefono"));
  const telefono2 = limpiar(formData.get("telefono2"));
  if (!id || telefono === "invalido" || telefono2 === "invalido") return;

  const admin = createAdminClient();
  await admin.from("repartidores").update({ telefono, telefono2 }).eq("id", id);
  revalidatePath("/repartidores");
}
