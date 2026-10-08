"use client";

import { useState, useTransition } from "react";
import { cambiarActivo, reiniciarClave, type EstadoUsuario } from "./actions";

export function AccionesUsuario({ usuarioId, activo, esMismoUsuario }: { usuarioId: string; activo: boolean; esMismoUsuario: boolean }) {
  const [trabajando, iniciar] = useTransition();
  const [resultado, setResultado] = useState<EstadoUsuario>({});

  const boton = "rounded-md border border-linea bg-tarjeta px-3 py-1.5 text-xs font-semibold hover:bg-fondo disabled:opacity-50";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button type="button" disabled={trabajando} className={boton} onClick={() => iniciar(async () => setResultado(await reiniciarClave(usuarioId)))}>
          Nueva contraseña
        </button>
        {!esMismoUsuario && (
          <button type="button" disabled={trabajando} className={boton} onClick={() => iniciar(async () => setResultado(await cambiarActivo(usuarioId, !activo)))}>
            {activo ? "Desactivar" : "Activar"}
          </button>
        )}
      </div>
      {resultado.error && <span role="alert" className="text-xs font-medium text-rojo">{resultado.error}</span>}
      {resultado.aviso && <span role="status" className="max-w-xs text-right text-xs font-medium text-[#8a6200]">{resultado.aviso}</span>}
      {resultado.clave && (
        <span role="status" className="text-xs">
          Contraseña nueva (solo se ve ahora): <code className="rounded bg-fondo px-1.5 py-0.5 font-mono text-sm">{resultado.clave}</code>
        </span>
      )}
    </div>
  );
}
