"use client";

import { useActionState, useRef, useState } from "react";
import { registrarPaquete, type EstadoRecibir } from "./actions";

export interface SectorOpcion {
  id: string;
  nombre: string;
  zona: string;
}

interface Valores {
  guia: string;
  nombre: string;
  telefono: string;
  direccion: string;
  sectorId: string;
  contenido: string;
  voluminoso: boolean;
}

interface RespuestaEtiqueta {
  datos?: {
    guia: string | null;
    nombre: string | null;
    telefono: string | null;
    direccion: string | null;
    sector: string | null;
    contenido: string | null;
  };
  error?: string;
}

const VACIO: Valores = { guia: "", nombre: "", telefono: "", direccion: "", sectorId: "", contenido: "", voluminoso: false };
const LADO_MAXIMO = 1600;
const ESTADO_INICIAL: EstadoRecibir = {};

// Reduce la foto del celular (varios MB) a un JPEG liviano antes de enviarla a la IA
async function fotoABase64(archivo: File): Promise<string> {
  const bitmap = await createImageBitmap(archivo);
  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(bitmap.width * escala);
  lienzo.height = Math.round(bitmap.height * escala);
  lienzo.getContext("2d")!.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
  return lienzo.toDataURL("image/jpeg", 0.85).split(",")[1];
}

export function FormularioRecibir({ sectores }: { sectores: SectorOpcion[] }) {
  const [estado, accion, guardando] = useActionState(registrarPaquete, ESTADO_INICIAL);
  const [valores, setValores] = useState<Valores>(VACIO);
  const [leyendo, setLeyendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [recientes, setRecientes] = useState<NonNullable<EstadoRecibir["resumen"]>[]>([]);
  const inputFoto = useRef<HTMLInputElement>(null);

  // Cuando se guarda un paquete: se anota en la lista y el formulario queda listo para el siguiente
  const [ultimoEstado, setUltimoEstado] = useState(estado);
  if (estado !== ultimoEstado) {
    setUltimoEstado(estado);
    if (estado.ok && estado.resumen) {
      setRecientes((anteriores) => [estado.resumen!, ...anteriores].slice(0, 8));
      setValores(VACIO);
      setAviso(null);
    }
  }

  const cambiar = (campo: keyof Valores, valor: string | boolean) =>
    setValores((actual) => ({ ...actual, [campo]: valor }));

  async function alElegirFoto(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!archivo) return;

    setLeyendo(true);
    setAviso(null);
    try {
      const imagen = await fotoABase64(archivo);
      const respuesta = await fetch("/api/etiqueta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagen, tipo: "image/jpeg" }),
      });
      const cuerpo: RespuestaEtiqueta = await respuesta.json();
      if (!respuesta.ok || !cuerpo.datos) {
        setAviso(cuerpo.error ?? "No se pudo leer la etiqueta. Escribe los datos a mano.");
        return;
      }
      const d = cuerpo.datos;
      const sector = sectores.find((s) => s.nombre === d.sector);
      setValores({
        guia: d.guia ?? "",
        nombre: d.nombre ?? "",
        telefono: d.telefono ?? "",
        direccion: d.direccion ?? "",
        sectorId: sector?.id ?? "",
        contenido: d.contenido ?? "",
        voluminoso: false,
      });
      setAviso("Revisa los datos antes de guardar: la IA puede equivocarse con letra borrosa.");
    } catch {
      setAviso("No se pudo procesar la foto. Escribe los datos a mano.");
    } finally {
      setLeyendo(false);
    }
  }

  const zonas = [...new Set(sectores.map((s) => s.zona))];
  const clasesCampo = "w-full rounded-lg border border-linea bg-tarjeta px-3 py-2.5";

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <form action={accion} className="space-y-4 rounded-xl border border-linea bg-tarjeta p-5">
        <div>
          <input ref={inputFoto} type="file" accept="image/*" capture="environment" onChange={alElegirFoto} className="hidden" />
          <button
            type="button"
            onClick={() => inputFoto.current?.click()}
            disabled={leyendo}
            className="w-full rounded-lg border-2 border-dashed border-acento bg-acento/5 px-4 py-4 font-semibold text-acento-oscuro hover:bg-acento/10 disabled:opacity-60"
          >
            {leyendo ? "Leyendo etiqueta…" : "Tomar foto de la etiqueta"}
          </button>
          {aviso && <p role="status" className="mt-2 text-sm text-tinta-2">{aviso}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="guia" etiqueta="Número de guía">
            <input id="guia" name="guia" required value={valores.guia} onChange={(e) => cambiar("guia", e.target.value)} className={`${clasesCampo} font-mono`} />
          </Campo>
          <Campo id="telefono" etiqueta="Teléfono">
            <input id="telefono" name="telefono" required inputMode="tel" value={valores.telefono} onChange={(e) => cambiar("telefono", e.target.value)} className={clasesCampo} />
          </Campo>
        </div>

        <Campo id="nombre" etiqueta="Nombre (igual que la etiqueta y la cédula)">
          <input id="nombre" name="nombre" required value={valores.nombre} onChange={(e) => cambiar("nombre", e.target.value)} className={clasesCampo} />
        </Campo>

        <Campo id="direccion" etiqueta="Dirección">
          <input id="direccion" name="direccion" value={valores.direccion} onChange={(e) => cambiar("direccion", e.target.value)} className={clasesCampo} />
        </Campo>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="sectorId" etiqueta="Sector">
            <select id="sectorId" name="sectorId" value={valores.sectorId} onChange={(e) => cambiar("sectorId", e.target.value)} className={clasesCampo}>
              <option value="">Elegir sector…</option>
              {zonas.map((zona) => (
                <optgroup key={zona} label={zona}>
                  {sectores.filter((s) => s.zona === zona).map((s) => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Campo>
          <Campo id="contenido" etiqueta="Contenido (opcional)">
            <input id="contenido" name="contenido" value={valores.contenido} onChange={(e) => cambiar("contenido", e.target.value)} className={clasesCampo} />
          </Campo>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="voluminoso" checked={valores.voluminoso} onChange={(e) => cambiar("voluminoso", e.target.checked)} className="size-4 accent-[#f26a1b]" />
          Paquete grande: no cabe en moto (va en la minivan)
        </label>

        {estado.error && <p role="alert" className="text-sm font-medium text-rojo">{estado.error}</p>}

        <button type="submit" disabled={guardando} className="w-full rounded-lg bg-tinta px-4 py-3 font-semibold text-white hover:bg-tinta/90 disabled:opacity-60">
          {guardando ? "Guardando…" : "Guardar paquete"}
        </button>
      </form>

      <aside className="space-y-3">
        <h2 className="text-lg font-semibold">Guardados ahora</h2>
        {recientes.length === 0 && <p className="text-sm text-tinta-2">Los paquetes que guardes aparecerán aquí.</p>}
        <ul className="space-y-2">
          {recientes.map((r) => (
            <li key={r.guia} className="rounded-lg border border-linea bg-tarjeta px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs">{r.guia}</span>
                <span className={r.repartidor === "Sin asignar" ? "font-semibold text-rojo" : "font-semibold text-verde"}>
                  {r.repartidor}
                </span>
              </div>
              <div className="font-medium">{r.nombre}</div>
              <div className="text-xs text-tinta-2">{r.sector}</div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

function Campo({ id, etiqueta, children }: { id: string; etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{etiqueta}</label>
      {children}
    </div>
  );
}
