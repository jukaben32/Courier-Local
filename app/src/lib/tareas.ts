import "server-only";
import { cerrarVencidos, type ResumenVencidos } from "./vencidos";
import { enviarRecordatorios, type ResumenRecordatorios } from "./whatsapp/recordatorios";

export interface ResumenTareas {
  vencidos: ResumenVencidos;
  recordatorios: ResumenRecordatorios;
}

/** Lo que se ejecuta cada 15 minutos: primero se cierran los vencidos y luego se recuerda al resto. */
export async function ejecutarTareas(ahora: Date = new Date()): Promise<ResumenTareas> {
  const vencidos = await cerrarVencidos(ahora);
  const recordatorios = await enviarRecordatorios(ahora);
  return { vencidos, recordatorios };
}
