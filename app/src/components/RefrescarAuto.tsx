"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Vuelve a pedir los datos de la pantalla cada tanto (solo si la app está a la vista), para que las paradas nuevas aparezcan solas. */
export function RefrescarAuto({ cadaSegundos = 30 }: { cadaSegundos?: number }) {
  const router = useRouter();

  useEffect(() => {
    const intervalo = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, cadaSegundos * 1000);
    const alVolver = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [router, cadaSegundos]);

  return (
    <p className="flex items-center justify-center gap-2 text-xs text-tinta-2" role="status">
      <span className="size-2 animate-pulse rounded-full bg-verde" aria-hidden />
      Se actualiza sola
    </p>
  );
}
