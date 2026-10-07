"use client";

import { useState, useTransition } from "react";
import { enviarAvisos, type EstadoAvisos } from "./actions";

export function BotonAvisos({ pendientes, simulado }: { pendientes: number; simulado: boolean }) {
  const [enviando, iniciar] = useTransition();
  const [resultado, setResultado] = useState<EstadoAvisos>({});

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={enviando || pendientes === 0}
        onClick={() => iniciar(async () => setResultado(await enviarAvisos()))}
        className="rounded-lg border border-tinta bg-tarjeta px-4 py-2.5 text-sm font-semibold hover:bg-tinta hover:text-white disabled:opacity-50"
      >
        {enviando ? "Enviando…" : `Enviar avisos por WhatsApp (${pendientes})`}
      </button>
      {simulado && <span className="text-xs text-tinta-2">Modo prueba: no sale ningún mensaje real.</span>}
      {resultado.mensaje && <span role="status" className="text-sm text-verde">{resultado.mensaje}</span>}
      {resultado.error && <span role="alert" className="max-w-xs text-right text-sm text-rojo">{resultado.error}</span>}
    </div>
  );
}
