import { RefrescarAuto } from "@/components/RefrescarAuto";
import { diaDeRD } from "@/lib/periodoPago";
import { bloquearRuta, plazoSubidaMin, pruebaQueBloquea, pruebasPendientes } from "@/lib/pruebasCourier";
import { debeAbrirSinRespuesta, esParadaNueva, ordenarSinRespuesta, resumirContactos, type EstadoAviso, type MensajeContacto } from "@/lib/sinRespuesta";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatearTelefono } from "@/lib/telefono";
import { etiquetaRango, horaDeColumna } from "@/lib/whatsapp/horas";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PrepararSinSenal } from "../PrepararSinSenal";
import { TEXTO_RESULTADO_LLAMADA, type ResultadoLlamada } from "@/lib/demora";
import { RegistrarLlamada } from "./RegistrarLlamada";
import { RutaOptimizada, type ParadaRuta } from "./RutaOptimizada";

export const dynamic = "force-dynamic";

const ESTADOS_POR_ENTREGAR = ["recibido", "notificado", "confirmado", "en_ruta", "intento_fallido"];
const ORDEN_FRANJA: Record<string, number> = { AM: 1, MID: 2, PM: 3 };
const ETIQUETA_FRANJA: Record<string, string> = { AM: "9 am a 12 pm", MID: "12 pm a 3 pm", PM: "3 pm a 6 pm" };
// Las horas exactas (versión OpenWA) van después de las franjas fijas y se ordenan entre sí
const SIN_HORARIO = 999;
const TEXTO_AVISO: Record<EstadoAviso | "ninguno", string> = {
  ninguno: "Todavía sin aviso",
  enviado: "Aviso enviado (aún no llega a su teléfono)",
  entregado: "Aviso entregado ✓✓",
  leido: "Aviso leído ✓✓",
  fallido: "El aviso no pudo enviarse: llámalo",
};
const BASE_HORA_EXACTA = 100;

interface ParadaDb {
  id: string;
  numero_guia: string;
  nombre_etiqueta: string;
  estado: string;
  voluminoso: boolean;
  ventana_horaria: string | null;
  hora_preferida: string | null;
  hora_hasta: string | null;
  dia_entrega: string | null;
  ubicacion_entrega_lat: number | null;
  ubicacion_entrega_lng: number | null;
  direccion_entrega_texto: string | null;
  hora_confirmacion: string | null;
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
  motivo_sin_subir: string | null;
  paquetes: { numero_guia: string; nombre_etiqueta: string } | null;
}

