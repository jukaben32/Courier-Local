// Métricas del dashboard: recibe los datos ya leídos de la base y devuelve todo calculado.
// No toca la base de datos, así que se puede probar con datos de ejemplo.

import { nivelPlazo, type NivelPlazo } from "./plazo";

const ZONA_HORARIA = "America/Santo_Domingo";
const MS_POR_DIA = 24 * 60 * 60 * 1000;
const DIAS_DE_LA_SERIE = 14;
const MAX_SECTORES = 8;
const ESTADOS_ACTIVOS = ["recibido", "notificado", "confirmado", "en_ruta", "intento_fallido", "retiro_oficina"];
const ESTADOS_DEVUELTOS = ["devuelto", "rechazado"];

export interface PaqueteM {
  id: string;
  estado: string;
  fechaRecibido: string;
  /** Intentos fallidos que lleva (0 = si se entrega, fue al primer intento). */
  intentos: number;
  sector: string | null;
  repartidor: string | null;
  motivoDevolucion: string | null;
  /** El cliente ya eligió su horario. */
  confirmado: boolean;
}

export interface EntregaM {
  paqueteId: string;
  repartidor: string | null;
  creadoEn: string;
  resultado: "entregado" | "intento_fallido" | "rechazado";
  tipo: string;
  cargadoEnCourier: boolean;
}

export interface MensajeM {
  paqueteId: string;
  tipo: string;
  estado: string;
}

export interface EntradaMetricas {
  paquetes: PaqueteM[];
  entregas: EntregaM[];
  mensajes: MensajeM[];
}

export interface Metricas {
  cartera: { activos: number; porPlazo: Record<NivelPlazo, number>; porEstado: Record<string, number> };
  rendimiento: {
    recibidos: number;
    entregados: number;
    devueltos: number;
    /** % de entregados sobre los paquetes ya cerrados (entregados + devueltos). */
    tasaEntrega: number | null;
    /** % de entregados que se lograron sin ningún intento fallido. */
    primerIntento: number | null;
    /** Días promedio entre recibir y entregar. */
    diasPromedio: number | null;
    motivos: { motivo: string; cantidad: number }[];
  };
  whatsapp: { avisados: number; confirmaron: number; tasaRespuesta: number | null; mensajes: number; fallidos: number };
  /** Cuántas entregas fueron retiro en la oficina (el courier se ahorra pagar una entrega a domicilio). */
  retiros: { retiros: number; domicilio: number; porcentaje: number | null };
  porRepartidor: { nombre: string; entregas: number; fallidos: number; primerIntento: number | null; sinSubir: number }[];
  porSector: { sector: string; recibidos: number; entregados: number; pendientes: number }[];
  porDia: { dia: string; recibidos: number; entregados: number }[];
}

const porcentaje = (parte: number, total: number): number | null => (total === 0 ? null : Math.round((parte / total) * 100));

/** Día calendario de RD como "2026-10-10". */
function diaRD(fecha: Date | string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_HORARIA }).format(new Date(fecha));
}

function contar<T>(items: T[], clave: (item: T) => string): Map<string, number> {
  const conteo = new Map<string, number>();
  for (const item of items) conteo.set(clave(item), (conteo.get(clave(item)) ?? 0) + 1);
  return conteo;
}

function calcularCartera(paquetes: PaqueteM[], ahora: Date): Metricas["cartera"] {
  const activos = paquetes.filter((p) => ESTADOS_ACTIVOS.includes(p.estado));
  const porPlazo: Record<NivelPlazo, number> = { verde: 0, amarillo: 0, rojo: 0, vencido: 0 };
  for (const p of activos) porPlazo[nivelPlazo(new Date(p.fechaRecibido), ahora)] += 1;
  return { activos: activos.length, porPlazo, porEstado: Object.fromEntries(contar(paquetes, (p) => p.estado)) };
}

function calcularRendimiento(paquetes: PaqueteM[], entregas: EntregaM[]): Metricas["rendimiento"] {
  const entregados = paquetes.filter((p) => p.estado === "entregado");
  const devueltos = paquetes.filter((p) => ESTADOS_DEVUELTOS.includes(p.estado));

  const entregaPorPaquete = new Map(entregas.filter((e) => e.resultado === "entregado").map((e) => [e.paqueteId, e]));
  const dias = entregados.flatMap((p) => {
    const entrega = entregaPorPaquete.get(p.id);
    return entrega ? [(new Date(entrega.creadoEn).getTime() - new Date(p.fechaRecibido).getTime()) / MS_POR_DIA] : [];
  });

  const motivos = contar(
    devueltos.filter((p) => p.motivoDevolucion),
    (p) => p.motivoDevolucion!
  );

  return {
    recibidos: paquetes.length,
    entregados: entregados.length,
    devueltos: devueltos.length,
    tasaEntrega: porcentaje(entregados.length, entregados.length + devueltos.length),
    primerIntento: porcentaje(entregados.filter((p) => p.intentos === 0).length, entregados.length),
    diasPromedio: dias.length ? Math.round((dias.reduce((t, d) => t + d, 0) / dias.length) * 10) / 10 : null,
    motivos: [...motivos].map(([motivo, cantidad]) => ({ motivo, cantidad })).sort((a, b) => b.cantidad - a.cantidad),
  };
}

