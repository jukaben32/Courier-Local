import Link from "next/link";
import { formatearCedula } from "@/lib/cedula";
import { formatearTelefono } from "@/lib/telefono";
import { nivelPlazo, type NivelPlazo } from "@/lib/plazo";
import { createClient } from "@/lib/supabase/server";
import { whatsappSimulado } from "@/lib/whatsapp/cliente";
import { BotonAvisos } from "./BotonAvisos";

// Las acciones de esta pantalla (enviar cientos de avisos de una vez) pueden tardar más que el límite por defecto
export const maxDuration = 120;

const ESTADOS_ACTIVOS = ["recibido", "notificado", "confirmado", "en_ruta", "intento_fallido", "retiro_oficina"];
const LIMITE_FILAS = 300;

const VISTAS = [
  { clave: "activos", texto: "Por entregar" },
  { clave: "cerrados", texto: "Cerrados" },
  { clave: "todos", texto: "Todos" },
] as const;

const TEXTO_ESTADO: Record<string, string> = {
  recibido: "Recibido",
  notificado: "Avisado",
  confirmado: "Confirmado",
  en_ruta: "En ruta",
  entregado: "Entregado",
  intento_fallido: "Intento fallido",
  retiro_oficina: "Retiro en oficina",
  devuelto: "Devuelto",
  rechazado: "Rechazado",
};

const ESTILO_PLAZO: Record<NivelPlazo, { texto: string; clases: string }> = {
  verde: { texto: "Día 1", clases: "bg-verde/15 text-verde" },
  amarillo: { texto: "Día 2", clases: "bg-ambar/20 text-[#8a6200]" },
  rojo: { texto: "Último día", clases: "bg-rojo/15 text-rojo" },
  vencido: { texto: "Vencido", clases: "bg-tinta text-white" },
};

interface FilaPaquete {
  id: string;
  numero_guia: string;
  nombre_etiqueta: string;
  estado: string;
  voluminoso: boolean;
  intentos_realizados: number;
  fecha_recibido: string;
  destinatarios: { telefono: string; cedula: string | null } | null;
  sectores: { nombre: string } | null;
  repartidores: { nombre: string } | null;
}

