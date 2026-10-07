/** "RD$1,250.00" */
export const pesos = (n: number): string =>
  `RD$${n.toLocaleString("es-DO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "67%" o "—" cuando todavía no hay datos para calcularlo. */
export const porcentaje = (valor: number | null): string => (valor === null ? "—" : `${valor}%`);
