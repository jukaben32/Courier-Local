// Bloque "Hoy" del Resumen: cómo va el día, de un vistazo. Función pura (sin base de datos).

export interface PaqueteHoy {
  id: string;
  estado: string;
  /** ISO. */
  fechaRecibido: string;
  /** "YYYY-MM-DD" si el cliente pidió otro día; null = hoy. */
  diaEntrega: string | null;
  tieneUbicacion: boolean;
  repartidor: string | null;
}

export interface EntregaHoy {
  repartidor: string | null;
  resultado: string;
}

export interface MensajeHoy {
  telefono: string | null;
  direccion: string;
}

export interface FilaRepartidorHoy {
  nombre: string;
  /** Paquetes que tiene por entregar. */
  asignados: number;
  confirmados: number;
  conUbicacion: number;
  sinRespuesta: number;
  entregadosHoy: number;
}

export interface ResumenHoy {
  embudo: {
    llegaron: number;
    porAvisar: number;
    esperando: number;
    confirmados: number;
    conUbicacion: number;
    paraManana: number;
    respondieron: number;
    entregados: number;
  };
  repartidores: FilaRepartidorHoy[];
}

/** Estados en que el paquete todavía está por entregar. */
export const ESTADOS_POR_ENTREGAR = ["recibido", "notificado", "confirmado", "en_ruta", "intento_fallido", "retiro_oficina"];

export function resumirHoy(entrada: {
  paquetes: PaqueteHoy[];
  entregas: EntregaHoy[];
  mensajes: MensajeHoy[];
  /** "YYYY-MM-DD" de hoy en RD. */
  hoy: string;
  /** ISO del inicio del día en RD. */
  inicioHoy: string;
}): ResumenHoy {
  const { entregas, mensajes, hoy, inicioHoy } = entrada;
  // Un paquete puede llegar de dos consultas (por entregar y recibidos hoy): se cuenta una sola vez
  const paquetes = [...new Map(entrada.paquetes.map((p) => [p.id, p])).values()];
  const porEntregar = paquetes.filter((p) => ESTADOS_POR_ENTREGAR.includes(p.estado));
  const esDeHoy = (p: PaqueteHoy) => !p.diaEntrega || p.diaEntrega <= hoy;
  const confirmadosHoy = porEntregar.filter((p) => p.estado === "confirmado" && esDeHoy(p));
  const entregadas = entregas.filter((e) => e.resultado === "entregado");

  const respondieron = new Set(mensajes.filter((m) => m.direccion === "entrante" && m.telefono).map((m) => m.telefono));

  const nombres = new Set<string>();
  for (const p of porEntregar) if (p.repartidor) nombres.add(p.repartidor);
  for (const e of entregadas) if (e.repartidor) nombres.add(e.repartidor);
  const repartidores = [...nombres]
    .map<FilaRepartidorHoy>((nombre) => {
      const suyos = porEntregar.filter((p) => p.repartidor === nombre);
      const confirmados = suyos.filter((p) => p.estado === "confirmado" && esDeHoy(p));
      return {
        nombre,
        asignados: suyos.length,
        confirmados: confirmados.length,
        conUbicacion: confirmados.filter((p) => p.tieneUbicacion).length,
        sinRespuesta: suyos.filter((p) => p.estado === "recibido" || p.estado === "notificado").length,
        entregadosHoy: entregadas.filter((e) => e.repartidor === nombre).length,
      };
    })
    .sort((a, b) => b.asignados - a.asignados || a.nombre.localeCompare(b.nombre));

  return {
    embudo: {
      llegaron: paquetes.filter((p) => p.fechaRecibido >= inicioHoy).length,
      porAvisar: porEntregar.filter((p) => p.estado === "recibido").length,
      esperando: porEntregar.filter((p) => p.estado === "notificado").length,
      confirmados: confirmadosHoy.length,
      conUbicacion: confirmadosHoy.filter((p) => p.tieneUbicacion).length,
      paraManana: porEntregar.filter((p) => p.estado === "confirmado" && !esDeHoy(p)).length,
      respondieron: respondieron.size,
      entregados: entregadas.length,
    },
    repartidores,
  };
}
