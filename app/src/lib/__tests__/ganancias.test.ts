import { describe, expect, it } from "vitest";
import { pagoDelPeriodo, resumenPagos, type EntregaPagable, type PaqueteAsignado, type RepartidorBase } from "../ganancias";

// 15 de octubre de 2026, 12:00 en RD: el período en curso es el del 10 (se paga el 25)
const AHORA = new Date("2026-10-15T16:00:00Z");

const ana: RepartidorBase = { id: "a", nombre: "Ana", rol: "repartidor" };
const luis: RepartidorBase = { id: "l", nombre: "Luis", rol: "repartidor" };

const entrega = (extra: Partial<EntregaPagable> = {}): EntregaPagable => ({
  repartidorId: "a",
  creadoEn: "2026-10-15T14:00:00Z",
  tarifa: 40,
  cargadoEnCourier: true,
  ...extra,
});

describe("resumenPagos", () => {
  it("identifica el período en curso, el anterior y sus días de pago", () => {
    const r = resumenPagos({ repartidores: [], entregas: [], paquetes: [] }, AHORA);
    expect(r.periodoActual).toEqual({ inicio: "2026-10-10", fin: "2026-10-24", pago: "2026-10-25" });
    expect(r.periodoAnterior).toEqual({ inicio: "2026-09-25", fin: "2026-10-09", pago: "2026-10-10" });
  });

  it("suma lo ganado hoy, en el período en curso y en el anterior; lo de más atrás no cuenta", () => {
    const r = resumenPagos(
      {
        repartidores: [ana],
        entregas: [
          entrega({ creadoEn: "2026-10-15T14:00:00Z", tarifa: 40 }), // hoy
          entrega({ creadoEn: "2026-10-12T14:00:00Z", tarifa: 55 }), // período en curso
          entrega({ creadoEn: "2026-10-05T14:00:00Z", tarifa: 40 }), // período anterior
          entrega({ creadoEn: "2026-09-20T14:00:00Z", tarifa: 40 }), // más viejo: no cuenta
        ],
        paquetes: [],
      },
      AHORA
    );
    expect(r.repartidores[0]).toMatchObject({
      hoy: { entregas: 1, ganado: 40 },
      periodoActual: { entregas: 2, ganado: 95 },
      periodoAnterior: { entregas: 1, ganado: 40 },
    });
  });

  it("una entrega sin tarifa cuenta como entrega pero no suma dinero", () => {
    const r = resumenPagos({ repartidores: [ana], entregas: [entrega({ tarifa: null })], paquetes: [] }, AHORA);
    expect(r.repartidores[0].hoy).toEqual({ entregas: 1, ganado: 0 });
  });

  it("el corte es a medianoche de RD: lo entregado el 24 a las 11:30 pm es del período en curso", () => {
    const tarde = new Date("2026-10-24T20:00:00Z"); // 4 pm del 24 en RD
    const r = resumenPagos(
      {
        repartidores: [ana],
        entregas: [entrega({ creadoEn: "2026-10-25T03:30:00Z" })], // 11:30 pm del 24 en RD
        paquetes: [],
      },
      tarde
    );
    expect(r.repartidores[0].periodoActual.entregas).toBe(1);
  });

  it("incluye a quien no ha entregado nada, con ceros, y ordena por entregas del período", () => {
    const r = resumenPagos(
      { repartidores: [luis, ana], entregas: [entrega(), entrega({ creadoEn: "2026-10-12T14:00:00Z" })], paquetes: [] },
      AHORA
    );
    expect(r.repartidores.map((x) => x.nombre)).toEqual(["Ana", "Luis"]);
    expect(r.repartidores[1].periodoActual).toEqual({ entregas: 0, ganado: 0 });
  });

  it("cuenta pruebas sin subir, paquetes por entregar y vencidos de cada uno", () => {
    const paquetes: PaqueteAsignado[] = [
      { repartidorId: "a", fechaRecibido: "2026-10-15T14:00:00Z" }, // hoy: verde
      { repartidorId: "a", fechaRecibido: "2026-10-12T14:00:00Z" }, // hace 3 días: vencido
      { repartidorId: "l", fechaRecibido: "2026-10-15T14:00:00Z" },
    ];
    const r = resumenPagos(
      { repartidores: [ana, luis], entregas: [entrega({ cargadoEnCourier: false }), entrega({ cargadoEnCourier: true })], paquetes },
      AHORA
    );
    const a = r.repartidores.find((x) => x.nombre === "Ana")!;
    expect(a).toMatchObject({ sinSubir: 1, porEntregar: 2, vencidos: 1 });
    expect(r.repartidores.find((x) => x.nombre === "Luis")).toMatchObject({ sinSubir: 0, porEntregar: 1, vencidos: 0 });
  });

  it("calcula los totales de todos los repartidores", () => {
    const r = resumenPagos(
      {
        repartidores: [ana, luis],
        entregas: [entrega({ tarifa: 40 }), entrega({ repartidorId: "l", tarifa: 55 })],
        paquetes: [],
      },
      AHORA
    );
    expect(r.totales.hoy).toEqual({ entregas: 2, ganado: 95 });
    expect(r.totales.periodoActual).toEqual({ entregas: 2, ganado: 95 });
    expect(r.totales.periodoAnterior).toEqual({ entregas: 0, ganado: 0 });
  });
});

describe("pagoDelPeriodo", () => {
  it("suma solo lo entregado dentro del período pedido y deja fuera a quien no entregó nada", () => {
    const r = pagoDelPeriodo(
      {
        repartidores: [ana, luis],
        entregas: [
          entrega({ creadoEn: "2026-10-10T14:00:00Z", tarifa: 40 }), // primer día del período del 10
          entrega({ creadoEn: "2026-10-24T14:00:00Z", tarifa: 55 }), // último día
          entrega({ creadoEn: "2026-10-25T14:00:00Z", tarifa: 40 }), // ya es el período siguiente
          entrega({ creadoEn: "2026-10-09T14:00:00Z", tarifa: 40 }), // período anterior
        ],
      },
      "2026-10-10"
    );
    expect(r.periodo).toEqual({ inicio: "2026-10-10", fin: "2026-10-24", pago: "2026-10-25" });
    expect(r.filas).toEqual([{ id: "a", nombre: "Ana", entregas: 2, ganado: 95 }]);
    expect(r.total).toEqual({ entregas: 2, ganado: 95 });
  });
});
