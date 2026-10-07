import type { Almacen, EntregaEnCola } from "./colaOffline";

const NOMBRE_BD = "courier-local";
const TIENDA = "entregas-pendientes";

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolver, rechazar) => {
    const solicitud = indexedDB.open(NOMBRE_BD, 1);
    solicitud.onupgradeneeded = () => solicitud.result.createObjectStore(TIENDA, { keyPath: "id" });
    solicitud.onsuccess = () => resolver(solicitud.result);
    solicitud.onerror = () => rechazar(solicitud.error);
  });
}

async function operar<T>(modo: IDBTransactionMode, accion: (tienda: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const bd = await abrir();
  return new Promise<T>((resolver, rechazar) => {
    const solicitud = accion(bd.transaction(TIENDA, modo).objectStore(TIENDA));
    solicitud.onsuccess = () => resolver(solicitud.result);
    solicitud.onerror = () => rechazar(solicitud.error);
  });
}

/** Cola guardada en el teléfono (IndexedDB): sobrevive si se cierra la app o se apaga el celular. */
export const almacenLocal: Almacen = {
  listar: () => operar("readonly", (t) => t.getAll() as IDBRequest<EntregaEnCola[]>),
  guardar: async (entrega) => {
    await operar("readwrite", (t) => t.put(entrega));
  },
  borrar: async (id) => {
    await operar("readwrite", (t) => t.delete(id));
  },
};
