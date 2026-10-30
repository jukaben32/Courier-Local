"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
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
    setAjustes(ajustesIniciales(revision.filas ?? []));
    setResultado(null);
  }

  const filas = revision.filas ?? [];
  const cambiar = (fila: number, cambio: Partial<Ajuste>) =>
    setAjustes((actual) => ({ ...actual, [`${fila}`]: { ...actual[`${fila}`], ...cambio } }));

  const aImportar = filas.filter((f) => f.motivo === null && ajustes[`${f.fila}`]?.incluir);
  const sinSector = aImportar.filter((f) => !ajustes[`${f.fila}`]?.sectorId).length;
  const conError = filas.filter((f) => f.motivo !== null).length;

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

      {filas.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              <span className="font-semibold">{aImportar.length}</span> listos para importar
              {sinSector > 0 && <span className="text-tinta-2"> · {sinSector} sin sector (quedarán sin repartidor)</span>}
              {conError > 0 && <span className="text-rojo"> · {conError} con problemas</span>}
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
                  <th className="px-3 py-2">Grande</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-linea">
                {filas.map((f) => {
                  const ajuste = ajustes[`${f.fila}`];
                  if (!ajuste) return null;
                  const bloqueada = f.motivo !== null;
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
        </>
      )}
    </div>
  );
}
