import Link from "next/link";
import { porcentaje } from "@/lib/formato";
import { calcularMetricas, type EntregaM, type MensajeM, type PaqueteM } from "@/lib/metricas";
import { leerTodo } from "@/lib/paginar";
import { createClient } from "@/lib/supabase/server";
import { Dato, Seccion } from "./resumen/Tarjetas";
import { GraficoDiario } from "./resumen/GraficoDiario";

export const dynamic = "force-dynamic";

const DIAS_DEL_PERIODO = 30;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

const MOTIVOS: Record<string, string> = {
  sin_respuesta_destinatario: "El cliente nunca respondió",
  no_localizable: "No se pudo localizar",
  rechazado_por_destinatario: "Lo rechazó el cliente",
  danado: "Llegó dañado",
  falla_repartidor: "Falla del repartidor",
  otro: "Otro motivo",
};

const PLAZOS = [
  { clave: "verde", texto: "Día 1", clases: "bg-verde/15 text-verde" },
  { clave: "amarillo", texto: "Día 2", clases: "bg-ambar/20 text-[#8a6200]" },
  { clave: "rojo", texto: "Último día", clases: "bg-rojo/15 text-rojo" },
  { clave: "vencido", texto: "Vencidos", clases: "bg-tinta text-white" },
] as const;

// Forma de cada fila tal como la devuelve la base (los datos relacionados vienen anidados)
interface FilaPaquete {
  id: string;
  estado: string;
  fecha_recibido: string;
  intentos_realizados: number;
  motivo_devolucion: string | null;
  hora_confirmacion: string | null;
  sectores: { nombre: string } | null;
  repartidores: { nombre: string } | null;
}
interface FilaEntrega {
  paquete_id: string;
  creado_en: string;
  resultado: EntregaM["resultado"];
  tipo: string;
  cargado_en_courier: boolean;
  repartidores: { nombre: string } | null;
}
interface FilaMensaje {
  paquete_id: string;
  tipo: string;
  estado: string;
}

const pct = porcentaje;

