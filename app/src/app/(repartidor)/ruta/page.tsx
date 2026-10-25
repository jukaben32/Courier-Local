import { etiquetaBloque, horaDeColumna } from "@/lib/whatsapp/horas";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PrepararSinSenal } from "../PrepararSinSenal";
import { RutaOptimizada, type ParadaRuta } from "./RutaOptimizada";

export const dynamic = "force-dynamic";

const ESTADOS_POR_ENTREGAR = ["recibido", "notificado", "confirmado", "en_ruta", "intento_fallido"];
const ORDEN_FRANJA: Record<string, number> = { AM: 1, MID: 2, PM: 3 };
const ETIQUETA_FRANJA: Record<string, string> = { AM: "9 am a 12 pm", MID: "12 pm a 3 pm", PM: "3 pm a 6 pm" };
// Las horas exactas (versión OpenWA) van después de las franjas fijas y se ordenan entre sí
const SIN_HORARIO = 999;
const BASE_HORA_EXACTA = 100;

interface ParadaDb {
  id: string;
  numero_guia: string;
  nombre_etiqueta: string;
  estado: string;
  voluminoso: boolean;
  ventana_horaria: string | null;
  hora_preferida: string | null;
  ubicacion_entrega_lat: number | null;
  ubicacion_entrega_lng: number | null;
  destinatarios: { telefono: string; direccion_texto: string | null } | null;
  sectores: { nombre: string } | null;
}

interface PedidoOficinaDb {
  id: string;
  estado: "pendiente" | "rechazada";
  motivo_resolucion: string | null;
  paquetes: { nombre_etiqueta: string; numero_guia: string } | null;
}

interface SinSubirDb {
  id: string;
  creado_en: string;
  paquetes: { numero_guia: string; nombre_etiqueta: string } | null;
}

