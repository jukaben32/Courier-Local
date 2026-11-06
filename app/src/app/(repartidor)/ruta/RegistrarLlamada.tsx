"use client";

import { useActionState } from "react";
import { RESULTADOS_LLAMADA, TEXTO_RESULTADO_LLAMADA } from "@/lib/demora";
import { registrarLlamada, type EstadoLlamada } from "./llamadas";

const inicial: EstadoLlamada = {};

/** Formulario plegable para anotar qué pasó al llamar a un cliente. */
export function RegistrarLlamada({ paqueteId, telefono }: { paqueteId: string; telefono: string }) {
  const [estado, accion, enviando] = useActionState(registrarLlamada, inicial);

  return (
    <details className="mt-2 rounded-lg border border-linea bg-tarjeta">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">{estado.ok ? "Llamada anotada ✓ (anotar otra)" : "Anotar llamada"}</summary>
      <form action={accion} className="space-y-2 px-3 pb-3">
        <input type="hidden" name="paquete_id" value={paqueteId} />
        <input type="hidden" name="telefono" value={telefono} />
        <select name="resultado" required defaultValue="" aria-label="Qué pasó" className="w-full rounded-lg border border-linea bg-fondo px-3 py-2.5 text-sm">
          <option value="" disabled>¿Qué pasó?</option>
          {RESULTADOS_LLAMADA.map((r) => (
            <option key={r} value={r}>{TEXTO_RESULTADO_LLAMADA[r]}</option>
          ))}
        </select>
        <input name="nota" maxLength={300} placeholder="Nota (opcional)" aria-label="Nota" className="w-full rounded-lg border border-linea bg-fondo px-3 py-2.5 text-sm" />
        {estado.error && <p className="text-sm font-medium text-rojo">{estado.error}</p>}
        <button disabled={enviando} className="w-full rounded-lg bg-tinta py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {enviando ? "Guardando…" : "Guardar llamada"}
        </button>
      </form>
    </details>
  );
}
