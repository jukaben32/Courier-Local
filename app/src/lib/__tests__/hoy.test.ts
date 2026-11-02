import { describe, expect, it } from "vitest";
import { resumirHoy, type PaqueteHoy } from "../hoy";

const HOY = "2026-10-31";
const INICIO = "2026-10-31T04:00:00.000Z";

let contador = 0;
const paquete = (extra: Partial<PaqueteHoy> = {}): PaqueteHoy => ({
  id: `p${++contador}`,
  estado: "notificado",
  fechaRecibido: "2026-10-31T13:00:00.000Z",
  diaEntrega: null,
  tieneUbicacion: false,
  repartidor: "Ana",
  ...extra,
});

describe("resumirHoy", () => {
  it("cuenta el embudo del día", () => {
    const r = resumirHoy({
      hoy: HOY,
      inicioHoy: INICIO,
      paquetes: [
        paquete({ estado: "recibido" }),
        paquete({ estado: "notificado" }),
        paquete({ estado: "notificado", fechaRecibido: "2026-10-30T13:00:00.000Z" }),
        paquete({ estado: "confirmado", tieneUbicacion: true }),
        paquete({ estado: "confirmado" }),
        paquete({ estado: "confirmado", diaEntrega: "2026-11-01", tieneUbicacion: true }),
        paquete({ estado: "entregado" }),
      ],
      entregas: [{ repartidor: "Ana", resultado: "entregado" }, { repartidor: "Ana", resultado: "fallido" }],
      mensajes: [
        { telefono: "1", direccion: "entrante" },
        { telefono: "1", direccion: "entrante" },
        { telefono: "2", direccion: "entrante" },
        { telefono: "3", direccion: "saliente" },
      ],
    });
    expect(r.embudo).toEqual({
      llegaron: 6,
      porAvisar: 1,
      esperando: 2,
      confirmados: 2,
      conUbicacion: 1,
      paraManana: 1,
      respondieron: 2,
      entregados: 1,
    });
  });

  it("una fila por repartidor con lo que le toca hoy, ordenadas por carga", () => {
    const r = resumirHoy({
      hoy: HOY,
      inicioHoy: INICIO,
      paquetes: [
        paquete({ repartidor: "Luis", estado: "confirmado", tieneUbicacion: true }),
        paquete({ repartidor: "Ana", estado: "confirmado" }),
        paquete({ repartidor: "Ana", estado: "notificado" }),
        paquete({ repartidor: "Ana", estado: "recibido" }),
        paquete({ repartidor: "Ana", estado: "confirmado", diaEntrega: "2026-11-01" }),
      ],
      entregas: [{ repartidor: "Luis", resultado: "entregado" }, { repartidor: "Marta", resultado: "entregado" }],
      mensajes: [],
    });
    expect(r.repartidores).toEqual([
      { nombre: "Ana", asignados: 4, confirmados: 1, conUbicacion: 0, sinRespuesta: 2, entregadosHoy: 0 },
      { nombre: "Luis", asignados: 1, confirmados: 1, conUbicacion: 1, sinRespuesta: 0, entregadosHoy: 1 },
      { nombre: "Marta", asignados: 0, confirmados: 0, conUbicacion: 0, sinRespuesta: 0, entregadosHoy: 1 },
    ]);
  });

  it("un paquete repetido en las dos consultas se cuenta una vez", () => {
    const p = paquete({ estado: "recibido" });
    const r = resumirHoy({ hoy: HOY, inicioHoy: INICIO, paquetes: [p, p], entregas: [], mensajes: [] });
    expect(r.embudo.llegaron).toBe(1);
    expect(r.embudo.porAvisar).toBe(1);
  });

  it("sin datos todo es cero", () => {
    const r = resumirHoy({ hoy: HOY, inicioHoy: INICIO, paquetes: [], entregas: [], mensajes: [] });
    expect(Object.values(r.embudo).every((n) => n === 0)).toBe(true);
    expect(r.repartidores).toEqual([]);
  });
});
