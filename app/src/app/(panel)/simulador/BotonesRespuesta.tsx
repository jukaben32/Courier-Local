"use client";

import { useState, useTransition } from "react";
import type { RespuestaSimulada } from "./actions";
import { simularRespuesta } from "./actions";

interface Props {
  telefono: string;
  franjas: { codigo: string; titulo: string }[];
}

// Punto de ejemplo en el centro de San Pedro de Macorís
const UBICACION_PRUEBA = { lat: 18.4539, lng: -69.3086 };

export function BotonesRespuesta({ telefono, franjas }: Props) {
  const [enviando, iniciar] = useTransition();
  const [resultado, setResultado] = useState("");

  const enviar = (respuesta: RespuestaSimulada) =>
    iniciar(async () => setResultado(await simularRespuesta(telefono, respuesta)));

  const clases =
    "rounded-lg border border-linea bg-fondo px-3 py-2 text-sm font-medium hover:border-acento hover:bg-acento/10 disabled:opacity-50";

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        <span className="w-full text-xs font-semibold uppercase tracking-wide text-tinta-2">Otras respuestas</span>
        <button type="button" disabled={enviando} onClick={() => enviar({ tipo: "accion", accion: "coordinar" })} className={clases}>Coordinar entrega</button>
        <button type="button" disabled={enviando} onClick={() => enviar({ tipo: "accion", accion: "retiro" })} className={clases}>Paso a buscarlo</button>
        <button type="button" disabled={enviando} onClick={() => enviar({ tipo: "accion", accion: "otra_persona" })} className={clases}>Otra persona lo recibe</button>
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="w-full text-xs font-semibold uppercase tracking-wide text-tinta-2">Horario (botones del aviso) y ubicación</span>
        {franjas.map((f) => (
          <button key={f.codigo} type="button" disabled={enviando} onClick={() => enviar({ tipo: "franja", codigo: f.codigo })} className={clases}>{f.titulo}</button>
        ))}
        <button type="button" disabled={enviando} onClick={() => enviar({ tipo: "ubicacion", ...UBICACION_PRUEBA })} className={clases}>📍 Enviar ubicación</button>
        <button type="button" disabled={enviando} onClick={() => enviar({ tipo: "texto", texto: "hola" })} className={clases}>Escribir &quot;hola&quot;</button>
      </div>
      {resultado && <p role="status" className="text-sm text-tinta-2">{resultado}</p>}
    </div>
  );
}
