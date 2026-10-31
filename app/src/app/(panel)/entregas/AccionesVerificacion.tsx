"use client";

import { useState, useTransition } from "react";
import { aprobarVerificacion, reintentarVerificacion, type ResultadoVerificacion } from "./actions";

export function AccionesVerificacion({ entregaId }: { entregaId: string }) {
  const [trabajando, iniciar] = useTransition();
  const [resultado, setResultado] = useState<ResultadoVerificacion>({});

  const ejecutar = (accion: (id: string) => Promise<ResultadoVerificacion>) => iniciar(async () => setResultado(await accion(entregaId)));

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={trabajando}
          onClick={() => ejecutar(reintentarVerificacion)}
          className="rounded-md border border-linea px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          Leer con IA otra vez
        </button>
        <button
          type="button"
          disabled={trabajando}
          onClick={() => ejecutar(aprobarVerificacion)}
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
