"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { elegirRepartidor } from "@/lib/asignacion";
import type { SectorOpcion } from "../recibir/FormularioRecibir";
import { importarListado, revisarListado, type EstadoImportacion, type EstadoRevision, type FilaRevisada } from "./actions";

interface Ajuste {
  incluir: boolean;
  sectorId: string;
  voluminoso: boolean;
}

const ESTADO_INICIAL: EstadoRevision = {};

function ajustesIniciales(filas: FilaRevisada[]): Record<string, Ajuste> {
  return Object.fromEntries(filas.map((f) => [`${f.fila}`, { incluir: f.motivo === null, sectorId: f.sectorId, voluminoso: false }]));
}

export function ImportarListado({ sectores }: { sectores: SectorOpcion[] }) {
  const [revision, revisar, revisando] = useActionState(revisarListado, ESTADO_INICIAL);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [ajustes, setAjustes] = useState<Record<string, Ajuste>>({});
  const [resultado, setResultado] = useState<EstadoImportacion | null>(null);
  const [importando, iniciar] = useTransition();

  // Cada revisión nueva arranca con lo que se reconoció solo
  const [ultimaRevision, setUltimaRevision] = useState(revision);
  if (revision !== ultimaRevision) {
    setUltimaRevision(revision);
    setAjustes(ajustesIniciales((revision.filas ?? []).filter((f) => !f.repetida)));
    setResultado(null);
  }

  const todas = revision.filas ?? [];
  const repetidas = todas.filter((f) => f.repetida);
  const filas = todas.filter((f) => !f.repetida);
  const cambiar = (fila: number, cambio: Partial<Ajuste>) =>
    setAjustes((actual) => ({ ...actual, [`${fila}`]: { ...actual[`${fila}`], ...cambio } }));

  const aImportar = filas.filter((f) => f.motivo === null && ajustes[`${f.fila}`]?.incluir);
  const sinSector = aImportar.filter((f) => !ajustes[`${f.fila}`]?.sectorId).length;
  const conError = filas.filter((f) => f.motivo !== null).length;

  // El mismo reparto que hará el servidor al importar (en el orden del listado), para verlo antes
  const reparto = (() => {
    const asignacion = revision.asignacion;
    const porFila: Record<string, string | null> = {};
    const conteo = new Map<string, number>();
    if (!asignacion) return { porFila, resumen: [] as { nombre: string; cantidad: number }[], sinRuta: 0, sectoresSinRuta: [] as string[] };

    const carga = { ...asignacion.carga };
    let sinRuta = 0;
    const sectoresSinRuta = new Set<string>();
    for (const f of aImportar) {
      const ajuste = ajustes[`${f.fila}`];
      const sector = ajuste.sectorId;
      const duenos = sector ? (asignacion.duenos[sector] ?? []) : [];
      const id = elegirRepartidor({
        voluminoso: ajuste.voluminoso,
        administradorId: asignacion.administradorId,
        duenosDelSector: duenos,
        cargaActual: carga,
      });
      porFila[`${f.fila}`] = id;
      if (id) {
        carga[id] = (carga[id] ?? 0) + 1;
        conteo.set(id, (conteo.get(id) ?? 0) + 1);
      } else {
        sinRuta++;
        if (sector && !ajuste.voluminoso) sectoresSinRuta.add(sectores.find((s) => s.id === sector)?.nombre ?? sector);
      }
    }
    const resumen = [...conteo].map(([id, cantidad]) => ({ nombre: asignacion.nombres[id] ?? "—", cantidad })).sort((a, b) => b.cantidad - a.cantidad);
    return { porFila, resumen, sinRuta, sectoresSinRuta: [...sectoresSinRuta] };
  })();

  function confirmar() {
    if (!archivo) return;
    const datos = new FormData();
    datos.set("archivo", archivo);
    datos.set("ajustes", JSON.stringify(ajustes));
    iniciar(async () => setResultado(await importarListado(datos)));
  }

  const zonas = [...new Set(sectores.map((s) => s.zona))];

  if (resultado && !resultado.error) {
    return (
      <div className="space-y-4 rounded-xl border border-linea bg-tarjeta p-5">
        <p className="text-xl font-semibold text-verde">{resultado.importadas} paquetes importados</p>
        {!!resultado.yaRegistradas && <p className="text-sm text-tinta-2">{resultado.yaRegistradas} ya estaban registrados y se dejaron como estaban.</p>}
        {!!resultado.sinRepartidor && (
          <p className="text-sm text-rojo">{resultado.sinRepartidor} quedaron sin repartidor (sin sector o sector sin ruta): asígnalos en Paquetes.</p>
        )}
        {!!resultado.omitidas?.length && (
          <div>
            <p className="text-sm font-medium">No se importaron ({resultado.omitidas.length}):</p>
            <ul className="mt-1 space-y-1 text-sm text-tinta-2">
              {resultado.omitidas.map((o) => (
                <li key={o.fila}>
                  Fila {o.fila} · <span className="font-mono text-xs">{o.guia || "—"}</span> · {o.motivo}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <Link href="/paquetes" className="rounded-lg bg-tinta px-4 py-2.5 font-semibold text-white hover:bg-tinta/90">
            Ir a Paquetes y enviar avisos
          </Link>
          <button type="button" onClick={() => setResultado(null)} className="rounded-lg border border-linea px-4 py-2.5 font-semibold">
            Ver la vista previa otra vez
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form action={revisar} className="flex flex-wrap items-end gap-3 rounded-xl border border-linea bg-tarjeta p-5">
        <div className="min-w-0 flex-1">
          <label htmlFor="archivo" className="mb-1 block text-sm font-medium">Archivo del listado (.xlsx)</label>
          <input
            id="archivo"
            name="archivo"
            type="file"
            required
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            className="w-full rounded-lg border border-linea bg-tarjeta px-3 py-2 text-sm"
          />
        </div>
        <button type="submit" disabled={revisando} className="rounded-lg bg-tinta px-4 py-2.5 font-semibold text-white hover:bg-tinta/90 disabled:opacity-60">
          {revisando ? "Leyendo…" : "Revisar listado"}
        </button>
      </form>

      {revision.error && <p role="alert" className="text-sm font-medium text-rojo">{revision.error}</p>}
      {resultado?.error && <p role="alert" className="text-sm font-medium text-rojo">{resultado.error}</p>}

      {todas.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              <span className="font-semibold">{aImportar.length}</span> nuevos listos para importar
              {sinSector > 0 && <span className="text-tinta-2"> · {sinSector} sin sector</span>}
              {conError > 0 && <span className="text-rojo"> · {conError} con problemas</span>}
              {repetidas.length > 0 && <span className="text-tinta-2"> · {repetidas.length} ya registrados</span>}
            </p>
            <button
              type="button"
              onClick={confirmar}
              disabled={importando || aImportar.length === 0 || !archivo}
              className="rounded-lg bg-acento px-4 py-2.5 font-semibold text-[#1a0900] hover:bg-acento/90 disabled:opacity-50"
            >
              {importando ? "Importando…" : `Importar ${aImportar.length} paquetes`}
            </button>
          </div>

          {aImportar.length > 0 && (
            <section className="space-y-2 rounded-xl border border-linea bg-tarjeta p-4" aria-label="Reparto previsto">
              <h2 className="text-sm font-semibold">Así se repartirían</h2>
              <ul className="flex flex-wrap gap-2 text-sm">
                {reparto.resumen.map((r) => (
                  <li key={r.nombre} className="rounded-full bg-verde/10 px-3 py-1 text-verde">
                    <b className="tabular-nums">{r.cantidad}</b> {r.nombre}
                  </li>
                ))}
                {reparto.sinRuta > 0 && (
                  <li className="rounded-full bg-rojo/10 px-3 py-1 font-medium text-rojo">
                    <b className="tabular-nums">{reparto.sinRuta}</b> sin repartidor
                  </li>
                )}
              </ul>
              {reparto.sectoresSinRuta.length > 0 && (
                <p className="text-sm text-rojo">
                  Estos sectores no tienen repartidor asignado: {reparto.sectoresSinRuta.join(", ")}. Asígnalos en Repartidores o
                  elige otro sector abajo.
                </p>
              )}
            </section>
          )}

          {filas.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-linea bg-tarjeta">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-linea text-xs uppercase text-tinta-2">
                  <tr>
                    <th className="px-3 py-2">Incluir</th>
                    <th className="px-3 py-2">Fila</th>
                    <th className="px-3 py-2">Guía</th>
                    <th className="px-3 py-2">Cliente</th>
                    <th className="px-3 py-2">Dirección</th>
                    <th className="px-3 py-2">Sector</th>
                    <th className="px-3 py-2">Repartidor</th>
                    <th className="px-3 py-2">Grande</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-linea">
                  {filas.map((f) => {
                    const ajuste = ajustes[`${f.fila}`];
                    if (!ajuste) return null;
                    const bloqueada = f.motivo !== null;
                    const repartidorId = reparto.porFila[`${f.fila}`];
                    return (
                      <tr key={f.fila} className={bloqueada ? "bg-rojo/5" : ajuste.incluir ? "" : "opacity-50"}>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            aria-label={`Incluir fila ${f.fila}`}
                            checked={ajuste.incluir}
                            disabled={bloqueada}
                            onChange={(e) => cambiar(f.fila, { incluir: e.target.checked })}
                            className="size-4 accent-[#f26a1b]"
                          />
                        </td>
                        <td className="px-3 py-2 text-tinta-2">{f.fila}</td>
                        <td className="px-3 py-2 font-mono text-xs">{f.guia || "—"}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{f.nombre || "—"}</div>
                          <div className="text-xs text-tinta-2">{f.telefono}</div>
                          {f.motivo && <div className="text-xs font-medium text-rojo">{f.motivo}</div>}
                        </td>
                        <td className="max-w-64 px-3 py-2 text-xs">{f.direccion || "—"}</td>
                        <td className="px-3 py-2">
                          <select
                            aria-label={`Sector de la fila ${f.fila}`}
                            value={ajuste.sectorId}
                            disabled={bloqueada}
                            onChange={(e) => cambiar(f.fila, { sectorId: e.target.value })}
                            className={`w-48 rounded-md border bg-tarjeta px-2 py-1.5 text-xs ${ajuste.sectorId ? "border-linea" : "border-rojo/60"}`}
                          >
                            <option value="">Sin sector</option>
                            {zonas.map((zona) => (
                              <optgroup key={zona} label={zona}>
                                {sectores.filter((s) => s.zona === zona).map((s) => (
                                  <option key={s.id} value={s.id}>{s.nombre}</option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                          {f.sectorListado && <div className="mt-0.5 text-xs text-tinta-2">Listado: {f.sectorListado}</div>}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {bloqueada || !ajuste.incluir ? (
                            "—"
                          ) : repartidorId ? (
                            <span className="font-medium">{revision.asignacion?.nombres[repartidorId] ?? "—"}</span>
                          ) : (
                            <span className="font-medium text-rojo">Sin repartidor</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            aria-label={`Paquete grande, fila ${f.fila}`}
                            checked={ajuste.voluminoso}
                            disabled={bloqueada}
                            onChange={(e) => cambiar(f.fila, { voluminoso: e.target.checked })}
                            className="size-4 accent-[#f26a1b]"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {repetidas.length > 0 && (
            <details className="rounded-xl border border-linea bg-tarjeta px-4 py-3 text-sm">
              <summary className="cursor-pointer font-medium text-tinta-2">
                {repetidas.length} ya registrados: se omiten (el listado de la oficina es acumulado)
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-tinta-2">
                {repetidas.map((f) => (
                  <li key={f.fila}>
                    <span className="font-mono">{f.guia}</span> · {f.nombre}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
