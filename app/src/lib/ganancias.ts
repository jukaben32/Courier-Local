// Cuánto entregó y cuánto ganó cada repartidor: hoy, en el período de pago en curso y en el anterior.
// Recibe los datos ya leídos de la base, así que se puede probar con datos de ejemplo.

import { fechaDePago, finDelPeriodo, limitesPeriodo, periodoAnterior, periodoDe } from "./periodoPago";
import { nivelPlazo } from "./plazo";

const ZONA_HORARIA = "America/Santo_Domingo";

export interface RepartidorBase {
  id: string;
  nombre: string;
  rol: string;
}

/** Una entrega a domicilio ya hecha (la que se paga). */
export interface EntregaPagable {
  repartidorId: string;
  creadoEn: string;
  /** Lo que se le paga por esta entrega, fijado al entregar. */
  tarifa: number | null;
  cargadoEnCourier: boolean;
}

/** Un paquete que sigue sin entregar y está asignado a alguien. */
export interface PaqueteAsignado {
  repartidorId: string;
  fechaRecibido: string;
}

export interface Cuenta {
  entregas: number;
  ganado: number;
}

export interface PeriodoPago {
  inicio: string;
  fin: string;
  pago: string;
}

export interface FilaRepartidor {
  id: string;
  nombre: string;
  rol: string;
  hoy: Cuenta;
  periodoActual: Cuenta;
  periodoAnterior: Cuenta;
  /** Entregas hechas cuya prueba falta subir al programa del courier. */
  sinSubir: number;
  porEntregar: number;
  vencidos: number;
}

export interface ResumenPagos {
  periodoActual: PeriodoPago;
  periodoAnterior: PeriodoPago;
  repartidores: FilaRepartidor[];
  totales: { hoy: Cuenta; periodoActual: Cuenta; periodoAnterior: Cuenta };
}

export interface EntradaPagos {
  repartidores: RepartidorBase[];
  entregas: EntregaPagable[];
  paquetes: PaqueteAsignado[];
}

const diaRD = (momento: Date | string) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_HORARIA }).format(new Date(momento));
const describir = (inicio: string): PeriodoPago => ({ inicio, fin: finDelPeriodo(inicio), pago: fechaDePago(inicio) });
const sumar = (a: Cuenta, b: Cuenta): Cuenta => ({ entregas: a.entregas + b.entregas, ganado: a.ganado + b.ganado });
const VACIA: Cuenta = { entregas: 0, ganado: 0 };

function cuenta(entregas: EntregaPagable[]): Cuenta {
  return { entregas: entregas.length, ganado: entregas.reduce((total, e) => total + (e.tarifa ?? 0), 0) };
}

export function resumenPagos(entrada: EntradaPagos, ahora: Date = new Date()): ResumenPagos {
  const inicioActual = periodoDe(ahora);
  const inicioAnterior = periodoAnterior(inicioActual);
  const actual = limitesPeriodo(inicioActual);
  const anterior = limitesPeriodo(inicioAnterior);
  const hoy = diaRD(ahora);

  const dentro = (e: EntregaPagable, limites: { desde: string; hasta: string }) => {
    const momento = new Date(e.creadoEn).getTime();
    return momento >= new Date(limites.desde).getTime() && momento < new Date(limites.hasta).getTime();
  };

  const repartidores = entrada.repartidores
    .map<FilaRepartidor>((r) => {
      const suyas = entrada.entregas.filter((e) => e.repartidorId === r.id);
      const pendientes = entrada.paquetes.filter((p) => p.repartidorId === r.id);
      return {
        id: r.id,
        nombre: r.nombre,
        rol: r.rol,
        hoy: cuenta(suyas.filter((e) => diaRD(e.creadoEn) === hoy)),
        periodoActual: cuenta(suyas.filter((e) => dentro(e, actual))),
        periodoAnterior: cuenta(suyas.filter((e) => dentro(e, anterior))),
        sinSubir: suyas.filter((e) => !e.cargadoEnCourier).length,
        porEntregar: pendientes.length,
        vencidos: pendientes.filter((p) => nivelPlazo(new Date(p.fechaRecibido), ahora) === "vencido").length,
      };
    })
    .sort((a, b) => b.periodoActual.entregas - a.periodoActual.entregas || a.nombre.localeCompare(b.nombre));

  return {
    periodoActual: describir(inicioActual),
    periodoAnterior: describir(inicioAnterior),
    repartidores,
    totales: {
      hoy: repartidores.reduce((t, r) => sumar(t, r.hoy), VACIA),
      periodoActual: repartidores.reduce((t, r) => sumar(t, r.periodoActual), VACIA),
      periodoAnterior: repartidores.reduce((t, r) => sumar(t, r.periodoAnterior), VACIA),
    },
  };
}

/** Lo que se le paga a cada repartidor por un período cualquiera (para la pantalla de pagos). */
export function pagoDelPeriodo(
  entrada: Pick<EntradaPagos, "repartidores" | "entregas">,
  inicio: string
): { periodo: PeriodoPago; filas: { id: string; nombre: string; entregas: number; ganado: number }[]; total: Cuenta } {
  const { desde, hasta } = limitesPeriodo(inicio);
  const filas = entrada.repartidores
    .map((r) => {
      const suyas = entrada.entregas.filter((e) => {
        const momento = new Date(e.creadoEn).getTime();
        return e.repartidorId === r.id && momento >= new Date(desde).getTime() && momento < new Date(hasta).getTime();
      });
      return { id: r.id, nombre: r.nombre, ...cuenta(suyas) };
    })
    .filter((f) => f.entregas > 0)
    .sort((a, b) => b.ganado - a.ganado || a.nombre.localeCompare(b.nombre));
  return { periodo: describir(inicio), filas, total: filas.reduce((t, f) => sumar(t, f), VACIA) };
}
