import "server-only";
import { evaluarEstadoEnvio, type EstadoEnvio, type SesionEstado } from "./estadoEnvio";
import { diaDeRD } from "./periodoPago";
import type { createClient } from "./supabase/server";
import { configsOpenWA, ritmoDesdeEntorno, usaOpenWA } from "./whatsapp/proveedor";
import { desdeFecha, rutasPermitidas } from "./whatsapp/soloRutas";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface DatosEstadoEnvio {
  estado: EstadoEnvio;
  sesiones: SesionEstado[] | null;
  enCola: number;
  avisadosHoy: number;
  /** Nombres de los repartidores a los que se limita el envío, o null si se avisa a todos. */
  soloRutas: string[] | null;
  /** Día desde el que se avisa (YYYY-MM-DD), si el envío se limita al listado de hoy. */
  soloDesde: string | null;
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

  const permitidas = await rutasPermitidas();
  let consultaCola = supabase.from("paquetes").select("id", { count: "exact", head: true }).eq("estado", "recibido");
  const desde = desdeFecha();
  if (desde) consultaCola = consultaCola.gte("fecha_recibido", desde);

  const [sesiones, { data: avisos }, { count: enCola }] = await Promise.all([
    leerSesiones(),
    supabase
      .from("mensajes_whatsapp")
      .select("telefono, estado, creado_en")
      .eq("direccion", "saliente")
      .eq("tipo", "aviso")
      .or("proveedor_id.is.null,proveedor_id.not.like.sim-*")
      .gte("creado_en", inicioHoy)
      .order("creado_en", { ascending: false })
      .limit(5000),
    permitidas ? consultaCola.in("repartidor_asignado_id", permitidas.ids.length ? permitidas.ids : ["00000000-0000-0000-0000-000000000000"]) : consultaCola,
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
  return { estado, sesiones, enCola: enCola ?? 0, avisadosHoy, soloRutas: permitidas ? permitidas.nombres : null, soloDesde: desde ? (process.env.ENVIO_SOLO_DESDE ?? "").trim() : null };
}
