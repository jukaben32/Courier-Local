import Link from "next/link";
import { diaDeRD } from "@/lib/periodoPago";
import { plazoSubidaMin, resumirPruebas, type EntregaFila, type NivelPrueba } from "@/lib/pruebasCourier";
import { createClient } from "@/lib/supabase/server";
import { Dato, Seccion } from "../resumen/Tarjetas";
import { Refrescar } from "../en-vivo/Refrescar";
import { AccionesVerificacion } from "./AccionesVerificacion";

export const dynamic = "force-dynamic";

const COLUMNAS =
  "id, resultado, creado_en, cargado_en_courier, cargado_en_courier_en, verificacion, motivo_sin_subir, foto_cedula_destinatario_url, repartidores(nombre), paquetes(numero_guia, nombre_etiqueta)";

interface FilaBD {
  id: string;
  resultado: string;
  creado_en: string;
  cargado_en_courier: boolean;
  cargado_en_courier_en: string | null;
  verificacion: "verificada" | "pendiente";
  motivo_sin_subir: string | null;
  foto_cedula_destinatario_url: string | null;
  repartidores: { nombre: string } | null;
  paquetes: { numero_guia: string; nombre_etiqueta: string } | null;
}

const COLOR: Record<NivelPrueba, string> = {
  ok: "text-verde",
  tarde: "text-[#8a6200]",
  critico: "font-semibold text-rojo",
};

function hace(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  return `${Math.floor(minutos / 60)} h ${minutos % 60} min`;
}

