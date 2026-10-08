"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { leerCoordenadas } from "@/lib/coordenadas";
import { proponerEquilibrio, type PaqueteEquilibrio } from "@/lib/equilibrio";
import { leerTodo } from "@/lib/paginar";
import { diaDeRD } from "@/lib/periodoPago";
import { esOficina, obtenerUsuarioActual } from "@/lib/sesion";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface FilaCarga {
  id: string;
  nombre: string;
  /** Paquetes de la ciudad que lleva ahora y que llevaría. */
  antes: number;
  despues: number;
  /** Paquetes de municipios que lleva (no se mueven; pesan si se tiene en cuenta el esfuerzo). */
  municipios: number;
}

export interface GrupoMovimiento {
  sector: string;
  de: string;
  a: string;
  cantidad: number;
  /** Kilómetros extra promedio por paquete (en línea recta). */
  extraKmPromedio: number;
}

export interface SectorSinUbicacion {
  id: string;
  nombre: string;
  paquetes: number;
}

export interface PropuestaVista {
  /** Paquetes de la ciudad que llevaría cada uno si se repartiera exacto (solo cuando no se mide el esfuerzo). */
  objetivo: number | null;
  esfuerzo: boolean;
  filas: FilaCarga[];
  grupos: GrupoMovimiento[];
  /** Lo que se aplica si la oficina acepta: cada paquete con quién lo tiene y quién lo recibiría. */
  movimientos: { paqueteId: string; deId: string; aId: string }[];
  kmExtra: number;
  sinUbicacion: number;
  /** Sectores de la ciudad con paquetes pero sin ubicación, para que la oficina los ubique. */
  sectoresSinUbicacion: SectorSinUbicacion[];
  /** Quiénes quedaron fuera del margen porque igualarlos alargaba demasiado la ruta. */
  fueraDeMargen: string[];
}

export interface EstadoEquilibrio {
  error?: string;
  propuesta?: PropuestaVista;
  mensaje?: string;
}

// Los paquetes que ya salieron en ruta cuentan en la carga pero no se pueden cambiar
const ESTADOS_QUE_CUENTAN = ["recibido", "notificado", "confirmado", "en_ruta", "intento_fallido"];
const ESTADOS_MOVIBLES = ["recibido", "notificado", "confirmado", "intento_fallido"];
const ZONA_CIUDAD = "San Pedro";
const MARGEN_MAXIMO = 10;
const MAX_MOVIMIENTOS = 600;
const MAX_SECTORES_A_UBICAR = 8;
// Peso de un paquete de un sector sin dificultad registrada
const PESO_POR_DEFECTO = 1;

interface FilaPaquete {
  id: string;
  estado: string;
  repartidor_asignado_id: string;
  ubicacion_entrega_lat: number | null;
  ubicacion_entrega_lng: number | null;
  sectores: { id: string; nombre: string; latitud: number | null; longitud: number | null; factor_dificultad: number; zonas: { nombre: string } | null } | null;
}

const sumar = (mapa: Map<string, number>, clave: string, cantidad: number) => mapa.set(clave, (mapa.get(clave) ?? 0) + cantidad);

/**
 * Calcula cómo repartir parejo los paquetes pendientes de San Pedro ciudad sin alargar las rutas.
 * Los paquetes de los municipios no se mueven. Con "esfuerzo", además, cuentan como carga fija de cada uno
 * (más pesada mientras más difícil el sector), para no darle más ciudad a quien ya lleva rutas duras.
 * No cambia nada todavía.
 */
