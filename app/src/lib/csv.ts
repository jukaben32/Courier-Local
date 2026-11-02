// Convierte filas en un archivo CSV que Excel abre bien (UTF-8 con marca BOM, para que respete tildes y ñ).

export interface Columna {
  /** Nombre de la columna en la fila. */
  clave: string;
  /** Título que se ve en la primera fila del archivo. */
  titulo: string;
}

function celda(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  const texto = typeof valor === "boolean" ? (valor ? "Sí" : "No") : String(valor);
  // Comillas, comas y saltos de línea obligan a encerrar la celda entre comillas
  return /[",\r\n;]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function aCsv(columnas: Columna[], filas: Record<string, unknown>[]): string {
  const encabezado = columnas.map((c) => celda(c.titulo)).join(",");
  const cuerpo = filas.map((f) => columnas.map((c) => celda(f[c.clave])).join(","));
  return `﻿${[encabezado, ...cuerpo].join("\r\n")}\r\n`;
}
