"use client";

import { useEffect, useState } from "react";

// Aviso para instalar la app en el celular (adaptado de "sistema restaurante").
// - Android / Chrome: el navegador avisa cuándo se puede instalar y se muestra un botón "Instalar".
// - iPhone / iPad (Safari): no existe botón; se explica el gesto "Compartir → Añadir a pantalla de inicio".
// - Si la app ya está instalada, o la persona cerró el aviso, no se muestra.
const CLAVE_OCULTO = "cl-instalar-oculto";

// Evento no estándar de Chrome/Android que permite lanzar el cuadro de instalación
type EventoInstalacion = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function estaOculto(): boolean {
  try {
    return localStorage.getItem(CLAVE_OCULTO) === "1";
  } catch {
    return false;
  }
}

function recordarOculto() {
  try {
    localStorage.setItem(CLAVE_OCULTO, "1");
  } catch {
    // Sin almacenamiento: el aviso puede volver a salir, no pasa nada
  }
}

function yaInstalada(): boolean {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

function esSafariIos(): boolean {
  const ua = window.navigator.userAgent;
  const esIos = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  const esSafari = /safari/i.test(ua) && !/crios|fxios|edgios|opios/i.test(ua);
  return esIos && esSafari;
}

export function SugerirInstalar() {
  const [evento, setEvento] = useState<EventoInstalacion | null>(null);
  const [mostrarIos, setMostrarIos] = useState(false);

  useEffect(() => {
    if (yaInstalada() || estaOculto()) return;

    // Chrome solo ofrece instalar si hay un service worker registrado (el mismo del modo sin señal)
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(() => undefined);

    function alOfrecerInstalar(e: Event) {
      e.preventDefault();
      setEvento(e as EventoInstalacion);
    }
    window.addEventListener("beforeinstallprompt", alOfrecerInstalar);

    // En iPhone se espera un momento para no tapar la pantalla apenas abre
    const temporizador = esSafariIos() ? setTimeout(() => setMostrarIos(true), 2500) : undefined;

    return () => {
      window.removeEventListener("beforeinstallprompt", alOfrecerInstalar);
      if (temporizador) clearTimeout(temporizador);
    };
  }, []);

  if (!evento && !mostrarIos) return null;

  function cerrar() {
    recordarOculto();
    setEvento(null);
    setMostrarIos(false);
  }

  async function instalar() {
    if (!evento) return;
    await evento.prompt();
    await evento.userChoice.catch(() => undefined);
    cerrar();
  }

  return (
    <div
      role="dialog"
      aria-label="Instalar la app"
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-lg items-center gap-3 rounded-2xl bg-tinta px-4 py-3 text-sm leading-snug text-white shadow-2xl"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon-192.png" alt="" width={40} height={40} className="h-10 w-10 flex-none rounded-xl" />
      <p className="min-w-0 flex-1">
        {evento
          ? "Instala Courier Local en tu teléfono para abrirla como una app."
          : "Para instalarla en tu iPhone: toca el botón Compartir y elige «Añadir a pantalla de inicio»."}
      </p>
      {evento && (
        <button
          type="button"
          onClick={instalar}
          className="flex-none rounded-lg bg-[#f26a1b] px-3 py-2 font-semibold text-white"
        >
          Instalar
        </button>
      )}
      <button
        type="button"
        onClick={cerrar}
        aria-label="Cerrar"
        className="flex-none px-1 text-lg leading-none text-white/70"
      >
        ✕
      </button>
    </div>
  );
}