export async function calcularEquilibrio(margen: number, esfuerzo: boolean): Promise<EstadoEquilibrio> {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || !esOficina(usuario)) return { error: "No autorizado." };
  const margenValido = z.number().int().min(0).max(MARGEN_MAXIMO).safeParse(margen);
  if (!margenValido.success) return { error: "El margen no es válido." };

  const supabase = await createClient();
  const hoy = diaDeRD(new Date());
  const [{ data: repartidoresDb }, { data: coberturasDb }, { data: rutasDb }, paquetesDb] = await Promise.all([
    supabase.from("repartidores").select("id, nombre, es_suplente").eq("rol", "repartidor").eq("activo", true),
    supabase.from("coberturas").select("ausente_id, cubre_id").lte("desde", hoy).gte("hasta", hoy).is("terminada_en", null),
    supabase.from("repartidor_sectores").select("repartidor_id, sectores(latitud, longitud)"),
    leerTodo<FilaPaquete>((a, b) =>
      supabase
        .from("paquetes")
        .select("id, estado, repartidor_asignado_id, ubicacion_entrega_lat, ubicacion_entrega_lng, sectores(id, nombre, latitud, longitud, factor_dificultad, zonas(nombre))")
        .in("estado", ESTADOS_QUE_CUENTAN)
        .not("repartidor_asignado_id", "is", null)
        .order("id")
        .range(a, b)
    ),
  ]);

  // Participan los repartidores activos, salvo el suplente (si no está cubriendo a alguien) y los ausentes de hoy
  const cubren = new Set((coberturasDb ?? []).map((c: { cubre_id: string }) => c.cubre_id));
  const ausentes = new Set((coberturasDb ?? []).map((c: { ausente_id: string }) => c.ausente_id));
  const participantes = ((repartidoresDb ?? []) as { id: string; nombre: string; es_suplente: boolean }[]).filter(
    (r) => !ausentes.has(r.id) && (!r.es_suplente || cubren.has(r.id))
  );
  if (participantes.length < 2) return { error: "Hacen falta al menos dos repartidores trabajando para repartir parejo." };
  const nombre = new Map(participantes.map((r) => [r.id, r.nombre]));
  const ids = new Set(participantes.map((r) => r.id));

  // Si alguien aún no tiene paquetes en la ciudad, su zona se estima con el centro de sus sectores
  const centrosPorRepartidor = new Map<string, { lat: number; lng: number }[]>();
  for (const ruta of (rutasDb ?? []) as unknown as { repartidor_id: string; sectores: { latitud: number | null; longitud: number | null } | null }[]) {
    if (ruta.sectores?.latitud == null || ruta.sectores.longitud == null) continue;
    centrosPorRepartidor.set(ruta.repartidor_id, [...(centrosPorRepartidor.get(ruta.repartidor_id) ?? []), { lat: ruta.sectores.latitud, lng: ruta.sectores.longitud }]);
  }
  const casaPorDefecto = Object.fromEntries(
    [...centrosPorRepartidor].map(([id, puntos]) => [id, { lat: puntos.reduce((t, p) => t + p.lat, 0) / puntos.length, lng: puntos.reduce((t, p) => t + p.lng, 0) / puntos.length }])
  );

  const sectorDe = new Map<string, string>();
  const paquetes: PaqueteEquilibrio[] = [];
  const cargaFija: Record<string, number> = {};
  const municipios = new Map<string, number>();
  const ciudadAntes = new Map<string, number>();
  const sinUbicar = new Map<string, SectorSinUbicacion>();

  for (const p of paquetesDb) {
    if (!ids.has(p.repartidor_asignado_id)) continue;
    const sector = p.sectores;
    const esCiudad = sector?.zonas?.nombre === ZONA_CIUDAD;

    if (!esCiudad) {
      // Municipios (o sin sector): no se mueven; solo pesan en la carga si se mide el esfuerzo
      sumar(municipios, p.repartidor_asignado_id, 1);
      if (esfuerzo) cargaFija[p.repartidor_asignado_id] = (cargaFija[p.repartidor_asignado_id] ?? 0) + (sector?.factor_dificultad ?? PESO_POR_DEFECTO);
      continue;
    }

    sumar(ciudadAntes, p.repartidor_asignado_id, 1);
    sectorDe.set(p.id, sector!.nombre);
    // La ubicación del paquete: el pin del cliente o, si no hay, el centro de su sector
    const lat = p.ubicacion_entrega_lat ?? sector!.latitud;
    const lng = p.ubicacion_entrega_lng ?? sector!.longitud;
    const ubicado = lat !== null && lng !== null && (p.ubicacion_entrega_lat !== null || sector!.latitud !== null);
    if (!ubicado && ESTADOS_MOVIBLES.includes(p.estado)) {
      const actual = sinUbicar.get(sector!.id) ?? { id: sector!.id, nombre: sector!.nombre, paquetes: 0 };
      sinUbicar.set(sector!.id, { ...actual, paquetes: actual.paquetes + 1 });
    }
    paquetes.push({
      id: p.id,
      repartidorId: p.repartidor_asignado_id,
      sector: sector!.nombre,
      lat: ubicado ? lat : null,
      lng: ubicado ? lng : null,
      movible: ESTADOS_MOVIBLES.includes(p.estado),
      peso: esfuerzo ? sector!.factor_dificultad : PESO_POR_DEFECTO,
    });
  }

  const r = proponerEquilibrio({ paquetes, repartidores: participantes.map((p) => p.id), margen: margenValido.data, cargaFija, casaPorDefecto });

  const sale = new Map<string, number>();
  const entra = new Map<string, number>();
  const grupos = new Map<string, GrupoMovimiento & { total: number }>();
  for (const m of r.movimientos) {
    sumar(sale, m.deId, 1);
    sumar(entra, m.aId, 1);
    const sector = sectorDe.get(m.paqueteId) ?? "Sin sector";
    const clave = `${sector}|${m.deId}|${m.aId}`;
    const actual = grupos.get(clave) ?? { sector, de: nombre.get(m.deId) ?? "—", a: nombre.get(m.aId) ?? "—", cantidad: 0, extraKmPromedio: 0, total: 0 };
    grupos.set(clave, { ...actual, cantidad: actual.cantidad + 1, total: actual.total + m.extraKm });
  }

  return {
    propuesta: {
      objetivo: esfuerzo || participantes.length === 0 ? null : [...ciudadAntes.values()].reduce((t, n) => t + n, 0) / participantes.length,
      esfuerzo,
      filas: participantes
        .map((p) => {
          const antes = ciudadAntes.get(p.id) ?? 0;
          return { id: p.id, nombre: p.nombre, antes, despues: antes - (sale.get(p.id) ?? 0) + (entra.get(p.id) ?? 0), municipios: municipios.get(p.id) ?? 0 };
        })
        .sort((a, b) => b.antes - a.antes),
      grupos: [...grupos.values()]
        .map(({ total, ...g }) => ({ ...g, extraKmPromedio: Math.round((total / g.cantidad) * 10) / 10 }))
        .sort((a, b) => b.cantidad - a.cantidad),
      movimientos: r.movimientos.map((m) => ({ paqueteId: m.paqueteId, deId: m.deId, aId: m.aId })),
      kmExtra: Math.round(r.kmExtra * 10) / 10,
      sinUbicacion: r.sinUbicacion,
      sectoresSinUbicacion: [...sinUbicar.values()].sort((a, b) => b.paquetes - a.paquetes).slice(0, MAX_SECTORES_A_UBICAR),
      fueraDeMargen: r.fueraDeMargen.map((id) => nombre.get(id) ?? "—"),
    },
  };
}