export default async function PaginaResumen() {
  const supabase = await createClient();
  const desde = new Date(new Date().getTime() - DIAS_DEL_PERIODO * MS_POR_DIA).toISOString();

  const [paquetesDb, entregasDb, mensajesDb] = await Promise.all([
    leerTodo<FilaPaquete>((a, b) =>
      supabase
        .from("paquetes")
        .select("id, estado, fecha_recibido, intentos_realizados, motivo_devolucion, hora_confirmacion, sectores(nombre), repartidores:repartidor_asignado_id(nombre)")
        .gte("fecha_recibido", desde)
        .order("id")
        .range(a, b)
    ),
    leerTodo<FilaEntrega>((a, b) =>
      supabase
        .from("entregas")
        .select("paquete_id, creado_en, resultado, tipo, cargado_en_courier, repartidores(nombre)")
        .gte("creado_en", desde)
        .order("id")
        .range(a, b)
    ),
    leerTodo<FilaMensaje>((a, b) =>
      supabase.from("mensajes_whatsapp").select("paquete_id, tipo, estado").gte("creado_en", desde).order("id").range(a, b)
    ),
  ]);

  const paquetes = paquetesDb.map<PaqueteM>((f) => ({
    id: f.id,
    estado: f.estado,
    fechaRecibido: f.fecha_recibido,
    intentos: f.intentos_realizados,
    sector: f.sectores?.nombre ?? null,
    repartidor: f.repartidores?.nombre ?? null,
    motivoDevolucion: f.motivo_devolucion,
    confirmado: f.hora_confirmacion !== null,
  }));
  const entregas = entregasDb.map<EntregaM>((f) => ({
    paqueteId: f.paquete_id,
    repartidor: f.repartidores?.nombre ?? null,
    creadoEn: f.creado_en,
    resultado: f.resultado,
    tipo: f.tipo,
    cargadoEnCourier: f.cargado_en_courier,
  }));
  const mensajes = mensajesDb.map<MensajeM>((f) => ({
    paqueteId: f.paquete_id,
    tipo: f.tipo,
    estado: f.estado,
  }));

  const m = calcularMetricas({ paquetes, entregas, mensajes });
  const maxSector = Math.max(1, ...m.porSector.map((s) => s.recibidos));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Resumen</h1>
          <p className="text-sm text-tinta-2">Cómo va la operación en los últimos {DIAS_DEL_PERIODO} días.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/repartidores" className="rounded-lg bg-acento px-4 py-2.5 text-sm font-semibold text-[#1a0900] hover:bg-acento-oscuro hover:text-white">
            Cuentas por repartidor
          </Link>
          <Link href="/cierre" className="rounded-lg border border-linea bg-tarjeta px-4 py-2.5 text-sm font-semibold">
            Ver el cierre de hoy
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Dato titulo="Por entregar ahora" valor={String(m.cartera.activos)} />
        <Dato titulo="Entregados" valor={String(m.rendimiento.entregados)} nota={`de ${m.rendimiento.recibidos} recibidos`} />
        <Dato titulo="Tasa de entrega" valor={pct(m.rendimiento.tasaEntrega)} nota="de los ya cerrados" />
        <Dato titulo="Al primer intento" valor={pct(m.rendimiento.primerIntento)} nota="de los entregados" />
        <Dato titulo="Días para entregar" valor={m.rendimiento.diasPromedio === null ? "—" : String(m.rendimiento.diasPromedio)} nota="promedio (máximo 3)" />
        <Dato titulo="Respuesta al aviso" valor={pct(m.whatsapp.tasaRespuesta)} nota={`${m.whatsapp.confirmaron} de ${m.whatsapp.avisados} avisados`} />
        <Dato titulo="Devueltos" valor={String(m.rendimiento.devueltos)} />
        <Dato titulo="Mensajes enviados" valor={String(m.whatsapp.mensajes)} nota={`${m.whatsapp.fallidos} fallidos`} />
      </div>

      <Seccion titulo="Plazo de lo que falta por entregar" ayuda="El courier da 3 días desde que llega cada paquete.">
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PLAZOS.map((p) => (
            <li key={p.clave} className={`rounded-lg px-3 py-3 ${p.clases}`}>
              <p className="font-display text-3xl font-semibold tabular-nums">{m.cartera.porPlazo[p.clave]}</p>
              <p className="text-xs font-semibold uppercase tracking-wide">{p.texto}</p>
            </li>
          ))}
        </ul>
      </Seccion>

      <Seccion titulo="Últimos 14 días" ayuda="Paquetes que llegaron y paquetes entregados cada día.">
        <GraficoDiario dias={m.porDia} />
      </Seccion>

      <Seccion titulo="Repartidores" ayuda="Entregas del periodo. Las pruebas sin subir retrasan el cierre que ve el courier.">
        {m.porRepartidor.length === 0 ? (
          <p className="text-sm text-tinta-2">Todavía no hay entregas en este periodo.</p>
        ) : (
          <ul className="divide-y divide-linea">
            {m.porRepartidor.map((r) => (
              <li key={r.nombre} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 text-sm">
                <span className="font-medium">{r.nombre}</span>
                <span className="flex flex-wrap gap-x-4 text-tinta-2">
                  <span><b className="text-tinta">{r.entregas}</b> entregas</span>
                  <span><b className="text-tinta">{pct(r.primerIntento)}</b> al primer intento</span>
                  <span><b className="text-tinta">{r.fallidos}</b> fallidos</span>
                  <span className={r.sinSubir > 0 ? "font-semibold text-rojo" : ""}><b>{r.sinSubir}</b> sin subir</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <div className="grid gap-6 lg:grid-cols-2">
        <Seccion titulo="Sectores con más paquetes" ayuda="Dónde se concentra el trabajo.">
          {m.porSector.length === 0 && <p className="text-sm text-tinta-2">Sin datos todavía.</p>}
          <ul className="space-y-3">
            {m.porSector.map((s) => (
              <li key={s.sector} className="text-sm">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">{s.sector}</span>
                  <span className="shrink-0 tabular-nums text-tinta-2">{s.recibidos} en total · {s.entregados} entregados · {s.pendientes} por entregar</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded bg-fondo">
                  <div className="h-full rounded bg-acento" style={{ width: `${(s.recibidos / maxSector) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Seccion>

        <Seccion titulo="Por qué se devuelven" ayuda="Motivo de los paquetes que volvieron al courier.">
          {m.rendimiento.motivos.length === 0 ? (
            <p className="text-sm font-medium text-verde">No hay devoluciones en este periodo. ✅</p>
          ) : (
            <ul className="divide-y divide-linea">
              {m.rendimiento.motivos.map((x) => (
                <li key={x.motivo} className="flex justify-between gap-3 py-2.5 text-sm">
                  <span>{MOTIVOS[x.motivo] ?? x.motivo}</span>
                  <b className="tabular-nums">{x.cantidad}</b>
                </li>
              ))}
            </ul>
          )}
        </Seccion>
      </div>
    </div>
  );
}
