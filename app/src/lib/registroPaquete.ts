import "server-only";
import { aplicarCoberturas, elegirRepartidor } from "@/lib/asignacion";
import { diaDeRD } from "@/lib/periodoPago";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const ESTADOS_PENDIENTES = ["recibido", "notificado", "confirmado", "en_ruta", "intento_fallido"];

export interface DatosPaquete {
  guia: string;
  nombre: string;
  /** Ya normalizado a 10 dígitos de RD. */
  telefono: string;
  direccion?: string;
  sectorId?: string;
  contenido?: string;
  voluminoso: boolean;
  /** Solo los que vienen de un listado importado. */
  importacionId?: string;
  datosListado?: Record<string, string>;
}

/** Lo que hace falta para repartir: se carga una vez y sirve para uno o cientos de paquetes. */
export interface ContextoAsignacion {
  administradorId: string | null;
  /** Dueños de cada sector, ya con las coberturas de hoy aplicadas. */
  duenosPorSector: Map<string, string[]>;
  /** Paquetes pendientes por repartidor; se va sumando con cada paquete guardado. */
  cargaActual: Record<string, number>;
}

export async function cargarContextoAsignacion(supabase: Supabase, sectorIds: string[]): Promise<ContextoAsignacion> {
  const hoy = diaDeRD(new Date());
  const [{ data: rutas }, { data: admin }, { data: pendientes }, { data: coberturas }] = await Promise.all([
    sectorIds.length > 0
      ? supabase
          .from("repartidor_sectores")
          .select("sector_id, repartidor_id, repartidores!inner(activo, rol)")
          .in("sector_id", sectorIds)
          .eq("repartidores.activo", true)
          .eq("repartidores.rol", "repartidor")
      : Promise.resolve({ data: [] }),
    supabase.from("repartidores").select("id").eq("rol", "administrador").eq("activo", true).limit(1),
    supabase.from("paquetes").select("repartidor_asignado_id").in("estado", ESTADOS_PENDIENTES).not("repartidor_asignado_id", "is", null),
    // Ausencias que se están cubriendo hoy: el paquete del que falta va a quien lo cubre
    supabase.from("coberturas").select("ausente_id, cubre_id").lte("desde", hoy).gte("hasta", hoy).is("terminada_en", null),
  ]);

  const cargaActual: Record<string, number> = {};
  for (const p of pendientes ?? []) {
    cargaActual[p.repartidor_asignado_id] = (cargaActual[p.repartidor_asignado_id] ?? 0) + 1;
  }

  const listaCoberturas = (coberturas ?? []).map((c: { ausente_id: string; cubre_id: string }) => ({ ausenteId: c.ausente_id, cubreId: c.cubre_id }));
  const duenos = new Map<string, string[]>();
  for (const r of (rutas ?? []) as { sector_id: string; repartidor_id: string }[]) {
    duenos.set(r.sector_id, [...(duenos.get(r.sector_id) ?? []), r.repartidor_id]);
  }
  const duenosPorSector = new Map([...duenos].map(([sector, ids]) => [sector, aplicarCoberturas(ids, listaCoberturas)]));

  return { administradorId: admin?.[0]?.id ?? null, duenosPorSector, cargaActual };
}

/**
 * Guarda un paquete: crea o actualiza al destinatario (nombre + teléfono = una persona),
 * lo asigna solo al repartidor del sector y anota la carga en el contexto.
 */
export async function guardarPaquete(
  supabase: Supabase,
  datos: DatosPaquete,
  contexto: ContextoAsignacion
): Promise<{ ok: true; repartidorId: string | null } | { ok: false; error: string }> {
  const { data: repetido } = await supabase.from("paquetes").select("id").eq("numero_guia", datos.guia).maybeSingle();
  if (repetido) return { ok: false, error: `La guía ${datos.guia} ya fue registrada.` };

  // Una persona = nombre + teléfono (una familia puede compartir teléfono)
  const { data: mismosTelefono } = await supabase.from("destinatarios").select("id, nombre").eq("telefono", datos.telefono);
  const clave = (nombre: string) => nombre.trim().toLowerCase();
  const existente = (mismosTelefono ?? []).find((d) => clave(d.nombre) === clave(datos.nombre));

  let destinatarioId: string;
  if (existente) {
    destinatarioId = existente.id;
    const cambios = {
      ...(datos.direccion ? { direccion_texto: datos.direccion } : {}),
      ...(datos.sectorId ? { sector_id: datos.sectorId } : {}),
    };
    if (Object.keys(cambios).length > 0) {
      await supabase.from("destinatarios").update(cambios).eq("id", destinatarioId);
    }
  } else {
    const { data: nuevo, error } = await supabase
      .from("destinatarios")
      .insert({
        nombre: datos.nombre,
        telefono: datos.telefono,
        direccion_texto: datos.direccion ?? null,
        sector_id: datos.sectorId ?? null,
      })
      .select("id")
      .single();
    if (error || !nuevo) return { ok: false, error: "No se pudo guardar al destinatario. Intenta de nuevo." };
    destinatarioId = nuevo.id;
  }

  // Asignación automática: dueño del sector (o el de menos carga si es rotativo)
  const repartidorId = elegirRepartidor({
    voluminoso: datos.voluminoso,
    administradorId: contexto.administradorId,
    duenosDelSector: datos.sectorId ? contexto.duenosPorSector.get(datos.sectorId) ?? [] : [],
    cargaActual: contexto.cargaActual,
  });

  const { error: errorPaquete } = await supabase.from("paquetes").insert({
    numero_guia: datos.guia,
    destinatario_id: destinatarioId,
    nombre_etiqueta: datos.nombre,
    contenido: datos.contenido ?? null,
    voluminoso: datos.voluminoso,
    sector_id: datos.sectorId ?? null,
    repartidor_asignado_id: repartidorId,
    ...(datos.importacionId ? { importacion_id: datos.importacionId, datos_listado: datos.datosListado ?? null } : {}),
  });
  if (errorPaquete) return { ok: false, error: "No se pudo guardar el paquete. Intenta de nuevo." };

  // En un listado, el siguiente paquete del mismo sector rotativo ya ve esta carga
  if (repartidorId) contexto.cargaActual[repartidorId] = (contexto.cargaActual[repartidorId] ?? 0) + 1;
  return { ok: true, repartidorId };
}
