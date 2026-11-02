// Control de la subida de pruebas al courier de origen. Su índice de velocidad mide cuánto pasa entre
// entregar y subir la prueba, y una subida tardía le cuesta paquetes a la oficina al día siguiente.
// Funciones puras (sin base de datos) para poder probarlas.

export interface EntregaFila {
  id: string;
  resultado: string;
  /** Momento de la entrega (ISO). */
  creadoEn: string;
  /** Momento en que la prueba quedó subida (ISO), o null. */
  subidoEn: string | null;
  cargado: boolean;
  repartidor: string | null;
  nombre: string;
  guia: string;
  verificacion: "verificada" | "pendiente";
  /** Por qué no pudo subirla en el momento, si lo dijo. */
  motivoSinSubir: string | null;
}

export type NivelPrueba = "ok" | "tarde" | "critico";

export interface PruebaPendiente {
  id: string;
  repartidor: string | null;
  nombre: string;
  guia: string;
  minutos: number;
  nivel: NivelPrueba;
  motivoSinSubir: string | null;
}

export interface FilaRepartidor {
  nombre: string;
  entregadas: number;
  fallidas: number;
  sinSubir: number;
  /** Minutos promedio entre entregar y subir (solo las ya subidas); null si ninguna. */
  demoraPromedioMin: number | null;
  /** De las entregadas, qué porcentaje quedó subida dentro del plazo (0 a 100). */
  dentroDelPlazoPct: number | null;
}

export interface ResumenPruebas {
  pendientes: PruebaPendiente[];
  porRepartidor: FilaRepartidor[];
  verificacionesPendientes: number;
}

export const PLAZO_SUBIDA_POR_DEFECTO_MIN = 10;

/** Motivos que puede dar el repartidor cuando no pudo subir la prueba en el momento. */
export const MOTIVOS_SIN_SUBIR = ["Sin señal", "El programa del courier no funciona", "No pude abrir el programa", "Otro motivo"] as const;

/** Minutos en que debe estar subida la prueba (COURIER_MINUTOS_SUBIDA). */
export function plazoSubidaMin(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.COURIER_MINUTOS_SUBIDA);
  return Number.isFinite(n) && n > 0 ? n : PLAZO_SUBIDA_POR_DEFECTO_MIN;
}

/** Si la ruta se bloquea mientras haya una prueba atrasada (COURIER_BLOQUEAR_RUTA=false lo apaga). */
export function bloquearRuta(env: Record<string, string | undefined> = process.env): boolean {
  return env.COURIER_BLOQUEAR_RUTA?.trim().toLowerCase() !== "false";
}

const minutosEntre = (desde: string, hasta: Date) => Math.max(0, Math.floor((hasta.getTime() - new Date(desde).getTime()) / 60_000));

export function pruebasPendientes(filas: EntregaFila[], ahora: Date, plazoMin: number): PruebaPendiente[] {
  return filas
    .filter((f) => f.resultado === "entregado" && !f.cargado)
    .map<PruebaPendiente>((f) => {
      const minutos = minutosEntre(f.creadoEn, ahora);
      return {
        id: f.id,
        repartidor: f.repartidor,
        nombre: f.nombre,
        guia: f.guia,
        minutos,
        nivel: minutos < plazoMin ? "ok" : minutos < plazoMin * 3 ? "tarde" : "critico",
        motivoSinSubir: f.motivoSinSubir,
      };
    })
    .sort((a, b) => b.minutos - a.minutos);
}

/**
 * La prueba que frena al repartidor: la más atrasada que ya pasó el plazo y para la que no dijo un motivo
 * ("sin señal", "courier caído"…). Con un motivo registrado deja de bloquear, pero la oficina lo ve.
 */
export function pruebaQueBloquea(pendientes: PruebaPendiente[], plazoMin: number): PruebaPendiente | null {
  return pendientes.find((p) => p.minutos >= plazoMin && !p.motivoSinSubir) ?? null;
}

/**
 * @param filas Entregas de hoy (para las estadísticas por repartidor) y todas las que siguen sin subir.
 * @param inicioHoy ISO del comienzo del día en RD.
 */
export function resumirPruebas(filas: EntregaFila[], ahora: Date, plazoMin: number, inicioHoy: string): ResumenPruebas {
  const hoy = filas.filter((f) => f.creadoEn >= inicioHoy);
  const nombres = [...new Set(hoy.map((f) => f.repartidor).filter((n): n is string => !!n))];

  const porRepartidor = nombres
    .map<FilaRepartidor>((nombre) => {
      const suyas = hoy.filter((f) => f.repartidor === nombre);
      const entregadas = suyas.filter((f) => f.resultado === "entregado");
      const subidas = entregadas.filter((f) => f.cargado && f.subidoEn);
      const demoras = subidas.map((f) => minutosEntre(f.creadoEn, new Date(f.subidoEn!)));
      return {
        nombre,
        entregadas: entregadas.length,
        fallidas: suyas.filter((f) => f.resultado === "intento_fallido").length,
        sinSubir: entregadas.filter((f) => !f.cargado).length,
        demoraPromedioMin: demoras.length ? Math.round(demoras.reduce((t, m) => t + m, 0) / demoras.length) : null,
        dentroDelPlazoPct: entregadas.length ? Math.round((demoras.filter((m) => m <= plazoMin).length / entregadas.length) * 100) : null,
      };
    })
    .sort((a, b) => b.entregadas - a.entregadas || a.nombre.localeCompare(b.nombre));

  return {
    pendientes: pruebasPendientes(filas, ahora, plazoMin),
    porRepartidor,
    verificacionesPendientes: filas.filter((f) => f.resultado === "entregado" && f.verificacion === "pendiente").length,
  };
}