/** La oficina le pone ubicación a un sector pegando las coordenadas o el enlace de Google Maps. */
export async function ubicarSector(sectorId: string, texto: string): Promise<EstadoEquilibrio> {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || !esOficina(usuario) || !z.string().uuid().safeParse(sectorId).success) return { error: "No autorizado." };

  const punto = leerCoordenadas(texto);
  if (!punto) {
    return { error: "No entendí la ubicación. En Google Maps toca y mantén el punto del sector y copia los números (por ejemplo 18.4503, -69.3012), o pega el enlace largo." };
  }

  // Solo el dueño edita sectores en la base; aquí la oficina solo puede cambiar la ubicación (ya se verificó el rol arriba)
  const { data, error } = await createAdminClient()
    .from("sectores")
    .update({ latitud: punto.lat, longitud: punto.lng, origen_ubicacion: "manual" })
    .eq("id", sectorId)
    .select("nombre")
    .maybeSingle();
  if (error || !data) return { error: "No se pudo guardar la ubicación." };

  revalidatePath("/repartidores");
  return { mensaje: `Ubicación de ${data.nombre} guardada. Calcula el reparto otra vez.` };
}

const Movimientos = z
  .array(z.object({ paqueteId: z.string().uuid(), deId: z.string().uuid(), aId: z.string().uuid() }))
  .min(1, "No hay nada que aplicar.")
  .max(MAX_MOVIMIENTOS);

/** Aplica la propuesta que la oficina revisó. Cada paquete se cambia solo si sigue con quien se calculó. */
export async function aplicarEquilibrio(movimientos: { paqueteId: string; deId: string; aId: string }[]): Promise<EstadoEquilibrio> {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || !esOficina(usuario)) return { error: "No autorizado." };
  const entrada = Movimientos.safeParse(movimientos);
  if (!entrada.success) return { error: entrada.error.issues[0].message };

  const supabase = await createClient();
  const destinos = [...new Set(entrada.data.map((m) => m.aId))];
  const { data: validos } = await supabase.from("repartidores").select("id").in("id", destinos).eq("rol", "repartidor").eq("activo", true);
  if (!validos || validos.length !== destinos.length) return { error: "Alguno de los repartidores ya no está activo. Calcula el reparto otra vez." };

  // Se agrupan por (de, a) para hacer pocas actualizaciones
  const grupos = new Map<string, { deId: string; aId: string; ids: string[] }>();
  for (const m of entrada.data) {
    const clave = `${m.deId}|${m.aId}`;
    const g = grupos.get(clave) ?? { deId: m.deId, aId: m.aId, ids: [] };
    grupos.set(clave, { ...g, ids: [...g.ids, m.paqueteId] });
  }

  let cambiados = 0;
  for (const g of grupos.values()) {
    const { data, error } = await supabase
      .from("paquetes")
      .update({ repartidor_asignado_id: g.aId })
      .in("id", g.ids)
      .eq("repartidor_asignado_id", g.deId)
      .in("estado", ESTADOS_MOVIBLES)
      .select("id");
    if (error) return { error: "No se pudo aplicar todo el reparto. Calcula de nuevo para ver cómo quedó." };
    cambiados += data?.length ?? 0;
  }

  revalidatePath("/repartidores");
  revalidatePath("/paquetes");
  const saltados = entrada.data.length - cambiados;
  return {
    mensaje: `Listo: ${cambiados} ${cambiados === 1 ? "paquete cambió" : "paquetes cambiaron"} de repartidor.${saltados > 0 ? ` ${saltados} ya habían cambiado y no se tocaron.` : ""}`,
  };
}
