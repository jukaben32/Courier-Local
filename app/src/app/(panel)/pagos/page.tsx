import Link from "next/link";
import { redirect } from "next/navigation";
import { desplazarQuincena, esQuincenaValida, etiquetaQuincena, quincenaDe } from "@/lib/quincena";
import { obtenerUsuarioActual } from "@/lib/sesion";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const pesos = (n: number) => `RD$${n.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface FilaPago {
  repartidor_id: string;
  repartidor: string;
  entregas: number;
  total_a_pagar: number;
}

interface FilaBono {
  repartidor_id: string;
  entregas_totales: number;
  entregas_en_ventana: number;
  entregas_primer_intento: number;
  evidencia_completa_pct: number;
  penalizaciones: number;
  puntaje: number;
  califica_bono: boolean;
  puesto_del_mes: number | null;
  monto_bono_estimado: number;
}

export default async function PaginaPagos({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const usuario = await obtenerUsuarioActual();
  if (usuario?.rol !== "dueno") redirect("/paquetes");

  const { q } = await searchParams;
  const actual = quincenaDe(new Date());
  const quincena = esQuincenaValida(q) && q <= actual ? q : actual;
  const mes = `${quincena.slice(0, 7)}-01`;

  const supabase = await createClient();
  const [{ data: pagosDb }, { data: bonosDb }, { data: repartidoresDb }, { data: parametros }] = await Promise.all([
    supabase.from("liquidacion_quincenal").select("repartidor_id, repartidor, entregas, total_a_pagar").eq("quincena_inicio", quincena),
    supabase.from("bonos_mensuales").select("*").eq("mes", mes).order("puntaje", { ascending: false }),
    supabase.from("repartidores").select("id, nombre"),
    supabase.from("parametros_bono").select("*").limit(1).maybeSingle(),
  ]);

  const pagos = ((pagosDb ?? []) as unknown as FilaPago[]).sort((a, b) => Number(b.total_a_pagar) - Number(a.total_a_pagar));
  const bonos = (bonosDb ?? []) as unknown as FilaBono[];
  const nombre = new Map((repartidoresDb ?? []).map((r: { id: string; nombre: string }) => [r.id, r.nombre]));
  const totalEntregas = pagos.reduce((t, p) => t + Number(p.entregas), 0);
  const totalPagar = pagos.reduce((t, p) => t + Number(p.total_a_pagar), 0);
  const anterior = desplazarQuincena(quincena, 1);
  const siguiente = quincena < actual ? desplazarQuincena(quincena, -1) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Pagos y bonos</h1>
          <p className="text-sm text-tinta-2">Quincena del {etiquetaQuincena(quincena)}</p>
        </div>
        <div className="flex gap-2 text-sm font-medium">
          <Link href={`/pagos?q=${anterior}`} className="rounded-lg border border-linea bg-tarjeta px-3 py-2">← Anterior</Link>
          {siguiente && <Link href={`/pagos?q=${siguiente}`} className="rounded-lg border border-linea bg-tarjeta px-3 py-2">Siguiente →</Link>}
        </div>
      </div>

      <section className="rounded-xl border border-linea bg-tarjeta p-5">
        <h2 className="mb-1 text-lg font-semibold">Pago de la quincena</h2>
        <p className="mb-3 text-sm text-tinta-2">Cada entrega con su prueba se paga según su zona: RD$40 en San Pedro y RD$55 en los municipios. La tarifa queda fijada al entregar.</p>
        {pagos.length === 0 ? (
          <p className="text-sm text-tinta-2">No hay entregas en esta quincena.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="border-b border-linea text-xs uppercase tracking-wide text-tinta-2">
                <tr><th className="py-2">Repartidor</th><th className="py-2 text-right">Entregas</th><th className="py-2 text-right">A pagar</th></tr>
              </thead>
              <tbody>
                {pagos.map((p) => (
                  <tr key={p.repartidor_id} className="border-b border-linea last:border-0">
                    <td className="py-2.5 font-medium">{p.repartidor}</td>
                    <td className="py-2.5 text-right tabular-nums">{p.entregas}</td>
                    <td className="py-2.5 text-right font-semibold tabular-nums">{pesos(Number(p.total_a_pagar))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-tinta">
                  <td className="py-2.5 font-semibold">Total</td>
                  <td className="py-2.5 text-right font-semibold tabular-nums">{totalEntregas}</td>
                  <td className="py-2.5 text-right text-base font-bold tabular-nums">{pesos(totalPagar)}</td>
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
