import { createClient } from "@/lib/supabase/server";
import { ResolverExcepcion } from "./ResolverExcepcion";

export const dynamic = "force-dynamic";

const VIGENCIA_ENLACE_SEGUNDOS = 900;
const TEXTO_SISTEMA = { no_coincide: "El nombre de la cédula no coincide con el del paquete", ilegible: "La cédula no se pudo leer" } as const;
const TEXTO_ESTADO = { aprobada: "Autorizada", rechazada: "Rechazada", pendiente: "Pendiente" } as const;

interface Solicitud {
  id: string;
  foto_url: string;
  nombre_en_cedula: string | null;
  cedula_leida: string | null;
  motivo_sistema: keyof typeof TEXTO_SISTEMA;
  nota_repartidor: string | null;
  estado: keyof typeof TEXTO_ESTADO;
  motivo_resolucion: string | null;
  creada_en: string;
  paquetes: { numero_guia: string; nombre_etiqueta: string } | null;
  repartidores: { nombre: string } | null;
}

const COLUMNAS =
  "id, foto_url, nombre_en_cedula, cedula_leida, motivo_sistema, nota_repartidor, estado, motivo_resolucion, creada_en, paquetes(numero_guia, nombre_etiqueta), repartidores(nombre)";

function haceCuanto(iso: string): string {
  const minutos = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return minutos < 60 ? `hace ${minutos} min` : `hace ${Math.floor(minutos / 60)} h`;
}

export default async function PaginaExcepciones() {
  const supabase = await createClient();
  const [{ data: pendientesDb }, { data: resueltasDb }] = await Promise.all([
    supabase.from("solicitudes_excepcion").select(COLUMNAS).eq("estado", "pendiente").order("creada_en"),
    supabase.from("solicitudes_excepcion").select(COLUMNAS).neq("estado", "pendiente").order("resuelta_en", { ascending: false }).limit(10),
  ]);
  const pendientes = (pendientesDb ?? []) as unknown as Solicitud[];
  const resueltas = (resueltasDb ?? []) as unknown as Solicitud[];

  const fotos = await Promise.all(
    pendientes.map(async (s) => (await supabase.storage.from("evidencias").createSignedUrl(s.foto_url, VIGENCIA_ENLACE_SEGUNDOS)).data?.signedUrl ?? null)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Excepciones de cédula</h1>
        <p className="max-w-2xl text-sm text-tinta-2">
          Cuando la cédula no coincide con el nombre del paquete, el repartidor pide autorización. Revisa la foto y decide: al autorizar o rechazar siempre queda escrito tu motivo.
        </p>
      </div>

      {pendientes.length === 0 && <p className="rounded-xl border border-linea bg-tarjeta px-4 py-10 text-center text-tinta-2">No hay solicitudes pendientes. ✅</p>}

      <ul className="space-y-4">
        {pendientes.map((s, i) => (
          <li key={s.id} className="grid gap-4 rounded-xl border-2 border-ambar bg-tarjeta p-4 md:grid-cols-[220px_1fr]">
            {fotos[i] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fotos[i]!} alt="Foto de la cédula" className="max-h-56 w-full rounded-lg object-contain" />
            ) : (
              <div className="grid place-items-center rounded-lg bg-fondo text-sm text-tinta-2">Sin foto</div>
            )}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-ambar">{TEXTO_SISTEMA[s.motivo_sistema]} · {haceCuanto(s.creada_en)}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-tinta-2">Paquete a nombre de</dt><dd className="font-semibold">{s.paquetes?.nombre_etiqueta} <span className="font-mono text-xs font-normal text-tinta-2">({s.paquetes?.numero_guia})</span></dd>
                <dt className="text-tinta-2">La cédula dice</dt><dd className="font-semibold">{s.nombre_en_cedula ?? "No se pudo leer"}{s.cedula_leida ? <span className="font-mono text-xs font-normal text-tinta-2"> · {s.cedula_leida}</span> : null}</dd>
                <dt className="text-tinta-2">Repartidor</dt><dd>{s.repartidores?.nombre}</dd>
                {s.nota_repartidor && (<><dt className="text-tinta-2">Nota</dt><dd>{s.nota_repartidor}</dd></>)}
              </dl>
              <ResolverExcepcion solicitudId={s.id} />
            </div>
          </li>
        ))}
      </ul>

      {resueltas.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-semibold">Resueltas recientemente</h2>
          <ul className="divide-y divide-linea rounded-xl border border-linea bg-tarjeta">
            {resueltas.map((s) => (
              <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm">
                <span><b>{s.paquetes?.nombre_etiqueta}</b> · {s.repartidores?.nombre}</span>
                <span className={s.estado === "aprobada" ? "font-semibold text-verde" : "font-semibold text-rojo"}>{TEXTO_ESTADO[s.estado]}</span>
                <span className="w-full text-xs text-tinta-2">Motivo: {s.motivo_resolucion}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
