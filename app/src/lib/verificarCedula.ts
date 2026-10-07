import "server-only";
import { nombresCoinciden, validarCedulaRD } from "./cedula";
import { leerCedula } from "./cedulaIA";
import { IaNoConfigurada } from "./etiqueta";

export type Verificacion =
  | { ok: true; numero: string; nombre: string }
  | {
      ok: false;
      status: number;
      codigo: "sin_ia" | "error_ia" | "ilegible" | "no_coincide";
      error: string;
      /** Lo que se alcanzó a leer en la foto (cuando se leyó bien pero no coincide). */
      leida?: { nombre: string; numero: string };
    };

/**
 * Lee la foto de la cédula y comprueba tres cosas: que se lea con claridad, que el número sea válido
 * (dígito verificador) y que el nombre coincida con el de la etiqueta del paquete.
 */
export async function verificarCedulaDelPaquete(
  imagenBase64: string,
  nombreEtiqueta: string,
  quien: "repartidor" | "oficina"
): Promise<Verificacion> {
  let cedula;
  try {
    cedula = await leerCedula(imagenBase64);
  } catch (error) {
    if (error instanceof IaNoConfigurada) {
      return { ok: false, status: 503, codigo: "sin_ia", error: "La lectura de cédulas aún no está activada." };
    }
    return { ok: false, status: 502, codigo: "error_ia", error: "No se pudo leer la cédula. Intenta de nuevo." };
  }

  const numero = cedula.numero ? validarCedulaRD(cedula.numero) : null;
  if (!cedula.legible || !cedula.nombre || !numero) {
    return {
      ok: false,
      status: 422,
      codigo: "ilegible",
      error: "No se lee bien la cédula. Toma la foto de nuevo con buena luz y sin reflejos.",
    };
  }

  if (!nombresCoinciden(nombreEtiqueta, cedula.nombre)) {
    const consejo =
      quien === "repartidor"
        ? "No se puede entregar sin la cédula correcta; pide que la oficina autorice una excepción."
        : "No se puede entregar sin la cédula correcta; registra una excepción con su motivo.";
    return {
      ok: false,
      status: 422,
      codigo: "no_coincide",
      error: `La cédula es de ${cedula.nombre}, pero el paquete es de ${nombreEtiqueta}. ${consejo}`,
      leida: { nombre: cedula.nombre, numero },
    };
  }

  return { ok: true, numero, nombre: cedula.nombre };
}
