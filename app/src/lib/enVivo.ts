// Pantalla "En vivo": junta los mensajes de WhatsApp del día por cliente y dice en qué va cada uno.
// Función pura (sin base de datos) para poder probarla.

export interface MensajeDelDia {
  id: string;
  telefono: string;
  direccion: "entrante" | "saliente";
  tipo: string;
  estado: string;
  contenido: string | null;
  creado_en: string;
  /** En fotos y videos del cliente: "chatId|messageId" para verlos. */
  proveedor_id: string | null;
}

export interface PaqueteDelCliente {
  telefono: string;
  numero_guia: string;
  nombre_etiqueta: string;
  estado: string;
  ventana_horaria: string | null;
  hora_preferida: string | null;
  tiene_ubicacion: boolean;
  sector: string | null;
}

export type EstadoConversacion = "atencion" | "confirmado" | "respondio" | "esperando" | "fallido";

export interface FilaEnVivo {
  telefono: string;
  nombre: string;
  guias: string[];
  sector: string | null;
  estado: EstadoConversacion;
  /** Estado del aviso en el teléfono del cliente: enviado, entregado, leido o fallido. */
  aviso: string | null;
  /** Horario elegido, para mostrar ("1:00 pm", "Mediodía (12:00 - 3:00)"). */
  eligio: string | null;
  ubicacion: boolean;
  /** Fotos o videos que mandó el cliente (de su casa, normalmente). */
  fotos: number;
  ultimoDelCliente: { texto: string; hora: string } | null;
  ultimaActividad: string;
  mensajes: MensajeDelDia[];
}

/** Segundos que se espera la respuesta automática antes de marcar "necesita atención". */
export const ESPERA_RESPUESTA_S = 60;

const ORDEN_AVISO = ["enviado", "entregado", "leido"];

/** Foto o video del cliente que se puede abrir desde la app. */
export function esArchivoVisible(m: MensajeDelDia): boolean {
  return m.direccion === "entrante" && (m.contenido === "[foto]" || m.contenido === "[video]") && !!m.proveedor_id?.includes("|");
}

/** "13:00:00" -> "1:00 pm" */
export function horaLegible(hora: string): string {
  const [h, m] = hora.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

export function resumirConversaciones(
  mensajes: MensajeDelDia[],
  paquetes: PaqueteDelCliente[],
  franjas: Record<string, string>,
  ahora: Date
): FilaEnVivo[] {
  const porTelefono = new Map<string, MensajeDelDia[]>();
  for (const m of [...mensajes].sort((a, b) => a.creado_en.localeCompare(b.creado_en))) {
    porTelefono.set(m.telefono, [...(porTelefono.get(m.telefono) ?? []), m]);
  }

  const filas: FilaEnVivo[] = [];
  for (const [telefono, suyos] of porTelefono) {
    const deEl = paquetes.filter((p) => p.telefono === telefono);
    const entrantes = suyos.filter((m) => m.direccion === "entrante");
    const salientes = suyos.filter((m) => m.direccion === "saliente");
    const ultimoEntrante = entrantes.at(-1);
    const ultimoSaliente = salientes.at(-1);

    const avisos = salientes.filter((m) => m.tipo === "aviso" || m.tipo === "recordatorio");
    const aviso = avisos.length === 0
      ? null
      : avisos.some((m) => m.estado === "fallido") && !avisos.some((m) => m.estado !== "fallido")
        ? "fallido"
        : avisos.map((m) => m.estado).reduce((a, b) => (ORDEN_AVISO.indexOf(b) > ORDEN_AVISO.indexOf(a) ? b : a));

    // El cliente escribió después de nuestra última respuesta y el sistema no le contestó
    const sinContestar =
      ultimoEntrante !== undefined &&
      (!ultimoSaliente || ultimoEntrante.creado_en > ultimoSaliente.creado_en) &&
      ahora.getTime() - new Date(ultimoEntrante.creado_en).getTime() > ESPERA_RESPUESTA_S * 1000;

    const confirmado = deEl.find((p) => p.estado === "confirmado" || p.estado === "en_ruta" || p.estado === "entregado");
    const estado: EstadoConversacion = sinContestar
      ? "atencion"
      : confirmado
        ? "confirmado"
        : entrantes.length > 0
          ? "respondio"
          : aviso === "fallido"
            ? "fallido"
            : "esperando";

    const conHorario = deEl.find((p) => p.hora_preferida || p.ventana_horaria);
    const eligio = conHorario?.hora_preferida
      ? horaLegible(conHorario.hora_preferida)
      : conHorario?.ventana_horaria
        ? (franjas[conHorario.ventana_horaria] ?? conHorario.ventana_horaria)
        : null;

    filas.push({
      telefono,
      nombre: deEl[0]?.nombre_etiqueta ?? telefono,
      guias: deEl.map((p) => p.numero_guia),
      sector: deEl[0]?.sector ?? null,
      estado,
      aviso,
      eligio,
      ubicacion: deEl.some((p) => p.tiene_ubicacion),
      fotos: entrantes.filter((m) => esArchivoVisible(m)).length,
      ultimoDelCliente: ultimoEntrante ? { texto: ultimoEntrante.contenido || "—", hora: ultimoEntrante.creado_en } : null,
      ultimaActividad: suyos.at(-1)!.creado_en,
      mensajes: suyos,
    });
  }

  // Primero lo que hay que atender; después lo más reciente
  return filas.sort(
    (a, b) => Number(b.estado === "atencion") - Number(a.estado === "atencion") || b.ultimaActividad.localeCompare(a.ultimaActividad)
  );
}
