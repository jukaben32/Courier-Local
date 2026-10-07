// Las quincenas del pago: la 1.ª va del día 1 al 15 y la 2.ª del 16 al fin de mes (hora de RD).
// Se identifican por su fecha de inicio ("2026-10-01" o "2026-10-16").

const FORMATO_FECHA = /^(\d{4})-(\d{2})-(01|16)$/;

const dosCifras = (n: number) => String(n).padStart(2, "0");

/** Quincena que contiene la fecha dada, según el día de calendario en RD. */
export function quincenaDe(fecha: Date): string {
  const [anio, mes, dia] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" })
    .format(fecha)
    .split("-")
    .map(Number);
  return `${anio}-${dosCifras(mes)}-${dia <= 15 ? "01" : "16"}`;
}

export function esQuincenaValida(texto: string | undefined): texto is string {
  return texto !== undefined && FORMATO_FECHA.test(texto);
}

/** La quincena anterior (+1) o siguiente (-1) a la indicada. */
export function desplazarQuincena(inicio: string, direccion: 1 | -1): string {
  const [, anioTexto, mesTexto, diaTexto] = inicio.match(FORMATO_FECHA)!;
  let anio = Number(anioTexto);
  let mes = Number(mesTexto);
  const primera = diaTexto === "01";

  if (direccion === 1) {
    if (!primera) return `${anio}-${dosCifras(mes)}-01`;
    mes -= 1;
    if (mes === 0) { mes = 12; anio -= 1; }
    return `${anio}-${dosCifras(mes)}-16`;
  }
  if (primera) return `${anio}-${dosCifras(mes)}-16`;
  mes += 1;
  if (mes === 13) { mes = 1; anio += 1; }
  return `${anio}-${dosCifras(mes)}-01`;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "1 al 15 de octubre de 2026" */
export function etiquetaQuincena(inicio: string): string {
  const [, anio, mes, dia] = inicio.match(FORMATO_FECHA)!;
  const ultimoDia = new Date(Number(anio), Number(mes), 0).getDate();
  return `${dia === "01" ? "1 al 15" : `16 al ${ultimoDia}`} de ${MESES[Number(mes) - 1]} de ${anio}`;
}
