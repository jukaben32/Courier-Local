/**
 * Valida una cédula dominicana (11 dígitos) con su dígito verificador y la devuelve solo con
 * números; null si no es válida. Sirve para detectar errores cuando la IA lee mal la foto.
 * Algoritmo de la JCE: pesos 1,2,1,2… sobre los 10 primeros dígitos; los productos de dos cifras
 * se suman cifra por cifra; el verificador es lo que falta para llegar a la siguiente decena.
 */
export function validarCedulaRD(entrada: string): string | null {
  const digitos = entrada.replace(/\D/g, "");
  if (digitos.length !== 11) return null;

  let suma = 0;
  for (let i = 0; i < 10; i += 1) {
    const producto = Number(digitos[i]) * (i % 2 === 0 ? 1 : 2);
    suma += producto > 9 ? producto - 9 : producto;
  }
  const verificador = (10 - (suma % 10)) % 10;
  return verificador === Number(digitos[10]) ? digitos : null;
}

/** "02301535932" -> "023-0153593-2" */
export function formatearCedula(digitos: string): string {
  return `${digitos.slice(0, 3)}-${digitos.slice(3, 10)}-${digitos.slice(10)}`;
}

const PALABRAS_SUELTAS = new Set(["de", "del", "la", "las", "los", "y", "e"]);

function palabras(nombre: string): string[] {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length >= 2 && !PALABRAS_SUELTAS.has(p));
}

/**
 * ¿El nombre de la etiqueta y el de la cédula son la misma persona? Ignora tildes, mayúsculas,
 * el orden (la cédula separa nombres y apellidos) y partículas como "de" o "del". Exige que
 * coincidan al menos 2 palabras (o todas, si el nombre más corto tiene menos de 2).
 */
export function nombresCoinciden(etiqueta: string, cedula: string): boolean {
  const a = new Set(palabras(etiqueta));
  const b = new Set(palabras(cedula));
  if (a.size === 0 || b.size === 0) return false;

  let iguales = 0;
  for (const palabra of a) if (b.has(palabra)) iguales += 1;
  return iguales >= Math.min(2, a.size, b.size);
}
