"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { almacenLocal } from "@/lib/almacenIndexedDB";
import { sincronizar, type EntregaEnCola } from "@/lib/colaOffline";
import { enviarEntrega } from "@/lib/enviarEntrega";

const CADA_MS = 20_000;

/** Envía solas las entregas guardadas sin señal y avisa de las que necesitan atención. */
export function SincronizadorEntregas() {
  const router = useRouter();
  const [cola, setCola] = useState<EntregaEnCola[]>([]);
  const ocupado = useRef(false);

  const ciclo = useCallback(async () => {
    if (ocupado.current) return;
    ocupado.current = true;
    try {
      const resumen = await sincronizar(almacenLocal, async (e) => (await enviarEntrega(e)).resultado);
      setCola(await almacenLocal.listar());
      if (resumen.enviadas > 0) router.refresh();
    } catch {
      // IndexedDB no disponible: la entrega seguirá funcionando solo con señal
    } finally {
      ocupado.current = false;
    }
  }, [router]);

  useEffect(() => {
    const inicio = setTimeout(() => void ciclo(), 0);
    const intervalo = setInterval(() => void ciclo(), CADA_MS);
    const alVolver = () => void ciclo();
    window.addEventListener("online", alVolver);
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearTimeout(inicio);
      clearInterval(intervalo);
      window.removeEventListener("online", alVolver);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [ciclo]);

  async function descartar(id: string) {
    await almacenLocal.borrar(id);
    setCola(await almacenLocal.listar());
  }

  const esperando = cola.filter((e) => !e.error);
  const conError = cola.filter((e) => e.error);
  if (cola.length === 0) return null;

  return (
    <div className="space-y-2 pb-4">
      {esperando.length > 0 && (
        <p role="status" className="rounded-lg bg-ambar/20 px-3 py-3 text-sm font-medium">
          📶 {esperando.length} {esperando.length === 1 ? "entrega guardada" : "entregas guardadas"} sin señal. Se enviarán solas cuando haya conexión.
        </p>
      )}
      {conError.map((e) => (
        <div key={e.id} role="alert" className="rounded-lg border border-rojo bg-rojo/10 px-3 py-3 text-sm">
          <p className="font-semibold text-rojo">
            No se pudo registrar: {e.nombre} <span className="font-mono text-xs">({e.guia})</span>
          </p>
          <p className="mt-1">{e.error}</p>
          <p className="mt-1 text-tinta-2">Avisa a la oficina o vuelve a tomar la foto de la cédula.</p>
          <button type="button" onClick={() => descartar(e.id)} className="mt-2 rounded-md border border-linea bg-tarjeta px-3 py-2 font-medium">
            Entendido, quitar aviso
          </button>
        </div>
      ))}
    </div>
  );
}
