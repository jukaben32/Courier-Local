"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { leerPrimeraHoja } from "@/lib/excel";
import { buscarSector, extraerEnvios, type EnvioListado } from "@/lib/listado";
import { cargarContextoAsignacion, guardarPaquete } from "@/lib/registroPaquete";
import { esOficina, obtenerUsuarioActual } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";

// Las acciones del servidor aceptan hasta 1 MB; un listado de 1000 envíos pesa unos 250 KB
const TAMANO_MAXIMO = 900 * 1024;
const FILAS_MAXIMAS = 1000;

export interface FilaRevisada {
  fila: number;
  guia: string;
  nombre: string;
  telefono: string;
  direccion: string;
  sectorListado: string;
  /** Sector de Courier Local que se reconoció ("" si no se reconoció). */
  sectorId: string;
  contenido: string;
  /** Si tiene motivo, la fila no se puede importar. */
  motivo: string | null;
  /** Ya estaba registrada (el listado de la oficina es acumulado): no es un error, solo se omite. */
  repetida: boolean;
}

/** Lo que el navegador necesita para mostrar a qué repartidor irá cada paquete, antes de importar. */
export interface AsignacionPrevia {
  /** Repartidores dueños de cada sector. */
  duenos: Record<string, string[]>;
  nombres: Record<string, string>;
  /** Paquetes que ya lleva cada repartidor. */
  carga: Record<string, number>;
  administradorId: string | null;
}

export interface EstadoRevision {
  filas?: FilaRevisada[];
  asignacion?: AsignacionPrevia;
  error?: string;
}

export interface EstadoImportacion {
  importadas?: number;
  /** Ya estaban registrados antes: se omitieron sin avisar de error. */
  yaRegistradas?: number;
  sinRepartidor?: number;
  omitidas?: { fila: number; guia: string; motivo: string }[];
  error?: string;
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Lee el Excel subido y lo convierte en envíos. Devuelve un error para la oficina si algo no cuadra. */
async function leerArchivo(formData: FormData): Promise<{ archivo: File; envios: EnvioListado[] } | { error: string }> {
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { error: "Elige el archivo del listado." };
  if (!archivo.name.toLowerCase().endsWith(".xlsx")) return { error: "El listado debe ser un Excel (.xlsx)." };
  if (archivo.size > TAMANO_MAXIMO) return { error: "El archivo es demasiado grande (máximo 900 KB)." };

  try {
    const { envios, error } = extraerEnvios(leerPrimeraHoja(new Uint8Array(await archivo.arrayBuffer())));
    if (error) return { error };
    if (envios.length === 0) return { error: "El listado no tiene envíos." };
    if (envios.length > FILAS_MAXIMAS) return { error: `El listado tiene más de ${FILAS_MAXIMAS} envíos. Divídelo en partes.` };
    return { archivo, envios };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo leer el archivo." };
  }
}

const MOTIVO_REPETIDA = "Ya fue registrada antes.";

/** Por qué una fila no se puede importar (null = se puede). */
async function motivosDeRechazo(supabase: Supabase, envios: EnvioListado[]): Promise<Map<string, string>> {
  const guias = envios.map((e) => e.guia).filter(Boolean);
  const { data: existentes } = await supabase.from("paquetes").select("numero_guia").in("numero_guia", guias);
  const yaRegistradas = new Set((existentes ?? []).map((p: { numero_guia: string }) => p.numero_guia));

  const motivos = new Map<string, string>();
  const vistas = new Set<string>();
  for (const e of envios) {
    const id = `${e.fila}`;
    if (!e.guia) motivos.set(id, "Falta el código (guía).");
    else if (vistas.has(e.guia)) motivos.set(id, "Guía repetida en el mismo listado.");
    else if (yaRegistradas.has(e.guia)) motivos.set(id, MOTIVO_REPETIDA);
    else if (e.nombre.length < 3) motivos.set(id, "Falta el nombre del cliente.");
    else if (!e.telefono) motivos.set(id, `Teléfono no válido de RD: "${e.telefonoOriginal || "vacío"}".`);
    vistas.add(e.guia);
  }
  return motivos;
}

async function cargarSectores(supabase: Supabase) {
  const { data } = await supabase.from("sectores").select("id, nombre");
  return (data ?? []) as { id: string; nombre: string }[];
}

/** Paso 1: leer el listado y mostrar qué se va a importar. No guarda nada. */
export async function revisarListado(_anterior: EstadoRevision, formData: FormData): Promise<EstadoRevision> {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || !esOficina(usuario)) return { error: "No tienes permiso para importar listados." };

  const leido = await leerArchivo(formData);
  if ("error" in leido) return { error: leido.error };

  const supabase = await createClient();
  const [sectores, motivos] = await Promise.all([cargarSectores(supabase), motivosDeRechazo(supabase, leido.envios)]);

