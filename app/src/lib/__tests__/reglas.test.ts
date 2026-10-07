import { describe, expect, it } from "vitest";
import { elegirRepartidor } from "../asignacion";
import { nivelPlazo } from "../plazo";
import { formatearTelefono, normalizarTelefonoRD, telefonoParaWhatsApp } from "../telefono";

describe("normalizarTelefonoRD", () => {
  it("acepta formatos comunes y devuelve 10 dígitos", () => {
    expect(normalizarTelefonoRD("(829) 555-0123")).toBe("8295550123");
    expect(normalizarTelefonoRD("+1 829 555 0123")).toBe("8295550123");
    expect(normalizarTelefonoRD("18495550123")).toBe("8495550123");
  });

  it("rechaza números que no son de RD o están incompletos", () => {
    expect(normalizarTelefonoRD("829-750-507")).toBeNull();
    expect(normalizarTelefonoRD("305-555-1234")).toBeNull();
    expect(normalizarTelefonoRD("")).toBeNull();
  });

  it("formatea para pantalla y para WhatsApp", () => {
    expect(formatearTelefono("8295550123")).toBe("829-555-0123");
    expect(telefonoParaWhatsApp("8295550123")).toBe("18295550123");
  });
});

describe("nivelPlazo (hora de RD)", () => {
  const recibido = new Date("2026-10-05T16:00:00Z"); // 12:00 del lunes en RD

  it("el mismo día es verde, aunque pasen horas", () => {
    expect(nivelPlazo(recibido, new Date("2026-10-06T03:00:00Z"))).toBe("verde"); // 23:00 del lunes en RD
  });

  it("cuenta por día de calendario de RD, no por 24 horas", () => {
    expect(nivelPlazo(recibido, new Date("2026-10-06T05:00:00Z"))).toBe("amarillo"); // 01:00 del martes en RD
    expect(nivelPlazo(recibido, new Date("2026-10-07T16:00:00Z"))).toBe("rojo");
    expect(nivelPlazo(recibido, new Date("2026-10-08T16:00:00Z"))).toBe("vencido");
  });
});

describe("elegirRepartidor", () => {
  const base = { voluminoso: false, administradorId: "admin", cargaActual: {} };

  it("el paquete voluminoso va al administrador", () => {
    expect(elegirRepartidor({ ...base, voluminoso: true, duenosDelSector: ["a"] })).toBe("admin");
  });

  it("un sector con un solo dueño va a ese repartidor", () => {
    expect(elegirRepartidor({ ...base, duenosDelSector: ["a"], cargaActual: { a: 40 } })).toBe("a");
  });

  it("un sector rotativo va al que lleva menos paquetes", () => {
    const eleccion = elegirRepartidor({
      ...base,
      duenosDelSector: ["a", "b", "c"],
      cargaActual: { a: 12, b: 7, c: 9 },
    });
    expect(eleccion).toBe("b");
  });

  it("en empate elige siempre el mismo, y quien no tiene carga cuenta como cero", () => {
    expect(elegirRepartidor({ ...base, duenosDelSector: ["b", "a"], cargaActual: { a: 3, b: 3 } })).toBe("a");
    expect(elegirRepartidor({ ...base, duenosDelSector: ["a", "b"], cargaActual: { a: 3 } })).toBe("b");
  });

  it("sin dueños devuelve null para que el organizador asigne", () => {
    expect(elegirRepartidor({ ...base, duenosDelSector: [] })).toBeNull();
  });
});
