"use client";

import { useActionState, useState, useTransition, type ReactNode } from "react";
import { cubrirAusencia, pasarPaquetes, reemplazarRepartidor, terminarCobertura, type EstadoCobertura } from "./actions";

export interface OpcionRepartidor {
  id: string;
  nombre: string;
  esSuplente: boolean;
}

export interface CoberturaVigente {
  id: string;
  ausente: string;
  cubre: string;
  hasta: string;
  motivo: string | null;
}

interface Props {
  repartidores: OpcionRepartidor[];
  coberturas: CoberturaVigente[];
  esDueno: boolean;
  /** Fecha de hoy ("2026-10-07") y el último día que se puede elegir. */
  hoy: string;
  limite: string;
}

const ESTADO_INICIAL: EstadoCobertura = {};
const campo = "w-full rounded-lg border border-linea bg-tarjeta px-3 py-2.5";
const boton = "rounded-lg bg-tinta px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60";

function Mensajes({ estado }: { estado: EstadoCobertura }) {
  return (
    <>
      {estado.error && <p role="alert" className="text-sm font-medium text-rojo">{estado.error}</p>}
      {estado.mensaje && <p role="status" className="text-sm font-medium text-verde">{estado.mensaje}</p>}
    </>
  );
}

function Opciones({ lista, suplentePrimero }: { lista: OpcionRepartidor[]; suplentePrimero?: boolean }) {
  const ordenada = suplentePrimero ? [...lista].sort((a, b) => Number(b.esSuplente) - Number(a.esSuplente)) : lista;
  return (
    <>
      <option value="">Elegir…</option>
      {ordenada.map((r) => <option key={r.id} value={r.id}>{r.nombre}{r.esSuplente ? " (suplente)" : ""}</option>)}
    </>
  );
}

function Caja({ titulo, ayuda, children }: { titulo: string; ayuda: string; children: ReactNode }) {
  return (
    <details className="rounded-lg border border-linea bg-fondo/50 px-4 py-3 [&_summary]:cursor-pointer">
      <summary className="font-semibold">{titulo}</summary>
      <p className="mb-3 mt-1 text-sm text-tinta-2">{ayuda}</p>
      <div className="space-y-3">{children}</div>
    </details>
  );
}

function FormCobertura({ repartidores, hoy, limite }: Pick<Props, "repartidores" | "hoy" | "limite">) {
  const [estado, accion, pendiente] = useActionState(cubrirAusencia, ESTADO_INICIAL);
  return (
    <form action={accion} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium">¿Quién falta?
        <select name="ausenteId" required className={`${campo} mt-1`}><Opciones lista={repartidores} /></select>
      </label>
      <label className="text-sm font-medium">¿Quién lo cubre?
        <select name="cubreId" required className={`${campo} mt-1`}><Opciones lista={repartidores} suplentePrimero /></select>
      </label>
      <label className="text-sm font-medium">Hasta qué día (opcional, por defecto hoy)
        <input type="date" name="hasta" min={hoy} max={limite} className={`${campo} mt-1`} />
      </label>
      <label className="text-sm font-medium">Motivo (opcional)
        <input name="motivo" maxLength={200} placeholder="Ej: enfermo, moto dañada" className={`${campo} mt-1`} />
      </label>
      <div className="space-y-2 sm:col-span-2">
        <Mensajes estado={estado} />
        <button type="submit" disabled={pendiente} className={boton}>{pendiente ? "Pasando paquetes…" : "Cubrir ausencia"}</button>
      </div>
    </form>
  );
}

function FormEntrenar({ repartidores }: Pick<Props, "repartidores">) {
  const [estado, accion, pendiente] = useActionState(pasarPaquetes, ESTADO_INICIAL);
  return (
    <form action={accion} className="grid gap-3 sm:grid-cols-3">
      <label className="text-sm font-medium">Quitarle paquetes a
        <select name="desdeId" required className={`${campo} mt-1`}><Opciones lista={repartidores} /></select>
      </label>
      <label className="text-sm font-medium">Dárselos a
        <select name="haciaId" required className={`${campo} mt-1`}><Opciones lista={repartidores} suplentePrimero /></select>
      </label>
      <label className="text-sm font-medium">¿Cuántos?
        <input type="number" name="cantidad" min={1} max={50} defaultValue={5} required className={`${campo} mt-1`} />
      </label>
      <div className="space-y-2 sm:col-span-3">
        <Mensajes estado={estado} />
        <button type="submit" disabled={pendiente} className={boton}>{pendiente ? "Pasando…" : "Pasar paquetes"}</button>
      </div>
    </form>
  );
}

