import { describe, expect, it } from "vitest";
import { debeAbrirSinRespuesta, esParadaNueva, ordenarSinRespuesta, resumirContactos, type MensajeContacto } from "../sinRespuesta";

const msj = (extra: Partial<MensajeContacto>): MensajeContacto => ({
  telefono: "8295551234",
  direccion: "saliente",
  tipo: "aviso",
  estado: "enviado",
  contenido: null,
  creado_en: "2026-10-31T14:00:00Z",
  proveedor_id: "abc",
  ...extra,
});

describe("resumirContactos", () => {
  it("toma el estado del último aviso real y lo último que escribió el cliente", () => {
    const r = resumirContactos([
      msj({ estado: "enviado", creado_en: "2026-10-31T14:00:00Z" }),
      msj({ estado: "leido", creado_en: "2026-10-31T14:05:00Z" }),
      msj({ direccion: "entrante", tipo: "respuesta", contenido: "Hola buenas", creado_en: "2026-10-31T14:10:00Z" }),
      msj({ direccion: "entrante", tipo: "respuesta", contenido: "no estoy en casa hoy", creado_en: "2026-10-31T14:20:00Z" }),
    ]);
    expect(r.get("8295551234")).toEqual({ aviso: "leido", ultimoMensaje: "no estoy en casa hoy" });
  });

  it("ignora los envíos simulados y las palabras clave internas", () => {
    const r = resumirContactos([
      msj({ proveedor_id: "sim-123", estado: "entregado" }),
      msj({ estado: "fallido", creado_en: "2026-10-31T15:00:00Z" }),
      msj({ direccion: "entrante", tipo: "respuesta", contenido: "hora" }),
      msj({ direccion: "entrante", tipo: "respuesta", contenido: "ubicacion" }),
    ]);
    expect(r.get("8295551234")).toEqual({ aviso: "fallido", ultimoMensaje: null });
  });

  it("quien no tiene mensajes reales no aparece", () => {
    expect(resumirContactos([msj({ proveedor_id: "sim-1" })]).size).toBe(0);
  });
});

describe("debeAbrirSinRespuesta", () => {
  it("queda plegada con la ruta llena y se abre al quedar un tercio o menos", () => {
    expect(debeAbrirSinRespuesta(9, 1)).toBe(false); // 9 de 10 por entregar
    expect(debeAbrirSinRespuesta(4, 6)).toBe(false); // 4 de 10 (40 %)
    expect(debeAbrirSinRespuesta(3, 7)).toBe(true); // 3 de 10 (30 %)
    expect(debeAbrirSinRespuesta(1, 8)).toBe(true);
    expect(debeAbrirSinRespuesta(1, 2)).toBe(true); // 1 de 3
    expect(debeAbrirSinRespuesta(2, 3)).toBe(false); // 2 de 5
  });

  it("sin paradas confirmadas se abre", () => {
    expect(debeAbrirSinRespuesta(0, 0)).toBe(true);
    expect(debeAbrirSinRespuesta(0, 12)).toBe(true);
  });
});

describe("esParadaNueva", () => {
  const ahora = new Date("2026-10-31T16:00:00Z");

  it("es nueva si confirmó en los últimos 30 minutos", () => {
    expect(esParadaNueva("2026-10-31T15:45:00Z", ahora)).toBe(true);
    expect(esParadaNueva("2026-10-31T15:20:00Z", ahora)).toBe(false);
    expect(esParadaNueva(null, ahora)).toBe(false);
  });
});

describe("ordenarSinRespuesta", () => {
  it("primero los que escribieron algo, luego por sector y nombre", () => {
    const filas = [
      { sector: "Miramar", nombre: "Ana", contacto: undefined },
      { sector: "Juan Dolio", nombre: "Luis", contacto: { aviso: null, ultimoMensaje: "hola" } },
      { sector: "Guayacanes", nombre: "Eva", contacto: undefined },
    ];
    expect(ordenarSinRespuesta(filas).map((f) => f.nombre)).toEqual(["Luis", "Eva", "Ana"]);
  });
});
