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

/**
 * ENVIO_SOLO_DESDE=2026-10-31: solo se avisa a los paquetes recibidos desde ese día (hora de RD), es decir,
 * los del listado de hoy. Devuelve el ISO del comienzo de ese día, o null si no está puesta o no es válida.
 */
export function desdeFecha(env: Record<string, string | undefined> = process.env): string | null {
  const dia = env.ENVIO_SOLO_DESDE?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null;
  const inicio = new Date(`${dia}T00:00:00-04:00`);
  return Number.isNaN(inicio.getTime()) ? null : inicio.toISOString();
}

const ESTADOS_ABIERTOS = ["recibido", "notificado", "confirmado", "en_ruta", "intento_fallido", "retiro_oficina"];

/**
 * Con el filtro de rutas puesto, el bot solo conversa con quien tiene un paquete abierto con uno de esos
 * repartidores. A los demás se les guarda el mensaje pero no se les contesta.
 */
export async function puedeConversar(telefono: string, idsRepartidores: string[]): Promise<boolean> {
  if (idsRepartidores.length === 0) return false;
  const admin = createAdminClient();
  const { data: personas } = await admin.from("destinatarios").select("id").eq("telefono", telefono);
  const ids = (personas ?? []).map((p: { id: string }) => p.id);
  if (ids.length === 0) return false;
  const { count } = await admin
    .from("paquetes")
    .select("id", { count: "exact", head: true })
    .in("destinatario_id", ids)
    .in("estado", ESTADOS_ABIERTOS)
    .in("repartidor_asignado_id", idsRepartidores);
  return (count ?? 0) > 0;
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
