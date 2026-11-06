"use client";

import { marcarMalEncaminado } from "./actions";

/** Marca un paquete que llegó a la oficina equivocada. Pide confirmar porque lo saca de avisos y rutas. */
export function BotonMalEncaminado({ id, guia }: { id: string; guia: string }) {
  return (
    <form
      action={marcarMalEncaminado}
      onSubmit={(e) => {
        if (!window.confirm(`¿El paquete ${guia} llegó por error a esta oficina?\n\nSaldrá de los avisos y de la ruta, y quedará como devuelto para regresarlo al courier.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button className="rounded-md border border-linea px-2 py-1 text-xs text-tinta-2 hover:border-rojo hover:text-rojo">Mal encaminado</button>
    </form>
  );
}
