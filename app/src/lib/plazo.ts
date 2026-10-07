export type NivelPlazo = "verde" | "amarillo" | "rojo" | "vencido";

const ZONA_HORARIA = "America/Santo_Domingo";
const MS_POR_DIA = 24 * 60 * 60 * 1000;

// Fecha del calendario (año-mes-día) en la hora de RD, como número de días desde 1970.
export function diaLocal(fecha: Date): number {
  const [anio, mes, dia] = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(fecha)
    .split("-")
    .map(Number);
  return Date.UTC(anio, mes - 1, dia) / MS_POR_DIA;
}

/**
 * Semáforo del plazo de 3 días del courier, contado por días de calendario de RD:
 * el día que llega es verde (intento 1), al siguiente amarillo (intento 2),
 * el tercero rojo (último intento) y después está vencido.
 */
export function nivelPlazo(fechaRecibido: Date, ahora: Date = new Date()): NivelPlazo {
  const dias = diaLocal(ahora) - diaLocal(fechaRecibido);
  if (dias <= 0) return "verde";
  if (dias === 1) return "amarillo";
  if (dias === 2) return "rojo";
  return "vencido";
}
