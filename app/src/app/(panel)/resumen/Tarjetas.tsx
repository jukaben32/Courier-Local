import type { ReactNode } from "react";

/** Un número grande con su título (y una nota opcional que lo explica). */
export function Dato({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-xl border border-linea bg-tarjeta px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-tinta-2">{titulo}</p>
      <p className="font-display text-3xl font-semibold tabular-nums">{valor}</p>
      {nota && <p className="text-xs text-tinta-2">{nota}</p>}
    </div>
  );
}

/** Recuadro con título para agrupar una parte del resumen. */
export function Seccion({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-linea bg-tarjeta p-5">
      <h2 className="text-lg font-semibold">{titulo}</h2>
      {ayuda && <p className="mb-3 text-sm text-tinta-2">{ayuda}</p>}
      {!ayuda && <div className="mb-3" />}
      {children}
    </section>
  );
}
