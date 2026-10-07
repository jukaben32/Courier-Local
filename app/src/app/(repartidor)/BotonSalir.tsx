"use client";

// Al cerrar sesión se borran las pantallas guardadas para el modo sin señal (tienen datos de clientes)
export function BotonSalir() {
  return (
    <button
      className="rounded-md border border-white/20 px-3 py-1.5"
      onClick={() => {
        void caches?.delete("courier-local-v1");
      }}
    >
      Salir
    </button>
  );
}
