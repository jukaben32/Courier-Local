import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** La foto de la cédula se borra a los 90 días (Ley 172-13). */
export const DIAS_RETENCION_FOTOS = 90;
const POR_LOTE = 100;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** ISO a partir del cual una foto ya está vencida. */
export function limiteDeRetencion(ahora: Date, dias: number = DIAS_RETENCION_FOTOS): string {
  return new Date(ahora.getTime() - dias * MS_POR_DIA).toISOString();
}

export interface ResumenBorrado {
  entregas: number;
  excepciones: number;
}

async function borrarLote(
  admin: ReturnType<typeof createAdminClient>,
  tabla: "entregas" | "solicitudes_excepcion",
  columnaFoto: string,
  columnaFecha: string,
  limite: string,
  ahora: Date
): Promise<number> {
  const { data } = await admin
    .from(tabla)
    .select(`id, ${columnaFoto}`)
    .not(columnaFoto, "is", null)
    .is("foto_borrada_en", null)
    .lt(columnaFecha, limite)
    .limit(POR_LOTE);
  const filas = (data ?? []) as unknown as Record<string, string>[];
  if (filas.length === 0) return 0;

  // Primero se borra el archivo; si falla, la fila queda sin marcar y se reintenta en la próxima pasada
  const { error } = await admin.storage.from("evidencias").remove(filas.map((f) => f[columnaFoto]));
  if (error) return 0;

  await admin.from(tabla).update({ foto_borrada_en: ahora.toISOString() }).in("id", filas.map((f) => f.id));
  return filas.length;
}

/**
 * Borra las fotos de cédula con más de 90 días: el archivo desaparece, la fila y sus datos se conservan
 * (con la marca foto_borrada_en). Se llama junto a las demás tareas programadas.
 */
export async function borrarFotosVencidas(ahora: Date = new Date(), dias: number = DIAS_RETENCION_FOTOS): Promise<ResumenBorrado> {
  const admin = createAdminClient();
  const limite = limiteDeRetencion(ahora, dias);
  return {
    entregas: await borrarLote(admin, "entregas", "foto_cedula_destinatario_url", "creado_en", limite, ahora),
    excepciones: await borrarLote(admin, "solicitudes_excepcion", "foto_url", "creada_en", limite, ahora),
  };
}