function calcularWhatsapp(paquetes: PaqueteM[], mensajes: MensajeM[]): Metricas["whatsapp"] {
  const avisados = new Set(mensajes.filter((m) => m.tipo === "aviso").map((m) => m.paqueteId));
  const confirmaron = paquetes.filter((p) => avisados.has(p.id) && p.confirmado).length;
  return {
    avisados: avisados.size,
    confirmaron,
    tasaRespuesta: porcentaje(confirmaron, avisados.size),
    mensajes: mensajes.length,
    fallidos: mensajes.filter((m) => m.estado === "fallido").length,
  };
}

function calcularRetiros(entregas: EntregaM[]): Metricas["retiros"] {
  const entregadas = entregas.filter((e) => e.resultado === "entregado");
  const retiros = entregadas.filter((e) => e.tipo === "retiro_oficina").length;
  const domicilio = entregadas.length - retiros;
  return { retiros, domicilio, porcentaje: porcentaje(retiros, entregadas.length) };
}

function calcularPorRepartidor(paquetes: PaqueteM[], entregas: EntregaM[]): Metricas["porRepartidor"] {
  const paquetePorId = new Map(paquetes.map((p) => [p.id, p]));
  const nombres = [...new Set(entregas.flatMap((e) => (e.repartidor ? [e.repartidor] : [])))];

  return nombres
    .map((nombre) => {
      const suyas = entregas.filter((e) => e.repartidor === nombre);
      const entregadas = suyas.filter((e) => e.resultado === "entregado");
      // El primer intento se conoce solo si el paquete está en el periodo
      const conocidas = entregadas.flatMap((e) => (paquetePorId.has(e.paqueteId) ? [paquetePorId.get(e.paqueteId)!] : []));
      return {
        nombre,
        entregas: entregadas.length,
        fallidos: suyas.filter((e) => e.resultado === "intento_fallido").length,
        primerIntento: porcentaje(conocidas.filter((p) => p.intentos === 0).length, conocidas.length),
        sinSubir: entregadas.filter((e) => !e.cargadoEnCourier).length,
      };
    })
    .sort((a, b) => b.entregas - a.entregas || a.nombre.localeCompare(b.nombre));
}

function calcularPorSector(paquetes: PaqueteM[]): Metricas["porSector"] {
  const sectores = new Map<string, PaqueteM[]>();
  for (const p of paquetes) sectores.set(p.sector ?? "Sin sector", [...(sectores.get(p.sector ?? "Sin sector") ?? []), p]);

  return [...sectores]
    .map(([sector, lista]) => ({
      sector,
      recibidos: lista.length,
      entregados: lista.filter((p) => p.estado === "entregado").length,
      pendientes: lista.filter((p) => ESTADOS_ACTIVOS.includes(p.estado)).length,
    }))
    .sort((a, b) => b.recibidos - a.recibidos || a.sector.localeCompare(b.sector))
    .slice(0, MAX_SECTORES);
}

function calcularPorDia(paquetes: PaqueteM[], entregas: EntregaM[], ahora: Date): Metricas["porDia"] {
  const recibidos = contar(paquetes, (p) => diaRD(p.fechaRecibido));
  const entregados = contar(
    entregas.filter((e) => e.resultado === "entregado"),
    (e) => diaRD(e.creadoEn)
  );
  return Array.from({ length: DIAS_DE_LA_SERIE }, (_, i) => {
    const dia = diaRD(new Date(ahora.getTime() - (DIAS_DE_LA_SERIE - 1 - i) * MS_POR_DIA));
    return { dia, recibidos: recibidos.get(dia) ?? 0, entregados: entregados.get(dia) ?? 0 };
  });
}

export function calcularMetricas(entrada: EntradaMetricas, ahora: Date = new Date()): Metricas {
  const { paquetes, entregas, mensajes } = entrada;
  return {
    cartera: calcularCartera(paquetes, ahora),
    rendimiento: calcularRendimiento(paquetes, entregas),
    whatsapp: calcularWhatsapp(paquetes, mensajes),
    retiros: calcularRetiros(entregas),
    porRepartidor: calcularPorRepartidor(paquetes, entregas),
    porSector: calcularPorSector(paquetes),
    porDia: calcularPorDia(paquetes, entregas, ahora),
  };
}
