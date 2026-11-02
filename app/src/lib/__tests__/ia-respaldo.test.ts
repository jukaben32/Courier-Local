import { describe, expect, it } from "vitest";
import { construirContexto, iaRespaldoActiva, interpretarSalida } from "../whatsapp/ia-respaldo-logica";

describe("iaRespaldoActiva", () => {
  it("apagada por defecto aunque haya clave", () => {
    expect(iaRespaldoActiva({ ANTHROPIC_API_KEY: "clave" })).toBe(false);
  });

  it("necesita el interruptor en true y la clave", () => {
    expect(iaRespaldoActiva({ IA_RESPALDO_ACTIVA: "true", ANTHROPIC_API_KEY: "clave" })).toBe(true);
    expect(iaRespaldoActiva({ IA_RESPALDO_ACTIVA: "true" })).toBe(false);
  });
});

describe("construirContexto", () => {
  it("sin paquetes lo dice explícitamente", () => {
    expect(construirContexto([])).toBe("El cliente no tiene paquetes abiertos.");
  });

  it("lista cada paquete con su estado y su horario preferido", () => {
    const texto = construirContexto([
      { id: "1", estado: "notificado", nombre_etiqueta: "Ana", ventana_horaria: "mediodia", hora_preferida: null },
    ]);
    expect(texto).toContain("Ana");
    expect(texto).toContain("notificado");
    expect(texto).toContain("mediodia");
  });
});

describe("interpretarSalida", () => {
  it("acepta una respuesta válida", () => {
    expect(interpretarSalida({ accion: "responder", texto: "Hola" })).toEqual({ accion: "responder", texto: "Hola" });
  });

  it("si la salida no es válida, pasa a una persona en vez de inventar", () => {
    expect(interpretarSalida({ accion: "cualquier_cosa" })).toEqual({ accion: "pasar_a_persona", texto: "" });
    expect(interpretarSalida(null)).toEqual({ accion: "pasar_a_persona", texto: "" });
  });
});
