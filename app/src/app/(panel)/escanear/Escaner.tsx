"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { escanearGuia, type RespuestaEscaneo } from "./actions";

interface Props {
  total: number;
  escaneados: number;
  porRepartidor: { nombre: string; total: number; escaneados: number }[];
  faltan: { guia: string; nombre: string; repartidor: string }[];
}

const ESTILOS: Record<RespuestaEscaneo["resultado"], { caja: string; titulo: string }> = {
  ok: { caja: "bg-green-600 text-white", titulo: "Recibido" },
  sin_repartidor: { caja: "bg-amber-500 text-black", titulo: "Sin repartidor: asígnalo a mano" },
  duplicado: { caja: "bg-red-600 text-white", titulo: "Ya estaba escaneado" },
  desconocido: { caja: "bg-amber-500 text-black", titulo: "No está en el listado" },
  error: { caja: "bg-red-600 text-white", titulo: "Error" },
};

function pitido(frecuencia: number, ms = 150) {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    osc.frequency.value = frecuencia;
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + ms / 1000);
    osc.onended = () => void ctx.close();
  } catch {
    // sin sonido no pasa nada: el color de la pantalla ya lo dice
  }
}

export function Escaner({ total, escaneados, porRepartidor, faltan }: Props) {
  const router = useRouter();
  const campo = useRef<HTMLInputElement>(null);
  const [ultimo, setUltimo] = useState<RespuestaEscaneo | null>(null);
  const [historial, setHistorial] = useState<RespuestaEscaneo[]>([]);
  const [pendiente, empezar] = useTransition();

  // El lector escribe donde esté el cursor: siempre se vuelve al campo
  useEffect(() => {
    campo.current?.focus();
  }, [ultimo]);

  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const codigo = campo.current?.value ?? "";
    if (campo.current) campo.current.value = "";
    if (!codigo.trim()) return;
    empezar(async () => {
      const respuesta = await escanearGuia(codigo);
      pitido(respuesta.resultado === "ok" ? 880 : 300, respuesta.resultado === "ok" ? 120 : 350);
      setUltimo(respuesta);
      setHistorial((h) => [respuesta, ...h].slice(0, 10));
      router.refresh();
    });
  };

  const estilo = ultimo ? ESTILOS[ultimo.resultado] : null;

  return (
    <div className="space-y-5">
      <form onSubmit={enviar}>
        <input
          ref={campo}
          autoFocus
          autoComplete="off"
          onBlur={() => setTimeout(() => campo.current?.focus(), 100)}
          placeholder="Escanea el código del paquete…"
          className="w-full rounded-xl border-2 border-tinta bg-tarjeta px-4 py-4 text-xl"
          aria-label="Código del paquete"
        />
      </form>

      {estilo && ultimo ? (
        <div className={`rounded-2xl p-6 ${estilo.caja}`} role="status" aria-live="polite">
          <p className="text-sm font-semibold uppercase tracking-wide opacity-80">{estilo.titulo}</p>
          {ultimo.resultado === "desconocido" || ultimo.resultado === "error" ? (
            <p className="mt-1 text-2xl font-semibold">{ultimo.error ?? ultimo.guia}</p>
          ) : (
            <>
              <p className="mt-1 text-2xl font-semibold">{ultimo.nombre}</p>
              <p className="text-lg">{ultimo.sector}</p>
              <p className="mt-2 font-display text-5xl font-bold leading-none">→ {ultimo.repartidor ?? "SIN REPARTIDOR"}</p>
              {ultimo.horaPrevia && <p className="mt-2 text-sm">Se escaneó antes, a las {ultimo.horaPrevia}.</p>}
            </>
          )}
          <p className="mt-3 text-xs opacity-80">{ultimo.guia}</p>
        </div>
      ) : (
        <p className="rounded-2xl bg-tarjeta px-4 py-10 text-center text-tinta-2">{pendiente ? "Buscando…" : "Esperando el primer paquete."}</p>
      )}

      <div className="rounded-xl bg-tarjeta p-4">
        <p className="text-lg font-semibold">
          Escaneados {escaneados} de {total} · faltan {total - escaneados}
        </p>
        <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {porRepartidor.map((r) => (
            <li key={r.nombre} className="flex justify-between border-b border-linea py-1">
              <span>{r.nombre}</span>
              <span className="font-semibold">
                {r.escaneados}/{r.total}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {historial.length > 0 && (
        <div>
          <p className="mb-1 text-sm font-semibold text-tinta-2">Últimos escaneos</p>
          <ul className="space-y-1 text-sm">
            {historial.map((h, i) => (
              <li key={`${h.guia}-${i}`} className="flex justify-between rounded-md border border-linea bg-tarjeta px-3 py-2">
                <span className="truncate">{h.nombre ?? h.guia}</span>
                <span className="shrink-0 font-semibold">{h.resultado === "ok" ? `→ ${h.repartidor}` : ESTILOS[h.resultado].titulo}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {faltan.length > 0 && (
        <details className="rounded-xl bg-tarjeta p-4">
          <summary className="cursor-pointer font-semibold">Faltan por llegar ({faltan.length})</summary>
          <ul className="mt-2 space-y-1 text-sm">
            {faltan.map((f) => (
              <li key={f.guia} className="flex justify-between gap-3 border-b border-linea py-1">
                <span className="truncate">
                  {f.nombre} <span className="text-tinta-2">· {f.guia}</span>
                </span>
                <span className="shrink-0">{f.repartidor}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
