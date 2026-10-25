// Envío espaciado ("goteo"): en vez de mandar todos los avisos de golpe, cada tanda manda solo
// unas pocas personas, con pausas al azar entre mensaje y mensaje. Aquí vive la decisión de
// cuántas enviar (función pura); la tanda real está en tanda.ts.

import { horaLocalRD } from "./mensajes";
import type { ConfigRitmo } from "./proveedor";

export interface EntradaTanda {
  ahora: Date;
  ritmo: ConfigRitmo;
  /** Personas distintas que ya recibieron un mensaje hoy. */
  enviadosHoy: number;
  /** Personas con paquetes "recibido" esperando su aviso. */
  enCola: number;
  /** Envíos fallidos consecutivos más recientes. */
  fallosSeguidos: number;
  sesion: { lista: boolean; motivo?: string };
  /** Número entre 0 y 1 (inyectable para las pruebas). */
  azar: () => number;
}

export type PlanTanda = { enviar: number; pausa?: undefined } | { enviar: 0; pausa: string };

function horaEntera(ahora: Date): number {
  return Number(horaLocalRD(ahora).split(":")[0]);
}

/** Cuántas personas se avisan en esta tanda, o por qué no se envía nada. */
export function planificarTanda(entrada: EntradaTanda): PlanTanda {
  const { ritmo } = entrada;

  const hora = horaEntera(entrada.ahora);
  if (hora < ritmo.horaDesde || hora >= ritmo.horaHasta) {
    return { enviar: 0, pausa: `Fuera del horario de envío (${ritmo.horaDesde}:00 a ${ritmo.horaHasta}:00).` };
  }
  if (!entrada.sesion.lista) return { enviar: 0, pausa: entrada.sesion.motivo ?? "El WhatsApp no está listo." };
  if (entrada.fallosSeguidos >= ritmo.fallosSeguidosParaFrenar) {
    return {
      enviar: 0,
      pausa: `${entrada.fallosSeguidos} envíos fallidos seguidos: revisa el WhatsApp antes de seguir.`,
    };
  }
  const restantes = ritmo.topeDiario - entrada.enviadosHoy;
  if (restantes <= 0) return { enviar: 0, pausa: `Se llegó al tope de hoy (${ritmo.topeDiario} personas).` };
  if (entrada.enCola === 0) return { enviar: 0, pausa: "No hay avisos en cola." };

  const rango = ritmo.porTandaMax - ritmo.porTandaMin + 1;
  const deseadas = ritmo.porTandaMin + Math.min(rango - 1, Math.floor(entrada.azar() * rango));
  return { enviar: Math.min(deseadas, restantes, entrada.enCola) };
}

/** Pausa al azar (en milisegundos) entre dos mensajes de una misma tanda. */
export function pausaEntreMensajes(ritmo: ConfigRitmo, azar: () => number = Math.random): number {
  const segundos = ritmo.pausaMinSegundos + azar() * (ritmo.pausaMaxSegundos - ritmo.pausaMinSegundos);
  return Math.round(segundos * 1000);
}

/** Hora aproximada ("HH:MM", RD) en que se avisaría a toda la cola, a ritmo de una tanda cada `cadaMinutos`. */
export function horaEstimadaFin(
  ahora: Date,
  enCola: number,
  ritmo: ConfigRitmo,
  cadaMinutos = 2
): string | null {
  if (enCola <= 0) return null;
  const porTanda = (ritmo.porTandaMin + ritmo.porTandaMax) / 2;
  const minutos = Math.ceil(enCola / porTanda) * cadaMinutos;
  return horaLocalRD(new Date(ahora.getTime() + minutos * 60_000));
}
