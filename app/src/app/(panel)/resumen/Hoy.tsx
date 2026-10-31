import Link from "next/link";
import type { ResumenHoy } from "@/lib/hoy";
import { Dato, Seccion } from "./Tarjetas";

export interface AlertasHoy {
  atencion: number;
  sinSubir: number;
  ultimoDia: number;
  vencidos: number;
  excepciones: number;
}

/** Cómo va el día: alertas (solo si hay), el recorrido de los paquetes y cada repartidor. */
export function Hoy({ hoy, alertas }: { hoy: ResumenHoy; alertas: AlertasHoy }) {
  const e = hoy.embudo;
  const lista = [
    { cantidad: alertas.atencion, texto: "clientes necesitan atención", href: "/en-vivo?ver=atencion" },
    { cantidad: alertas.excepciones, texto: "excepciones por resolver", href: "/excepciones" },
    { cantidad: alertas.sinSubir, texto: "pruebas de entrega sin subir", href: "/cierre" },
    { cantidad: alertas.ultimoDia, texto: "paquetes en su último día", href: "/paquetes" },
    { cantidad: alertas.vencidos, texto: "paquetes vencidos", href: "/paquetes" },
  ].filter((a) => a.cantidad > 0);

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Hoy</h2>

      {lista.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Alertas">
          {lista.map((a) => (
            <li key={a.texto}>
              <Link href={a.href} className="inline-flex items-center gap-2 rounded-full border border-rojo/40 bg-rojo/10 px-3 py-1.5 text-sm font-medium text-rojo hover:bg-rojo/15">
                <b className="tabular-nums">{a.cantidad}</b> {a.texto}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Dato titulo="Llegaron hoy" valor={String(e.llegaron)} />
        <Dato titulo="Por avisar" valor={String(e.porAvisar)} nota="aún sin mensaje" />
        <Dato titulo="Esperando respuesta" valor={String(e.esperando)} nota={`${e.respondieron} respondieron hoy`} />
        <Dato titulo="Confirmados" valor={String(e.confirmados)} nota={`${e.conUbicacion} con ubicación`} />
        <Dato titulo="Para mañana" valor={String(e.paraManana)} />
        <Dato titulo="Entregados hoy" valor={String(e.entregados)} />
      </div>

      <Seccion titulo="Repartidores hoy" ayuda="Lo que tiene cada uno por entregar. Los que no han respondido los gestiona el repartidor.">
        {hoy.repartidores.length === 0 ? (
          <p className="text-sm text-tinta-2">Todavía no hay paquetes asignados.</p>
        ) : (
          <ul className="divide-y divide-linea">
            {hoy.repartidores.map((r) => (
              <li key={r.nombre} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 text-sm">
                <span className="font-medium">{r.nombre}</span>
                <span className="flex flex-wrap gap-x-4 gap-y-1 text-tinta-2">
                  <span><b className="text-tinta">{r.asignados}</b> por entregar</span>
                  <span><b className="text-tinta">{r.confirmados}</b> confirmados ({r.conUbicacion} con ubicación)</span>
                  <span><b className="text-tinta">{r.sinRespuesta}</b> sin respuesta</span>
                  <span className="text-verde"><b>{r.entregadosHoy}</b> entregados hoy</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Seccion>
    </section>
  );
}
