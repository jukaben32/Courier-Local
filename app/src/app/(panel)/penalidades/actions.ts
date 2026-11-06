"use server";

import { revalidatePath } from "next/cache";
import { TIPOS_PENALIDAD } from "@/lib/demora";
import { esOficina, obtenerUsuarioActual } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";

async function soloOficina() {
  const usuario = await obtenerUsuarioActual();
  return usuario && esOficina(usuario) ? usuario : null;
}

/** Registra una penalidad que cobró el courier (paquete perdido, demora en oficina...). */
export async function registrarPenalidad(formData: FormData): Promise<void> {
  const usuario = await soloOficina();
  if (!usuario) return;

  const guia = String(formData.get("guia") ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const tipo = String(formData.get("tipo") ?? "");
  const costo = Number(String(formData.get("costo") ?? "").replace(/,/g, ""));
  const dias = Number(formData.get("dias"));
  const nota = String(formData.get("nota") ?? "").trim().slice(0, 300);
  if (guia.length < 6 || !(TIPOS_PENALIDAD as readonly string[]).includes(tipo) || !Number.isFinite(costo) || costo < 0) return;

  const supabase = await createClient();
  const { data: paquete } = await supabase.from("paquetes").select("id").eq("numero_guia", guia).maybeSingle();
  await supabase.from("penalidades").insert({
    paquete_id: paquete?.id ?? null,
    numero_guia: guia,
    tipo,
    costo,
    dias_en_oficina: Number.isInteger(dias) && dias >= 0 ? dias : null,
    nota: nota || null,
    registrada_por: usuario.id,
  });
  revalidatePath("/penalidades");
}

export async function marcarPenalidadPagada(formData: FormData): Promise<void> {
  if (!(await soloOficina())) return;
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("penalidades").update({ estado: "pagada", pagada_en: new Date().toISOString() }).eq("id", id).eq("estado", "pendiente");
  revalidatePath("/penalidades");
}