// Si el cliente compartió su ubicación se navega directo ahí; si no, se busca por la dirección
function enlaceMapa(p: ParadaDb): string {
  if (p.ubicacion_entrega_lat !== null && p.ubicacion_entrega_lng !== null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${p.ubicacion_entrega_lat},${p.ubicacion_entrega_lng}&travelmode=motorcycle`;
  }
  const consulta = `${p.direccion_entrega_texto ?? p.destinatarios?.direccion_texto ?? ""} ${p.sectores?.nombre ?? ""} San Pedro de Macorís`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(consulta.trim())}`;
}

export default async function PaginaRuta() {
  const supabase = await createClient();
  const ayer = new Date(new Date().getTime() - 24 * 60 * 60 * 1000).toISOString();
  const inicioHoy = new Date(`${diaDeRD(new Date())}T00:00:00-04:00`).toISOString();
  const [{ data: paradasDb }, { data: sinSubirDb }, { data: pedidosDb }, { count: entregadasHoy }] = await Promise.all([
    supabase
      .from("paquetes")
      .select(
        "id, numero_guia, nombre_etiqueta, estado, voluminoso, ventana_horaria, hora_preferida, hora_hasta, dia_entrega, ubicacion_entrega_lat, ubicacion_entrega_lng, direccion_entrega_texto, hora_confirmacion, destinatarios(telefono, direccion_texto), sectores(nombre)"
      )
      .in("estado", ESTADOS_POR_ENTREGAR),
    supabase
      .from("entregas")
      .select("id, creado_en, motivo_sin_subir, paquetes(numero_guia, nombre_etiqueta)")
      .eq("resultado", "entregado")
      .eq("cargado_en_courier", false)
      .order("creado_en"),
    // Pedidos de autorización a la oficina: los pendientes y los rechazados del último día
    supabase
      .from("solicitudes_excepcion")
      .select("id, estado, motivo_resolucion, paquetes(nombre_etiqueta, numero_guia)")
      .or(`estado.eq.pendiente,and(estado.eq.rechazada,resuelta_en.gte.${ayer})`)
      .order("creada_en"),
    supabase.from("entregas").select("id", { count: "exact", head: true }).eq("resultado", "entregado").gte("creado_en", inicioHoy),
  ]);

  const paradas = (paradasDb ?? []) as unknown as ParadaDb[];
  const hoy = diaDeRD(new Date());
  // Lo que el cliente pidió para mañana no entra en la ruta de hoy
  const confirmadas = paradas.filter((p) => p.estado === "confirmado" && (!p.dia_entrega || p.dia_entrega <= hoy));
  const paraManana = paradas.filter((p) => p.estado === "confirmado" && p.dia_entrega && p.dia_entrega > hoy);
  const esperando = paradas.filter((p) => p.estado !== "confirmado");
  const ahora = new Date();

  // Cómo va el aviso de cada cliente que no ha confirmado, y qué escribió. Se leen en el servidor, y solo de
  // los teléfonos de SUS paquetes (el repartidor no tiene acceso directo a los mensajes).
  const telefonosEsperando = [...new Set(esperando.map((p) => p.destinatarios?.telefono).filter((t): t is string => !!t))];
  const mensajesContacto: MensajeContacto[] = [];
  if (telefonosEsperando.length > 0) {
    const desde = new Date(ahora.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const admin = createAdminClient();
    for (let i = 0; i < telefonosEsperando.length; i += 40) {
      const { data } = await admin
        .from("mensajes_whatsapp")
        .select("telefono, direccion, tipo, estado, contenido, creado_en, proveedor_id")
        .in("telefono", telefonosEsperando.slice(i, i + 40))
        .gte("creado_en", desde);
      mensajesContacto.push(...((data ?? []) as MensajeContacto[]));
    }
  }
  const contactos = resumirContactos(mensajesContacto);

  // Última llamada anotada a cada cliente (si la tabla aún no existe, simplemente no hay datos)
  const idsEsperando = esperando.map((p) => p.id);
  const ultimaLlamada = new Map<string, { resultado: string; creada_en: string }>();
  if (idsEsperando.length > 0) {
    const { data: llamadasDb } = await supabase
      .from("llamadas")
      .select("paquete_id, resultado, creada_en")
      .in("paquete_id", idsEsperando)
      .order("creada_en", { ascending: false });
    for (const l of (llamadasDb ?? []) as { paquete_id: string; resultado: string; creada_en: string }[]) {
      if (!ultimaLlamada.has(l.paquete_id)) ultimaLlamada.set(l.paquete_id, l);
    }
  }
  const sinRespuesta = ordenarSinRespuesta(
    esperando.map((p) => ({
      paquete: p,
      sector: p.sectores?.nombre ?? "Sin sector",
      nombre: p.nombre_etiqueta,
      contacto: p.destinatarios ? contactos.get(p.destinatarios.telefono) : undefined,
    }))
  );
  // Se abre sola cuando le queda un tercio de la ruta o menos (o ninguna parada confirmada)
  const abrirSinRespuesta = debeAbrirSinRespuesta(confirmadas.length, entregadasHoy ?? 0);

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
      direccion: p.direccion_entrega_texto ?? p.destinatarios?.direccion_texto ?? null,
      sector: p.sectores?.nombre ?? null,
      guia: p.numero_guia,
      franja: horaExacta !== null ? BASE_HORA_EXACTA + horaExacta : (ORDEN_FRANJA[p.ventana_horaria ?? ""] ?? SIN_HORARIO),
      etiquetaFranja: horaExacta !== null ? etiquetaRango(horaExacta, horaDeColumna(p.hora_hasta) ?? horaExacta + 1) : (ETIQUETA_FRANJA[p.ventana_horaria ?? ""] ?? "Sin horario"),
      lat: propio ? p.ubicacion_entrega_lat : (centro?.lat ?? null),
      lng: propio ? p.ubicacion_entrega_lng : (centro?.lng ?? null),
      ubicacionAproximada: !propio && centro !== null,
      enlaceMapa: enlaceMapa(p),
      nuevo: esParadaNueva(p.hora_confirmacion, ahora),
    };
  });
  const sinSubir = (sinSubirDb ?? []) as unknown as SinSubirDb[];
  const pedidos = (pedidosDb ?? []) as unknown as PedidoOficinaDb[];

  // Una prueba atrasada frena la ruta: subirla en el momento es lo que mide el índice de velocidad del courier
  const plazo = plazoSubidaMin();
  const pendientes = pruebasPendientes(
    sinSubir.map((e) => ({
      id: e.id,
      resultado: "entregado",
      creadoEn: e.creado_en,
      subidoEn: null,
      cargado: false,
      repartidor: null,
      nombre: e.paquetes?.nombre_etiqueta ?? "",
      guia: e.paquetes?.numero_guia ?? "",
      verificacion: "verificada" as const,
      motivoSinSubir: e.motivo_sin_subir,
    })),
    new Date(),
    plazo
  );
  const bloqueante = bloquearRuta() ? pruebaQueBloquea(pendientes, plazo) : null;

  const pantallasSinSenal = ["/ruta", ...paradas.map((p) => `/entrega/${p.id}`), ...sinSubir.map((e) => `/subir/${e.id}`)];

  return (
    <div className="space-y-6">
      <PrepararSinSenal rutas={pantallasSinSenal} />
      <RefrescarAuto cadaSegundos={30} />
      {bloqueante && (
        <Link href={`/subir/${bloqueante.id}`} className="block rounded-xl border-2 border-rojo bg-rojo/10 p-4">
          <p className="text-lg font-semibold text-rojo">Sube primero la prueba de {bloqueante.nombre}</p>
          <p className="text-sm text-tinta-2">
            Hace {bloqueante.minutos} min que la entregaste. Hasta que la subas al courier no puedes seguir con la ruta: su índice de velocidad cuenta desde que entregas.
          </p>
          <span className="mt-3 inline-block rounded-md bg-rojo px-4 py-2 text-sm font-semibold text-white">Subir ahora</span>
        </Link>
      )}

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
        <RutaOptimizada paradas={paradasRuta} bloqueada={bloqueante !== null} />
      </section>

      {paraManana.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold">Para mañana ({paraManana.length})</h2>
          <p className="mb-3 text-sm text-tinta-2">Estos clientes pidieron recibir mañana; entran a tu ruta de mañana.</p>
          <ul className="space-y-2">
            {paraManana.map((p) => {
              const desde = horaDeColumna(p.hora_preferida);
              return (
                <li key={p.id} className="rounded-lg border border-linea bg-tarjeta px-3 py-3 text-sm">
                  <span className="block truncate font-medium">{p.nombre_etiqueta}</span>
                  <span className="block truncate text-xs text-tinta-2">
                    {desde !== null ? etiquetaRango(desde, horaDeColumna(p.hora_hasta) ?? desde + 1) : "Sin horario"} · {p.sectores?.nombre ?? "Sin sector"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {sinRespuesta.length > 0 && (
        <details open={abrirSinRespuesta} className="rounded-xl border border-linea bg-tarjeta">
          <summary className="cursor-pointer px-4 py-3">
            <span className="text-lg font-semibold">Sin respuesta ({sinRespuesta.length})</span>
            {abrirSinRespuesta && (
              <span className="mt-0.5 block text-sm font-medium text-acento-oscuro">
                {confirmadas.length === 0 ? "No tienes paradas confirmadas: ponte con estos clientes." : "Te quedan pocas paradas: ponte con estos clientes."}
              </span>
            )}
          </summary>
          <p className="px-4 pb-3 text-sm text-tinta-2">
            Ya se les avisó por WhatsApp y aún no contestan. Llámalos o escríbeles tú. En cuanto confirmen su hora entran solos a tu ruta.
          </p>
          <ul className="space-y-2 px-3 pb-3">
            {sinRespuesta.map(({ paquete: p, contacto }) => {
              const tel = p.destinatarios?.telefono;
              const aviso = contacto?.aviso ?? null;
              return (
                <li key={p.id} className="rounded-lg border border-linea bg-fondo/40 px-3 py-3">
                  <p className="truncate font-medium">{p.nombre_etiqueta}</p>
                  <p className="text-xs text-tinta-2">
                    {p.sectores?.nombre ?? "Sin sector"}
                    {p.direccion_entrega_texto ?? p.destinatarios?.direccion_texto ? ` · ${p.direccion_entrega_texto ?? p.destinatarios?.direccion_texto}` : ""}
                  </p>
                  <p className="mt-1 text-xs">
                    <span className={aviso === "fallido" ? "font-semibold text-rojo" : "text-tinta-2"}>{TEXTO_AVISO[aviso ?? "ninguno"]}</span>
                    {p.estado === "intento_fallido" && <span className="ml-2 font-semibold text-rojo">· intento fallido</span>}
                    {contacto?.ultimoMensaje && <span className="ml-2 font-medium">· escribió: «{contacto.ultimoMensaje}»</span>}
                  </p>
                  {tel && <p className="text-xs tabular-nums text-tinta-2">{formatearTelefono(tel)}</p>}
                  {ultimaLlamada.get(p.id) && (
                    <p className="text-xs text-tinta-2">
                      Última llamada: {TEXTO_RESULTADO_LLAMADA[ultimaLlamada.get(p.id)!.resultado as ResultadoLlamada] ?? ultimaLlamada.get(p.id)!.resultado}
                      {" · "}
                      {new Date(ultimaLlamada.get(p.id)!.creada_en).toLocaleTimeString("es-DO", { timeZone: "America/Santo_Domingo", hour: "numeric", minute: "2-digit", hour12: true })}
                    </p>
                  )}
                  <div className="mt-2 grid grid-cols-3 gap-2 text-sm font-semibold">
                    {tel ? (
                      <>
                        <a href={`tel:+1${tel}`} className="rounded-lg bg-tinta py-2.5 text-center text-white">Llamar</a>
                        <a href={`https://wa.me/1${tel}`} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-verde py-2.5 text-center text-verde">WhatsApp</a>
                      </>
                    ) : (
                      <span className="col-span-2 py-2.5 text-center text-xs text-tinta-2">Sin teléfono</span>
                    )}
                    {bloqueante ? (
                      <span aria-disabled="true" className="rounded-lg border border-linea py-2.5 text-center opacity-40">Entregar</span>
                    ) : (
                      <Link href={`/entrega/${p.id}`} className="rounded-lg border border-linea py-2.5 text-center">Entregar</Link>
                    )}
                  </div>
                  {tel && <RegistrarLlamada paqueteId={p.id} telefono={tel} />}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}
