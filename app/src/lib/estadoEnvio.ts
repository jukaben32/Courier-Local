// "Estado del envío": dice de un vistazo si los avisos de WhatsApp están saliendo bien o si algo
// se detuvo (sesión desconectada, programador apagado...). Función pura para poder probarla.

import { horaEstimadaFin } from "./whatsapp/goteo";
import { horaLocalRD } from "./whatsapp/mensajes";
import type { ConfigRitmo } from "./whatsapp/proveedor";

export interface SesionEstado {
  nombre: string;
  telefono: string | null;
  estado: string;
  /** Conectada y sin restricción. */
  lista: boolean;
}

export interface EntradaEstadoEnvio {
  /** null = no se pudo consultar OpenWA desde aquí. */
  sesiones: SesionEstado[] | null;
  /** Paquetes que esperan su primer aviso. */
  enCola: number;
  avisadosHoy: number;
  fallidosHoy: number;
  /** ISO del último aviso enviado hoy. */
  ultimoAviso: string | null;
  ahora: Date;
  ritmo: ConfigRitmo;
}

export type NivelAlerta = "rojo" | "ambar" | "verde";

export interface EstadoEnvio {
  alertas: { nivel: NivelAlerta; texto: string }[];
  listas: number;
  total: number;
  terminaHacia: string | null;
}

/** Minutos sin enviar, con cola y sesión lista, a partir de los cuales se considera detenido. */
export const MINUTOS_PARA_DAR_POR_DETENIDO = 10;

export function evaluarEstadoEnvio(e: EntradaEstadoEnvio): EstadoEnvio {
  const alertas: EstadoEnvio["alertas"] = [];
  const sesiones = e.sesiones ?? [];
  const listas = sesiones.filter((s) => s.lista).length;
  const hora = Number(horaLocalRD(e.ahora).split(":")[0]);
  const enHorario = hora >= e.ritmo.horaDesde && hora < e.ritmo.horaHasta;

  if (e.sesiones === null) {
    alertas.push({
      nivel: "ambar",
      texto: "No se pudo consultar OpenWA desde aquí. El estado de las cuentas se ve en el computador donde corre OpenWA.",
    });
  } else if (sesiones.length === 0) {
    alertas.push({ nivel: "rojo", texto: "No hay cuentas de WhatsApp configuradas (OPENWA_SESSION_IDS)." });
  } else if (listas === 0) {
    alertas.push({ nivel: "rojo", texto: "Ninguna cuenta de WhatsApp está conectada: no saldrá ningún aviso." });
  } else if (listas < sesiones.length) {
    const caidas = sesiones.filter((s) => !s.lista).map((s) => `${s.nombre} (${s.estado})`);
    alertas.push({ nivel: "ambar", texto: `${caidas.length} de ${sesiones.length} cuentas desconectadas: ${caidas.join(", ")}.` });
  }

  const puedeEnviar = e.sesiones === null || listas > 0;
  if (e.enCola > 0 && puedeEnviar) {
    if (!enHorario) {
      alertas.push({ nivel: "ambar", texto: `Fuera del horario de envío (de ${e.ritmo.horaDesde}:00 a ${e.ritmo.horaHasta}:00): los avisos salen al abrir el horario.` });
    } else if (e.ultimoAviso === null) {
      alertas.push({ nivel: "ambar", texto: "Todavía no ha salido ningún aviso hoy. Si ya importaste la lista, enciende el programador (npm run programador)." });
    } else {
      const minutos = Math.floor((e.ahora.getTime() - new Date(e.ultimoAviso).getTime()) / 60_000);
      if (minutos >= MINUTOS_PARA_DAR_POR_DETENIDO) {
        alertas.push({ nivel: "rojo", texto: `El envío parece detenido: el último aviso salió hace ${minutos} minutos. Revisa que el programador esté encendido.` });
      }
    }
  }

  if (e.fallidosHoy >= 5) {
    alertas.push({ nivel: "ambar", texto: `${e.fallidosHoy} avisos fallaron hoy (número inválido o WhatsApp sin conexión).` });
  }

  const terminaHacia = e.enCola > 0 && enHorario && puedeEnviar ? horaEstimadaFin(e.ahora, Math.ceil(e.enCola / Math.max(1, listas)), e.ritmo) : null;
  if (alertas.length === 0) {
    alertas.push(
      e.enCola === 0
        ? { nivel: "verde", texto: "No hay avisos pendientes." }
        : { nivel: "verde", texto: `Enviando con ${listas} ${listas === 1 ? "cuenta" : "cuentas"}${terminaHacia ? `: terminaría hacia las ${terminaHacia}` : ""}.` }
    );
  }

  return { alertas, listas, total: sesiones.length, terminaHacia };
}
