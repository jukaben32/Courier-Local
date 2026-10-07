"use server";

import { revalidatePath } from "next/cache";
import { esOficina, obtenerUsuarioActual } from "@/lib/sesion";
import { ejecutarTareas } from "@/lib/tareas";
import { whatsappSimulado } from "@/lib/whatsapp/cliente";

export type AdelantoReloj = "ahora" | "dos_horas" | "manana_8am" | "tres_dias";

const HORA_MS = 60 * 60 * 1000;

// 8:00 am de mañana en RD (UTC-4 todo el año)
function manana8am(ahora: Date): Date {
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(ahora);
  const manana = new Date(new Date(`${hoy}T12:00:00-04:00`).getTime() + 24 * HORA_MS);
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(manana);
  return new Date(`${dia}T08:00:00-04:00`);
}

/**
 * Prueba las tareas automáticas "como si" hubiera pasado el tiempo indicado, sin esperar días.
 * Solo funciona en modo de prueba (sin las claves de YCloud).
 */
export async function probarTareas(adelanto: AdelantoReloj): Promise<string> {
  const usuario = await obtenerUsuarioActual();
  if (!usuario || !esOficina(usuario)) return "No tienes permiso.";
  if (!whatsappSimulado()) return "Solo disponible en modo de prueba.";

  const ahora = new Date();
  const momento =
    adelanto === "dos_horas" ? new Date(ahora.getTime() + 2 * HORA_MS)
    : adelanto === "manana_8am" ? manana8am(ahora)
    : adelanto === "tres_dias" ? new Date(manana8am(ahora).getTime() + 2 * 24 * HORA_MS)
    : ahora;

  const r = await ejecutarTareas(momento);
  revalidatePath("/simulador");
  revalidatePath("/paquetes");
  return `Reloj en ${new Intl.DateTimeFormat("es-DO", { timeZone: "America/Santo_Domingo", dateStyle: "short", timeStyle: "short" }).format(momento)}: ` +
    `${r.recordatorios.enviados} recordatorio(s) enviados (${r.recordatorios.esperando} personas esperando), ${r.vencidos.devueltos} paquete(s) devuelto(s) por vencer el plazo.`;
}
