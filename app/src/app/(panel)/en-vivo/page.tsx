import Link from "next/link";
import { esArchivoVisible, type EstadoConversacion, type FilaEnVivo } from "@/lib/enVivo";
import { cargarEnVivo } from "@/lib/enVivoDatos";
import { createClient } from "@/lib/supabase/server";
import { formatearTelefono } from "@/lib/telefono";
import { Refrescar } from "./Refrescar";

const ETIQUETA: Record<EstadoConversacion, { texto: string; clase: string }> = {
  atencion: { texto: "Necesita atención", clase: "bg-rojo text-white" },
  confirmado: { texto: "Confirmado", clase: "bg-verde/15 text-verde" },
  respondio: { texto: "Respondió", clase: "bg-acento/15 text-acento-oscuro" },
  esperando: { texto: "Esperando respuesta", clase: "bg-linea text-tinta-2" },
  fallido: { texto: "Aviso no salió", clase: "bg-rojo/10 text-rojo" },
};

const TEXTO_AVISO: Record<string, string> = { enviado: "✓ enviado", entregado: "✓✓ entregado", leido: "✓✓ leído", fallido: "✗ falló" };

const VISTAS = [
  { clave: "todos", texto: "Todos" },
  { clave: "atencion", texto: "Necesitan atención" },
  { clave: "confirmado", texto: "Confirmados" },
  { clave: "respondio", texto: "Respondieron" },
  { clave: "esperando", texto: "Sin respuesta" },
] as const;

const hora = new Intl.DateTimeFormat("es-DO", { timeStyle: "short", timeZone: "America/Santo_Domingo" });

export default async function PaginaEnVivo({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { ver = "todos" } = await searchParams;
  const supabase = await createClient();
  const { filas, enCola } = await cargarEnVivo(supabase);
  const cuenta = (e: EstadoConversacion) => filas.filter((f) => f.estado === e).length;
  const visibles = ver === "todos" ? filas : filas.filter((f) => f.estado === ver);

  const tarjetas = [
    { texto: "Avisados hoy", valor: filas.length },
    { texto: "Respondieron", valor: filas.filter((f) => f.ultimoDelCliente).length },
    { texto: "Confirmados", valor: cuenta("confirmado") },
    { texto: "Con ubicación", valor: filas.filter((f) => f.ubicacion).length },
    { texto: "Necesitan atención", valor: cuenta("atencion"), alerta: true },
    { texto: "En cola por avisar", valor: enCola },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">En vivo</h1>
          <p className="text-sm text-tinta-2">Las conversaciones de WhatsApp de hoy, cliente por cliente, con lo que respondió cada uno.</p>
        </div>
        <Refrescar />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tarjetas.map((t) => (
          <div key={t.texto} className={`rounded-xl border bg-tarjeta px-4 py-3 ${t.alerta && t.valor > 0 ? "border-rojo" : "border-linea"}`}>
            <div className={`text-2xl font-semibold ${t.alerta && t.valor > 0 ? "text-rojo" : ""}`}>{t.valor}</div>
            <div className="text-xs text-tinta-2">{t.texto}</div>
          </div>
        ))}
      </div>

      <nav aria-label="Filtrar" className="deslizable flex gap-1">
        {VISTAS.map((v) => {
          const n = v.clave === "todos" ? filas.length : cuenta(v.clave);
          return (
            <Link
              key={v.clave}
              href={v.clave === "todos" ? "/en-vivo" : `/en-vivo?ver=${v.clave}`}
              aria-current={ver === v.clave ? "page" : undefined}
              className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium ${ver === v.clave ? "bg-tinta text-white" : "border border-linea bg-tarjeta hover:bg-linea/50"}`}
            >
              {v.texto} ({n})
            </Link>
          );
        })}
      </nav>

      {visibles.length === 0 ? (
        <p className="rounded-xl border border-linea bg-tarjeta px-4 py-6 text-center text-sm text-tinta-2">
          {filas.length === 0 ? "Hoy todavía no se ha avisado a nadie." : "Nadie en este grupo."}
        </p>
      ) : (
        <ul className="space-y-2">
          {visibles.map((f) => (
            <FilaCliente key={f.telefono} fila={f} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilaCliente({ fila: f }: { fila: FilaEnVivo }) {
  const etiqueta = ETIQUETA[f.estado];
  return (
    <li className={`rounded-xl border bg-tarjeta ${f.estado === "atencion" ? "border-rojo" : "border-linea"}`}>
      <details>
        <summary className="grid cursor-pointer list-none gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[1.3fr_1fr_1.6fr]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{f.nombre}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${etiqueta.clase}`}>{etiqueta.texto}</span>
            </div>
            <div className="text-xs text-tinta-2">
              {formatearTelefono(f.telefono)} · {f.sector ?? "Sin sector"}
              {f.guias.length > 1 && ` · ${f.guias.length} paquetes`}
            </div>
          </div>
          <div className="text-sm">
            <div>
              {f.eligio ? <span className="font-semibold text-verde">🕐 {f.eligio}</span> : <span className="text-tinta-2">Sin horario</span>}
              {f.ubicacion && <span className="ml-2 text-verde">📍 ubicación</span>}
              {f.fotos > 0 && <span className="ml-2 text-verde">📸 {f.fotos === 1 ? "foto de la casa" : `${f.fotos} fotos/videos`}</span>}
            </div>
            <div className="text-xs text-tinta-2">Aviso: {f.aviso ? TEXTO_AVISO[f.aviso] ?? f.aviso : "—"}</div>
          </div>
          <div className="min-w-0 text-sm">
            {f.ultimoDelCliente ? (
              <>
                <div className="truncate">«{f.ultimoDelCliente.texto}»</div>
                <div className="text-xs text-tinta-2">Escribió a las {hora.format(new Date(f.ultimoDelCliente.hora))}</div>
              </>
            ) : (
              <span className="text-tinta-2">Todavía no ha escrito</span>
            )}
          </div>
        </summary>
        <ol className="space-y-1.5 border-t border-linea px-4 py-3 text-sm">
          {f.mensajes.map((m) => (
            <li key={m.id} className={`flex gap-2 ${m.direccion === "entrante" ? "" : "justify-end text-right"}`}>
              <span
                className={`max-w-[85%] rounded-lg px-3 py-1.5 ${m.direccion === "entrante" ? "bg-linea/60" : "bg-acento/10"}`}
              >
                <span className="block text-xs text-tinta-2">
                  {m.direccion === "entrante" ? "Cliente" : `Courier · ${m.tipo}`} · {hora.format(new Date(m.creado_en))}
                  {m.direccion === "saliente" && ` · ${TEXTO_AVISO[m.estado] ?? m.estado}`}
                </span>
                {esArchivoVisible(m) ? (
                  m.contenido === "[video]" ? (
                    <video src={`/api/whatsapp-archivo/${m.id}`} controls preload="none" className="mt-1 max-h-72 rounded-md" />
                  ) : (
                    <a href={`/api/whatsapp-archivo/${m.id}`} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element -- archivo privado servido por la app, no optimizable */}
                      <img src={`/api/whatsapp-archivo/${m.id}`} alt="Foto que mandó el cliente" loading="lazy" className="mt-1 max-h-72 rounded-md" />
                    </a>
                  )
                ) : (
                  m.contenido || (m.tipo === "aviso" ? "Aviso de llegada del paquete" : "—")
                )}
              </span>
            </li>
          ))}
        </ol>
      </details>
    </li>
  );
}
