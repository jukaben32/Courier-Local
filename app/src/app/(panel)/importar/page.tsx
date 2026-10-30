import { createClient } from "@/lib/supabase/server";
import type { SectorOpcion } from "../recibir/FormularioRecibir";
import { ImportarListado } from "./ImportarListado";

interface Importacion {
  id: string;
  archivo: string;
  total_filas: number;
  importadas: number;
  omitidas: number;
  created_at: string;
}

export default async function PaginaImportar() {
  const supabase = await createClient();
  const [{ data: sectoresBD }, { data: historial, error: errorHistorial }] = await Promise.all([
    supabase.from("sectores").select("id, nombre, zonas(nombre)").order("nombre"),
    supabase.from("importaciones").select("id, archivo, total_filas, importadas, omitidas, created_at").order("created_at", { ascending: false }).limit(10),
  ]);

  const filas = (sectoresBD ?? []) as unknown as { id: string; nombre: string; zonas: { nombre: string } | null }[];
  const sectores: SectorOpcion[] = filas.map((s) => ({ id: s.id, nombre: s.nombre, zona: s.zonas?.nombre ?? "" }));
  const importaciones = (historial ?? []) as Importacion[];
  const fecha = new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santo_Domingo" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Importar listado</h1>
        <p className="text-sm text-tinta-2">
          Sube el Excel «Listado de envíos en la oficina». Revisa la vista previa y confirma: cada paquete se asigna solo al
          repartidor de su sector. Después envía los avisos desde Paquetes.
        </p>
      </div>

      {errorHistorial && (
        <p role="alert" className="rounded-lg border border-rojo/40 bg-rojo/5 px-4 py-3 text-sm text-rojo">
          Falta preparar la base de datos: aplica <span className="font-mono">base-de-datos/009-importar-listado.sql</span> en Supabase.
        </p>
      )}

      <ImportarListado sectores={sectores} />

      {importaciones.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Últimas importaciones</h2>
          <ul className="divide-y divide-linea rounded-xl border border-linea bg-tarjeta text-sm">
            {importaciones.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <div className="font-medium">{i.archivo}</div>
                  <div className="text-xs text-tinta-2">{fecha.format(new Date(i.created_at))}</div>
                </div>
                <div className="text-right">
                  <span className="font-semibold text-verde">{i.importadas} importados</span>
                  {i.omitidas > 0 && <span className="ml-2 text-tinta-2">· {i.omitidas} omitidos</span>}
                  <span className="ml-2 text-tinta-2">de {i.total_filas}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
