import Link from "next/link";
import { nivelPlazo } from "@/lib/plazo";
import { formatearTelefono } from "@/lib/telefono";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ETIQUETA_PLAZO = { verde: "Día 1", amarillo: "Día 2", rojo: "Último día", vencido: "Vencido" } as const;

interface FilaRetiro {
  id: string;
  numero_guia: string;
  nombre_etiqueta: string;
  fecha_recibido: string;
  destinatarios: { telefono: string } | null;
}

interface SinSubir {
  id: string;
  creado_en: string;
  paquetes: { numero_guia: string; nombre_etiqueta: string } | null;
}

export default async function PaginaRetiros({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const supabase = await createClient();

  let consulta = supabase
    .from("paquetes")
    .select("id, numero_guia, nombre_etiqueta, fecha_recibido, destinatarios(telefono)")
    .eq("estado", "retiro_oficina")
    .order("fecha_recibido");
  const texto = q.trim().replace(/[,()%*]/g, " ");
  if (texto) consulta = consulta.or(`numero_guia.ilike.%${texto}%,nombre_etiqueta.ilike.%${texto}%`);

  const [{ data }, { data: sinSubirDb }] = await Promise.all([
    consulta,
    supabase
      .from("entregas")
      .select("id, creado_en, paquetes(numero_guia, nombre_etiqueta)")
      .eq("tipo", "retiro_oficina")
      .eq("resultado", "entregado")
      .eq("cargado_en_courier", false)
      .order("creado_en"),
  ]);
  const retiros = (data ?? []) as unknown as FilaRetiro[];
  const sinSubir = (sinSubirDb ?? []) as unknown as SinSubir[];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold">Retiros en oficina</h1>
        <p className="text-sm text-tinta-2">Clientes que prefirieron pasar a buscar su paquete. La oficina cierra a las 4:00 pm.</p>
      </div>

      {sinSubir.length > 0 && (
        <section className="rounded-xl border-2 border-acento bg-acento/10 p-4">
          <h2 className="text-lg font-semibold">Pruebas de retiro por subir al courier ({sinSubir.length})</h2>
          <ul className="mt-2 space-y-2">
            {sinSubir.map((e) => (
              <li key={e.id}>
                <Link href={`/retiros/subir/${e.id}`} className="flex items-center justify-between rounded-lg bg-tarjeta px-3 py-3">
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

      <form action="/retiros">
        <input name="q" defaultValue={q} placeholder="Buscar por guía o nombre" aria-label="Buscar por guía o nombre" className="w-full max-w-sm rounded-lg border border-linea bg-tarjeta px-3 py-2 text-sm" />
      </form>

      <div className="overflow-x-auto rounded-xl border border-linea bg-tarjeta">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-linea bg-fondo/60 text-xs uppercase tracking-wide text-tinta-2">
            <tr><th className="px-4 py-3">Plazo</th><th className="px-4 py-3">Guía</th><th className="px-4 py-3">Cliente</th><th className="px-4 py-3" /></tr>
          </thead>
          <tbody>
            {retiros.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-tinta-2">No hay retiros pendientes.</td></tr>
            )}
            {retiros.map((p) => (
              <tr key={p.id} className="border-b border-linea last:border-0">
                <td className="px-4 py-3">{ETIQUETA_PLAZO[nivelPlazo(new Date(p.fecha_recibido))]}</td>
                <td className="px-4 py-3 font-mono text-xs">{p.numero_guia}</td>
                <td className="px-4 py-3">
                  <div className="font-medium">{p.nombre_etiqueta}</div>
                  {p.destinatarios && <div className="text-xs text-tinta-2">{formatearTelefono(p.destinatarios.telefono)}</div>}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/retiros/${p.id}`} className="rounded-md bg-tinta px-3 py-2 text-sm font-semibold text-white">Entregar</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
