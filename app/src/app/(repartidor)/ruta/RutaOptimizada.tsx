"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { enlaceRutaGoogleMaps } from "@/lib/enlaceRuta";
import { CONFIG_RUTA, ordenarRuta, type Punto } from "@/lib/ruta";

export interface ParadaRuta {
  id: string;
  nombre: string;
  direccion: string | null;
  sector: string | null;
  guia: string;
  franja: number;
  etiquetaFranja: string;
  lat: number | null;
  lng: number | null;
  /** La ubicación sale del centro de su sector, no del punto que compartió el cliente. */
  ubicacionAproximada: boolean;
  enlaceMapa: string;
  /** El cliente confirmó hace poco: acaba de entrar a la ruta. */
  nuevo: boolean;
}

const REVISAR_POSICION_CADA_MS = 60_000;

/** Minutos hasta llegar a la casa (el acumulado incluye el rato de entrega de esa parada). */
const minutosHastaLlegar = (acumuladoMin: number) => Math.max(0, acumuladoMin - CONFIG_RUTA.minutosPorParada);

const formatoHora = (d: Date) => d.toLocaleTimeString("es-DO", { hour: "numeric", minute: "2-digit", hour12: true });

/** Avisa por WhatsApp al cliente que el repartidor va hacia su casa (el servidor evita repetirlo). */
function BotonVoy({ id, minutos, bloqueada, grande = false }: { id: string; minutos: number; bloqueada: boolean; grande?: boolean }) {
  const [estado, setEstado] = useState<"libre" | "enviando" | "enviado" | "error">("libre");
  const enviar = async () => {
    setEstado("enviando");
    try {
      const r = await fetch("/api/voy-en-camino", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paqueteId: id, minutos: Math.round(minutos) }),
      });
      setEstado(r.ok ? "enviado" : "error");
    } catch {
      setEstado("error");
    }
  };
  const base = grande ? "col-span-2 rounded-lg border border-white/30 py-3 text-center" : "shrink-0 rounded-md border border-linea px-3 py-2 text-sm font-semibold";
  if (estado === "enviado") return <span className={`${base} ${grande ? "text-white/70" : "text-tinta-2"}`}>Cliente avisado ✓</span>;
  return (
    <button type="button" onClick={enviar} disabled={bloqueada || estado === "enviando"} className={`${base} disabled:opacity-40`}>
      {estado === "enviando" ? "Avisando…" : estado === "error" ? "No se pudo, reintentar" : "Voy para allá 🛵"}
    </button>
  );
}

function formatoDuracion(minutos: number): string {
  const total = Math.round(minutos);
  if (total < 60) return `${total} min`;
  return `${Math.floor(total / 60)} h ${total % 60} min`;
}

/**
 * La ruta del repartidor: una sola parada grande ("la siguiente") y el resto en orden.
 * Se recalcula desde donde está el repartidor, así que si se desvía o termina una parada,
 * el orden se ajusta solo.
 */
