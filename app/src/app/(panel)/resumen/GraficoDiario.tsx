import type { Metricas } from "@/lib/metricas";

const ALTO_GRAFICO_PX = 128;

/** Barras de los últimos días: gris = paquetes que llegaron, verde = paquetes entregados. */
export function GraficoDiario({ dias }: { dias: Metricas["porDia"] }) {
  const maximo = Math.max(1, ...dias.flatMap((d) => [d.recibidos, d.entregados]));
  const altura = (valor: number) => (valor === 0 ? 2 : Math.max(4, Math.round((valor / maximo) * ALTO_GRAFICO_PX)));

  return (
    <figure>
      <div className="mb-3 flex gap-4 text-xs text-tinta-2">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-tinta/30" />Llegaron</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-verde" />Entregados</span>
      </div>
      <div className="flex items-end gap-1 sm:gap-2" style={{ height: ALTO_GRAFICO_PX + 20 }}>
        {dias.map((d) => (
          <div
            key={d.dia}
            className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
            title={`${d.dia}: ${d.recibidos} llegaron, ${d.entregados} entregados`}
          >
            <div className="flex w-full items-end justify-center gap-px" style={{ height: ALTO_GRAFICO_PX }}>
              <div className="w-1/2 rounded-t bg-tinta/30" style={{ height: altura(d.recibidos) }} />
              <div className="w-1/2 rounded-t bg-verde" style={{ height: altura(d.entregados) }} />
            </div>
            <span className="text-[10px] tabular-nums text-tinta-2">{d.dia.slice(8)}</span>
          </div>
        ))}
      </div>
      <figcaption className="sr-only">
        {dias.map((d) => `${d.dia}: ${d.recibidos} llegaron y ${d.entregados} entregados`).join(". ")}
      </figcaption>
    </figure>
  );
}
