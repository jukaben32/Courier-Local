"use client";

import { useState, useTransition } from "react";
import { marcarPruebaSubida } from "./actions";

interface Props {
  entregaId: string;
  urlFoto: string | null;
  guia: string;
  cedula: string;
}

/** Acciones rápidas de la oficina para subir una prueba al courier: foto, guía y marcarla como subida. */
export function AccionesPrueba({ entregaId, urlFoto, guia, cedula }: Props) {
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, iniciar] = useTransition();

  async function copiar(texto: string, etiqueta: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setAviso(`${etiqueta} copiada`);
    } catch {
      setAviso("No se pudo copiar");
    }
  }

  // Baja la foto ya nombrada con la guía, lista para adjuntarla en el programa del courier
  async function descargar() {
    if (!urlFoto) return;
    try {
      const blob = await (await fetch(urlFoto)).blob();
      const enlace = document.createElement("a");
      enlace.href = URL.createObjectURL(blob);
      enlace.download = `${guia || "prueba"}.jpg`;
      enlace.click();
      URL.revokeObjectURL(enlace.href);
      setAviso("Foto descargada");
    } catch {
      setAviso("No se pudo descargar la foto");
    }
  }

  const boton = "rounded-md border border-linea px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50";

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={descargar} disabled={!urlFoto} className={boton}>Descargar foto</button>
        <button type="button" onClick={() => copiar(guia, "Guía")} className={boton}>Copiar guía</button>
        {cedula && (
          <button type="button" onClick={() => copiar(cedula.replace(/\D/g, ""), "Cédula")} className={boton}>Copiar cédula</button>
        )}
        <button
          type="button"
          disabled={guardando}
          onClick={() =>
            iniciar(async () => {
              const r = await marcarPruebaSubida(entregaId);
              if (r.error) setAviso(r.error);
            })
          }
          className="rounded-md bg-verde px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Ya la subí"}
        </button>
      </div>
      {aviso && <p role="status" className="text-xs text-tinta-2">{aviso}</p>}
    </div>
  );
}
