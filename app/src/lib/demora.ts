// Demora en oficina y penalidades: lógica pura (sin base de datos) para poder probarla.
// El courier cobra una penalidad cuando un paquete pasa demasiados días en la oficina (se vio una a los 7 días)
// y una mucho mayor si el paquete se pierde. Aquí se avisa ANTES de llegar a ese punto.

import { diaLocal } from "./plazo";

/** Día a partir del cual el courier cobra "demora en oficina". */
export const DIAS_PENALIDAD = 7;
/** Desde este día el paquete aparece como "en riesgo". */
export const DIAS_ATENCION = 5;

export type NivelDemora = "normal" | "atencion" | "penalidad";

/** Días de calendario (hora de RD) que lleva el paquete en la oficina. 0 = llegó hoy. */
export function diasEnOficina(fechaRecibido: Date, ahora: Date = new Date()): number {
  return Math.max(0, diaLocal(ahora) - diaLocal(fechaRecibido));
}

export function nivelDemora(dias: number): NivelDemora {
  if (dias >= DIAS_PENALIDAD) return "penalidad";
  if (dias >= DIAS_ATENCION) return "atencion";
  return "normal";
}

export const TIPOS_PENALIDAD = ["paquete_perdido", "demora_oficina", "otro"] as const;
export type TipoPenalidad = (typeof TIPOS_PENALIDAD)[number];

export const TEXTO_TIPO_PENALIDAD: Record<TipoPenalidad, string> = {
  paquete_perdido: "Paquete perdido",
  demora_oficina: "Demora en oficina",
  otro: "Otro",
};

export interface PenalidadResumen {
  tipo: string;
  estado: string;
  costo: number;
}

/** Totales que se muestran arriba de la pantalla: lo que se debe y lo que ya se pagó. */
export function totalesPenalidades(lista: PenalidadResumen[]): { deuda: number; pagado: number; pendientes: number } {
  let deuda = 0;
  let pagado = 0;
  let pendientes = 0;
  for (const p of lista) {
    const costo = Number(p.costo) || 0;
    if (p.estado === "pagada") pagado += costo;
    else {
      deuda += costo;
      pendientes += 1;
    }
  }
  return { deuda: Math.round(deuda * 100) / 100, pagado: Math.round(pagado * 100) / 100, pendientes };
}

export const RESULTADOS_LLAMADA = ["contesto", "no_contesto", "ocupado", "numero_equivocado", "apagado", "reprogramado"] as const;
export type ResultadoLlamada = (typeof RESULTADOS_LLAMADA)[number];

export const TEXTO_RESULTADO_LLAMADA: Record<ResultadoLlamada, string> = {
  contesto: "Contestó",
  no_contesto: "No contestó",
  ocupado: "Ocupado",
  numero_equivocado: "Número equivocado",
  apagado: "Apagado / fuera de servicio",
  reprogramado: "Quedó para otra hora",
};

export function esResultadoLlamada(valor: unknown): valor is ResultadoLlamada {
  return typeof valor === "string" && (RESULTADOS_LLAMADA as readonly string[]).includes(valor);
}

/** "RD$ 4,031.17" */
export function formatearPesos(monto: number): string {
  return `RD$ ${monto.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
