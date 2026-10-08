import { pesos } from "@/lib/formato";
import { resumenPagos, type EntregaPagable, type PaqueteAsignado, type RepartidorBase } from "@/lib/ganancias";
import { leerTodo } from "@/lib/paginar";
import { diaDeRD, diasHasta, etiquetaFecha, etiquetaPeriodo, limitesPeriodo } from "@/lib/periodoPago";
import { obtenerUsuarioActual } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";
import { Dato } from "../resumen/Tarjetas";
import { TarjetaRepartidor, type FilaBono, type ParametrosBono } from "@/components/TarjetaRepartidor";
import { EquilibrioReparto } from "./EquilibrioReparto";
import { PanelCobertura, type CoberturaVigente } from "./PanelCobertura";

export const dynamic = "force-dynamic";

const MAX_DIAS_COBERTURA = 14;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

interface FilaRepartidorDb {
  id: string;
  nombre: string;
  rol: string;
  activo: boolean;
  es_suplente: boolean;
}
interface FilaCobertura {
  id: string;
  hasta: string;
  motivo: string | null;
  ausente_id: string;
  cubre_id: string;
  ausente: { nombre: string } | null;
  cubre: { nombre: string } | null;
}

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

  const hoy = diaDeRD(ahora);
  const [repartidoresDb, entregasDb, paquetesDb, { data: bonosDb }, { data: parametrosDb }, { data: coberturasDb }] = await Promise.all([
    // También los dados de baja: se muestran mientras tengan dinero por cobrar
    supabase.from("repartidores").select("id, nombre, rol, activo, es_suplente").order("nombre"),
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
    supabase
      .from("coberturas")
      .select("id, hasta, motivo, ausente_id, cubre_id, ausente:repartidores!ausente_id(nombre), cubre:repartidores!cubre_id(nombre)")
      .lte("desde", hoy)
      .gte("hasta", hoy)
      .is("terminada_en", null),
  ]);

  const filasRepartidor = (repartidoresDb.data ?? []) as unknown as FilaRepartidorDb[];
  const repartidores = filasRepartidor.map<RepartidorBase>((f) => ({ id: f.id, nombre: f.nombre, rol: f.rol, activo: f.activo, esSuplente: f.es_suplente }));
  const coberturasVigentes = (coberturasDb ?? []) as unknown as FilaCobertura[];
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
  const diasParaPago = diasHasta(hoy, r.periodoActual.pago);

  // Quien ya no trabaja solo se muestra si todavía tiene dinero por cobrar o paquetes sin pasar a otro
  const visibles = r.repartidores.filter((f) => f.activo || f.periodoActual.entregas > 0 || f.periodoAnterior.entregas > 0 || f.porEntregar > 0);

  // Para decir en cada tarjeta quién cubre a quién hoy
  const cubriendoA = new Map<string, string[]>();
  const cubiertoPor = new Map<string, string>();
  for (const c of coberturasVigentes) {
    cubriendoA.set(c.cubre_id, [...(cubriendoA.get(c.cubre_id) ?? []), c.ausente?.nombre ?? "otro repartidor"]);
    cubiertoPor.set(c.ausente_id, c.cubre?.nombre ?? "otro repartidor");
  }
  const opciones = filasRepartidor.filter((f) => f.activo && f.rol === "repartidor").map((f) => ({ id: f.id, nombre: f.nombre, esSuplente: f.es_suplente }));
  const vigentes: CoberturaVigente[] = coberturasVigentes.map((c) => ({
    id: c.id,
    ausente: c.ausente?.nombre ?? "—",
    cubre: c.cubre?.nombre ?? "—",
    hasta: etiquetaFecha(c.hasta),
    motivo: c.motivo,
  }));

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

      <EquilibrioReparto />

      <PanelCobertura
        repartidores={opciones}
        coberturas={vigentes}
        esDueno={usuario?.rol === "dueno"}
        hoy={hoy}
        limite={diaDeRD(new Date(ahora.getTime() + MAX_DIAS_COBERTURA * MS_POR_DIA))}
      />

      {visibles.length === 0 ? (
        <p className="rounded-xl border border-linea bg-tarjeta px-4 py-10 text-center text-tinta-2">No hay repartidores activos.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visibles.map((fila) => (
            <TarjetaRepartidor
              key={fila.id}
              fila={fila}
              bono={bonos.get(fila.id)}
              parametros={parametros}
              periodoActual={r.periodoActual}
              periodoAnterior={r.periodoAnterior}
              verDinero={verDinero}
              cubriendoA={cubriendoA.get(fila.id)}
              cubiertoPor={cubiertoPor.get(fila.id)}
            />
          ))}
        </div>
      )}
      {!verDinero && <p className="text-xs text-tinta-2">Los montos en pesos solo los ve el dueño.</p>}
    </div>
  );
}
