import { createClient } from "@/lib/supabase/server";
import { FormularioRecibir, type SectorOpcion } from "./FormularioRecibir";

export default async function PaginaRecibir() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sectores")
    .select("id, nombre, zonas(nombre)")
    .order("nombre");

  const filas = (data ?? []) as unknown as { id: string; nombre: string; zonas: { nombre: string } | null }[];
  const sectores: SectorOpcion[] = filas.map((s) => ({
    id: s.id,
    nombre: s.nombre,
    zona: s.zonas?.nombre ?? "",
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold">Recibir paquetes</h1>
        <p className="text-sm text-tinta-2">
          Toma una foto de la etiqueta, revisa los datos y guarda. El paquete se asigna solo al repartidor del sector.
        </p>
      </div>
      <FormularioRecibir sectores={sectores} />
    </div>
  );
}
