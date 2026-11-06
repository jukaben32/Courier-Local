import { describe, expect, it } from "vitest";
import { diasEnOficina, esResultadoLlamada, formatearPesos, nivelDemora, totalesPenalidades } from "../demora";

describe("demora en oficina", () => {
  it("cuenta días de calendario de RD", () => {
    const ahora = new Date("2026-11-06T15:00:00Z");
    expect(diasEnOficina(new Date("2026-11-06T13:00:00Z"), ahora)).toBe(0);
    expect(diasEnOficina(new Date("2026-11-04T13:00:00Z"), ahora)).toBe(2);
    expect(diasEnOficina(new Date("2026-10-30T13:00:00Z"), ahora)).toBe(7);
  });

  it("avisa desde el día 5 y marca penalidad desde el 7", () => {
    expect(nivelDemora(4)).toBe("normal");
    expect(nivelDemora(5)).toBe("atencion");
    expect(nivelDemora(6)).toBe("atencion");
    expect(nivelDemora(7)).toBe("penalidad");
  });
});

describe("penalidades", () => {
  it("separa deuda de lo pagado", () => {
    const t = totalesPenalidades([
      { tipo: "paquete_perdido", estado: "pagada", costo: 4031.1727 },
      { tipo: "paquete_perdido", estado: "pagada", costo: 3362.99 },
      { tipo: "demora_oficina", estado: "pendiente", costo: 60 },
    ]);
    expect(t).toEqual({ deuda: 60, pagado: 7394.16, pendientes: 1 });
  });

  it("formatea pesos", () => {
    expect(formatearPesos(7454.16)).toBe("RD$ 7,454.16");
  });
});

describe("llamadas", () => {
  it("solo acepta resultados conocidos", () => {
    expect(esResultadoLlamada("contesto")).toBe(true);
    expect(esResultadoLlamada("otra cosa")).toBe(false);
    expect(esResultadoLlamada(undefined)).toBe(false);
  });
});
