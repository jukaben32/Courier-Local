const ZONA_HORARIA = "America/Santo_Domingo";

export interface EntregaDelDia {
  repartidorId: string;
  repartidor: string;
  /** Momento de la entrega (ISO). */
  creadoEn: string;
  /** Momento en que se subió la prueba al programa del courier (ISO), o null si falta. */
  subidoEnCourierEn: string | null;
}

export interface PendienteDeSubir {
  repartidor: string;
  cantidad: number;
  /** Minutos que lleva sin subir la entrega más antigua. */
  minutosMasAntigua: number;
}

export interface ResumenDelDia {
  entregadas: number;
  /** Hora local de RD de la última entrega ("17:42") o null si no hay ninguna. */
  ultimaEntrega: string | null;
  porHora: { hora: number; cantidad: number }[];
  sinSubir: PendienteDeSubir[];
  /** Demora promedio, en minutos, entre entregar y subir al courier (solo las ya subidas). */
  demoraPromedioSubida: number | null;
}

function horaLocal(iso: string): { hora: number; texto: string } {
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONA_HORARIA,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date(iso))
    .split(":");
  return { hora: Number(partes[0]), texto: `${partes[0]}:${partes[1]}` };
}

const minutosEntre = (desde: string, hasta: Date | string) =>
  Math.max(0, Math.round((new Date(hasta).getTime() - new Date(desde).getTime()) / 60000));

/**
 * Resumen del día para el dueño: cómo va el cierre y quién tiene pruebas sin subir al courier.
 * Terminar temprano (y subir las pruebas a tiempo) es lo que hace que el courier mande más paquetes.
 */
export function resumenDelDia(entregas: EntregaDelDia[], ahora: Date = new Date()): ResumenDelDia {
  const ordenadas = [...entregas].sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));

  const porHora = new Map<number, number>();
  for (const e of ordenadas) {
    const { hora } = horaLocal(e.creadoEn);
    porHora.set(hora, (porHora.get(hora) ?? 0) + 1);
  }

  const sinSubirPorPersona = new Map<string, { cantidad: number; antigua: string }>();
  for (const e of ordenadas.filter((x) => x.subidoEnCourierEn === null)) {
    const actual = sinSubirPorPersona.get(e.repartidor);
    sinSubirPorPersona.set(e.repartidor, {
      cantidad: (actual?.cantidad ?? 0) + 1,
      antigua: actual?.antigua ?? e.creadoEn,
    });
  }

  const subidas = ordenadas.filter((e) => e.subidoEnCourierEn !== null);
  const demora = subidas.length
    ? Math.round(subidas.reduce((total, e) => total + minutosEntre(e.creadoEn, e.subidoEnCourierEn!), 0) / subidas.length)
    : null;

  return {
    entregadas: ordenadas.length,
    ultimaEntrega: ordenadas.length ? horaLocal(ordenadas[ordenadas.length - 1].creadoEn).texto : null,
    porHora: [...porHora].sort(([a], [b]) => a - b).map(([hora, cantidad]) => ({ hora, cantidad })),
    sinSubir: [...sinSubirPorPersona]
      .map(([repartidor, d]) => ({
        repartidor,
        cantidad: d.cantidad,
        minutosMasAntigua: minutosEntre(d.antigua, ahora),
      }))
      .sort((a, b) => b.minutosMasAntigua - a.minutosMasAntigua),
    demoraPromedioSubida: demora,
  };
}
