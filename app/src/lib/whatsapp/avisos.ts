// Armado de los avisos de llegada, compartido por el botón "Enviar avisos" y por las tandas
// del goteo: un solo mensaje por persona (con todos sus paquetes recibidos).

import { cuerpoPlantilla, type MensajeSaliente, type ResultadoEnvio } from "./envio";
import { PLANTILLAS, parametrosAvisoLlegada } from "./plantillas";

export interface PaqueteNuevo {
  id: string;
  numero_guia: string;
  nombre_etiqueta: string;
  destinatario_id: string;
  destinatarios: { telefono: string } | null;
}

/** Agrupa por persona, respetando el orden de llegada. Las personas sin teléfono se cuentan aparte. */
export function agruparAvisos(nuevos: PaqueteNuevo[]): { grupos: PaqueteNuevo[][]; sinTelefono: number } {
  const porPersona = new Map<string, PaqueteNuevo[]>();
  for (const p of nuevos) {
    porPersona.set(p.destinatario_id, [...(porPersona.get(p.destinatario_id) ?? []), p]);
  }
  const grupos = [...porPersona.values()].filter((g) => g[0].destinatarios?.telefono);
  return { grupos, sinTelefono: porPersona.size - grupos.length };
}

export function mensajesDeAvisos(grupos: PaqueteNuevo[][]): MensajeSaliente[] {
  return grupos.map((grupo) => ({
    telefono: grupo[0].destinatarios!.telefono,
    externalId: grupo[0].destinatario_id,
    cuerpo: cuerpoPlantilla(
      PLANTILLAS.avisoLlegada.nombre,
      parametrosAvisoLlegada(grupo[0].nombre_etiqueta, grupo.map((p) => p.numero_guia))
    ),
  }));
}

/** Filas del historial de mensajes y ids de paquetes que pasan a "notificado". */
export function historialDeAvisos(
  grupos: PaqueteNuevo[][],
  mensajes: MensajeSaliente[],
  resultados: ResultadoEnvio[]
): { filas: Record<string, unknown>[]; idsAvisados: string[] } {
  const filas: Record<string, unknown>[] = [];
  const idsAvisados: string[] = [];
  grupos.forEach((grupo, i) => {
    const r = resultados[i];
    for (const p of grupo) {
      filas.push({
        paquete_id: p.id,
        telefono: mensajes[i].telefono,
        direccion: "saliente",
        tipo: "aviso",
        plantilla: PLANTILLAS.avisoLlegada.nombre,
        estado: r.ok ? "enviado" : "fallido",
        proveedor_id: r.id ?? null,
        sesion: r.sesion ?? null,
        error: r.error ?? null,
      });
      if (r.ok) idsAvisados.push(p.id);
    }
  });
  return { filas, idsAvisados };
}
