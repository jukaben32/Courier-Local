import { DIAS_ATENCION, DIAS_PENALIDAD, diasEnOficina, formatearPesos, nivelDemora, TEXTO_TIPO_PENALIDAD, TIPOS_PENALIDAD, totalesPenalidades, type TipoPenalidad } from "@/lib/demora";
import { createClient } from "@/lib/supabase/server";
import { marcarPenalidadPagada, registrarPenalidad } from "./actions";

export const dynamic = "force-dynamic";

const ESTADOS_ABIERTOS = ["recibido", "notificado", "confirmado", "en_ruta", "intento_fallido", "retiro_oficina"];
const campo = "w-full rounded-lg border border-linea bg-tarjeta px-3 py-2 text-sm";

interface FilaRiesgo {
  id: string;
  numero_guia: string;
  nombre_etiqueta: string;
  estado: string;
  fecha_recibido: string;
  sectores: { nombre: string } | null;
  repartidores: { nombre: string } | null;
}

interface FilaPenalidad {
  id: string;
  numero_guia: string;
  tipo: string;
  costo: number;
  estado: string;
  dias_en_oficina: number | null;
  nota: string | null;
  creada_en: string;
}

export default async function PaginaPenalidades() {
  const supabase = await createClient();
  const ahora = new Date();
  const limite = new Date(ahora.getTime() - (DIAS_ATENCION - 1) * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: fallidosDb }, { data: riesgoDb }, { data: penalidadesDb }] = await Promise.all([
    supabase
      .from("paquetes")
      .select("id, numero_guia, nombre_etiqueta, estado, fecha_recibido, sectores(nombre), repartidores:repartidor_asignado_id(nombre)")
      .eq("estado", "intento_fallido")
      .order("fecha_recibido")
      .limit(200),
    supabase
      .from("paquetes")
      .select("id, numero_guia, nombre_etiqueta, estado, fecha_recibido, sectores(nombre), repartidores:repartidor_asignado_id(nombre)")
      .in("estado", ESTADOS_ABIERTOS)
      .lt("fecha_recibido", limite)
      .order("fecha_recibido")
      .limit(200),
    supabase.from("penalidades").select("id, numero_guia, tipo, costo, estado, dias_en_oficina, nota, creada_en").order("creada_en", { ascending: false }).limit(200),
  ]);

  const riesgo =((riesgoDb ?? []) as unknown as FilaRiesgo[])
    .map((p) => ({ ...p, dias: diasEnOficina(new Date(p.fecha_recibido), ahora) }))
    .filter((p) => nivelDemora(p.dias) !== "normal");
  const fallidos = ((fallidosDb ?? []) as unknown as FilaRiesgo[]).map((p) => ({ ...p, dias: diasEnOficina(new Date(p.fecha_recibido), ahora) }));
  const penalidades = (penalidadesDb ?? []) as FilaPenalidad[];
  const totales = totalesPenalidades(penalidades);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Penalidades y atrasos</h1>
        <p className="text-sm text-tinta-2">
          El courier cobra una penalidad cuando un paquete pasa {DIAS_PENALIDAD} días en la oficina, y una mucho mayor si se pierde. Aquí se ven los paquetes que van camino a eso.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-linea bg-tarjeta p-4">
          <p className="text-xs uppercase tracking-wide text-tinta-2">Deuda pendiente</p>
          <p className={`text-2xl font-semibold ${totales.deuda > 0 ? "text-rojo" : ""}`}>{formatearPesos(totales.deuda)}</p>
          <p className="text-xs text-tinta-2">{totales.pendientes} sin pagar</p>
        </div>
        <div className="rounded-xl border border-linea bg-tarjeta p-4">
          <p className="text-xs uppercase tracking-wide text-tinta-2">Total pagado</p>
          <p className="text-2xl font-semibold">{formatearPesos(totales.pagado)}</p>
        </div>
        <div className="rounded-xl border border-linea bg-tarjeta p-4">
          <p className="text-xs uppercase tracking-wide text-tinta-2">Paquetes en riesgo</p>
          <p className={`text-2xl font-semibold ${riesgo.length > 0 ? "text-rojo" : ""}`}>{riesgo.length}</p>
          <p className="text-xs text-tinta-2">con {DIAS_ATENCION} días o más en la oficina</p>
        </div>
      </div>

      <section className="rounded-xl border border-linea bg-tarjeta">
        <h2 className="border-b border-linea px-4 py-3 text-lg font-semibold">En riesgo de penalidad</h2>
        {riesgo.length === 0 ? (
          <p className="px-4 py-4 text-sm text-tinta-2">Ningún paquete lleva {DIAS_ATENCION} días o más. Todo al día. ✅</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-tinta-2">
                <tr><th className="px-4 py-2">Guía</th><th className="px-4 py-2">Cliente</th><th className="px-4 py-2">Sector</th><th className="px-4 py-2">Repartidor</th><th className="px-4 py-2">Días</th></tr>
              </thead>
              <tbody>
                {riesgo.map((p) => (
                  <tr key={p.id} className="border-t border-linea">
                    <td className="px-4 py-2 font-mono text-xs">{p.numero_guia}</td>
                    <td className="px-4 py-2">{p.nombre_etiqueta}</td>
                    <td className="px-4 py-2">{p.sectores?.nombre ?? "—"}</td>
                    <td className="px-4 py-2">{p.repartidores?.nombre ?? "Sin asignar"}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${nivelDemora(p.dias) === "penalidad" ? "bg-rojo/15 text-rojo" : "bg-ambar/20 text-[#8a6200]"}`}>
                        {p.dias} días{nivelDemora(p.dias) === "penalidad" ? " · ya penaliza" : ""}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-linea bg-tarjeta">
        <h2 className="border-b border-linea px-4 py-3 text-lg font-semibold">Entregas fallidas ({fallidos.length})</h2>
        {fallidos.length === 0 ? (
          <p className="px-4 py-4 text-sm text-tinta-2">No hay entregas fallidas pendientes.</p>
        ) : (
          <ul className="divide-y divide-linea text-sm">
            {fallidos.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span>
                  <span className="font-medium">{p.nombre_etiqueta}</span>
                  <span className="ml-2 font-mono text-xs text-tinta-2">{p.numero_guia}</span>
                  <span className="block text-xs text-tinta-2">{p.sectores?.nombre ?? "Sin sector"} · {p.repartidores?.nombre ?? "Sin asignar"}</span>
                </span>
                <span className="text-xs font-semibold">{p.dias} {p.dias === 1 ? "día" : "días"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-linea bg-tarjeta p-4">
        <h2 className="text-lg font-semibold">Registrar una penalidad</h2>
        <form action={registrarPenalidad} className="mt-3 grid gap-3 sm:grid-cols-5">
          <input name="guia" required placeholder="Guía (SP…)" aria-label="Guía" className={campo} />
          <select name="tipo" aria-label="Tipo" className={campo} defaultValue="demora_oficina">
            {TIPOS_PENALIDAD.map((t) => <option key={t} value={t}>{TEXTO_TIPO_PENALIDAD[t as TipoPenalidad]}</option>)}
          </select>
          <input name="costo" required inputMode="decimal" placeholder="Costo RD$" aria-label="Costo" className={campo} />
          <input name="dias" inputMode="numeric" placeholder="Días en oficina" aria-label="Días en oficina" className={campo} />
          <button className="rounded-lg bg-tinta px-3 py-2 text-sm font-semibold text-white">Guardar</button>
          <input name="nota" placeholder="Nota (opcional)" aria-label="Nota" className={`${campo} sm:col-span-5`} />
        </form>
      </section>

      <section className="rounded-xl border border-linea bg-tarjeta">
        <h2 className="border-b border-linea px-4 py-3 text-lg font-semibold">Historial</h2>
        {penalidades.length === 0 ? (
          <p className="px-4 py-4 text-sm text-tinta-2">Todavía no hay penalidades registradas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-tinta-2">
                <tr><th className="px-4 py-2">Guía</th><th className="px-4 py-2">Tipo</th><th className="px-4 py-2">Costo</th><th className="px-4 py-2">Días</th><th className="px-4 py-2">Estado</th><th className="px-4 py-2"></th></tr>
              </thead>
              <tbody>
                {penalidades.map((p) => (
                  <tr key={p.id} className="border-t border-linea">
                    <td className="px-4 py-2 font-mono text-xs">{p.numero_guia}</td>
                    <td className="px-4 py-2">{TEXTO_TIPO_PENALIDAD[p.tipo as TipoPenalidad] ?? p.tipo}{p.nota ? <span className="block text-xs text-tinta-2">{p.nota}</span> : null}</td>
                    <td className="px-4 py-2">{formatearPesos(Number(p.costo))}</td>
                    <td className="px-4 py-2">{p.dias_en_oficina ?? "—"}</td>
                    <td className="px-4 py-2">{p.estado === "pagada" ? "Pagada" : <span className="font-semibold text-rojo">Pendiente</span>}</td>
                    <td className="px-4 py-2 text-right">
                      {p.estado === "pendiente" && (
                        <form action={marcarPenalidadPagada}>
                          <input type="hidden" name="id" value={p.id} />
                          <button className="rounded-md border border-linea px-2 py-1 text-xs">Marcar pagada</button>
                        </form>
                      )}
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
