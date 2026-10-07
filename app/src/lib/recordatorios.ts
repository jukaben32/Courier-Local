import { diaLocal, nivelPlazo } from "./plazo";

export interface ConfigRecordatorios {
  /** Minutos que se espera, el mismo día del aviso, antes de recordar a quien no ha respondido. */
  minutosPrimero: number;
  /** Solo se escribe entre estas horas (hora de RD). */
  horaDesde: number;
  horaHasta: number;
  /** Pasada esta hora ya no se manda un recordatorio del mismo día del aviso. */
  horaLimiteMismoDia: number;
  /** Tope de mensajes por paquete (aviso + recordatorios) para no cansar al cliente ni bajar la calidad del número. */
  maximoMensajes: number;
}

export const CONFIG_POR_DEFECTO: ConfigRecordatorios = {
  minutosPrimero: 90,
  horaDesde: 8,
  horaHasta: 19,
  horaLimiteMismoDia: 16,
  maximoMensajes: 4,
};

const numeroDe = (valor: string | undefined, porDefecto: number) => {
  const n = Number(valor);
  return valor !== undefined && valor !== "" && Number.isFinite(n) ? n : porDefecto;
};

/** Permite ajustar los tiempos con variables de entorno, sin tocar el código. */
export function configDesdeEntorno(env: Record<string, string | undefined>): ConfigRecordatorios {
  return {
    minutosPrimero: numeroDe(env.RECORDATORIO_MINUTOS, CONFIG_POR_DEFECTO.minutosPrimero),
    horaDesde: numeroDe(env.RECORDATORIO_HORA_DESDE, CONFIG_POR_DEFECTO.horaDesde),
    horaHasta: numeroDe(env.RECORDATORIO_HORA_HASTA, CONFIG_POR_DEFECTO.horaHasta),
    horaLimiteMismoDia: numeroDe(env.RECORDATORIO_HORA_LIMITE_MISMO_DIA, CONFIG_POR_DEFECTO.horaLimiteMismoDia),
    maximoMensajes: numeroDe(env.RECORDATORIO_MAXIMO_MENSAJES, CONFIG_POR_DEFECTO.maximoMensajes),
  };
}

export interface CandidatoRecordatorio {
  destinatarioId: string;
  telefono: string;
  nombreEtiqueta: string;
  guias: string[];
  /** El paquete más viejo del grupo: manda para saber en qué día del plazo va. */
  fechaRecibido: string;
  ultimoMensajeEn: string | null;
  /** Mensajes (aviso + recordatorios) ya enviados por paquete; se toma el mayor del grupo. */
  mensajesEnviados: number;
  /** El último mensaje no se pudo entregar (por ejemplo, el número no tiene WhatsApp). */
  ultimoFallo: boolean;
  recordatoriosHoy: number;
}

export interface DecisionRecordatorio {
  candidato: CandidatoRecordatorio;
  plantilla: "recordatorio" | "ultimoDia";
}

function horaLocal(ahora: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "America/Santo_Domingo", hour: "2-digit", hour12: false }).format(ahora)
  );
}

/**
 * Decide a quién se le manda recordatorio. Solo entran personas con paquetes que siguen sin
 * confirmar (ni por WhatsApp ni porque el repartidor llamó): quien ya fue confirmado no llega aquí.
 */
export function decidirRecordatorios(
  candidatos: CandidatoRecordatorio[],
  ahora: Date,
  config: ConfigRecordatorios
): DecisionRecordatorio[] {
  const hora = horaLocal(ahora);
  if (hora < config.horaDesde || hora >= config.horaHasta) return [];

  const decisiones: DecisionRecordatorio[] = [];
  for (const c of candidatos) {
    if (!c.ultimoMensajeEn || c.ultimoFallo) continue;
    if (c.mensajesEnviados >= config.maximoMensajes) continue;
    if (c.recordatoriosHoy > 0) continue;

    const nivel = nivelPlazo(new Date(c.fechaRecibido), ahora);
    if (nivel === "vencido") continue;

    const ultimo = new Date(c.ultimoMensajeEn);
    const mismoDia = diaLocal(ultimo) === diaLocal(ahora);
    if (mismoDia) {
      const minutos = (ahora.getTime() - ultimo.getTime()) / 60000;
      if (minutos < config.minutosPrimero || hora >= config.horaLimiteMismoDia) continue;
    }

    decisiones.push({ candidato: c, plantilla: nivel === "rojo" ? "ultimoDia" : "recordatorio" });
  }
  return decisiones;
}
