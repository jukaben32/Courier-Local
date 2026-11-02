"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

interface Props {
  entregaId: string;
  urlFoto: string;
  guia: string;
  nombre: string;
  cedula: string;
  yaSubido: boolean;
  /** Marca la prueba como subida (acción del servidor). */
  marcarSubido: (entregaId: string) => Promise<unknown>;
  /**
   * Si se da, la pantalla no deja "subir después": solo se sale subiendo la prueba o diciendo por qué
   * no se pudo. (La oficina, en los retiros, no lo usa.)
   */
  marcarNoSubida?: (entregaId: string, motivo: string) => Promise<unknown>;
  motivosNoSubida?: readonly string[];
  /** Pantalla a la que se regresa sin subir la prueba. */
  rutaVolver: string;
  textoVolver: string;
}

export function PasoCourier({ entregaId, urlFoto, guia, nombre, cedula, yaSubido, marcarSubido, marcarNoSubida, motivosNoSubida = [], rutaVolver, textoVolver }: Props) {
  const [aviso, setAviso] = useState<string | null>(null);
  const [verMotivos, setVerMotivos] = useState(false);
  const [guardando, iniciar] = useTransition();

  async function copiar(texto: string, etiqueta: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setAviso(`${etiqueta} copiada`);
    } catch {
      setAviso("No se pudo copiar");
    }
  }

  // Abre el menú Compartir del celular con la foto ya nombrada con la guía, para mandarla a la app del courier
  async function compartir() {
    try {
      const blob = await (await fetch(urlFoto)).blob();
      const archivo = new File([blob], `${guia || "cedula"}.jpg`, { type: "image/jpeg" });
      if (navigator.canShare?.({ files: [archivo] })) {
        await navigator.share({ files: [archivo], title: guia });
        return;
      }
      const enlace = document.createElement("a");
      enlace.href = URL.createObjectURL(blob);
      enlace.download = archivo.name;
      enlace.click();
      setAviso("Foto guardada en tu galería");
    } catch {
      setAviso("No se pudo compartir la foto");
    }
  }

  const boton = "w-full rounded-lg border border-linea bg-tarjeta py-3 text-sm font-semibold";

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-verde/10 p-4">
        <p className="text-lg font-semibold text-verde">{yaSubido ? "Prueba ya subida al courier" : "Entrega registrada ✅"}</p>
        <p className="text-sm text-tinta-2">{yaSubido ? "No falta nada." : "Ahora sube la prueba al programa del courier."}</p>
      </div>

      <div className="rounded-xl bg-tarjeta p-4">
        <p className="font-semibold">{nombre}</p>
        <p className="font-mono text-sm text-tinta-2">{guia}</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={urlFoto} alt="Foto de la cédula" className="mt-3 max-h-56 w-full rounded-lg object-contain" />
      </div>

      {!yaSubido && (
        <>
          <button type="button" onClick={compartir} className="w-full rounded-xl bg-acento py-4 text-lg font-semibold text-[#1a0900]">
            Compartir foto al courier
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => copiar(guia, "Guía")} className={boton}>Copiar guía</button>
            {cedula ? (
              <button type="button" onClick={() => copiar(cedula.replace(/\D/g, ""), "Cédula")} className={boton}>Copiar cédula</button>
            ) : (
              <span className="grid place-items-center rounded-lg bg-ambar/15 px-2 text-center text-xs text-tinta-2">La oficina verificará la cédula</span>
            )}
          </div>
          {aviso && <p role="status" className="text-center text-sm text-tinta-2">{aviso}</p>}
          <button type="button" disabled={guardando} onClick={() => iniciar(async () => { await marcarSubido(entregaId); })} className="w-full rounded-xl bg-tinta py-4 font-semibold text-white disabled:opacity-60">
            {guardando ? "Guardando…" : "Ya la subí al courier"}
          </button>
        </>
      )}

      {yaSubido || !marcarNoSubida ? (
        <Link href={rutaVolver} className="block py-3 text-center text-sm font-medium text-tinta-2 underline">
          {yaSubido ? textoVolver : `Subir después y ${textoVolver.toLowerCase()}`}
        </Link>
      ) : (
        <div className="border-t border-linea pt-3">
          {!verMotivos ? (
            <button type="button" onClick={() => setVerMotivos(true)} className="w-full py-2 text-sm font-medium text-tinta-2 underline">
              No pude subirla ahora
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium">¿Por qué no pudiste?</p>
              {motivosNoSubida.map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={guardando}
                  onClick={() => iniciar(async () => { await marcarNoSubida(entregaId, m); })}
                  className={`${boton} disabled:opacity-50`}
                >
                  {m}
                </button>
              ))}
              <p className="text-xs text-tinta-2">Queda anotado y la oficina lo ve. La prueba sigue pendiente hasta que la subas.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
