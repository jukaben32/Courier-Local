// Optimizador de ruta de un repartidor en moto.
// Ordena las paradas confirmadas respetando los horarios (franjas) y, dentro de cada horario,
// recorriendo lo menos posible. Con 25 a 40 paradas el cálculo es instantáneo y corre en el celular,
// así se vuelve a calcular solo desde donde está el repartidor cada vez que cambia algo.

export interface Punto {
  lat: number;
  lng: number;
}

export interface Parada {
  id: string;
  lat: number | null;
  lng: number | null;
  /** Orden del horario elegido por el cliente: 1 = mañana, 2 = mediodía, 3 = tarde. */
  franja: number;
}

export interface ParadaOrdenada {
  id: string;
  franja: number;
  /** Sin ubicación del cliente: queda al final de su horario y no cuenta para la distancia. */
  aproximada: boolean;
  distanciaKm: number;
  acumuladoKm: number;
  /** Minutos desde la salida hasta terminar esta parada (viaje + tiempo de entrega). */
  acumuladoMin: number;
}

export interface ConfigRuta {
  velocidadKmh: number;
  /** Las calles no son línea recta: se multiplica la distancia en línea recta por este factor. */
  factorCalles: number;
  minutosPorParada: number;
}

export const CONFIG_RUTA: ConfigRuta = { velocidadKmh: 25, factorCalles: 1.3, minutosPorParada: 4 };

const RADIO_TIERRA_KM = 6371;
const aRadianes = (grados: number) => (grados * Math.PI) / 180;

/** Distancia en línea recta entre dos puntos (fórmula de Haversine), en kilómetros. */
export function distanciaKm(a: Punto, b: Punto): number {
  const dLat = aRadianes(b.lat - a.lat);
  const dLng = aRadianes(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aRadianes(a.lat)) * Math.cos(aRadianes(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.sqrt(h));
}

type ConUbicacion = Parada & Punto;

const tieneUbicacion = (p: Parada): p is ConUbicacion => p.lat !== null && p.lng !== null;

/** Largo de un recorrido que sale de `inicio` (si hay) y pasa por todas las paradas en ese orden. */
export function largoRecorrido(inicio: Punto | null, orden: Punto[]): number {
  let total = 0;
  let anterior = inicio;
  for (const p of orden) {
    if (anterior) total += distanciaKm(anterior, p);
    anterior = p;
  }
  return total;
}

// Siempre va a la parada más cercana a donde está
function vecinoMasCercano(inicio: Punto | null, paradas: ConUbicacion[]): ConUbicacion[] {
  const pendientes = [...paradas];
  const orden: ConUbicacion[] = [];
  let actual = inicio;

  if (!actual && pendientes.length > 0) {
    // Sin punto de salida: se empieza por la parada más lejos del centro, para no dejar una suelta al final
    const centro = {
      lat: pendientes.reduce((s, p) => s + p.lat, 0) / pendientes.length,
      lng: pendientes.reduce((s, p) => s + p.lng, 0) / pendientes.length,
    };
    const primera = pendientes.reduce((mejor, p) => (distanciaKm(centro, p) > distanciaKm(centro, mejor) ? p : mejor));
    pendientes.splice(pendientes.indexOf(primera), 1);
    orden.push(primera);
    actual = primera;
  }

  while (pendientes.length > 0 && actual) {
    const siguiente = pendientes.reduce((mejor, p) => (distanciaKm(actual!, p) < distanciaKm(actual!, mejor) ? p : mejor));
    pendientes.splice(pendientes.indexOf(siguiente), 1);
    orden.push(siguiente);
    actual = siguiente;
  }
  return orden;
}

// 2-opt: revierte tramos del recorrido mientras eso lo acorte (quita cruces y vueltas innecesarias)
function mejorar2Opt(inicio: Punto | null, orden: ConUbicacion[]): ConUbicacion[] {
  const mejor = [...orden];
  let mejoro = true;
  while (mejoro) {
    mejoro = false;
    for (let i = 0; i < mejor.length - 1; i += 1) {
      for (let j = i + 1; j < mejor.length; j += 1) {
        const candidato = [...mejor.slice(0, i), ...mejor.slice(i, j + 1).reverse(), ...mejor.slice(j + 1)];
        if (largoRecorrido(inicio, candidato) < largoRecorrido(inicio, mejor) - 1e-9) {
          mejor.splice(0, mejor.length, ...candidato);
          mejoro = true;
        }
      }
    }
  }
  return mejor;
}

/** Orden de visita de un conjunto de paradas con ubicación (sin considerar horarios). */
export function ordenarPorCercania(inicio: Punto | null, paradas: ConUbicacion[]): ConUbicacion[] {
  return mejorar2Opt(inicio, vecinoMasCercano(inicio, paradas));
}

/**
 * Arma la ruta: primero el horario más temprano; dentro de cada horario, el recorrido más corto
 * partiendo de donde está el repartidor. Las paradas sin ubicación van al final de su horario.
 */
export function ordenarRuta(paradas: Parada[], origen: Punto | null, config: ConfigRuta = CONFIG_RUTA): ParadaOrdenada[] {
  const franjas = [...new Set(paradas.map((p) => p.franja))].sort((a, b) => a - b);
  const resultado: ParadaOrdenada[] = [];
  let posicion: Punto | null = origen;
  let acumuladoKm = 0;
  let acumuladoMin = 0;

  for (const franja of franjas) {
    const delHorario = paradas.filter((p) => p.franja === franja);
    const conUbicacion = delHorario.filter(tieneUbicacion);
    const sinUbicacion = delHorario.filter((p) => !tieneUbicacion(p));

    for (const parada of ordenarPorCercania(posicion, conUbicacion)) {
      const km = posicion ? distanciaKm(posicion, parada) * config.factorCalles : 0;
      acumuladoKm += km;
      acumuladoMin += (km / config.velocidadKmh) * 60 + config.minutosPorParada;
      resultado.push({ id: parada.id, franja, aproximada: false, distanciaKm: km, acumuladoKm, acumuladoMin });
      posicion = { lat: parada.lat, lng: parada.lng };
    }
    for (const parada of sinUbicacion) {
      acumuladoMin += config.minutosPorParada;
      resultado.push({ id: parada.id, franja, aproximada: true, distanciaKm: 0, acumuladoKm, acumuladoMin });
    }
  }
  return resultado;
}
