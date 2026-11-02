export type ResultadoEscaneo = "ok" | "sin_repartidor" | "duplicado" | "desconocido";

/** Lo que escribe el lector puede traer espacios, saltos de línea o minúsculas. */
export function normalizarCodigo(crudo: string): string {
  return crudo.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export interface PaqueteEscaneable {
  repartidor_asignado_id: string | null;
  escaneado_en: string | null;
}

/** Qué le dice la pantalla al que escanea: verde, amarillo (revisar) o rojo (ya estaba). */
export function clasificarEscaneo(paquete: PaqueteEscaneable | null): ResultadoEscaneo {
  if (!paquete) return "desconocido";
  if (paquete.escaneado_en) return "duplicado";
  if (!paquete.repartidor_asignado_id) return "sin_repartidor";
  return "ok";
}
