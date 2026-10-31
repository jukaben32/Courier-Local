import "server-only";
import { borrarFotosVencidas, type ResumenBorrado } from "./retencion";
import { aprenderUbicaciones, type ResumenUbicaciones } from "./ubicaciones";
import { cerrarVencidos, type ResumenVencidos } from "./vencidos";
import { enviarRecordatorios, type ResumenRecordatorios } from "./whatsapp/recordatorios";

export interface ResumenTareas {
  vencidos: ResumenVencidos;
  recordatorios: ResumenRecordatorios;
  ubicaciones: ResumenUbicaciones;
  fotos: ResumenBorrado;
}

/** Lo que se ejecuta cada 15 minutos: primero se cierran los vencidos y luego se recuerda al resto. */
export async function ejecutarTareas(ahora: Date = new Date()): Promise<ResumenTareas> {
  const vencidos = await cerrarVencidos(ahora);
  const recordatorios = await enviarRecordatorios(ahora);
  // Si aprender ubicaciones falla no debe frenar los recordatorios, que ya salieron
  const ubicaciones = await aprenderUbicaciones(ahora).catch(() => ({ sectoresActualizados: 0 }));
  // Las fotos de cédula se borran a los 90 días, siempre con la fecha REAL (el simulador adelanta el reloj
  // y no debe borrar nada); si falla no debe frenar el resto
  const fotos = await borrarFotosVencidas(new Date()).catch(() => ({ entregas: 0, excepciones: 0 }));
  return { vencidos, recordatorios, ubicaciones, fotos };
}
