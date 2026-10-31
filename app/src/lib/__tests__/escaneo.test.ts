import { describe, expect, it } from "vitest";
import { clasificarEscaneo, normalizarCodigo } from "../escaneo";

describe("normalizarCodigo", () => {
  it("quita espacios, saltos de línea y pasa a mayúsculas", () => {
    expect(normalizarCodigo(" sp076462011t\r\n")).toBe("SP076462011T");
    expect(normalizarCodigo("SP 0764 62011 T")).toBe("SP076462011T");
  });
});

describe("clasificarEscaneo", () => {
  it("no está en el listado", () => expect(clasificarEscaneo(null)).toBe("desconocido"));
  it("ya escaneado antes", () => expect(clasificarEscaneo({ repartidor_asignado_id: "r", escaneado_en: "2026-10-31T14:00:00Z" })).toBe("duplicado"));
  it("sin repartidor: la oficina lo decide", () => expect(clasificarEscaneo({ repartidor_asignado_id: null, escaneado_en: null })).toBe("sin_repartidor"));
  it("todo bien", () => expect(clasificarEscaneo({ repartidor_asignado_id: "r", escaneado_en: null })).toBe("ok"));
});