export function RutaOptimizada({ paradas, bloqueada = false }: { paradas: ParadaRuta[]; bloqueada?: boolean }) {
  const [origen, setOrigen] = useState<Punto | null>(null);
  // La hora se calcula en el navegador (no en el servidor) para que sea la del teléfono
  const [ahora, setAhora] = useState<number | null>(null);

  useEffect(() => {
    const primera = setTimeout(() => setAhora(Date.now()), 0);
    const t = setInterval(() => setAhora(Date.now()), 60_000);
    return () => {
      clearTimeout(primera);
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    const leer = () =>
      navigator.geolocation.getCurrentPosition(
        (p) => setOrigen({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => undefined,
        { maximumAge: REVISAR_POSICION_CADA_MS, timeout: 8000 }
      );
    leer();
    const intervalo = setInterval(leer, REVISAR_POSICION_CADA_MS);
    return () => clearInterval(intervalo);
  }, []);

  const orden = useMemo(
    () => ordenarRuta(paradas.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, franja: p.franja })), origen),
    [paradas, origen]
  );
  const porId = useMemo(() => new Map(paradas.map((p) => [p.id, p])), [paradas]);

  if (orden.length === 0) {
    return (
      <p className="rounded-xl bg-tarjeta px-4 py-8 text-center text-tinta-2">
        Todavía no hay paradas confirmadas. El sistema ya les escribió a tus clientes: aparecerán aquí en cuanto respondan.
      </p>
    );
  }

  const siguiente = orden[0];
  const parada = porId.get(siguiente.id)!;
  const resto = orden.slice(1);
  const total = orden[orden.length - 1];
  const llegada = (acumuladoMin: number) => (ahora === null ? null : formatoHora(new Date(ahora + minutosHastaLlegar(acumuladoMin) * 60_000)));

  // Ruta completa en Google Maps: solo con paradas de ubicación exacta (las aproximadas llevarían al centro del sector)
  const puntosExactos = orden.flatMap((o) => {
    const p = porId.get(o.id)!;
    return o.aproximada || p.ubicacionAproximada || p.lat === null || p.lng === null ? [] : [{ lat: p.lat, lng: p.lng }];
  });
  const rutaCompleta = enlaceRutaGoogleMaps(puntosExactos);

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-tinta p-4 text-white">
        <p className="text-xs font-semibold uppercase tracking-wide text-acento">
          Siguiente parada · {parada.etiquetaFranja}
          {parada.nuevo && <span className="ml-2 rounded-full bg-acento px-2 py-0.5 text-[10px] font-bold text-[#1a0900]">NUEVO</span>}
        </p>
        <p className="mt-1 font-display text-2xl font-semibold leading-tight">{parada.nombre}</p>
        <p className="text-sm text-white/70">
          {parada.direccion ?? "Sin dirección"}
          {parada.sector ? ` · ${parada.sector}` : ""}
        </p>
        <p className="mt-2 text-sm">
          {siguiente.aproximada ? "Sin ubicación exacta" : origen ? `A ${siguiente.distanciaKm.toFixed(1)} km de ti` : "Activa tu ubicación para ver la distancia"}
          {parada.ubicacionAproximada && !siguiente.aproximada ? " · ubicación aproximada (centro del sector)" : ""}
          {!siguiente.aproximada && llegada(siguiente.acumuladoMin) ? ` · llegas ≈ ${llegada(siguiente.acumuladoMin)}` : ""}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm font-semibold">
          <a href={parada.enlaceMapa} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-white/30 py-3 text-center">
            Ir
          </a>
          {bloqueada ? (
            <span aria-disabled="true" className="rounded-lg bg-white/15 py-3 text-center text-white/50">Entregar</span>
          ) : (
            <Link href={`/entrega/${parada.id}`} className="rounded-lg bg-acento py-3 text-center text-[#1a0900]">
              Entregar
            </Link>
          )}
          <BotonVoy id={parada.id} minutos={minutosHastaLlegar(siguiente.acumuladoMin)} bloqueada={bloqueada} grande />
        </div>
      </div>

      {rutaCompleta && rutaCompleta.cantidad > 1 && (
        <a
          href={rutaCompleta.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-xl border-2 border-tinta py-3 text-center text-sm font-semibold"
        >
          Abrir las próximas {rutaCompleta.cantidad} paradas en Google Maps
        </a>
      )}

      <p className="text-center text-sm text-tinta-2">
        {orden.length} {orden.length === 1 ? "parada" : "paradas"} · unos {total.acumuladoKm.toFixed(1)} km · terminas en ≈ {formatoDuracion(total.acumuladoMin)}
      </p>

      {resto.length > 0 && (
        <ol className="space-y-2">
          {resto.map((o, i) => {
            const p = porId.get(o.id)!;
            return (
              <li key={o.id} className="flex items-center gap-3 rounded-lg border border-linea bg-tarjeta px-3 py-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-tinta/10 text-sm font-semibold">{i + 2}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {p.nombre}
                    {p.nuevo && <span className="ml-2 rounded-full bg-acento px-2 py-0.5 text-[10px] font-bold text-[#1a0900]">NUEVO</span>}
                  </span>
                  <span className="block truncate text-xs text-tinta-2">
                    {p.etiquetaFranja} · {p.sector ?? "Sin sector"}
                    {o.aproximada ? " · sin ubicación" : llegada(o.acumuladoMin) ? ` · ≈ ${llegada(o.acumuladoMin)}` : ""}
                  </span>
                </span>
                <BotonVoy id={p.id} minutos={minutosHastaLlegar(o.acumuladoMin)} bloqueada={bloqueada} />
                {bloqueada ? (
                  <span aria-disabled="true" className="shrink-0 rounded-md border border-linea px-3 py-2 text-sm font-semibold opacity-40">Entregar</span>
                ) : (
                  <Link href={`/entrega/${p.id}`} className="shrink-0 rounded-md border border-linea px-3 py-2 text-sm font-semibold">
                    Entregar
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