export default async function PaginaEntregas() {
  const supabase = await createClient();
  const inicioHoy = new Date(`${diaDeRD(new Date())}T00:00:00-04:00`).toISOString();

  const [sinSubir, deHoy, porVerificar] = await Promise.all([
    supabase.from("entregas").select(COLUMNAS).eq("resultado", "entregado").eq("cargado_en_courier", false).order("creado_en").limit(300),
    supabase.from("entregas").select(COLUMNAS).gte("creado_en", inicioHoy).order("creado_en").limit(2000),
    supabase.from("entregas").select(COLUMNAS).eq("resultado", "entregado").eq("verificacion", "pendiente").order("creado_en").limit(50),
  ]);

  const unicas = new Map<string, FilaBD>();
  for (const f of [...((sinSubir.data ?? []) as unknown as FilaBD[]), ...((deHoy.data ?? []) as unknown as FilaBD[])]) unicas.set(f.id, f);
  const filas = [...unicas.values()];

  const plazo = plazoSubidaMin();
  const resumen = resumirPruebas(
    filas.map<EntregaFila>((f) => ({
      id: f.id,
      resultado: f.resultado,
      creadoEn: f.creado_en,
      subidoEn: f.cargado_en_courier_en,
      cargado: f.cargado_en_courier,
      repartidor: f.repartidores?.nombre ?? null,
      nombre: f.paquetes?.nombre_etiqueta ?? "",
      guia: f.paquetes?.numero_guia ?? "",
      verificacion: f.verificacion,
      motivoSinSubir: f.motivo_sin_subir,
    })),
    new Date(),
    plazo,
    inicioHoy
  );

  // Fotos de las entregas por verificar (enlaces temporales)
  const pendientes = (porVerificar.data ?? []) as unknown as FilaBD[];
  const rutas = pendientes.map((f) => f.foto_cedula_destinatario_url).filter((r): r is string => !!r);
  const { data: firmadas } = rutas.length ? await supabase.storage.from("evidencias").createSignedUrls(rutas, 600) : { data: [] };
  const urlDe = new Map((firmadas ?? []).map((f) => [f.path, f.signedUrl]));

  const entregadasHoy = resumen.porRepartidor.reduce((t, r) => t + r.entregadas, 0);
  const fallidasHoy = resumen.porRepartidor.reduce((t, r) => t + r.fallidas, 0);
  const atrasadas = resumen.pendientes.filter((p) => p.nivel !== "ok").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Entregas</h1>
          <p className="text-sm text-tinta-2">
            Cada prueba debe quedar subida al courier en menos de {plazo} minutos: su índice de velocidad cuenta desde que se entrega.
          </p>
        </div>
        <Refrescar />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Dato titulo="Entregadas hoy" valor={String(entregadasHoy)} />
        <Dato titulo="Pruebas sin subir" valor={String(resumen.pendientes.length)} nota={atrasadas > 0 ? `${atrasadas} pasaron de ${plazo} min` : "todas a tiempo"} />
        <Dato titulo="Por verificar" valor={String(resumen.verificacionesPendientes)} nota="cédula sin comprobar" />
        <Dato titulo="No se pudo entregar" valor={String(fallidasHoy)} nota="intentos de hoy" />
      </div>

      <Seccion titulo="Pruebas sin subir al courier" ayuda="La más atrasada primero. Si el repartidor dijo por qué no pudo, aparece en la última columna.">
        {resumen.pendientes.length === 0 ? (
          <p className="text-sm font-medium text-verde">No hay pruebas pendientes. ✅</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-tinta-2">
                <tr>
                  <th className="py-1 pr-3">Hace</th>
                  <th className="py-1 pr-3">Repartidor</th>
                  <th className="py-1 pr-3">Paquete</th>
                  <th className="py-1">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-linea">
                {resumen.pendientes.map((p) => (
                  <tr key={p.id}>
                    <td className={`py-2 pr-3 tabular-nums ${COLOR[p.nivel]}`}>{hace(p.minutos)}</td>
                    <td className="py-2 pr-3">{p.repartidor ?? "Oficina"}</td>
                    <td className="py-2 pr-3">
                      {p.nombre} <span className="font-mono text-xs text-tinta-2">{p.guia}</span>
                    </td>
                    <td className="py-2 text-xs text-tinta-2">{p.motivoSinSubir ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      {pendientes.length > 0 && (
        <Seccion titulo="Cédulas por verificar" ayuda="La lectura automática no estuvo disponible al entregar. Mira la foto y confirma que corresponde al paquete.">
          <ul className="divide-y divide-linea">
            {pendientes.map((f) => {
              const url = f.foto_cedula_destinatario_url ? urlDe.get(f.foto_cedula_destinatario_url) : undefined;
              return (
                <li key={f.id} className="flex flex-wrap items-start gap-4 py-3">
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element -- enlace temporal de un archivo privado */}
                      <img src={url} alt="Foto de la cédula" className="h-28 w-40 rounded-md object-cover" />
                    </a>
                  ) : (
                    <span className="grid h-28 w-40 place-items-center rounded-md bg-linea/50 text-xs text-tinta-2">Sin foto</span>
                  )}
                  <div className="min-w-0 flex-1 space-y-2 text-sm">
                    <p className="font-medium">
                      {f.paquetes?.nombre_etiqueta} <span className="font-mono text-xs font-normal text-tinta-2">{f.paquetes?.numero_guia}</span>
                    </p>
                    <p className="text-xs text-tinta-2">Entregó {f.repartidores?.nombre ?? "la oficina"} · debe decir exactamente ese nombre</p>
                    <AccionesVerificacion entregaId={f.id} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Seccion>
      )}

      <Seccion titulo="Repartidores hoy" ayuda={`Demora entre entregar y subir la prueba. Meta: ${plazo} minutos o menos.`}>
        {resumen.porRepartidor.length === 0 ? (
          <p className="text-sm text-tinta-2">Todavía no hay entregas hoy.</p>
        ) : (
          <ul className="divide-y divide-linea">
            {resumen.porRepartidor.map((r) => (
              <li key={r.nombre} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 text-sm">
                <span className="font-medium">{r.nombre}</span>
                <span className="flex flex-wrap gap-x-4 gap-y-1 text-tinta-2">
                  <span><b className="text-tinta">{r.entregadas}</b> entregadas</span>
                  <span><b className="text-tinta">{r.fallidas}</b> no se pudo</span>
                  <span className={r.sinSubir > 0 ? "font-semibold text-rojo" : ""}><b>{r.sinSubir}</b> sin subir</span>
                  <span><b className="text-tinta">{r.demoraPromedioMin === null ? "—" : `${r.demoraPromedioMin} min`}</b> demora media</span>
                  <span><b className="text-tinta">{r.dentroDelPlazoPct === null ? "—" : `${r.dentroDelPlazoPct}%`}</b> a tiempo</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <p className="text-sm text-tinta-2">
        También: <Link href="/retiros" className="underline">Retiros en la oficina</Link> ·{" "}
        <Link href="/excepciones" className="underline">Excepciones</Link> · <Link href="/cierre" className="underline">Cierre del día</Link>
      </p>
    </div>
  );
}
