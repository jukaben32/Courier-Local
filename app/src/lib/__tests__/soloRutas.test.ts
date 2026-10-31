import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

import { filtrosDeRutas, repartidoresQueCoinciden } from "../whatsapp/soloRutas";

const REPARTIDORES = [
  { id: "a1", nombre: "Heimi Santana" },
  { id: "a2", nombre: "Isamar Santana" },
  { id: "a3", nombre: "Julius Manuel Perez" },
  { id: "a4", nombre: "Jaime Ernesto Tolentino Alvarado" },
];

describe("filtro de rutas para los avisos", () => {
  it("sin la variable no hay filtro", () => {
    expect(filtrosDeRutas({})).toEqual([]);
    expect(filtrosDeRutas({ ENVIO_SOLO_REPARTIDORES: "  " })).toEqual([]);
  });

  it("lee una lista separada por comas, sin espacios ni mayúsculas", () => {
    expect(filtrosDeRutas({ ENVIO_SOLO_REPARTIDORES: " Julius , JAIME,," })).toEqual(["julius", "jaime"]);
  });

  it("coincide por parte del nombre o por id", () => {
    expect(repartidoresQueCoinciden(REPARTIDORES, ["julius"])).toEqual(["a3"]);
    expect(repartidoresQueCoinciden(REPARTIDORES, ["julius", "jaime"])).toEqual(["a3", "a4"]);
    expect(repartidoresQueCoinciden(REPARTIDORES, ["a2"])).toEqual(["a2"]);
  });

  it("un apellido compartido trae a todos los que lo llevan, y un nombre que no existe a nadie", () => {
    expect(repartidoresQueCoinciden(REPARTIDORES, ["santana"])).toEqual(["a1", "a2"]);
    expect(repartidoresQueCoinciden(REPARTIDORES, ["nadie"])).toEqual([]);
  });
});
