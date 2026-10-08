// Reparto equitativo: que cada repartidor lleve más o menos la misma carga sin alargar las rutas.
// Quita paquetes a quien tiene de más y se los da a quien tiene de menos, escogiendo los que quedan
// más cerca de lo que el receptor ya lleva (así cada uno conserva un tramo continuo, incluso en un
// sector muy grande como Miramar), y sin pasarse de un tope de kilómetros extra.
// Solo propone: la oficina revisa la propuesta y decide si la aplica.

import { distanciaKm, type Punto } from "./ruta";

/** Cuántos kilómetros más (en línea recta) se acepta que cueste llevar un paquete a otro repartidor. */
export const MAX_KM_EXTRA_POR_PAQUETE = 8;

export interface PaqueteEquilibrio {
  id: string;
  repartidorId: string;
  /** Solo para mostrar en la propuesta. */
  sector: string;
  /** Ubicación del paquete: el pin del cliente o, si no hay, el centro de su sector. Sin ella no se mueve. */
  lat: number | null;
  lng: number | null;
  /** false = no se puede cambiar de repartidor (por ejemplo, ya salió en ruta). Por defecto sí se puede. */
  movible?: boolean;
  /** Cuánto esfuerzo pesa (por defecto 1). Sirve para que un paquete difícil cuente más. */
  peso?: number;
}

export interface EntradaEquilibrio {
  paquetes: PaqueteEquilibrio[];
  /** Quiénes participan en el reparto (los demás paquetes se ignoran). */
  repartidores: string[];
  /** Diferencia aceptada respecto al promedio: 0 = lo más exacto posible. */
  margen: number;
  /** Carga que ya lleva cada uno y no se puede mover (por ejemplo, el esfuerzo de sus paquetes de municipios). */
  cargaFija?: Record<string, number>;
  /** Zona de quien aún no tiene paquetes (el centro de sus sectores), para poder darle. */
  casaPorDefecto?: Record<string, Punto>;
  maxKmExtra?: number;
}

export interface Movimiento {
  paqueteId: string;
  deId: string;
  aId: string;
  /** Kilómetros de más (en línea recta) respecto a que lo llevara su repartidor actual. */
  extraKm: number;
}

export interface PropuestaEquilibrio {
  movimientos: Movimiento[];
  /** Carga de cada uno antes y después (con peso 1 por paquete, es la cantidad de paquetes). */
  antes: Record<string, number>;
  despues: Record<string, number>;
  /** Carga que llevaría cada uno si se repartiera exacto. */
  objetivo: number;
  kmExtra: number;
  /** Paquetes sin ubicación conocida: no se pueden mover, pero sí cuentan en la carga. */
  sinUbicacion: number;
  /** Quiénes quedaron fuera del margen porque igualarlos habría alargado demasiado la ruta. */
  fueraDeMargen: string[];
}

interface Candidato {
  paquete: PaqueteEquilibrio;
  deId: string;
  extraKm: number;
}

const TOLERANCIA = 1e-9;

const tieneUbicacion = (p: PaqueteEquilibrio): p is PaqueteEquilibrio & Punto => p.lat !== null && p.lng !== null;
const peso = (p: PaqueteEquilibrio) => p.peso ?? 1;
const punto = (p: PaqueteEquilibrio & Punto): Punto => ({ lat: p.lat, lng: p.lng });

/** Centro de un grupo de puntos, usando la mediana para que un punto lejano no lo arrastre. */
export function centroideRobusto(puntos: Punto[], minimo: number): Punto | null {
  if (puntos.length < minimo) return null;
  const mediana = (valores: number[]) => {
    const orden = [...valores].sort((a, b) => a - b);
    const medio = Math.floor(orden.length / 2);
    return orden.length % 2 ? orden[medio] : (orden[medio - 1] + orden[medio]) / 2;
  };
  return { lat: mediana(puntos.map((p) => p.lat)), lng: mediana(puntos.map((p) => p.lng)) };
}

/** Distancia desde un punto a lo más cercano de una lista (o null si la lista está vacía). */
function distanciaAlMasCercano(desde: Punto, puntos: Punto[]): number | null {
  let mejor: number | null = null;
  for (const otro of puntos) {
    const d = distanciaKm(desde, otro);
    if (mejor === null || d < mejor) mejor = d;
  }
  return mejor;
}

