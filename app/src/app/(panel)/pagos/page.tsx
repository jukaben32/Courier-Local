import Link from "next/link";
import { redirect } from "next/navigation";
import { pesos } from "@/lib/formato";
import { pagoDelPeriodo, type EntregaPagable, type RepartidorBase } from "@/lib/ganancias";
import { leerTodo } from "@/lib/paginar";
import {
  esPeriodoValido,
  etiquetaFecha,
  etiquetaPeriodo,
  fechaDePago,
  finDelPeriodo,
  limitesPeriodo,
  periodoAnterior,
  periodoDe,
  periodoSiguiente,
} from "@/lib/periodoPago";
import { obtenerUsuarioActual } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";
import type { FilaBono } from "../repartidores/TarjetaRepartidor";

export const dynamic = "force-dynamic";

interface FilaEntrega {
  repartidor_id: string;
  creado_en: string;
  tarifa_aplicada: number | string | null;
  cargado_en_courier: boolean;
}

export default async function PaginaPagos({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const usuario = await obtenerUsuarioActual();
  if (usuario?.rol !== "dueno") redirect("/paquetes");

  const { q } = await searchParams;
  const actual = periodoDe(new Date());
  const periodo = esPeriodoValido(q) && q <= actual ? q : actual;
  // El índice y el bono son mensuales: se muestra el del mes en que termina el período
  const mes = `${finDelPeriodo(periodo).slice(0, 7)}-01`;
  const { desde, hasta } = limitesPeriodo(periodo);

  const supabase = await createClient();
  const [entregasDb, { data: bonosDb }, { data: repartidoresDb }, { data: parametros }] = await Promise.all([
    leerTodo<FilaEntrega>((a, b) =>
      supabase
        .from("entregas")
        .select("repartidor_id, creado_en, tarifa_aplicada, cargado_en_courier")
        .eq("resultado", "entregado")
        .eq("tipo", "domicilio")
        .gte("creado_en", desde)
        .lt("creado_en", hasta)
        .order("id")
        .range(a, b)
    ),
    supabase.from("bonos_mensuales").select("*").eq("mes", mes).order("puntaje", { ascending: false }),
    supabase.from("repartidores").select("id, nombre, rol"),
    supabase.from("parametros_bono").select("*").limit(1).maybeSingle(),
  ]);

  const repartidores = (repartidoresDb ?? []) as unknown as RepartidorBase[];
  const entregas = entregasDb.map<EntregaPagable>((e) => ({
    repartidorId: e.repartidor_id,
    creadoEn: e.creado_en,
    tarifa: e.tarifa_aplicada === null ? null : Number(e.tarifa_aplicada),
    cargadoEnCourier: e.cargado_en_courier,
  }));
  const { filas: pagos, total } = pagoDelPeriodo({ repartidores, entregas }, periodo);
  const bonos = (bonosDb ?? []) as unknown as FilaBono[];
  const nombre = new Map(repartidores.map((r) => [r.id, r.nombre]));
  const anterior = periodoAnterior(periodo);
  const siguiente = periodo < actual ? periodoSiguiente(periodo) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Pagos y bonos</h1>
          <p className="text-sm text-tinta-2">Período del {etiquetaPeriodo(periodo)} · se paga el {etiquetaFecha(fechaDePago(periodo))}</p>
        </div>
        <div className="flex gap-2 text-sm font-medium">
          <Link href={`/pagos?q=${anterior}`} className="rounded-lg border border-linea bg-tarjeta px-3 py-2">← Anterior</Link>
          {siguiente && <Link href={`/pagos?q=${siguiente}`} className="rounded-lg border border-linea bg-tarjeta px-3 py-2">Siguiente →</Link>}
        </div>
      </div>

      <section className="rounded-xl border border-linea bg-tarjeta p-5">
        <h2 className="mb-1 text-lg font-semibold">Pago del período</h2>
        <p className="mb-3 text-sm text-tinta-2">Cada entrega con su prueba se paga según su zona: RD$40 en San Pedro y RD$55 en los municipios. La tarifa queda fijada al entregar.</p>
        {pagos.length === 0 ? (
          <p className="text-sm text-tinta-2">No hay entregas en este período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-linea text-xs uppercase tracking-wide text-tinta-2">
                <tr><th className="py-2">Repartidor</th><th className="py-2 text-right">Entregas</th><th className="py-2 text-right">A pagar</th></tr>
              </thead>
              <tbody>
                {pagos.map((p) => (
                  <tr key={p.id} className="border-b border-linea last:border-0">
                    <td className="py-2.5 font-medium">{p.nombre}</td>
                    <td className="py-2.5 text-right tabular-nums">{p.entregas}</td>
                    <td className="py-2.5 text-right font-semibold tabular-nums">{pesos(p.ganado)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-tinta">
                  <td className="py-2.5 font-semibold">Total</td>
                  <td className="py-2.5 text-right font-semibold tabular-nums">{total.entregas}</td>
                  <td className="py-2.5 text-right text-base font-bold tabular-nums">{pesos(total.ganado)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-linea bg-tarjeta p-5">
        <h2 className="mb-1 text-lg font-semibold">Índice de efectividad del mes</h2>
        <p className="mb-3 text-sm text-tinta-2">
          Mide solo lo que depende del repartidor: cumplir el horario, entregar al primer intento y subir la prueba completa.
          {parametros && (
            <>
              {" "}Para el bono: al menos {parametros.volumen_minimo_mensual} entregas y {Number(parametros.umbral_bono_mensual)} puntos
              (bono {pesos(Number(parametros.monto_bono_mensual))}, más {pesos(Number(parametros.monto_bono_primer_lugar))} al primer lugar).
              <b> Estos montos son de ejemplo hasta que el dueño confirme los reales.</b>
            </>
          )}
        </p>
        {bonos.length === 0 ? (
          <p className="text-sm text-tinta-2">Todavía no hay entregas con prueba completa este mes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-linea text-xs uppercase tracking-wide text-tinta-2">
                <tr>
                  <th className="py-2">Repartidor</th>
                  <th className="py-2 text-right">Entregas</th>
                  <th className="py-2 text-right">En su horario</th>
                  <th className="py-2 text-right">1.er intento</th>
                  <th className="py-2 text-right">Puntaje</th>
                  <th className="py-2 text-right">Bono estimado</th>
                </tr>
              </thead>
              <tbody>
                {bonos.map((b) => (
                  <tr key={b.repartidor_id} className="border-b border-linea last:border-0">
                    <td className="py-2.5 font-medium">{nombre.get(b.repartidor_id) ?? "—"}</td>
                    <td className="py-2.5 text-right tabular-nums">{b.entregas_totales}</td>
                    <td className="py-2.5 text-right tabular-nums">{b.entregas_en_ventana}</td>
                    <td className="py-2.5 text-right tabular-nums">{b.entregas_primer_intento}</td>
                    <td className="py-2.5 text-right font-semibold tabular-nums">{Number(b.puntaje).toFixed(1)}</td>
                    <td className="py-2.5 text-right tabular-nums">
                      {b.califica_bono ? <span className="font-semibold text-verde">{pesos(Number(b.monto_bono_estimado))}</span> : <span className="text-tinta-2">No califica</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