function FormReemplazo({ repartidores }: Pick<Props, "repartidores">) {
  const [estado, accion, pendiente] = useActionState(reemplazarRepartidor, ESTADO_INICIAL);
  return (
    <form action={accion} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium">Repartidor que sale
        <select name="salienteId" required className={`${campo} mt-1`}><Opciones lista={repartidores.filter((r) => !r.esSuplente)} /></select>
      </label>
      <label className="text-sm font-medium">Repartidor que entra en su lugar
        <select name="entranteId" required className={`${campo} mt-1`}><Opciones lista={repartidores} suplentePrimero /></select>
      </label>
      <label className="flex items-start gap-3 rounded-lg border border-rojo/40 bg-rojo/5 p-3 text-sm sm:col-span-2">
        <input type="checkbox" name="confirmo" className="mt-1 size-4" required />
        <span>Entiendo que el que sale <b>queda dado de baja y pierde el acceso</b>, y que el que entra hereda todas sus rutas y paquetes pendientes. No se puede deshacer desde aquí.</span>
      </label>
      <div className="space-y-2 sm:col-span-2">
        <Mensajes estado={estado} />
        <button type="submit" disabled={pendiente} className="rounded-lg bg-rojo px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
          {pendiente ? "Reemplazando…" : "Reemplazar definitivamente"}
        </button>
      </div>
    </form>
  );
}

function CoberturasAbiertas({ coberturas }: { coberturas: CoberturaVigente[] }) {
  const [trabajando, iniciar] = useTransition();
  const [resultado, setResultado] = useState<EstadoCobertura>({});
  if (coberturas.length === 0) return <p className="text-sm text-tinta-2">Nadie está siendo cubierto ahora. Todo el equipo trabaja normal.</p>;
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {coberturas.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ambar bg-ambar/10 px-3 py-2.5 text-sm">
            <span>
              <b>{c.cubre}</b> cubre a <b>{c.ausente}</b> hasta el {c.hasta}
              {c.motivo ? <span className="text-tinta-2"> · {c.motivo}</span> : null}
            </span>
            <button
              type="button"
              disabled={trabajando}
              onClick={() => iniciar(async () => setResultado(await terminarCobertura(c.id)))}
              className="rounded-md border border-linea bg-tarjeta px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            >
              Ya volvió
            </button>
          </li>
        ))}
      </ul>
      <Mensajes estado={resultado} />
    </div>
  );
}

export function PanelCobertura({ repartidores, coberturas, esDueno, hoy, limite }: Props) {
  const suplentes = repartidores.filter((r) => r.esSuplente);
  return (
    <section className="space-y-4 rounded-xl border border-linea bg-tarjeta p-5">
      <div>
        <h2 className="text-lg font-semibold">Repartidor suplente y cobertura</h2>
        <p className="text-sm text-tinta-2">
          {suplentes.length > 0
            ? `Suplente${suplentes.length > 1 ? "s" : ""}: ${suplentes.map((s) => s.nombre).join(", ")}. Cubre cuando alguien falla o se está entrenando.`
            : "Todavía no hay un suplente. El dueño lo registra en Usuarios → Crear usuario → Repartidor nuevo, marcando la casilla de suplente."}
        </p>
      </div>

      <CoberturasAbiertas coberturas={coberturas} />

      <Caja titulo="Alguien falta hoy" ayuda="Sus paquetes pendientes pasan a quien lo cubre, y los que lleguen después también, hasta que lo marques como vuelto.">
        <FormCobertura repartidores={repartidores} hoy={hoy} limite={limite} />
      </Caja>
      <Caja titulo="Entrenar al suplente" ayuda="Le pasas unos pocos paquetes para que practique, sin dejar a nadie como ausente.">
        <FormEntrenar repartidores={repartidores} />
      </Caja>
      {esDueno && (
        <Caja titulo="Reemplazar a alguien definitivamente" ayuda="Cuando un repartidor sale del equipo: el suplente hereda sus rutas y paquetes, y el que sale pierde el acceso.">
          <FormReemplazo repartidores={repartidores} />
        </Caja>
      )}
    </section>
  );
}
