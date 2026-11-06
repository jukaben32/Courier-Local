import { createClient } from "@/lib/supabase/server";
import { guardarTelefonosRepartidor } from "./telefonos-actions";

const campo = "w-full rounded-lg border border-linea bg-tarjeta px-3 py-2 text-sm";

interface FilaTelefonos {
  id: string;
  nombre: string;
  telefono: string | null;
  telefono2: string | null;
}

/** Teléfonos de cada repartidor (hasta dos), para que la oficina y los clientes puedan ubicarlos. */
export async function TelefonosRepartidores() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("repartidores")
    .select("id, nombre, telefono, telefono2")
    .eq("rol", "repartidor")
    .eq("activo", true)
    .order("nombre");

  return (
    <section className="rounded-xl border border-linea bg-tarjeta p-4">
      <h2 className="text-lg font-semibold">Teléfonos de los repartidores</h2>
      <p className="text-sm text-tinta-2">Hasta dos números por persona. El primero es el que se le da al cliente al confirmar la entrega.</p>
      {error ? (
        <p className="mt-3 text-sm font-medium text-rojo">Falta aplicar el SQL 015 (segundo teléfono) en Supabase.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {((data ?? []) as FilaTelefonos[]).map((r) => (
            <li key={r.id}>
              <form action={guardarTelefonosRepartidor} className="grid items-center gap-2 sm:grid-cols-[1.2fr_1fr_1fr_auto]">
                <input type="hidden" name="id" value={r.id} />
                <span className="font-medium">{r.nombre}</span>
                <input name="telefono" defaultValue={r.telefono ?? ""} inputMode="tel" placeholder="Teléfono 1" aria-label={`Teléfono 1 de ${r.nombre}`} className={campo} />
                <input name="telefono2" defaultValue={r.telefono2 ?? ""} inputMode="tel" placeholder="Teléfono 2 (opcional)" aria-label={`Teléfono 2 de ${r.nombre}`} className={campo} />
                <button className="rounded-lg bg-tinta px-3 py-2 text-sm font-semibold text-white">Guardar</button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
