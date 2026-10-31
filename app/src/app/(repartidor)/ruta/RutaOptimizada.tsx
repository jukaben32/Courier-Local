"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { enlaceRutaGoogleMaps } from "@/lib/enlaceRuta";
import { ordenarRuta, type Punto } from "@/lib/ruta";

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
}

const REVISAR_POSICION_CADA_MS = 60_000;

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

  // Ruta completa en Google Maps: solo con paradas de ubicación exacta (las aproximadas llevarían al centro del sector)
  const puntosExactos = orden.flatMap((o) => {
    const p = porId.get(o.id)!;
    return o.aproximada || p.ubicacionAproximada || p.lat === null || p.lng === null ? [] : [{ lat: p.lat, lng: p.lng }];
  });
  const rutaCompleta = enlaceRutaGoogleMaps(puntosExactos);

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-tinta p-4 text-white">
        <p className="text-xs font-semibold uppercase tracking-wide text-acento">Siguiente parada · {parada.etiquetaFranja}</p>
        <p className="mt-1 font-display text-2xl font-semibold leading-tight">{parada.nombre}</p>
        <p className="text-sm text-white/70">
          {parada.direccion ?? "Sin dirección"}
          {parada.sector ? ` · ${parada.sector}` : ""}
        </p>
        <p className="mt-2 text-sm">
          {siguiente.aproximada ? "Sin ubicación exacta" : origen ? `A ${siguiente.distanciaKm.toFixed(1)} km de ti` : "Activa tu ubicación para ver la distancia"}
          {parada.ubicacionAproximada && !siguiente.aproximada ? " · ubicación aproximada (centro del sector)" : ""}
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
                  <span className="block truncate font-medium">{p.nombre}</span>
                  <span className="block truncate text-xs text-tinta-2">
                    {p.etiquetaFranja} · {p.sector ?? "Sin sector"}
                    {o.aproximada ? " · sin ubicación" : ""}
                  </span>
                </span>
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
