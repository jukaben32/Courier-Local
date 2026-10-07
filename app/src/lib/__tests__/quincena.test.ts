import { describe, expect, it } from "vitest";
import { desplazarQuincena, esQuincenaValida, etiquetaQuincena, quincenaDe } from "../quincena";

describe("quincenaDe", () => {
  it("usa el día de calendario de RD, no el de UTC", () => {
    expect(quincenaDe(new Date("2026-10-15T20:00:00Z"))).toBe("2026-10-01"); // 16:00 del 15 en RD
    expect(quincenaDe(new Date("2026-10-16T03:00:00Z"))).toBe("2026-10-01"); // 23:00 del 15 en RD (ya es 16 en UTC)
    expect(quincenaDe(new Date("2026-10-16T05:00:00Z"))).toBe("2026-10-16"); // 01:00 del 16 en RD
    expect(quincenaDe(new Date("2026-11-01T02:00:00Z"))).toBe("2026-10-16"); // 22:00 del 31 de octubre en RD
  });
});

describe("desplazarQuincena", () => {
  it("retrocede y avanza cruzando meses y años", () => {
    expect(desplazarQuincena("2026-10-16", 1)).toBe("2026-10-01");
    expect(desplazarQuincena("2026-10-01", 1)).toBe("2026-09-16");
    expect(desplazarQuincena("2026-01-01", 1)).toBe("2025-12-16");
    expect(desplazarQuincena("2026-10-01", -1)).toBe("2026-10-16");
    expect(desplazarQuincena("2026-12-16", -1)).toBe("2027-01-01");
  });
});

describe("validación y etiquetas", () => {
  it("solo acepta inicios de quincena", () => {
    expect(esQuincenaValida("2026-10-01")).toBe(true);
    expect(esQuincenaValida("2026-10-16")).toBe(true);
    expect(esQuincenaValida("2026-10-05")).toBe(false);
    expect(esQuincenaValida("hola")).toBe(false);
    expect(esQuincenaValida(undefined)).toBe(false);
  });

  it("escribe la quincena en español", () => {
    expect(etiquetaQuincena("2026-10-01")).toBe("1 al 15 de octubre de 2026");
    expect(etiquetaQuincena("2026-10-16")).toBe("16 al 31 de octubre de 2026");
    expect(etiquetaQuincena("2026-02-16")).toBe("16 al 28 de febrero de 2026");
  });
});