  const contexto = await cargarContextoAsignacion(supabase, sectores.map((x) => x.id));
  const { data: repartidoresBD } = await supabase.from("repartidores").select("id, nombre");

  return {
    asignacion: {
      duenos: Object.fromEntries(contexto.duenosPorSector),
      nombres: Object.fromEntries((repartidoresBD ?? []).map((r: { id: string; nombre: string }) => [r.id, r.nombre])),
      carga: contexto.cargaActual,
      administradorId: contexto.administradorId,
    },
    filas: leido.envios.map((e) => ({
      fila: e.fila,
      guia: e.guia,
      nombre: e.nombre,
      telefono: e.telefono ?? e.telefonoOriginal,
      direccion: e.direccion,
      sectorListado: e.sectorListado,
      sectorId: buscarSector(e.sectorListado, sectores) ?? "",
      contenido: e.contenido,
      motivo: motivos.get(`${e.fila}`) ?? null,
      repetida: motivos.get(`${e.fila}`) === MOTIVO_REPETIDA,
    })),
  };
}

// Lo que la oficina corrigió en la vista previa, por número de fila
const Ajustes = z.record(
  z.string(),
  z.object({ incluir: z.boolean(), sectorId: z.union([z.uuid(), z.literal("")]), voluminoso: z.boolean() })
);

/**
 * Paso 2: importar. Se vuelve a leer el mismo archivo aquí en el servidor (no se confía en los
 * datos que manda el navegador); del navegador solo llegan los ajustes de la vista previa.
 */
export async function importarListado(formData: FormData): Promise<EstadoImportacion> {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || !esOficina(usuario)) return { error: "No tienes permiso para importar listados." };

  const leido = await leerArchivo(formData);
  if ("error" in leido) return { error: leido.error };

  let ajustes: z.infer<typeof Ajustes>;
  try {
    ajustes = Ajustes.parse(JSON.parse(String(formData.get("ajustes") ?? "{}")));
  } catch {
    return { error: "Los ajustes de la vista previa no son válidos. Vuelve a revisar el listado." };
  }

  const supabase = await createClient();
  const [sectores, motivos] = await Promise.all([cargarSectores(supabase), motivosDeRechazo(supabase, leido.envios)]);
  const sectoresValidos = new Set(sectores.map((s) => s.id));

  const { data: importacion, error: errorImportacion } = await supabase
    .from("importaciones")
    .insert({ archivo: leido.archivo.name, creado_por: usuario.id, total_filas: leido.envios.length })
    .select("id")
    .single();
  if (errorImportacion || !importacion) {
    return { error: "No se pudo registrar la importación. ¿Ya se aplicó el SQL 009 en Supabase?" };
  }

  const elegidos = leido.envios.map((e) => {
    const ajuste = ajustes[`${e.fila}`];
    const sectorId = ajuste ? ajuste.sectorId : buscarSector(e.sectorListado, sectores) ?? "";
    return { envio: e, ajuste, sectorId: sectoresValidos.has(sectorId) ? sectorId : "" };
  });

  const contexto = await cargarContextoAsignacion(supabase, [...new Set(elegidos.map((x) => x.sectorId).filter(Boolean))]);
  const omitidas: NonNullable<EstadoImportacion["omitidas"]> = [];
  let importadas = 0;
  let sinRepartidor = 0;
  let yaRegistradas = 0;

  // Uno por uno y en orden: así la carga de cada repartidor se reparte bien en los sectores rotativos
  for (const { envio, ajuste, sectorId } of elegidos) {
    const omitir = (motivo: string) => omitidas.push({ fila: envio.fila, guia: envio.guia, motivo });
    const motivo = motivos.get(`${envio.fila}`);
    if (motivo === MOTIVO_REPETIDA) {
      yaRegistradas++;
      continue;
    }
    if (motivo) {
      omitir(motivo);
      continue;
    }
    if (ajuste && !ajuste.incluir) {
      omitir("La oficina la desmarcó en la vista previa.");
      continue;
    }

    const guardado = await guardarPaquete(
      supabase,
      {
        guia: envio.guia,
        nombre: envio.nombre,
        telefono: envio.telefono!,
        direccion: envio.direccion || undefined,
        sectorId: sectorId || undefined,
        contenido: envio.contenido || undefined,
        voluminoso: ajuste?.voluminoso ?? false,
        importacionId: importacion.id,
        datosListado: envio.original,
      },
      contexto
    );
    if (!guardado.ok) {
      omitir(guardado.error);
      continue;
    }
    importadas++;
    if (!guardado.repartidorId) sinRepartidor++;
  }

  await supabase
    .from("importaciones")
    .update({ importadas, omitidas: omitidas.length, omitidas_detalle: omitidas })
    .eq("id", importacion.id);

  revalidatePath("/paquetes");
  revalidatePath("/importar");
  return { importadas, sinRepartidor, yaRegistradas, omitidas };
}
