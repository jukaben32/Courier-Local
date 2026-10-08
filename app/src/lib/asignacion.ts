export interface DatosAsignacion {
  /** Paquete grande que no cabe en moto: lo lleva el administrador en la minivan. */
  voluminoso: boolean;
  administradorId: string | null;
  /** Repartidores activos que tienen este sector como ruta (uno = dueño fijo, varios = rotativo). */
  duenosDelSector: string[];
  /** Paquetes pendientes que ya lleva cada repartidor hoy. */
  cargaActual: Record<string, number>;
}

/**
 * Decide a quién se le asigna un paquete nuevo. Devuelve null cuando no hay a quién
 * (el organizador lo asigna a mano).
 * - Voluminoso -> el administrador (minivan).
 * - Sector con un solo dueño -> ese repartidor.
 * - Sector rotativo (varios dueños) -> el que lleva menos paquetes hoy.
 */
export function elegirRepartidor(datos: DatosAsignacion): string | null {
  if (datos.voluminoso) return datos.administradorId;
  if (datos.duenosDelSector.length === 0) return null;

  // Orden estable por id para que un empate siempre dé el mismo resultado
  const candidatos = [...datos.duenosDelSector].sort();
  return candidatos.reduce((elegido, actual) =>
    (datos.cargaActual[actual] ?? 0) < (datos.cargaActual[elegido] ?? 0) ? actual : elegido
  );
}

export interface Cobertura {
  /** El repartidor que falta. */
  ausenteId: string;
  /** Quien lo cubre mientras tanto (normalmente el suplente). */
  cubreId: string;
}

/**
 * Cambia a los dueños ausentes de un sector por quienes los cubren hoy.
 * Si quien cubre ya era dueño del sector, no se repite.
 */
export function aplicarCoberturas(duenos: string[], coberturas: Cobertura[]): string[] {
  const reemplazo = new Map(coberturas.map((c) => [c.ausenteId, c.cubreId]));
  return [...new Set(duenos.map((id) => reemplazo.get(id) ?? id))];
}
