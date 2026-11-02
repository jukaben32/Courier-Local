// Lista "Sin respuesta" de la app del repartidor: los clientes que aún no confirman su hora son del repartidor,
// que los llama o les escribe por su cuenta. Aquí está la lógica pura (sin base de datos) para poder probarla.

export interface MensajeContacto {
  telefono: string;
  direccion: string;
  tipo: string;
  estado: string;
  contenido: string | null;
  creado_en: string;
  proveedor_id: string | null;
}

export type EstadoAviso = "enviado" | "entregado" | "leido" | "fallido";

export interface Contacto {
  /** Cómo va el último aviso que le mandamos; null si todavía no se le ha avisado. */
  aviso: EstadoAviso | null;
  /** Lo último que escribió el cliente (si escribió algo que sirva de pista). */
  ultimoMensaje: string | null;
}

// Palabras clave que el sistema guardaba antes en lugar de lo que el cliente escribió
const CODIGOS_INTERNOS = new Set(["hora", "accion", "rango", "ubicacion", "franja", "texto"]);

const esSimulado = (m: MensajeContacto) => (m.proveedor_id ?? "").startsWith("sim-");

export function resumirContactos(mensajes: MensajeContacto[]): Map<string, Contacto> {
  const porTelefono = new Map<string, MensajeContacto[]>();
  for (const m of [...mensajes].sort((a, b) => a.creado_en.localeCompare(b.creado_en))) {
    if (esSimulado(m)) continue;
    porTelefono.set(m.telefono, [...(porTelefono.get(m.telefono) ?? []), m]);
  }

  const resultado = new Map<string, Contacto>();
  for (const [telefono, suyos] of porTelefono) {
    const avisos = suyos.filter((m) => m.direccion === "saliente" && m.tipo === "aviso");
    const escritos = suyos.filter((m) => m.direccion === "entrante" && m.contenido && !CODIGOS_INTERNOS.has(m.contenido.trim().toLowerCase()));
    resultado.set(telefono, {
      aviso: (avisos.at(-1)?.estado as EstadoAviso | undefined) ?? null,
      ultimoMensaje: escritos.at(-1)?.contenido?.trim().slice(0, 80) ?? null,
    });
  }
  return resultado;
}

/**
 * La lista "Sin respuesta" se abre sola cuando al repartidor le queda un tercio de la ruta o menos, o ninguna
 * parada: es el momento de ponerse a localizar a los que no han contestado. Antes queda plegada, para no distraer.
 */
export function debeAbrirSinRespuesta(paradasRestantes: number, entregadasHoy: number): boolean {
  if (paradasRestantes <= 0) return true;
  // Comparación exacta: lo que queda es un tercio o menos del total (1 de 3 ya cuenta)
  return paradasRestantes * 3 <= paradasRestantes + entregadasHoy;
}

export const MINUTOS_COMO_NUEVO = 30;

/** Una parada es "nueva" si el cliente confirmó hace poco: así el repartidor ve quién acaba de entrar a su ruta. */
export function esParadaNueva(horaConfirmacion: string | null, ahora: Date): boolean {
  if (!horaConfirmacion) return false;
  const minutos = (ahora.getTime() - new Date(horaConfirmacion).getTime()) / 60_000;
  return minutos >= 0 && minutos <= MINUTOS_COMO_NUEVO;
}

/** Los que escribieron algo van primero (hay que atenderlos); después por sector y nombre. */
export function ordenarSinRespuesta<T extends { sector: string; nombre: string; contacto: Contacto | undefined }>(filas: T[]): T[] {
  return [...filas].sort(
    (a, b) =>
      Number(Boolean(b.contacto?.ultimoMensaje)) - Number(Boolean(a.contacto?.ultimoMensaje)) ||
      a.sector.localeCompare(b.sector) ||
      a.nombre.localeCompare(b.nombre)
  );
}
