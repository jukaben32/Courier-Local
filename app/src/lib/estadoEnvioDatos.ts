import "server-only";
import { evaluarEstadoEnvio, type EstadoEnvio, type SesionEstado } from "./estadoEnvio";
import { diaDeRD } from "./periodoPago";
import type { createClient } from "./supabase/server";
import { configsOpenWA, ritmoDesdeEntorno, usaOpenWA } from "./whatsapp/proveedor";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface DatosEstadoEnvio {
  estado: EstadoEnvio;
  sesiones: SesionEstado[] | null;
  enCola: number;
  avisadosHoy: number;
}

/** Cada cuenta de WhatsApp tal como la ve OpenWA. null si OpenWA no responde. */
async function leerSesiones(): Promise<SesionEstado[] | null> {
  const configs = configsOpenWA();
  try {
    return await Promise.all(
      configs.map(async (c) => {
        const respuesta = await fetch(`${c.url}/api/sessions/${encodeURIComponent(c.sessionId)}`, {
          headers: { "X-API-Key": c.apiKey },
          signal: AbortSignal.timeout(3000),
          cache: "no-store",
        });
        if (!respuesta.ok) throw new Error(`OpenWA respondió ${respuesta.status}`);
        const s = (await respuesta.json()) as { name?: string; phone?: string | null; status?: string; restriction?: unknown };
        return {
          nombre: s.name ?? c.sessionId.slice(0, 8),
          telefono: s.phone ?? null,
          estado: s.restriction ? "restringida" : (s.status ?? "desconocido"),
          lista: s.status === "ready" && !s.restriction,
        };
      })
    );
  } catch {
    return null;
  }
}

/** null cuando los avisos no salen por OpenWA (no aplica). */
export async function leerEstadoEnvio(supabase: Supabase): Promise<DatosEstadoEnvio | null> {
  if (!usaOpenWA()) return null;
  const inicioHoy = new Date(`${diaDeRD(new Date())}T00:00:00-04:00`).toISOString();

  const [sesiones, { data: avisos }, { count: enCola }] = await Promise.all([
    leerSesiones(),
    supabase
      .from("mensajes_whatsapp")
      .select("telefono, estado, creado_en")
      .eq("direccion", "saliente")
      .eq("tipo", "aviso")
      .gte("creado_en", inicioHoy)
      .order("creado_en", { ascending: false })
      .limit(5000),
    supabase.from("paquetes").select("id", { count: "exact", head: true }).eq("estado", "recibido"),
  ]);

  const filas = (avisos ?? []) as { telefono: string; estado: string; creado_en: string }[];
  const enviados = filas.filter((f) => f.estado !== "fallido");
  const avisadosHoy = new Set(enviados.map((f) => f.telefono)).size;
  const fallidosHoy = new Set(filas.filter((f) => f.estado === "fallido").map((f) => f.telefono)).size;

  const estado = evaluarEstadoEnvio({
    sesiones,
    enCola: enCola ?? 0,
    avisadosHoy,
    fallidosHoy,
    ultimoAviso: enviados[0]?.creado_en ?? null,
    ahora: new Date(),
    ritmo: ritmoDesdeEntorno(),
  });
  return { estado, sesiones, enCola: enCola ?? 0, avisadosHoy };
}
