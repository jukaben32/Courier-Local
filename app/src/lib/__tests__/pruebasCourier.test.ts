import { describe, expect, it } from "vitest";
import { bloquearRuta, plazoSubidaMin, pruebaQueBloquea, pruebasPendientes, resumirPruebas, type EntregaFila } from "../pruebasCourier";

const AHORA = new Date("2026-10-31T18:00:00Z");
const INICIO_HOY = "2026-10-31T04:00:00.000Z";
const hace = (minutos: number) => new Date(AHORA.getTime() - minutos * 60_000).toISOString();

let n = 0;
const entrega = (extra: Partial<EntregaFila> = {}): EntregaFila => ({
  id: `e${++n}`,
  resultado: "entregado",
  creadoEn: hace(5),
  subidoEn: null,
  cargado: false,
  repartidor: "Ana",
  nombre: "Cliente",
  guia: "G1",
  verificacion: "verificada",
  motivoSinSubir: null,
  ...extra,
});

describe("configuración", () => {
  it("el plazo por defecto es de 10 minutos y se puede cambiar", () => {
    expect(plazoSubidaMin({})).toBe(10);
    expect(plazoSubidaMin({ COURIER_MINUTOS_SUBIDA: "15" })).toBe(15);
    expect(plazoSubidaMin({ COURIER_MINUTOS_SUBIDA: "abc" })).toBe(10);
  });

  it("la ruta se bloquea por defecto y se puede apagar", () => {
    expect(bloquearRuta({})).toBe(true);
    expect(bloquearRuta({ COURIER_BLOQUEAR_RUTA: "false" })).toBe(false);
  });
});

describe("pruebasPendientes", () => {
  it("lista solo las entregadas sin subir, la más atrasada primero, con su nivel", () => {
    const r = pruebasPendientes(
      [entrega({ creadoEn: hace(4) }), entrega({ creadoEn: hace(20) }), entrega({ creadoEn: hace(45) }), entrega({ cargado: true }), entrega({ resultado: "intento_fallido" })],
      AHORA,
      10
    );
    expect(r.map((p) => [p.minutos, p.nivel])).toEqual([[45, "critico"], [20, "tarde"], [4, "ok"]]);
  });
});

describe("pruebaQueBloquea", () => {
  const pendientes = (filas: EntregaFila[]) => pruebasPendientes(filas, AHORA, 10);

  it("bloquea la más atrasada que ya pasó el plazo", () => {
    expect(pruebaQueBloquea(pendientes([entrega({ creadoEn: hace(12), nombre: "Luis" }), entrega({ creadoEn: hace(30), nombre: "Ana" })]), 10)?.nombre).toBe("Ana");
  });

  it("no bloquea dentro del plazo", () => {
    expect(pruebaQueBloquea(pendientes([entrega({ creadoEn: hace(9) })]), 10)).toBeNull();
  });

  it("con un motivo registrado ya no bloquea (pero la oficina lo ve)", () => {
    const filas = [entrega({ creadoEn: hace(30), motivoSinSubir: "Sin señal" })];
    expect(pruebaQueBloquea(pendientes(filas), 10)).toBeNull();
    expect(pendientes(filas)[0].motivoSinSubir).toBe("Sin señal");
  });
});

describe("resumirPruebas", () => {
  it("estadísticas del día por repartidor: demora, plazo y lo que falta", () => {
    const r = resumirPruebas(
      [
        entrega({ repartidor: "Ana", creadoEn: hace(120), cargado: true, subidoEn: hace(115) }), // 5 min
        entrega({ repartidor: "Ana", creadoEn: hace(100), cargado: true, subidoEn: hace(70) }), // 30 min
        entrega({ repartidor: "Ana", creadoEn: hace(15) }), // sin subir
        entrega({ repartidor: "Ana", resultado: "intento_fallido" }),
        entrega({ repartidor: "Luis", creadoEn: hace(60), cargado: true, subidoEn: hace(58) }), // 2 min
        entrega({ repartidor: "Luis", creadoEn: "2026-10-30T15:00:00.000Z" }), // de ayer: no cuenta en las estadísticas de hoy
      ],
      AHORA,
      10,
      INICIO_HOY
    );
    expect(r.porRepartidor).toEqual([
      { nombre: "Ana", entregadas: 3, fallidas: 1, sinSubir: 1, demoraPromedioMin: 18, dentroDelPlazoPct: 33 },
      { nombre: "Luis", entregadas: 1, fallidas: 0, sinSubir: 0, demoraPromedioMin: 2, dentroDelPlazoPct: 100 },
    ]);
    // La de ayer sigue sin subir y se ve en la lista de pendientes
    expect(r.pendientes).toHaveLength(2);
  });

  it("cuenta las entregas pendientes de verificar", () => {
    const r = resumirPruebas([entrega({ verificacion: "pendiente" }), entrega()], AHORA, 10, INICIO_HOY);
    expect(r.verificacionesPendientes).toBe(1);
  });
});
