import { describe, expect, it } from "vitest";
import { resumenDelDia, type EntregaDelDia } from "../cierre";
import { formatearCedula, nombresCoinciden, validarCedulaRD } from "../cedula";

describe("validarCedulaRD", () => {
  it("acepta cédulas con dígito verificador correcto, con o sin guiones", () => {
    expect(validarCedulaRD("001-0000001-7")).toBe("00100000017");
    expect(validarCedulaRD("402-0000002-0")).toBe("40200000020");
    expect(validarCedulaRD("00100000033")).toBe("00100000033");
  });

  it("rechaza un dígito mal leído o un largo incorrecto", () => {
    expect(validarCedulaRD("001-0000001-8")).toBeNull();
    expect(validarCedulaRD("001-1000001-7")).toBeNull();
    expect(validarCedulaRD("001-0000001-")).toBeNull();
    expect(validarCedulaRD("")).toBeNull();
  });

  it("formatea para mostrar", () => {
    expect(formatearCedula("00100000017")).toBe("001-0000001-7");
  });
});

describe("nombresCoinciden", () => {
  it("ignora tildes, mayúsculas, orden y partículas", () => {
    expect(nombresCoinciden("MARIA ALTAGRACIA PEREZ", "María Altagracia Pérez Gómez")).toBe(true);
    expect(nombresCoinciden("Perez Gomez Maria", "MARIA ALTAGRACIA PEREZ GOMEZ")).toBe(true);
    expect(nombresCoinciden("Juan de la Cruz", "JUAN CRUZ PEREZ")).toBe(true);
  });

  it("rechaza personas distintas", () => {
    expect(nombresCoinciden("Maria Perez", "Marta Gomez")).toBe(false);
    expect(nombresCoinciden("Maria Perez", "Maria Gomez")).toBe(false);
    expect(nombresCoinciden("", "Maria Perez")).toBe(false);
  });

  it("con una sola palabra legible en la etiqueta basta que coincida esa", () => {
    expect(nombresCoinciden("Juan P.", "JUAN PEREZ")).toBe(true);
  });
});

describe("resumenDelDia", () => {
  // 18:00 UTC = 14:00 en RD
  const e = (repartidor: string, hhUtc: string, subidoUtc: string | null): EntregaDelDia => ({
    repartidorId: repartidor,
    repartidor,
    creadoEn: `2026-10-05T${hhUtc}:00Z`,
    subidoEnCourierEn: subidoUtc ? `2026-10-05T${subidoUtc}:00Z` : null,
  });

  it("cuenta por hora local de RD y da la hora de la última entrega", () => {
    const r = resumenDelDia([e("A", "18:10", "18:20"), e("B", "18:40", "19:00"), e("A", "21:30", null)], new Date("2026-10-05T23:00:00Z"));
    expect(r.entregadas).toBe(3);
    expect(r.porHora).toEqual([{ hora: 14, cantidad: 2 }, { hora: 17, cantidad: 1 }]);
    expect(r.ultimaEntrega).toBe("17:30");
  });

  it("señala quién tiene pruebas sin subir y cuánto lleva esperando", () => {
    const r = resumenDelDia(
      [e("Ana", "18:00", null), e("Ana", "19:00", null), e("Luis", "20:00", null), e("Ana", "17:00", "17:05")],
      new Date("2026-10-05T21:00:00Z")
    );
    expect(r.sinSubir).toEqual([
      { repartidor: "Ana", cantidad: 2, minutosMasAntigua: 180 },
      { repartidor: "Luis", cantidad: 1, minutosMasAntigua: 60 },
    ]);
  });

  it("calcula la demora promedio solo con las ya subidas", () => {
    const r = resumenDelDia([e("A", "18:00", "18:10"), e("A", "18:00", "18:30"), e("A", "19:00", null)], new Date("2026-10-05T20:00:00Z"));
    expect(r.demoraPromedioSubida).toBe(20);
  });

  it("sin entregas devuelve ceros", () => {
    expect(resumenDelDia([])).toEqual({ entregadas: 0, ultimaEntrega: null, porHora: [], sinSubir: [], demoraPromedioSubida: null });
  });
});
