import { describe, expect, it } from "vitest";
import {
  diaDeRD,
  diasHasta,
  esPeriodoValido,
  etiquetaFecha,
  etiquetaPeriodo,
  fechaDePago,
  finDelPeriodo,
  limitesPeriodo,
  periodoAnterior,
  periodoDe,
  periodoSiguiente,
} from "../periodoPago";

// Cortes el 9 y el 24: el período 25→9 se paga el 10 y el período 10→24 se paga el 25.
describe("periodoDe", () => {
  it("ubica cada fecha en su período según el día de calendario en RD", () => {
    expect(periodoDe(new Date("2026-10-15T16:00:00Z"))).toBe("2026-10-10");
    expect(periodoDe(new Date("2026-10-10T04:30:00Z"))).toBe("2026-10-10"); // 00:30 del 10 en RD
    expect(periodoDe(new Date("2026-10-25T03:30:00Z"))).toBe("2026-10-10"); // 23:30 del 24 en RD (ya es 25 en UTC)
    expect(periodoDe(new Date("2026-10-25T04:30:00Z"))).toBe("2026-10-25"); // 00:30 del 25 en RD
    expect(periodoDe(new Date("2026-10-31T16:00:00Z"))).toBe("2026-10-25");
    expect(periodoDe(new Date("2026-11-09T20:00:00Z"))).toBe("2026-10-25"); // el 9 todavía es del período anterior
    expect(periodoDe(new Date("2026-11-10T04:30:00Z"))).toBe("2026-11-10");
  });

  it("los primeros días del año pertenecen al período que empezó en diciembre", () => {
    expect(periodoDe(new Date("2026-01-05T16:00:00Z"))).toBe("2025-12-25");
  });
});

describe("finDelPeriodo y fechaDePago", () => {
  it("el período del 10 termina el 24 y se paga el 25", () => {
    expect(finDelPeriodo("2026-10-10")).toBe("2026-10-24");
    expect(fechaDePago("2026-10-10")).toBe("2026-10-25");
  });

  it("el período del 25 termina el 9 del mes siguiente y se paga el 10", () => {
    expect(finDelPeriodo("2026-10-25")).toBe("2026-11-09");
    expect(fechaDePago("2026-10-25")).toBe("2026-11-10");
    expect(finDelPeriodo("2025-12-25")).toBe("2026-01-09");
    expect(fechaDePago("2025-12-25")).toBe("2026-01-10");
  });
});

describe("periodoAnterior y periodoSiguiente", () => {
  it("avanzan y retroceden cruzando meses y años", () => {
    expect(periodoAnterior("2026-10-10")).toBe("2026-09-25");
    expect(periodoAnterior("2026-10-25")).toBe("2026-10-10");
    expect(periodoAnterior("2026-01-10")).toBe("2025-12-25");
    expect(periodoSiguiente("2026-10-10")).toBe("2026-10-25");
    expect(periodoSiguiente("2026-10-25")).toBe("2026-11-10");
    expect(periodoSiguiente("2026-12-25")).toBe("2027-01-10");
  });
});

describe("limitesPeriodo", () => {
  it("da el momento exacto de inicio y el inicio del período siguiente (hora de RD = UTC-4)", () => {
    expect(limitesPeriodo("2026-10-10")).toEqual({ desde: "2026-10-10T04:00:00.000Z", hasta: "2026-10-25T04:00:00.000Z" });
    expect(limitesPeriodo("2026-10-25")).toEqual({ desde: "2026-10-25T04:00:00.000Z", hasta: "2026-11-10T04:00:00.000Z" });
  });
});

describe("validación y etiquetas", () => {
  it("solo acepta inicios de período (día 10 o 25)", () => {
    expect(esPeriodoValido("2026-10-10")).toBe(true);
    expect(esPeriodoValido("2026-10-25")).toBe(true);
    expect(esPeriodoValido("2026-10-01")).toBe(false);
    expect(esPeriodoValido("2026-10-16")).toBe(false);
    expect(esPeriodoValido("hola")).toBe(false);
    expect(esPeriodoValido(undefined)).toBe(false);
  });

  it("escribe el período en español", () => {
    expect(etiquetaPeriodo("2026-10-10")).toBe("10 al 24 de octubre de 2026");
    expect(etiquetaPeriodo("2026-09-25")).toBe("25 de septiembre al 9 de octubre de 2026");
    expect(etiquetaPeriodo("2025-12-25")).toBe("25 de diciembre de 2025 al 9 de enero de 2026");
    expect(etiquetaFecha("2026-10-25")).toBe("25 de octubre");
  });
});

describe("diaDeRD y diasHasta", () => {
  it("usa el día de calendario de RD y cuenta los días hasta el pago", () => {
    expect(diaDeRD(new Date("2026-10-10T03:00:00Z"))).toBe("2026-10-09"); // 11 pm del 9 en RD
    expect(diasHasta("2026-10-15", "2026-10-25")).toBe(10);
    expect(diasHasta("2026-10-25", "2026-10-25")).toBe(0);
    expect(diasHasta("2026-10-28", "2026-11-10")).toBe(13);
  });
});
