"use client";

import { useState, useTransition } from "react";
import { resolverExcepcion } from "./actions";

export function ResolverExcepcion({ solicitudId }: { solicitudId: string }) {
  const [motivo, setMotivo] = useState("");
  const [trabajando, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const decidir = (decision: "aprobar" | "rechazar") =>
    iniciar(async () => {
      const r = await resolverExcepcion(solicitudId, decision, motivo);
      setError(r.error ?? null);
    });

  return (
    <div className="space-y-2 pt-1">
      <label htmlFor={`motivo-${solicitudId}`} className="block text-sm font-medium">Tu motivo (obligatorio)</label>
      <input
        id={`motivo-${solicitudId}`}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Ej: el cliente se llama igual, la etiqueta traía su apodo"
        className="w-full rounded-lg border border-linea bg-tarjeta px-3 py-2.5 text-sm"
      />
      {error && <p role="alert" className="text-sm font-medium text-rojo">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={trabajando} onClick={() => decidir("aprobar")} className="rounded-lg bg-verde px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          Autorizar entrega
        </button>
        <button type="button" disabled={trabajando} onClick={() => decidir("rechazar")} className="rounded-lg border border-rojo px-4 py-2.5 text-sm font-semibold text-rojo disabled:opacity-50">
          Rechazar
        </button>
      </div>
    </div>
  );
}
