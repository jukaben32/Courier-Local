"use server";

import { revalidatePath } from "next/cache";
import { clasificarEscaneo, normalizarCodigo, type ResultadoEscaneo } from "@/lib/escaneo";
import { esOficina, obtenerUsuarioActual } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";

export interface RespuestaEscaneo {
  resultado: ResultadoEscaneo | "error";
  guia: string;
  nombre?: string;
  sector?: string;
  repartidor?: string;
  /** Hora (RD) a la que ya se había escaneado, si es duplicado. */
  horaPrevia?: string;
  error?: string;
}

const horaRD = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-DO", { timeZone: "America/Santo_Domingo", hour: "numeric", minute: "2-digit", hour12: true });

export async function escanearGuia(codigoCrudo: string): Promise<RespuestaEscaneo> {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || !esOficina(usuario)) return { resultado: "error", guia: "", error: "No tienes permiso para recibir paquetes." };

  const guia = normalizarCodigo(codigoCrudo);
  if (guia.length < 6) return { resultado: "error", guia, error: "No se leyó bien el código. Escanea otra vez." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("paquetes")
    .select("id, nombre_etiqueta, repartidor_asignado_id, escaneado_en, sectores(nombre), repartidores:repartidor_asignado_id(nombre)")
    .eq("numero_guia", guia)
    .order("fecha_recibido", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { resultado: "error", guia, error: "No se pudo consultar. Intenta de nuevo." };

  const paquete = data as unknown as {
    id: string;
    nombre_etiqueta: string;
    repartidor_asignado_id: string | null;
    escaneado_en: string | null;
    sectores: { nombre: string } | null;
    repartidores: { nombre: string } | null;
  } | null;

  const resultado = clasificarEscaneo(paquete);
  if (!paquete) return { resultado, guia };

  if (resultado !== "duplicado") {
    const { error: errorMarca } = await supabase
      .from("paquetes")
      .update({ escaneado_en: new Date().toISOString(), escaneado_por: (await supabase.auth.getUser()).data.user?.id ?? null })
      .eq("id", paquete.id);
    if (errorMarca) return { resultado: "error", guia, error: "No se pudo marcar como recibido. Intenta de nuevo." };
    revalidatePath("/escanear");
  }

  return {
    resultado,
    guia,
    nombre: paquete.nombre_etiqueta,
    sector: paquete.sectores?.nombre ?? "Sin sector",
    repartidor: paquete.repartidores?.nombre,
    horaPrevia: paquete.escaneado_en ? horaRD(paquete.escaneado_en) : undefined,
  };
}
