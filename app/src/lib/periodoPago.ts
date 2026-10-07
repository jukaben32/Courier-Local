// Los períodos de pago de los repartidores: se cortan el día 9 y el día 24.
//   · Período que empieza el 25 y termina el 9 del mes siguiente  -> se paga el 10
//   · Período que empieza el 10 y termina el 24                   -> se paga el 25
// Cada período se identifica por su fecha de inicio ("2026-10-10" o "2026-10-25"), en hora de RD.

const ZONA_HORARIA = "America/Santo_Domingo";
const FORMATO_PERIODO = /^(\d{4})-(\d{2})-(10|25)$/;
const MS_POR_DIA = 24 * 60 * 60 * 1000;
// RD no usa horario de verano: siempre es UTC-4
const DESFASE_RD = "-04:00";
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const dosCifras = (n: number) => String(n).padStart(2, "0");
const fecha = (anio: number, mes: number, dia: number) => `${anio}-${dosCifras(mes)}-${dosCifras(dia)}`;

/** Resuelve desbordes de mes/año: mes 0 -> diciembre del año anterior, mes 13 -> enero del siguiente. */
function normalizar(anio: number, mes: number): { anio: number; mes: number } {
  return { anio: anio + Math.floor((mes - 1) / 12), mes: ((((mes - 1) % 12) + 12) % 12) + 1 };
}

function partes(inicio: string): { anio: number; mes: number; dia: number } {
  const [, anio, mes, dia] = inicio.match(FORMATO_PERIODO)!;
  return { anio: Number(anio), mes: Number(mes), dia: Number(dia) };
}

export function esPeriodoValido(texto: string | undefined): texto is string {
  return texto !== undefined && FORMATO_PERIODO.test(texto);
}

/** Período que contiene la fecha dada, según el día de calendario en RD. */
export function periodoDe(momento: Date): string {
  const [anio, mes, dia] = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_HORARIA }).format(momento).split("-").map(Number);
  if (dia >= 25) return fecha(anio, mes, 25);
  if (dia >= 10) return fecha(anio, mes, 10);
  const anterior = normalizar(anio, mes - 1);
  return fecha(anterior.anio, anterior.mes, 25);
}

/** Último día (incluido) del período: el 24, o el 9 del mes siguiente. */
export function finDelPeriodo(inicio: string): string {
  const { anio, mes, dia } = partes(inicio);
  if (dia === 10) return fecha(anio, mes, 24);
  const siguiente = normalizar(anio, mes + 1);
  return fecha(siguiente.anio, siguiente.mes, 9);
}

/** Día en que se paga el período: el 25 o el 10 del mes siguiente. */
export function fechaDePago(inicio: string): string {
  const { anio, mes, dia } = partes(inicio);
  if (dia === 10) return fecha(anio, mes, 25);
  const siguiente = normalizar(anio, mes + 1);
  return fecha(siguiente.anio, siguiente.mes, 10);
}

export function periodoSiguiente(inicio: string): string {
  const { anio, mes, dia } = partes(inicio);
  if (dia === 10) return fecha(anio, mes, 25);
  const siguiente = normalizar(anio, mes + 1);
  return fecha(siguiente.anio, siguiente.mes, 10);
}

export function periodoAnterior(inicio: string): string {
  const { anio, mes, dia } = partes(inicio);
  if (dia === 25) return fecha(anio, mes, 10);
  const anterior = normalizar(anio, mes - 1);
  return fecha(anterior.anio, anterior.mes, 25);
}

/** Momento exacto de inicio del período y del período siguiente (el fin no está incluido). */
export function limitesPeriodo(inicio: string): { desde: string; hasta: string } {
  const aMomento = (dia: string) => new Date(`${dia}T00:00:00${DESFASE_RD}`).toISOString();
  return { desde: aMomento(inicio), hasta: aMomento(periodoSiguiente(inicio)) };
}

/** Día de calendario de RD de un momento, como "2026-10-10". */
export function diaDeRD(momento: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_HORARIA }).format(momento);
}

/** Cuántos días faltan para una fecha "YYYY-MM-DD" contando desde otra (0 = es el mismo día). */
export function diasHasta(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / MS_POR_DIA);
}

/** "25 de octubre" */
export function etiquetaFecha(dia: string): string {
  const [, mes, numero] = dia.split("-").map(Number);
  return `${numero} de ${MESES[mes - 1]}`;
}

/** "10 al 24 de octubre de 2026" o "25 de septiembre al 9 de octubre de 2026" */
export function etiquetaPeriodo(inicio: string): string {
  const fin = finDelPeriodo(inicio);
  const [anioInicio, mesInicio, diaInicio] = inicio.split("-").map(Number);
  const [anioFin, mesFin, diaFin] = fin.split("-").map(Number);
  if (anioInicio !== anioFin) return `${diaInicio} de ${MESES[mesInicio - 1]} de ${anioInicio} al ${diaFin} de ${MESES[mesFin - 1]} de ${anioFin}`;
  if (mesInicio !== mesFin) return `${diaInicio} de ${MESES[mesInicio - 1]} al ${diaFin} de ${MESES[mesFin - 1]} de ${anioFin}`;
  return `${diaInicio} al ${diaFin} de ${MESES[mesFin - 1]} de ${anioFin}`;
}
