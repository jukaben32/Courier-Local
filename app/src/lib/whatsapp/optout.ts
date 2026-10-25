import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Teléfonos de quienes respondieron "NO" (no esperan paquete o no quieren mensajes): no se les
 * vuelve a escribir. Es lo que más protege el número de reportes y bloqueos.
 */
export async function telefonosQueDijeronNo(telefonos: string[]): Promise<Set<string>> {
  if (telefonos.length === 0) return new Set();
  const admin = createAdminClient();
  const dijeronNo = new Set<string>();
  const LOTE = 100;
  for (let i = 0; i < telefonos.length; i += LOTE) {
    const { data } = await admin
      .from("mensajes_whatsapp")
      .select("telefono")
      .eq("direccion", "entrante")
      .eq("contenido", "NO")
      .in("telefono", telefonos.slice(i, i + LOTE));
    for (const fila of data ?? []) dijeronNo.add(fila.telefono as string);
  }
  return dijeronNo;
}
