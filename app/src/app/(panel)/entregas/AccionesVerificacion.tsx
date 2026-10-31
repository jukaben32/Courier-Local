"use client";

import { useState, useTransition } from "react";
import { aprobarVerificacion, reintentarVerificacion, type ResultadoVerificacion } from "./actions";

export function AccionesVerificacion({ entregaId }: { entregaId: string }) {
  const [trabajando, iniciar] = useTransition();
  const [resultado, setResultado] = useState<ResultadoVerificacion>({});
  const [cedula, setCedula] = useState("");

  const ejecutar = (accion: () => Promise<ResultadoVerificacion>) => iniciar(async () => setResultado(await accion()));

  return (
    <div className="space-y-1.5">
      <input
        aria-label="Número de cédula (opcional)"
        placeholder="Número de cédula (opcional)"
        inputMode="numeric"
        value={cedula}
        onChange={(e) => setCedula(e.target.value)}
        className="w-full max-w-xs rounded-md border border-linea bg-tarjeta px-3 py-1.5 text-xs"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={trabajando}
          onClick={() => ejecutar(() => reintentarVerificacion(entregaId))}
          className="rounded-md border border-linea px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          Leer con IA otra vez
        </button>
        <button
          type="button"
          disabled={trabajando}
          onClick={() => ejecutar(() => aprobarVerificacion(entregaId, cedula))}
          className="rounded-md bg-verde px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          La cédula es correcta
        </button>
      </div>
      {resultado.ok && <p role="status" className="text-xs font-medium text-verde">{resultado.ok}</p>}
      {resultado.error && <p role="alert" className="text-xs font-medium text-rojo">{resultado.error}</p>}
    </div>
  );
}
