import { describe, expect, it, vi } from "vitest";
import { clasificarRespuesta, sincronizar, type Almacen, type EntregaEnCola, type Enviar, type ResultadoEnvio } from "../colaOffline";

function almacenEnMemoria(inicial: EntregaEnCola[]): Almacen & { datos: Map<string, EntregaEnCola> } {
  const datos = new Map(inicial.map((e) => [e.id, e]));
  return {
    datos,
    listar: async () => [...datos.values()],
    guardar: async (e) => void datos.set(e.id, e),
    borrar: async (id) => void datos.delete(id),
  };
}

const entrega = (id: string, momento: string): EntregaEnCola => ({
  id, paqueteId: `p-${id}`, guia: `G-${id}`, nombre: "Cliente", imagen: "x", origen: "fisica_en_entrega", recibeOtro: false, momento,
});

describe("sincronizar", () => {
  it("envía en orden de entrega y vacía la cola", async () => {
    const almacen = almacenEnMemoria([entrega("b", "2026-10-05T15:00:00Z"), entrega("a", "2026-10-05T14:00:00Z")]);
    const orden: string[] = [];
    const enviar: Enviar = vi.fn(async (e): Promise<ResultadoEnvio> => { orden.push(e.id); return { estado: "ok" }; });

    const r = await sincronizar(almacen, enviar);
    expect(orden).toEqual(["a", "b"]);
    expect(r).toEqual({ enviadas: 2, pendientes: 0, conError: 0 });
    expect(almacen.datos.size).toBe(0);
  });

  it("se detiene sin perder nada cuando sigue sin señal", async () => {
    const almacen = almacenEnMemoria([entrega("a", "2026-10-05T14:00:00Z"), entrega("b", "2026-10-05T15:00:00Z")]);
    const enviar: Enviar = vi.fn(async (): Promise<ResultadoEnvio> => ({ estado: "sin_conexion" }));

    const r = await sincronizar(almacen, enviar);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ enviadas: 0, pendientes: 2, conError: 0 });
    expect(almacen.datos.size).toBe(2);
  });

  it("marca como error la que el servidor rechaza, no la reintenta y sigue con las demás", async () => {
    const almacen = almacenEnMemoria([entrega("a", "2026-10-05T14:00:00Z"), entrega("b", "2026-10-05T15:00:00Z")]);
    const enviar: Enviar = vi.fn(async (e): Promise<ResultadoEnvio> => (e.id === "a" ? { estado: "rechazada", mensaje: "La cédula no coincide" } : { estado: "ok" }));

    const r1 = await sincronizar(almacen, enviar);
    expect(r1).toEqual({ enviadas: 1, pendientes: 0, conError: 1 });
    expect(almacen.datos.get("a")?.error).toBe("La cédula no coincide");

    await sincronizar(almacen, enviar);
    expect(enviar).toHaveBeenCalledTimes(2); // "a" no se vuelve a enviar
  });
});

describe("clasificarRespuesta", () => {
  it("separa lo que se reintenta de lo que necesita revisión", () => {
    expect(clasificarRespuesta(200, undefined)).toEqual({ estado: "ok" });
    expect(clasificarRespuesta(503, undefined)).toEqual({ estado: "sin_conexion" });
    expect(clasificarRespuesta(401, undefined)).toEqual({ estado: "sin_conexion" });
    expect(clasificarRespuesta(422, "No coincide")).toEqual({ estado: "rechazada", mensaje: "No coincide" });
    expect(clasificarRespuesta(404, undefined)).toMatchObject({ estado: "rechazada" });
  });
});
