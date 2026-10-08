"use client";

import { useState, useTransition } from "react";
import { aplicarEquilibrio, calcularEquilibrio, ubicarSector, type EstadoEquilibrio, type PropuestaVista, type SectorSinUbicacion } from "./equilibrio-actions";

const MARGENES = [
  { valor: 0, texto: "Lo más parejo posible" },
  { valor: 2, texto: "Parejo (diferencia de 2 o 3 paquetes)" },
  { valor: 5, texto: "Flexible (diferencia de hasta 10 paquetes)" },
];
const MARGEN_POR_DEFECTO = 2;

const boton = "rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60";

function Barra({ valor, maximo, clases }: { valor: number; maximo: number; clases: string }) {
  return (
    <span className="block h-2 overflow-hidden rounded bg-fondo">
      <span className={`block h-full rounded ${clases}`} style={{ width: `${maximo === 0 ? 0 : (valor / maximo) * 100}%` }} />
    </span>
  );
}

/** Miramar y otros sectores grandes sin ubicación: la oficina la pega desde Google Maps. */
function UbicarSectores({ sectores, alGuardar }: { sectores: SectorSinUbicacion[]; alGuardar: (estado: EstadoEquilibrio) => void }) {
  const [trabajando, iniciar] = useTransition();
  const [textos, setTextos] = useState<Record<string, string>>({});
  if (sectores.length === 0) return null;

  return (
    <div className="space-y-2 rounded-lg border border-ambar bg-ambar/10 p-3">
      <p className="text-sm font-semibold">Estos sectores tienen paquetes pero el sistema no sabe dónde quedan</p>
      <p className="text-xs text-tinta-2">
        Sin eso no se pueden mover sus paquetes. En Google Maps toca y mantén el centro del sector, copia los números que aparecen arriba (por ejemplo 18.4503, -69.3012) y pégalos aquí.
      </p>
      <ul className="space-y-2">
        {sectores.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="min-w-[10rem] font-medium">{s.nombre} <span className="font-normal text-tinta-2">({s.paquetes})</span></span>
            <input
              value={textos[s.id] ?? ""}
              onChange={(e) => setTextos({ ...textos, [s.id]: e.target.value })}
              placeholder="18.4503, -69.3012"
              aria-label={`Ubicación de ${s.nombre}`}
              className="min-w-0 flex-1 rounded-lg border border-linea bg-tarjeta px-3 py-2"
            />
            <button
              type="button"
              disabled={trabajando || !(textos[s.id] ?? "").trim()}
              onClick={() => iniciar(async () => alGuardar(await ubicarSector(s.id, textos[s.id] ?? "")))}
              className="rounded-lg bg-tinta px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              Guardar
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Resultado({ propuesta, alUbicar }: { propuesta: PropuestaVista; alUbicar: (estado: EstadoEquilibrio) => void }) {
  const maximo = Math.max(1, ...propuesta.filas.flatMap((f) => [f.antes, f.despues]));
  const cambios = propuesta.movimientos.length;
  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {propuesta.filas.map((f) => (
          <li key={f.id} className="text-sm">
            <div className="flex flex-wrap justify-between gap-x-3">
              <span className="font-medium">{f.nombre}</span>
              <span className="tabular-nums text-tinta-2">
                {f.antes} → <b className="text-tinta">{f.despues}</b> de la ciudad
                {propuesta.esfuerzo && f.municipios > 0 ? ` (+ ${f.municipios} de municipios)` : ""}
              </span>
            </div>
            <div className="mt-1 space-y-1">
              <Barra valor={f.antes} maximo={maximo} clases="bg-tinta/30" />
              <Barra valor={f.despues} maximo={maximo} clases="bg-verde" />
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-tinta-2">
        Gris: como está ahora · Verde: como quedaría.
        {propuesta.objetivo !== null ? ` Ideal: ${Math.round(propuesta.objetivo * 10) / 10} paquetes de la ciudad por persona.` : " Se tuvo en cuenta el esfuerzo de los paquetes de municipios."}
      </p>

      {cambios === 0 ? (
        <p className="rounded-lg bg-verde/10 px-3 py-2.5 text-sm font-medium text-verde">El reparto ya está parejo; no hace falta cambiar nada. ✅</p>
      ) : (
        <div>
          <p className="mb-2 text-sm font-semibold">
            Cambiarían {cambios} {cambios === 1 ? "paquete" : "paquetes"}{" "}
            {propuesta.kmExtra > 0 ? `(unos ${propuesta.kmExtra} km de más en total)` : "(sin recorrer km de más)"}:
          </p>
          <ul className="divide-y divide-linea rounded-lg border border-linea bg-tarjeta text-sm">
            {propuesta.grupos.map((g) => (
              <li key={`${g.sector}${g.de}${g.a}`} className="flex flex-wrap justify-between gap-x-3 px-3 py-2">
                <span>
                  <b>{g.cantidad}</b> de {g.sector}: {g.de} → <b>{g.a}</b>
                </span>
                <span className="text-tinta-2">{g.extraKmPromedio > 0 ? `+${g.extraKmPromedio} km c/u` : "sin km extra"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {propuesta.fueraDeMargen.length > 0 && (
        <p className="rounded-lg bg-ambar/15 px-3 py-2.5 text-sm">
          <b>{propuesta.fueraDeMargen.join(", ")}</b> {propuesta.fueraDeMargen.length === 1 ? "queda" : "quedan"} con más o menos paquetes que el resto: igualarlos habría obligado a recorrer demasiados kilómetros de más. Se prefirió no alargar la ruta.
        </p>
      )}
      <UbicarSectores sectores={propuesta.sectoresSinUbicacion} alGuardar={alUbicar} />
      {propuesta.sinUbicacion > 0 && propuesta.sectoresSinUbicacion.length === 0 && (
        <p className="text-xs text-tinta-2">{propuesta.sinUbicacion} paquetes no se pueden mover todavía por falta de ubicación.</p>
      )}
    </div>
  );
}

export function EquilibrioReparto() {
  const [margen, setMargen] = useState(MARGEN_POR_DEFECTO);
  const [esfuerzo, setEsfuerzo] = useState(false);
  const [estado, setEstado] = useState<EstadoEquilibrio>({});
  const [trabajando, iniciar] = useTransition();

  const propuesta = estado.propuesta;
  const hayCambios = (propuesta?.movimientos.length ?? 0) > 0;

  // Al ubicar un sector se muestra el resultado y se conserva la propuesta que ya estaba en pantalla
  const alUbicar = (nuevo: EstadoEquilibrio) => setEstado((anterior) => ({ ...anterior, error: nuevo.error, mensaje: nuevo.mensaje }));

  return (
    <section className="space-y-4 rounded-xl border border-linea bg-tarjeta p-5">
      <div>
        <h2 className="text-lg font-semibold">Reparto equitativo (San Pedro ciudad)</h2>
        <p className="text-sm text-tinta-2">
          Que cada repartidor lleve más o menos la misma cantidad de paquetes de la ciudad, pasando de uno a otro los que quedan más cerca de lo que el otro ya lleva, para no alargar las rutas. Los paquetes de los municipios no se mueven. Primero se calcula y tú decides si lo aplicas.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 max-w-full text-sm font-medium">
          ¿Qué tan parejo?
          <select value={margen} onChange={(e) => setMargen(Number(e.target.value))} className="mt-1 block w-full max-w-full rounded-lg border border-linea bg-tarjeta px-3 py-2.5">
            {MARGENES.map((m) => <option key={m.valor} value={m.valor}>{m.texto}</option>)}
          </select>
        </label>
        <button
          type="button"
          disabled={trabajando}
          onClick={() => iniciar(async () => setEstado(await calcularEquilibrio(margen, esfuerzo)))}
          className={`${boton} bg-tinta text-white`}
        >
          {trabajando ? "Calculando…" : "Calcular reparto parejo"}
        </button>
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" checked={esfuerzo} onChange={(e) => setEsfuerzo(e.target.checked)} className="mt-1 size-4" />
        <span>
          <b>Tener en cuenta el esfuerzo.</b> Quien ya lleva paquetes de municipios (rutas más largas y duras) recibe menos de la ciudad.
        </span>
      </label>

      {estado.error && <p role="alert" className="text-sm font-medium text-rojo">{estado.error}</p>}
      {estado.mensaje && <p role="status" className="text-sm font-medium text-verde">{estado.mensaje}</p>}

      {propuesta && <Resultado propuesta={propuesta} alUbicar={alUbicar} />}

      {hayCambios && propuesta && (
        <button
          type="button"
          disabled={trabajando}
          onClick={() => iniciar(async () => setEstado(await aplicarEquilibrio(propuesta.movimientos)))}
          className={`${boton} bg-acento text-[#1a0900] hover:bg-acento-oscuro hover:text-white`}
        >
          {trabajando ? "Aplicando…" : "Aplicar este reparto"}
        </button>
      )}
    </section>
  );
}
