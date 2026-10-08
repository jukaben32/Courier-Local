import { pesos, porcentaje } from "@/lib/formato";
import type { Cuenta, FilaRepartidor, PeriodoPago } from "@/lib/ganancias";
import { etiquetaFecha } from "@/lib/periodoPago";

export interface FilaBono {
  repartidor_id: string;
  entregas_totales: number;
  entregas_en_ventana: number;
  entregas_primer_intento: number;
  evidencia_completa_pct: number;
  penalizaciones: number;
  puntaje: number;
  califica_bono: boolean;
  monto_bono_estimado: number;
}

export interface ParametrosBono {
  volumen_minimo_mensual: number;
  umbral_bono_mensual: number;
}

interface Props {
  fila: FilaRepartidor;
  bono: FilaBono | undefined;
  parametros: ParametrosBono | null;
  periodoActual: PeriodoPago;
  periodoAnterior: PeriodoPago;
  /** Solo el dueño ve el dinero; el resto de la oficina ve las cantidades. */
  verDinero: boolean;
  /** A quién está cubriendo hoy (si es suplente o cubre una ausencia). */
  cubriendoA?: string[];
  /** Quién lo está cubriendo hoy (si él es el que falta). */
  cubiertoPor?: string;
}

function Cifra({ titulo, cuenta, nota, verDinero }: { titulo: string; cuenta: Cuenta; nota?: string; verDinero: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-tinta-2">{titulo}</p>
      <p className="font-display text-3xl font-semibold tabular-nums">{cuenta.entregas}</p>
      <p className="text-xs text-tinta-2">{cuenta.entregas === 1 ? "entrega" : "entregas"}</p>
      {verDinero && <p className="mt-1 text-sm font-semibold tabular-nums">{pesos(cuenta.ganado)}</p>}
      {nota && <p className="text-xs text-tinta-2">{nota}</p>}
    </div>
  );
}

/** Lo que falta para el bono, dicho en simple. */
function textoBono(bono: FilaBono, parametros: ParametrosBono | null, verDinero: boolean): { texto: string; bueno: boolean } {
  if (bono.califica_bono) {
    const monto = verDinero && Number(bono.monto_bono_estimado) > 0 ? ` (${pesos(Number(bono.monto_bono_estimado))})` : "";
    return { texto: `Califica al bono${monto}`, bueno: true };
  }
  if (!parametros) return { texto: "Todavía no califica al bono", bueno: false };
  const faltanEntregas = Math.max(0, parametros.volumen_minimo_mensual - bono.entregas_totales);
  if (faltanEntregas > 0) return { texto: `Para el bono le faltan ${faltanEntregas} entregas`, bueno: false };
  return { texto: `Para el bono necesita ${Number(parametros.umbral_bono_mensual)} puntos`, bueno: false };
}

export function TarjetaRepartidor({ fila, bono, parametros, periodoActual, periodoAnterior, verDinero, cubriendoA = [], cubiertoPor }: Props) {
  const puntaje = bono ? Math.round(Number(bono.puntaje)) : null;
  const estadoBono = bono ? textoBono(bono, parametros, verDinero) : null;

  return (
    <article className="space-y-4 rounded-xl border border-linea bg-tarjeta p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xl font-semibold">{fila.nombre}</h3>
        <div className="flex flex-wrap gap-1.5">
          {fila.rol === "administrador" && <span className="rounded-full bg-tinta/10 px-2.5 py-1 text-xs font-semibold">Administrador (minivan)</span>}
          {fila.esSuplente && <span className="rounded-full bg-acento/20 px-2.5 py-1 text-xs font-semibold text-acento-oscuro">Suplente</span>}
          {!fila.activo && <span className="rounded-full bg-rojo/15 px-2.5 py-1 text-xs font-semibold text-rojo">Dado de baja</span>}
        </div>
      </header>
      {cubriendoA.length > 0 && <p className="-mt-2 rounded-lg bg-acento/10 px-3 py-2 text-sm font-medium">Hoy cubre a {cubriendoA.join(" y ")}.</p>}
      {cubiertoPor && <p className="-mt-2 rounded-lg bg-ambar/15 px-3 py-2 text-sm font-medium">Hoy no trabaja: lo cubre {cubiertoPor}.</p>}

      <div className="grid grid-cols-3 gap-3">
        <Cifra titulo="Hoy" cuenta={fila.hoy} verDinero={verDinero} />
        <Cifra titulo="Este período" cuenta={fila.periodoActual} nota={`Pago el ${etiquetaFecha(periodoActual.pago)}`} verDinero={verDinero} />
        <Cifra titulo="Período anterior" cuenta={fila.periodoAnterior} nota={`Pago el ${etiquetaFecha(periodoAnterior.pago)}`} verDinero={verDinero} />
      </div>

      <div className="border-t border-linea pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold">Índice de efectividad del mes</p>
          <p className="font-display text-2xl font-semibold tabular-nums">{puntaje === null ? "—" : `${puntaje} / 100`}</p>
        </div>
        {bono && puntaje !== null ? (
          <>
            <div className="relative mt-2 h-2 overflow-hidden rounded bg-fondo" role="img" aria-label={`Índice ${puntaje} de 100`}>
              <div className={`h-full rounded ${bono.califica_bono ? "bg-verde" : "bg-acento"}`} style={{ width: `${Math.min(100, Math.max(0, puntaje))}%` }} />
              {parametros && <div className="absolute inset-y-0 w-0.5 bg-tinta" style={{ left: `${Number(parametros.umbral_bono_mensual)}%` }} title="Puntos que pide el bono" />}
            </div>
            <p className={`mt-2 text-sm font-medium ${estadoBono?.bueno ? "text-verde" : "text-tinta-2"}`}>{estadoBono?.texto}</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-tinta-2">
              <dt>Al primer intento</dt>
              <dd className="text-right font-semibold text-tinta">{bono.entregas_primer_intento} de {bono.entregas_totales}</dd>
              <dt>En su horario</dt>
              <dd className="text-right font-semibold text-tinta">{bono.entregas_en_ventana} de {bono.entregas_totales}</dd>
              <dt>Prueba completa</dt>
              <dd className="text-right font-semibold text-tinta">{porcentaje(Math.round(Number(bono.evidencia_completa_pct)))}</dd>
              {bono.penalizaciones > 0 && (
                <>
                  <dt>Devoluciones por su culpa</dt>
                  <dd className="text-right font-semibold text-rojo">{bono.penalizaciones}</dd>
                </>
              )}
            </dl>
          </>
        ) : (
          <p className="mt-1 text-sm text-tinta-2">Todavía no tiene entregas este mes.</p>
        )}
      </div>

      <footer className="flex flex-wrap gap-2 text-xs font-semibold">
        <span className="rounded-full bg-fondo px-2.5 py-1">{fila.porEntregar} por entregar</span>
        {fila.vencidos > 0 && <span className="rounded-full bg-tinta px-2.5 py-1 text-white">{fila.vencidos} vencidos</span>}
        {fila.sinSubir > 0 && <span className="rounded-full bg-rojo/15 px-2.5 py-1 text-rojo">{fila.sinSubir} {fila.sinSubir === 1 ? "prueba sin subir" : "pruebas sin subir"} al courier</span>}
      </footer>
    </article>
  );
}