// Si el cliente compartió su ubicación se navega directo ahí; si no, se busca por la dirección
function enlaceMapa(p: ParadaDb): string {
  if (p.ubicacion_entrega_lat !== null && p.ubicacion_entrega_lng !== null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${p.ubicacion_entrega_lat},${p.ubicacion_entrega_lng}&travelmode=motorcycle`;
  }
  const consulta = `${p.destinatarios?.direccion_texto ?? ""} ${p.sectores?.nombre ?? ""} San Pedro de Macorís`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(consulta.trim())}`;
}

export default async function PaginaRuta() {
  const supabase = await createClient();
  const ayer = new Date(new Date().getTime() - 24 * 60 * 60 * 1000).toISOString();
  const [{ data: paradasDb }, { data: sinSubirDb }, { data: pedidosDb }] = await Promise.all([
    supabase
      .from("paquetes")
      .select(
        "id, numero_guia, nombre_etiqueta, estado, voluminoso, ventana_horaria, hora_preferida, ubicacion_entrega_lat, ubicacion_entrega_lng, destinatarios(telefono, direccion_texto), sectores(nombre)"
      )
      .in("estado", ESTADOS_POR_ENTREGAR),
    supabase
      .from("entregas")
      .select("id, creado_en, paquetes(numero_guia, nombre_etiqueta)")
      .eq("resultado", "entregado")
      .eq("cargado_en_courier", false)
      .order("creado_en"),
    // Pedidos de autorización a la oficina: los pendientes y los rechazados del último día
    supabase
      .from("solicitudes_excepcion")
      .select("id, estado, motivo_resolucion, paquetes(nombre_etiqueta, numero_guia)")
      .or(`estado.eq.pendiente,and(estado.eq.rechazada,resuelta_en.gte.${ayer})`)
      .order("creada_en"),
  ]);

  const paradas = (paradasDb ?? []) as unknown as ParadaDb[];
  const confirmadas = paradas.filter((p) => p.estado === "confirmado");
  const esperando = paradas.filter((p) => p.estado !== "confirmado");

  // Quien confirmó el horario pero no mandó su punto se ubica en el centro de su sector (aproximado)
  const puntosPorSector = new Map<string, { lat: number; lng: number }[]>();
  for (const p of paradas) {
    if (p.ubicacion_entrega_lat !== null && p.ubicacion_entrega_lng !== null && p.sectores) {
      const lista = puntosPorSector.get(p.sectores.nombre) ?? [];
      puntosPorSector.set(p.sectores.nombre, [...lista, { lat: p.ubicacion_entrega_lat, lng: p.ubicacion_entrega_lng }]);
    }
  }
  const centroDelSector = (nombre: string | undefined) => {
    const puntos = nombre ? puntosPorSector.get(nombre) : undefined;
    if (!puntos?.length) return null;
    return { lat: puntos.reduce((t, x) => t + x.lat, 0) / puntos.length, lng: puntos.reduce((t, x) => t + x.lng, 0) / puntos.length };
  };

  const paradasRuta: ParadaRuta[] = confirmadas.map((p) => {
    const propio = p.ubicacion_entrega_lat !== null && p.ubicacion_entrega_lng !== null;
    const centro = propio ? null : centroDelSector(p.sectores?.nombre);
    const horaExacta = horaDeColumna(p.hora_preferida);
    return {
      id: p.id,
      nombre: p.nombre_etiqueta,
      direccion: p.destinatarios?.direccion_texto ?? null,
      sector: p.sectores?.nombre ?? null,
      guia: p.numero_guia,
      franja: horaExacta !== null ? BASE_HORA_EXACTA + horaExacta : (ORDEN_FRANJA[p.ventana_horaria ?? ""] ?? SIN_HORARIO),
      etiquetaFranja: horaExacta !== null ? etiquetaBloque(horaExacta) : (ETIQUETA_FRANJA[p.ventana_horaria ?? ""] ?? "Sin horario"),
      lat: propio ? p.ubicacion_entrega_lat : (centro?.lat ?? null),
      lng: propio ? p.ubicacion_entrega_lng : (centro?.lng ?? null),
      ubicacionAproximada: !propio && centro !== null,
      enlaceMapa: enlaceMapa(p),
    };
  });
  const sinSubir = (sinSubirDb ?? []) as unknown as SinSubirDb[];
  const pedidos = (pedidosDb ?? []) as unknown as PedidoOficinaDb[];

  const pantallasSinSenal = ["/ruta", ...paradas.map((p) => `/entrega/${p.id}`), ...sinSubir.map((e) => `/subir/${e.id}`)];

  return (
    <div className="space-y-6">
      <PrepararSinSenal rutas={pantallasSinSenal} />
      {pedidos.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Pedidos a la oficina</h2>
          {pedidos.map((p) => (
            <div key={p.id} className={`rounded-lg border px-3 py-3 text-sm ${p.estado === "rechazada" ? "border-rojo bg-rojo/10" : "border-ambar bg-ambar/10"}`}>
              <p className="font-medium">{p.paquetes?.nombre_etiqueta} <span className="font-mono text-xs font-normal text-tinta-2">{p.paquetes?.numero_guia}</span></p>
              {p.estado === "pendiente" ? (
                <p className="text-tinta-2">Esperando que la oficina autorice la entrega. Sigue con tu ruta.</p>
              ) : (
                <p className="text-rojo">La oficina no autorizó la entrega: {p.motivo_resolucion}</p>
              )}
            </div>
          ))}
        </section>
      )}

      {sinSubir.length > 0 && (
        <section className="rounded-xl border-2 border-acento bg-acento/10 p-4">
          <h2 className="text-lg font-semibold">Sube estas pruebas al courier ahora ({sinSubir.length})</h2>
          <p className="mb-3 text-sm text-tinta-2">Mientras más rápido las subas, más temprano cierra el día.</p>
          <ul className="space-y-2">
            {sinSubir.map((e) => (
              <li key={e.id}>
                <Link href={`/subir/${e.id}`} className="flex items-center justify-between rounded-lg bg-tarjeta px-3 py-3">
                  <span>
                    <span className="block font-medium">{e.paquetes?.nombre_etiqueta}</span>
                    <span className="font-mono text-xs text-tinta-2">{e.paquetes?.numero_guia}</span>
                  </span>
                  <span className="rounded-md bg-acento px-3 py-2 text-sm font-semibold text-[#1a0900]">Subir</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Tu ruta de hoy</h2>
        <RutaOptimizada paradas={paradasRuta} />
      </section>

      {esperando.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold">Esperando respuesta del cliente ({esperando.length})</h2>
          <p className="mb-3 text-sm text-tinta-2">El sistema ya les escribió. Entran a tu ruta apenas confirman su horario; no hace falta llamarlos.</p>
          <ul className="space-y-2">
            {esperando.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-lg border border-linea bg-tarjeta px-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.nombre_etiqueta}</span>
                  <span className="block truncate text-xs text-tinta-2">{p.sectores?.nombre ?? "Sin sector"} · <span className="font-mono">{p.numero_guia}</span></span>
                </span>
                <Link href={`/entrega/${p.id}`} className="shrink-0 rounded-md border border-linea px-3 py-2 text-sm font-semibold">Entregar</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