export default async function PaginaPaquetes({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; q?: string }>;
}) {
  const { vista = "activos", q = "" } = await searchParams;
  const supabase = await createClient();

  let consulta = supabase
    .from("paquetes")
    .select(
      "id, numero_guia, nombre_etiqueta, estado, voluminoso, intentos_realizados, fecha_recibido, destinatarios(telefono, cedula), sectores(nombre), repartidores:repartidor_asignado_id(nombre)"
    )
    .order("fecha_recibido", { ascending: false })
    .limit(LIMITE_FILAS);

  if (vista === "activos") consulta = consulta.in("estado", ESTADOS_ACTIVOS);
  if (vista === "cerrados") consulta = consulta.not("estado", "in", `(${ESTADOS_ACTIVOS.join(",")})`);

  const texto = q.trim().replace(/[,()%*]/g, " ");
  if (texto) {
    // También se busca por teléfono o cédula (solo números, de 4 dígitos en adelante)
    const digitos = texto.replace(/[^0-9]/g, "");
    let coincidencias: string[] = [];
    if (digitos.length >= 4) {
      const { data: personas } = await supabase.from("destinatarios").select("id").or(`telefono.ilike.%${digitos}%,cedula.ilike.%${digitos}%`).limit(200);
      coincidencias = (personas ?? []).map((p: { id: string }) => p.id);
    }
    const condiciones = [`numero_guia.ilike.%${texto}%`, `nombre_etiqueta.ilike.%${texto}%`];
    if (coincidencias.length > 0) condiciones.push(`destinatario_id.in.(${coincidencias.join(",")})`);
    consulta = consulta.or(condiciones.join(","));
  }

  const [{ data, error }, { count: pendientesDeAviso }] = await Promise.all([
    consulta,
    supabase.from("paquetes").select("id", { count: "exact", head: true }).eq("estado", "recibido"),
  ]);
  const filas = (data ?? []) as unknown as FilaPaquete[];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Paquetes</h1>
          <p className="text-sm text-tinta-2">
            {filas.length === LIMITE_FILAS ? `Mostrando los ${LIMITE_FILAS} más recientes` : `${filas.length} paquetes`}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          <BotonAvisos pendientes={pendientesDeAviso ?? 0} simulado={whatsappSimulado()} />
          <Link
            href="/importar"
            className="rounded-lg bg-acento px-4 py-2.5 text-sm font-semibold text-[#1a0900] hover:bg-acento-oscuro hover:text-white"
          >
            Importar listado
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-linea bg-tarjeta p-1">
          {VISTAS.map((v) => (
            <Link
              key={v.clave}
              href={`/paquetes?vista=${v.clave}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                vista === v.clave ? "bg-tinta text-white" : "text-tinta-2 hover:text-tinta"
              }`}
            >
              {v.texto}
            </Link>
          ))}
        </div>
        <form className="min-w-[14rem] flex-1" action="/paquetes">
          <input type="hidden" name="vista" value={vista} />
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar por guía, nombre, teléfono o cédula"
            aria-label="Buscar por guía, nombre, teléfono o cédula"
            className="w-full max-w-sm rounded-lg border border-linea bg-tarjeta px-3 py-2 text-sm"
          />
        </form>
      </div>

      {error && <p role="alert" className="text-sm font-medium text-rojo">No se pudo cargar la lista. Recarga la página.</p>}

      {/* Celular: una tarjeta por paquete (la tabla de 6 columnas no cabe) */}
      <ul className="space-y-2 md:hidden">
        {filas.length === 0 && <li className="rounded-xl border border-linea bg-tarjeta px-4 py-10 text-center text-tinta-2">No hay paquetes en esta vista.</li>}
        {filas.map((p) => {
          const activo = ESTADOS_ACTIVOS.includes(p.estado);
          const plazo = ESTILO_PLAZO[nivelPlazo(new Date(p.fecha_recibido))];
          return (
            <li key={p.id} className="space-y-1.5 rounded-xl border border-linea bg-tarjeta px-4 py-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium">{p.nombre_etiqueta}</span>
                {activo && <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${plazo.clases}`}>{plazo.texto}</span>}
              </div>
              <p className="text-xs text-tinta-2">
                <span className="font-mono">{p.numero_guia}</span>
                {p.voluminoso && <span className="ml-2 rounded bg-tinta/10 px-1.5 py-0.5 text-[11px]">Grande</span>}
                {p.destinatarios && <> · {formatearTelefono(p.destinatarios.telefono)}</>}
              </p>
              {p.destinatarios?.cedula && <p className="text-xs text-tinta-2">Cédula {formatearCedula(p.destinatarios.cedula)}</p>}
              <p>
                {p.sectores?.nombre ?? <span className="text-rojo">Sin sector</span>} · {p.repartidores?.nombre ?? <span className="text-rojo">Sin asignar</span>}
              </p>
              <p className="font-medium">
                {TEXTO_ESTADO[p.estado] ?? p.estado}
                {p.intentos_realizados > 0 && activo && <span className="ml-2 text-xs font-normal text-tinta-2">({p.intentos_realizados}/3 intentos)</span>}
              </p>
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl border border-linea bg-tarjeta md:block">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b border-linea bg-fondo/60 text-xs uppercase tracking-wide text-tinta-2">
            <tr>
              <th className="px-4 py-3">Plazo</th>
              <th className="px-4 py-3">Guía</th>
              <th className="px-4 py-3">Destinatario</th>
              <th className="px-4 py-3">Teléfono</th>
              <th className="px-4 py-3">Cédula</th>
              <th className="px-4 py-3">Sector</th>
              <th className="px-4 py-3">Repartidor</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-tinta-2">
                  No hay paquetes en esta vista.
                </td>
              </tr>
            )}
            {filas.map((p) => {
              const activo = ESTADOS_ACTIVOS.includes(p.estado);
              const plazo = ESTILO_PLAZO[nivelPlazo(new Date(p.fecha_recibido))];
              return (
                <tr key={p.id} className="border-b border-linea last:border-0">
                  <td className="px-4 py-3">
                    {activo ? (
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${plazo.clases}`}>{plazo.texto}</span>
                    ) : (
                      <span className="text-tinta-2">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {p.numero_guia}
                    {p.voluminoso && <span className="ml-2 rounded bg-tinta/10 px-1.5 py-0.5 font-sans text-[11px]">Grande</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{p.nombre_etiqueta}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                    {p.destinatarios ? formatearTelefono(p.destinatarios.telefono) : <span className="text-tinta-2">—</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                    {p.destinatarios?.cedula ? (
                      formatearCedula(p.destinatarios.cedula)
                    ) : (
                      <span className="text-tinta-2" title="Se registra al verificar la cédula en la primera entrega">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{p.sectores?.nombre ?? <span className="text-rojo">Sin sector</span>}</td>
                  <td className="px-4 py-3">{p.repartidores?.nombre ?? <span className="text-rojo">Sin asignar</span>}</td>
                  <td className="px-4 py-3">
                    {TEXTO_ESTADO[p.estado] ?? p.estado}
                    {p.intentos_realizados > 0 && activo && (
                      <span className="ml-2 text-xs text-tinta-2">({p.intentos_realizados}/3 intentos)</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
