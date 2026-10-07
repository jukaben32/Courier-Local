import { pesos } from "@/lib/formato";
import { resumenPagos, type EntregaPagable, type PaqueteAsignado, type RepartidorBase } from "@/lib/ganancias";
import { leerTodo } from "@/lib/paginar";
import { diaDeRD, diasHasta, etiquetaFecha, etiquetaPeriodo, limitesPeriodo } from "@/lib/periodoPago";
import { obtenerUsuarioActual } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";
import { Dato } from "../resumen/Tarjetas";
import { TarjetaRepartidor, type FilaBono, type ParametrosBono } from "./TarjetaRepartidor";

export const dynamic = "force-dynamic";

const ESTADOS_POR_ENTREGAR = ["recibido", "notificado", "confirmado", "en_ruta", "intento_fallido", "retiro_oficina"];

interface FilaEntrega {
  repartidor_id: string;
  creado_en: string;
  tarifa_aplicada: number | string | null;
  cargado_en_courier: boolean;
}
interface FilaPaquete {
  repartidor_asignado_id: string;
  fecha_recibido: string;
}

function textoDiasParaPago(dias: number): string {
  if (dias <= 0) return "se paga hoy";
  return dias === 1 ? "se paga mañana" : `faltan ${dias} días`;
}

export default async function PaginaRepartidores() {
  const usuario = await obtenerUsuarioActual();
  const verDinero = usuario?.rol === "dueno";
  const ahora = new Date();
  const supabase = await createClient();

  // Se necesita lo entregado desde el inicio del período anterior (y las pruebas sin subir de cualquier fecha)
  const base = resumenPagos({ repartidores: [], entregas: [], paquetes: [] }, ahora);
  const desde = limitesPeriodo(base.periodoAnterior.inicio).desde;
  const mes = `${diaDeRD(ahora).slice(0, 7)}-01`;

  const [repartidoresDb, entregasDb, paquetesDb, { data: bonosDb }, { data: parametrosDb }] = await Promise.all([
    supabase.from("repartidores").select("id, nombre, rol").eq("activo", true).order("nombre"),
    leerTodo<FilaEntrega>((a, b) =>
      supabase
        .from("entregas")
        .select("repartidor_id, creado_en, tarifa_aplicada, cargado_en_courier")
        .eq("resultado", "entregado")
        .eq("tipo", "domicilio")
        .or(`creado_en.gte.${desde},cargado_en_courier.eq.false`)
        .order("id")
        .range(a, b)
    ),
    leerTodo<FilaPaquete>((a, b) =>
      supabase
        .from("paquetes")
        .select("repartidor_asignado_id, fecha_recibido")
        .in("estado", ESTADOS_POR_ENTREGAR)
        .not("repartidor_asignado_id", "is", null)
        .order("id")
        .range(a, b)
    ),
    supabase.from("bonos_mensuales").select("*").eq("mes", mes),
    supabase.from("parametros_bono").select("volumen_minimo_mensual, umbral_bono_mensual").limit(1).maybeSingle(),
  ]);

  const repartidores = (repartidoresDb.data ?? []) as unknown as RepartidorBase[];
  const entregas = entregasDb.map<EntregaPagable>((e) => ({
    repartidorId: e.repartidor_id,
    creadoEn: e.creado_en,
    tarifa: e.tarifa_aplicada === null ? null : Number(e.tarifa_aplicada),
    cargadoEnCourier: e.cargado_en_courier,
  }));
  const paquetes = paquetesDb.map<PaqueteAsignado>((p) => ({ repartidorId: p.repartidor_asignado_id, fechaRecibido: p.fecha_recibido }));
  const bonos = new Map(((bonosDb ?? []) as unknown as FilaBono[]).map((b) => [b.repartidor_id, b]));
  const parametros = parametrosDb as ParametrosBono | null;

  const r = resumenPagos({ repartidores, entregas, paquetes }, ahora);
  const diasParaPago = diasHasta(diaDeRD(ahora), r.periodoActual.pago);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Cuentas por repartidor</h1>
        <p className="max-w-2xl text-sm text-tinta-2">
          Cuánto entregó y cuánto ganó cada uno, al día de hoy. Se cobra el 10 y el 25: el corte es el 9 y el 24.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Dato
          titulo="Entregas hoy"
          valor={String(r.totales.hoy.entregas)}
          nota={verDinero ? pesos(r.totales.hoy.ganado) : undefined}
        />
        <Dato
          titulo="Período en curso"
          valor={verDinero ? pesos(r.totales.periodoActual.ganado) : String(r.totales.periodoActual.entregas)}
          nota={`${verDinero ? `${r.totales.periodoActual.entregas} entregas · ` : "entregas · "}${etiquetaPeriodo(r.periodoActual.inicio)}. Pago el ${etiquetaFecha(r.periodoActual.pago)} (${textoDiasParaPago(diasParaPago)})`}
        />
        <Dato
          titulo="Período anterior"
          valor={verDinero ? pesos(r.totales.periodoAnterior.ganado) : String(r.totales.periodoAnterior.entregas)}
          nota={`${verDinero ? `${r.totales.periodoAnterior.entregas} entregas · ` : "entregas · "}${etiquetaPeriodo(r.periodoAnterior.inicio)}. Pago el ${etiquetaFecha(r.periodoAnterior.pago)}`}
        />
      </div>

      {r.repartidores.length === 0 ? (
        <p className="rounded-xl border border-linea bg-tarjeta px-4 py-10 text-center text-tinta-2">No hay repartidores activos.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {r.repartidores.map((fila) => (
            <TarjetaRepartidor
              key={fila.id}
              fila={fila}
              bono={bonos.get(fila.id)}
              parametros={parametros}
              periodoActual={r.periodoActual}
              periodoAnterior={r.periodoAnterior}
              verDinero={verDinero}
            />
          ))}
        </div>
      )}
      {!verDinero && <p className="text-xs text-tinta-2">Los montos en pesos solo los ve el dueño.</p>}
    </div>
  );
}
