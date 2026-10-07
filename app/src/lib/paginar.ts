const FILAS_POR_PAGINA = 1000; // la base entrega como máximo 1000 filas por consulta

type Pagina = PromiseLike<{ data: unknown[] | null; error: unknown }>;

/** Lee todas las páginas de una consulta (la base corta cada consulta en 1000 filas). */
export async function leerTodo<T>(pedir: (desde: number, hasta: number) => Pagina): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += FILAS_POR_PAGINA) {
    const { data, error } = await pedir(desde, desde + FILAS_POR_PAGINA - 1);
    if (error) throw new Error("No se pudieron leer los datos.");
    // Sin tipos generados de la base, quien llama declara el tipo de las filas
    filas.push(...((data ?? []) as T[]));
    if ((data ?? []).length < FILAS_POR_PAGINA) return filas;
  }
}
