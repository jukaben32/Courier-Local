import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Permite avisar por WhatsApp solo a las rutas de ciertos repartidores (ENVIO_SOLO_REPARTIDORES).
// Los demás paquetes siguen importados y en estado "Recibido", sin recibir ningún mensaje, hasta que se
// quite el filtro. Vacío = se avisa a todos.

/** Texto de la variable en una lista: "Julius, Jaime" -> ["julius", "jaime"]. */
export function filtrosDeRutas(env: Record<string, string | undefined> = process.env): string[] {
  return (env.ENVIO_SOLO_REPARTIDORES ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Ids de los repartidores cuyo id es uno de los filtros o cuyo nombre contiene alguno. */
export function repartidoresQueCoinciden(repartidores: { id: string; nombre: string }[], filtros: string[]): string[] {
  return repartidores
    .filter((r) => filtros.some((f) => r.id.toLowerCase() === f || r.nombre.toLowerCase().includes(f)))
    .map((r) => r.id);
}

export interface RutasPermitidas {
  /** Ids permitidos. */
  ids: string[];
  /** Nombres, para mostrarlos. */
  nombres: string[];
}

/** null cuando no hay filtro (se avisa a todos). Con filtro que no coincide con nadie, ids queda vacío: no se avisa a nadie. */
export async function rutasPermitidas(env: Record<string, string | undefined> = process.env): Promise<RutasPermitidas | null> {
  const filtros = filtrosDeRutas(env);
  if (filtros.length === 0) return null;
  const { data } = await createAdminClient().from("repartidores").select("id, nombre");
  const repartidores = (data ?? []) as { id: string; nombre: string }[];
  const ids = repartidoresQueCoinciden(repartidores, filtros);
  return { ids, nombres: repartidores.filter((r) => ids.includes(r.id)).map((r) => r.nombre) };
}
