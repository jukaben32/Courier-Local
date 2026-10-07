// Prefijos válidos de celular/línea en República Dominicana
const PREFIJOS_RD = ["809", "829", "849"];

/**
 * Convierte cualquier forma de escribir un teléfono dominicano ("(829) 555-0123",
 * "+1 829 555 0123", "18295550123") a 10 dígitos sin símbolos: "8295550123".
 * Devuelve null si no es un número válido de RD.
 */
export function normalizarTelefonoRD(entrada: string): string | null {
  let digitos = entrada.replace(/\D/g, "");
  if (digitos.length === 11 && digitos.startsWith("1")) digitos = digitos.slice(1);
  if (digitos.length !== 10) return null;
  if (!PREFIJOS_RD.includes(digitos.slice(0, 3))) return null;
  return digitos;
}

/** "8295550123" -> "829-555-0123" (para mostrar en pantalla). */
export function formatearTelefono(digitos: string): string {
  return `${digitos.slice(0, 3)}-${digitos.slice(3, 6)}-${digitos.slice(6)}`;
}

/** Número en el formato que pide WhatsApp Cloud API: código de país sin "+". */
export function telefonoParaWhatsApp(digitos: string): string {
  return `1${digitos}`;
}
