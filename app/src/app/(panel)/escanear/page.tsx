import { createClient } from "@/lib/supabase/server";
import { Escaner } from "./Escaner";

interface Fila {
  numero_guia: string;
  nombre_etiqueta: string;
  escaneado_en: string | null;
  repartidores: { nombre: string } | null;
}

export default async function PaginaEscanear() {
  const supabase = await createClient();
  const { data: ultima } = await supabase.from("importaciones").select("id").order("created_at", { ascending: false }).limit(1).maybeSingle();

  let filas: Fila[] = [];
  if (ultima) {
    const { data } = await supabase
      .from("paquetes")
      .select("numero_guia, nombre_etiqueta, escaneado_en, repartidores:repartidor_asignado_id(nombre)")
      .eq("importacion_id", ultima.id)
      .limit(1000);
    filas = (data ?? []) as unknown as Fila[];
  }

  const total = filas.length;
  const escaneados = filas.filter((f) => f.escaneado_en).length;
  const porRepartidor = new Map<string, { total: number; escaneados: number }>();
  for (const f of filas) {
    const nombre = f.repartidores?.nombre ?? "Sin asignar";
    const actual = porRepartidor.get(nombre) ?? { total: 0, escaneados: 0 };
    actual.total += 1;
    if (f.escaneado_en) actual.escaneados += 1;
    porRepartidor.set(nombre, actual);
  }
  const faltan = filas
    .filter((f) => !f.escaneado_en)
    .map((f) => ({ guia: f.numero_guia, nombre: f.nombre_etiqueta, repartidor: f.repartidores?.nombre ?? "Sin asignar" }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold">Recepción por escáner</h1>
        <p className="text-sm text-tinta-2">
          Escanea cada paquete que llega. La pantalla dice a qué repartidor va y marca lo recibido del último listado importado.
        </p>
      </div>
      <Escaner
        total={total}
        escaneados={escaneados}
        porRepartidor={[...porRepartidor.entries()].map(([nombre, v]) => ({ nombre, ...v })).sort((a, b) => a.nombre.localeCompare(b.nombre))}
        faltan={faltan}
      />
    </div>
  );
}
