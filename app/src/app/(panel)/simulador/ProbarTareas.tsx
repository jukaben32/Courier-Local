"use client";

import { useState, useTransition } from "react";
import { probarTareas, type AdelantoReloj } from "./tareas";

const OPCIONES: { clave: AdelantoReloj; texto: string }[] = [
  { clave: "ahora", texto: "Ahora" },
  { clave: "dos_horas", texto: "Dentro de 2 horas" },
  { clave: "manana_8am", texto: "Mañana 8:00 am" },
  { clave: "tres_dias", texto: "Pasados 3 días" },
];

export function ProbarTareas() {
  const [enviando, iniciar] = useTransition();
  const [resultado, setResultado] = useState("");

  return (
    <section className="rounded-xl border border-linea bg-tarjeta p-4">
      <h2 className="text-lg font-semibold">Tareas automáticas (recordatorios y paquetes vencidos)</h2>
      <p className="mb-3 text-sm text-tinta-2">
        En producción corren solas cada 15 minutos. Aquí puedes probarlas como si hubiera pasado el tiempo: elige cuándo &quot;es ahora&quot; y se ejecutan con esa hora.
      </p>
      <div className="flex flex-wrap gap-2">
        {OPCIONES.map((o) => (
          <button
            key={o.clave}
            type="button"
            disabled={enviando}
            onClick={() => iniciar(async () => setResultado(await probarTareas(o.clave)))}
            className="rounded-lg border border-linea bg-fondo px-3 py-2 text-sm font-medium hover:border-acento hover:bg-acento/10 disabled:opacity-50"
          >
            {o.texto}
          </button>
        ))}
      </div>
      {resultado && <p role="status" className="mt-3 text-sm text-tinta-2">{resultado}</p>}
    </section>
  );
}
