import "server-only";
import { centroideRobusto } from "@/lib/equilibrio";
import { leerTodo } from "@/lib/paginar";
import { createAdminClient } from "@/lib/supabase/admin";

const MINIMO_PINES = 3; // con menos de 3 pines no se fía del promedio
const DIAS_A_MIRAR = 60;
const MS_POR_DIA = 24 * 60 * 60 * 1000;
// Los paquetes de demostración tienen ubicaciones inventadas: no deben enseñarle nada al sistema
const PREFIJO_DEMO = "DEMO-";
// Cambios menores de esto (≈ 50 m) no se guardan, para no escribir en la base cada 15 minutos
const CAMBIO_MINIMO_GRADOS = 0.0005;

export interface ResumenUbicaciones {
  sectoresActualizados: number;
}

interface FilaPin {
  sector_id: string;
  ubicacion_entrega_lat: number;
  ubicacion_entrega_lng: number;
}

/**
 * Aprende dónde queda cada sector a partir de los pines que comparten los clientes: el centro es la
 * mediana de los pines de los últimos 60 días. Lo "aprendido" sustituye lo que vino del mapa, pero
 * nunca lo puesto a mano. El reparto equitativo usa estas ubicaciones para saber qué sector queda cerca de cuál.
 */
export async function aprenderUbicaciones(ahora: Date = new Date()): Promise<ResumenUbicaciones> {
  const admin = createAdminClient();
  const desde = new Date(ahora.getTime() - DIAS_A_MIRAR * MS_POR_DIA).toISOString();

  const [pines, { data: sectores }] = await Promise.all([
    leerTodo<FilaPin>((a, b) =>
      admin
        .from("paquetes")
        .select("sector_id, ubicacion_entrega_lat, ubicacion_entrega_lng")
        .gte("fecha_recibido", desde)
        .not("sector_id", "is", null)
        .not("ubicacion_entrega_lat", "is", null)
        .not("numero_guia", "like", `${PREFIJO_DEMO}%`)
        .order("id")
        .range(a, b)
    ),
    admin.from("sectores").select("id, latitud, longitud, origen_ubicacion"),
  ]);

  const porSector = new Map<string, { lat: number; lng: number }[]>();
  for (const p of pines) {
    porSector.set(p.sector_id, [...(porSector.get(p.sector_id) ?? []), { lat: p.ubicacion_entrega_lat, lng: p.ubicacion_entrega_lng }]);
  }

  let actualizados = 0;
  for (const sector of sectores ?? []) {
    if (sector.origen_ubicacion === "manual") continue;
    const centro = centroideRobusto(porSector.get(sector.id) ?? [], MINIMO_PINES);
    if (!centro) continue;

    const casiIgual =
      sector.latitud !== null &&
      sector.longitud !== null &&
      Math.abs(sector.latitud - centro.lat) < CAMBIO_MINIMO_GRADOS &&
      Math.abs(sector.longitud - centro.lng) < CAMBIO_MINIMO_GRADOS;
    if (casiIgual && sector.origen_ubicacion === "aprendido") continue;

    const { error } = await admin.from("sectores").update({ latitud: centro.lat, longitud: centro.lng, origen_ubicacion: "aprendido" }).eq("id", sector.id);
    if (!error) actualizados += 1;
  }
  return { sectoresActualizados: actualizados };
}
