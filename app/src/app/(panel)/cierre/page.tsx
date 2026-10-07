import { resumenDelDia, type EntregaDelDia } from "@/lib/cierre";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ZONA_HORARIA = "America/Santo_Domingo";
const ESTADOS_POR_ENTREGAR = ["recibido", "notificado", "confirmado", "en_ruta", "intento_fallido", "retiro_oficina"];

interface FilaEntrega {
  repartidor_id: string;
  creado_en: string;
  cargado_en_courier_en: string | null;
  repartidores: { nombre: string } | null;
}

// Medianoche de hoy en RD (UTC-4, sin horario de verano) expresada como momento exacto
function inicioDelDia(): string {
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_HORARIA }).format(new Date());
  return new Date(`${hoy}T00:00:00-04:00`).toISOString();
}

export default async function PaginaCierre() {
  const supabase = await createClient();
  const [{ data }, { count: pendientes }] = await Promise.all([
    supabase
      .from("entregas")
      .select("repartidor_id, creado_en, cargado_en_courier_en, repartidores(nombre)")
      .eq("resultado", "entregado")
      .eq("tipo", "domicilio")
      .gte("creado_en", inicioDelDia()),
    supabase.from("paquetes").select("id", { count: "exact", head: true }).in("estado", ESTADOS_POR_ENTREGAR),
  ]);

  const entregas: EntregaDelDia[] = ((data ?? []) as unknown as FilaEntrega[]).map((f) => ({
    repartidorId: f.repartidor_id,
    repartidor: f.repartidores?.nombre ?? "Sin nombre",
    creadoEn: f.creado_en,
    subidoEnCourierEn: f.cargado_en_courier_en,
  }));
  const resumen = resumenDelDia(entregas);
  const maxHora = Math.max(1, ...resumen.porHora.map((h) => h.cantidad));
  const hora12 = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h >= 12 ? "pm" : "am"}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Cierre del día</h1>
        <p className="text-sm text-tinta-2">Mientras más temprano se cierra y se suben las pruebas, más paquetes manda el courier al día siguiente.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Dato titulo="Entregados hoy" valor={String(resumen.entregadas)} />
        <Dato titulo="Faltan por entregar" valor={String(pendientes ?? 0)} />
        <Dato titulo="Última entrega" valor={resumen.ultimaEntrega ?? "—"} />
        <Dato titulo="Demora en subir al courier" valor={resumen.demoraPromedioSubida === null ? "—" : `${resumen.demoraPromedioSubida} min`} />
      </div>

      <section className="rounded-xl border border-linea bg-tarjeta p-5">
        <h2 className="mb-3 text-lg font-semibold">Entregas por hora</h2>
        {resumen.porHora.length === 0 && <p className="text-sm text-tinta-2">Todavía no hay entregas hoy.</p>}
        <ul className="space-y-2">
          {resumen.porHora.map((h) => (
            <li key={h.hora} className="grid grid-cols-[3.5rem_1fr_2.5rem] items-center gap-3 text-sm">
              <span className="text-tinta-2">{hora12(h.hora)}</span>
              <span className="h-4 overflow-hidden rounded bg-fondo">
                <span className="block h-full rounded bg-acento" style={{ width: `${(h.cantidad / maxHora) * 100}%` }} />
              </span>
              <span className="text-right font-semibold tabular-nums">{h.cantidad}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-linea bg-tarjeta p-5">
        <h2 className="mb-1 text-lg font-semibold">Pruebas sin subir al courier</h2>
        <p className="mb-3 text-sm text-tinta-2">Cada prueba pendiente retrasa el cierre que ve el courier.</p>
        {resumen.sinSubir.length === 0 ? (
          <p className="text-sm font-medium text-verde">No hay pruebas pendientes. ✅</p>
        ) : (
          <ul className="divide-y divide-linea">
            {resumen.sinSubir.map((p) => (
              <li key={p.repartidor} className="flex items-center justify-between py-2.5 text-sm">
                <span className="font-medium">{p.repartidor}</span>
                <span>
                  {p.cantidad} sin subir ·{" "}
                  <b className={p.minutosMasAntigua >= 60 ? "text-rojo" : "text-tinta-2"}>
                    la más vieja hace {p.minutosMasAntigua >= 60 ? `${Math.floor(p.minutosMasAntigua / 60)} h ${p.minutosMasAntigua % 60} min` : `${p.minutosMasAntigua} min`}
                  </b>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-xl border border-linea bg-tarjeta px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-tinta-2">{titulo}</p>
      <p className="font-display text-3xl font-semibold tabular-nums">{valor}</p>
    </div>
  );
}