export function proponerEquilibrio(entrada: EntradaEquilibrio): PropuestaEquilibrio {
  const { repartidores, margen, cargaFija = {}, casaPorDefecto = {}, maxKmExtra = MAX_KM_EXTRA_POR_PAQUETE } = entrada;
  const participantes = new Set(repartidores);
  const paquetes = entrada.paquetes.filter((p) => participantes.has(p.repartidorId));

  // Quién tiene cada paquete ahora (va cambiando a medida que se proponen movimientos)
  const dueno = new Map(paquetes.map((p) => [p.id, p.repartidorId]));
  const carga: Record<string, number> = Object.fromEntries(repartidores.map((id) => [id, cargaFija[id] ?? 0]));
  for (const p of paquetes) carga[p.repartidorId] += peso(p);
  const antes = { ...carga };

  const objetivo = repartidores.length === 0 ? 0 : repartidores.reduce((t, id) => t + carga[id], 0) / repartidores.length;
  const sinUbicacion = paquetes.filter((p) => !tieneUbicacion(p)).length;
  const movimientos: Movimiento[] = [];
  const movidos = new Set<string>();

  /** Puntos de lo que lleva hoy alguien, sin contar un paquete en particular. */
  const puntosDe = (id: string, excepto?: string): Punto[] =>
    paquetes.filter((p) => dueno.get(p.id) === id && p.id !== excepto && tieneUbicacion(p)).map((p) => punto(p as PaqueteEquilibrio & Punto));

  /** Cuánto más habría que recorrer si el paquete lo lleva el receptor en vez del donante. */
  const costoDeMover = (paquete: PaqueteEquilibrio & Punto, deId: string, aId: string): number | null => {
    const origen = punto(paquete);
    const distanciaReceptor = distanciaAlMasCercano(origen, puntosDe(aId)) ?? (casaPorDefecto[aId] ? distanciaKm(origen, casaPorDefecto[aId]) : null);
    if (distanciaReceptor === null) return null;
    return distanciaReceptor - (distanciaAlMasCercano(origen, puntosDe(deId, paquete.id)) ?? 0);
  };

  const mejorMovimiento = (donantes: string[], aId: string): Candidato | null => {
    let mejor: Candidato | null = null;
    for (const deId of donantes) {
      const movibles = paquetes.filter((p) => dueno.get(p.id) === deId && !movidos.has(p.id) && p.movible !== false && tieneUbicacion(p));
      for (const paquete of movibles) {
        // Solo se mueve si de verdad mejora el reparto: la diferencia debe ser mayor que lo que pesa el paquete
        if (carga[deId] - carga[aId] <= peso(paquete) + TOLERANCIA) continue;
        const extraKm = costoDeMover(paquete as PaqueteEquilibrio & Punto, deId, aId);
        if (extraKm === null || extraKm > maxKmExtra) continue;
        const mejora = !mejor || extraKm < mejor.extraKm - TOLERANCIA || (Math.abs(extraKm - mejor.extraKm) <= TOLERANCIA && paquete.id < mejor.paquete.id);
        if (mejora) mejor = { paquete, deId, extraKm };
      }
    }
    return mejor;
  };

  for (let vuelta = 0; vuelta < paquetes.length; vuelta += 1) {
    const alto = objetivo + margen;
    const bajo = objetivo - margen;
    const sobran = repartidores.filter((id) => carga[id] > alto + TOLERANCIA);
    const faltan = repartidores.filter((id) => carga[id] < bajo - TOLERANCIA);
    if (sobran.length === 0 && faltan.length === 0) break;

    // Si solo hay quien tiene de más, recibe cualquiera por debajo del promedio, y viceversa
    const donantes = sobran.length > 0 ? sobran : repartidores.filter((id) => carga[id] > objetivo + TOLERANCIA);
    const receptores = faltan.length > 0 ? faltan : repartidores.filter((id) => carga[id] < objetivo - TOLERANCIA);

    // Se atiende primero a quien lleva menos; si a él no se le puede dar sin pasarse de kilómetros, al siguiente.
    // (Escoger siempre el movimiento más barato gastaría los paquetes cercanos a un vecino y dejaría sin opciones a otro.)
    const porNecesidad = [...receptores].sort((a, b) => carga[a] - carga[b] || a.localeCompare(b));
    let elegido: (Candidato & { aId: string }) | null = null;
    for (const aId of porNecesidad) {
      const candidato = mejorMovimiento(donantes, aId);
      if (candidato) {
        elegido = { ...candidato, aId };
        break;
      }
    }
    if (!elegido) break;

    movidos.add(elegido.paquete.id);
    dueno.set(elegido.paquete.id, elegido.aId);
    movimientos.push({ paqueteId: elegido.paquete.id, deId: elegido.deId, aId: elegido.aId, extraKm: elegido.extraKm });
    carga[elegido.deId] -= peso(elegido.paquete);
    carga[elegido.aId] += peso(elegido.paquete);
  }

  return {
    movimientos,
    antes,
    despues: carga,
    objetivo,
    kmExtra: movimientos.reduce((t, m) => t + m.extraKm, 0),
    sinUbicacion,
    fueraDeMargen: repartidores.filter((id) => carga[id] > objetivo + margen + TOLERANCIA || carga[id] < objetivo - margen - TOLERANCIA),
  };
}
