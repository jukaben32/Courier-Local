"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const CADA_MS = 10_000;

/** Vuelve a pedir los datos cada 10 segundos (solo mientras la pestaña está a la vista). */
export function Refrescar() {
  const router = useRouter();
  const [hora, setHora] = useState<string | null>(null);

  useEffect(() => {
    const marcar = () => setHora(new Date().toLocaleTimeString("es-DO", { timeZone: "America/Santo_Domingo" }));
    marcar();
    const intervalo = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      marcar();
    }, CADA_MS);
    return () => clearInterval(intervalo);
  }, [router]);

  return (
    <span className="flex items-center gap-2 text-xs text-tinta-2" role="status">
      <span className="size-2 animate-pulse rounded-full bg-verde" aria-hidden />
      En vivo · se actualiza cada 10 s{hora && ` · ${hora}`}
    </span>
  );
}
