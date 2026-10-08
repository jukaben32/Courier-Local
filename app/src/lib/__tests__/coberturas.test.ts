import { describe, expect, it } from "vitest";
import { aplicarCoberturas, elegirRepartidor } from "../asignacion";

describe("aplicarCoberturas", () => {
  it("sin coberturas deja a los dueños del sector como están", () => {
    expect(aplicarCoberturas(["ana", "luis"], [])).toEqual(["ana", "luis"]);
  });

  it("el que falta es reemplazado por quien lo cubre", () => {
    expect(aplicarCoberturas(["ana"], [{ ausenteId: "ana", cubreId: "suplente" }])).toEqual(["suplente"]);
  });

  it("en un sector rotativo reemplaza solo al ausente y no repite a nadie", () => {
    // Ana falta y la cubre Luis, que ya era dueño del sector: queda una sola vez
    expect(aplicarCoberturas(["ana", "luis"], [{ ausenteId: "ana", cubreId: "luis" }])).toEqual(["luis"]);
    // Ana falta y la cubre el suplente: el sector lo comparten Luis y el suplente
    expect(aplicarCoberturas(["ana", "luis"], [{ ausenteId: "ana", cubreId: "suplente" }])).toEqual(["suplente", "luis"]);
  });

  it("ignora coberturas de gente que no es dueña de ese sector", () => {
    expect(aplicarCoberturas(["ana"], [{ ausenteId: "otro", cubreId: "suplente" }])).toEqual(["ana"]);
  });

  it("el paquete nuevo de un sector con dueño ausente llega al suplente", () => {
    const duenos = aplicarCoberturas(["ana"], [{ ausenteId: "ana", cubreId: "suplente" }]);
    expect(elegirRepartidor({ voluminoso: false, administradorId: null, duenosDelSector: duenos, cargaActual: {} })).toBe("suplente");
  });
});
