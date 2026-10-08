import { describe, expect, it } from "vitest";
import { centroideRobusto, proponerEquilibrio, type PaqueteEquilibrio } from "../equilibrio";

// Puntos en una línea de este a oeste: 0.01° de longitud ≈ 1 km
const LAT = 18.45;
const punto = (km: number) => ({ lat: LAT, lng: -69.3 + km * 0.0095 });

let contador = 0;
const paquete = (repartidorId: string, km: number | null, extra: Partial<PaqueteEquilibrio> = {}): PaqueteEquilibrio => {
  contador += 1;
  return { id: `p${contador}`, repartidorId, sector: "S", ...(km === null ? { lat: null, lng: null } : punto(km)), ...extra };
};

const cargas = (paquetes: PaqueteEquilibrio[], movimientos: { paqueteId: string; aId: string }[]) => {
  const dueno = new Map(paquetes.map((p) => [p.id, p.repartidorId]));
  for (const m of movimientos) dueno.set(m.paqueteId, m.aId);
  const total: Record<string, number> = {};
  for (const id of dueno.values()) total[id] = (total[id] ?? 0) + 1;
  return total;
};

describe("proponerEquilibrio", () => {
  it("no mueve nada si el reparto ya es parejo", () => {
    const paquetes = [paquete("A", 0), paquete("A", 1), paquete("B", 10), paquete("B", 11)];
    const r = proponerEquilibrio({ paquetes, repartidores: ["A", "B"], margen: 0 });
    expect(r.movimientos).toEqual([]);
    expect(r.antes).toEqual({ A: 2, B: 2 });
  });

  it("le quita a quien tiene de más los paquetes que quedan más cerca de la zona de quien tiene de menos", () => {
    // A trabaja entre el km 0 y el 5; B está en el km 10. A tiene 6 y B tiene 2.
    const aPaquetes = [0, 1, 2, 3, 4, 5].map((km) => paquete("A", km));
    const bPaquetes = [paquete("B", 10), paquete("B", 11)];
    const r = proponerEquilibrio({ paquetes: [...aPaquetes, ...bPaquetes], repartidores: ["A", "B"], margen: 0 });

    expect(r.movimientos).toHaveLength(2);
    // Se mueven los dos paquetes de A que quedan más cerca de B (km 5 y km 4)
    expect(r.movimientos.map((m) => m.paqueteId).sort()).toEqual([aPaquetes[4].id, aPaquetes[5].id].sort());
    expect(r.movimientos.every((m) => m.deId === "A" && m.aId === "B")).toBe(true);
    expect(r.despues).toEqual({ A: 4, B: 4 });
  });

  it("nunca mueve un paquete sin ubicación conocida", () => {
    // A tiene 6 paquetes pero solo 1 con ubicación; B no tiene ninguno
    const paquetes = [paquete("A", 4), ...Array.from({ length: 5 }, () => paquete("A", null))];
    const r = proponerEquilibrio({ paquetes, repartidores: ["A", "B"], margen: 0, casaPorDefecto: { B: punto(10) } });
    expect(r.movimientos).toHaveLength(1);
    expect(r.sinUbicacion).toBe(5);
  });

  it("con margen acepta cierta diferencia y no mueve de más", () => {
    const paquetes = [...[0, 1, 2, 3, 4].map((km) => paquete("A", km)), paquete("B", 10), paquete("B", 11), paquete("B", 12)];
    // 5 contra 3: la diferencia es 2, que cabe en un margen de 1
    expect(proponerEquilibrio({ paquetes, repartidores: ["A", "B"], margen: 1 }).movimientos).toEqual([]);
    // con margen 0 sí se parejea (4 y 4)
    expect(proponerEquilibrio({ paquetes, repartidores: ["A", "B"], margen: 0 }).despues).toEqual({ A: 4, B: 4 });
  });

  it("con tres repartidores deja a todos dentro del margen y conserva el total", () => {
    const paquetes = [
      ...Array.from({ length: 10 }, (_, i) => paquete("A", i * 0.5)),
      ...Array.from({ length: 3 }, (_, i) => paquete("B", 6 + i)),
      ...Array.from({ length: 3 }, (_, i) => paquete("C", 12 + i)),
    ];
    const r = proponerEquilibrio({ paquetes, repartidores: ["A", "B", "C"], margen: 1 });
    const final = cargas(paquetes, r.movimientos);
    const promedio = 16 / 3;
    for (const id of ["A", "B", "C"]) {
      expect(final[id]).toBeGreaterThanOrEqual(Math.floor(promedio - 1));
      expect(final[id]).toBeLessThanOrEqual(Math.ceil(promedio + 1));
    }
    expect(Object.values(final).reduce((t, n) => t + n, 0)).toBe(16);
    // ningún paquete se mueve dos veces
    expect(new Set(r.movimientos.map((m) => m.paqueteId)).size).toBe(r.movimientos.length);
  });

  it("prefiere pasar paquetes a quien queda más cerca y no manda nada a una zona demasiado lejana", () => {
    // A (km 0-4) tiene 8; B está en el km 6 con 4 y C está en el km 60 con 4. Promedio 5,33
    const paquetes = [
      ...Array.from({ length: 8 }, (_, i) => paquete("A", i * 0.5)),
      ...Array.from({ length: 4 }, () => paquete("B", 6)),
      ...Array.from({ length: 4 }, () => paquete("C", 60)),
    ];
    const r = proponerEquilibrio({ paquetes, repartidores: ["A", "B", "C"], margen: 0 });
    expect(r.movimientos.filter((m) => m.aId === "B").length).toBeGreaterThan(0);
    // Mandarle paquetes a C alargaría la ruta más de lo permitido: se queda con los suyos
    expect(r.movimientos.filter((m) => m.aId === "C")).toHaveLength(0);
    expect(r.despues.C).toBe(4);
    // y avisa de que C quedó por debajo del reparto parejo
    expect(r.fueraDeMargen).toContain("C");
  });

  it("el tope de kilómetros extra se puede cambiar", () => {
    const paquetes = [...Array.from({ length: 6 }, (_, i) => paquete("A", i * 0.5)), ...Array.from({ length: 2 }, () => paquete("B", 30))];
    expect(proponerEquilibrio({ paquetes, repartidores: ["A", "B"], margen: 0 }).movimientos).toHaveLength(0);
    expect(proponerEquilibrio({ paquetes, repartidores: ["A", "B"], margen: 0, maxKmExtra: 100 }).movimientos).toHaveLength(2);
  });

  it("informa cuántos kilómetros extra supone", () => {
    const paquetes = [...[0, 1, 2, 3].map((km) => paquete("A", km)), paquete("B", 10)];
    const r = proponerEquilibrio({ paquetes, repartidores: ["A", "B"], margen: 0 });
    expect(r.movimientos).toHaveLength(1);
    expect(r.movimientos[0].extraKm).toBeGreaterThan(0);
    expect(r.kmExtra).toBeCloseTo(r.movimientos[0].extraKm, 5);
  });

  it("si hay una sola persona o ninguna no hay nada que repartir", () => {
    expect(proponerEquilibrio({ paquetes: [paquete("A", 0)], repartidores: ["A"], margen: 0 }).movimientos).toEqual([]);
    expect(proponerEquilibrio({ paquetes: [], repartidores: [], margen: 0 }).movimientos).toEqual([]);
  });
});

describe("esfuerzo y paquetes que no se pueden mover", () => {
  it("la carga fija (por ejemplo, paquetes de municipios) cuenta para decidir quién recibe más", () => {
    // Los dos llevan 4 paquetes de la ciudad, pero A además lleva carga fija equivalente a 4 más
    const paquetes = [...[0, 1, 2, 3].map((km) => paquete("A", km)), ...[5, 6, 7, 8].map((km) => paquete("B", km))];
    expect(proponerEquilibrio({ paquetes, repartidores: ["A", "B"], margen: 0 }).movimientos).toEqual([]);

    const r = proponerEquilibrio({ paquetes, repartidores: ["A", "B"], margen: 0, cargaFija: { A: 4 } });
    expect(r.movimientos).toHaveLength(2);
    expect(r.movimientos.every((m) => m.deId === "A" && m.aId === "B")).toBe(true);
    expect(r.despues).toEqual({ A: 6, B: 6 });
  });

  it("un paquete que pesa más solo se mueve si de verdad mejora el reparto", () => {
    // A lleva un paquete pesado (2) y uno liviano (1) = 3; B lleva 1. Pasar el pesado solo cambiaría el desbalance de lado
    const pesado = paquete("A", 5, { peso: 2 });
    const liviano = paquete("A", 0);
    const r = proponerEquilibrio({ paquetes: [pesado, liviano, paquete("B", 6)], repartidores: ["A", "B"], margen: 0 });
    expect(r.movimientos.map((m) => m.paqueteId)).toEqual([liviano.id]);
    expect(r.despues).toEqual({ A: 2, B: 2 });
  });
});

describe("zonas grandes (como Miramar)", () => {
  it("le pasa a B los paquetes de la orilla que toca su zona, sin partir el sector por la mitad al azar", () => {
    // Un sector muy grande: A tiene 12 paquetes en fila (km 0 a 5.5); B tiene 2 pegados al extremo este (km 6)
    const grande = Array.from({ length: 12 }, (_, i) => paquete("A", i * 0.5, { sector: "Miramar" }));
    const r = proponerEquilibrio({ paquetes: [...grande, paquete("B", 6), paquete("B", 6.2)], repartidores: ["A", "B"], margen: 0 });
    // Se pasan los 5 del extremo este: quedan juntos, así cada uno conserva un tramo continuo
    const idsMovidos = new Set(r.movimientos.map((m) => m.paqueteId));
    const kmMovidos = grande.map((p, i) => ({ km: i * 0.5, movido: idsMovidos.has(p.id) })).filter((x) => x.movido).map((x) => x.km).sort((a, b) => a - b);
    expect(kmMovidos).toEqual([3, 3.5, 4, 4.5, 5, 5.5].slice(-5));
    expect(r.despues).toEqual({ A: 7, B: 7 });
  });
});

describe("centroideRobusto", () => {
  it("usa la mediana, así un pin mandado desde otro lugar no arrastra el centro del sector", () => {
    const puntos = [
      { lat: 18.45, lng: -69.3 },
      { lat: 18.451, lng: -69.301 },
      { lat: 18.449, lng: -69.299 },
      { lat: 18.9, lng: -69.9 }, // un cliente que mandó su ubicación desde lejos
    ];
    const c = centroideRobusto(puntos, 3)!;
    expect(c.lat).toBeCloseTo(18.4505, 3);
    expect(c.lng).toBeCloseTo(-69.3005, 3);
  });

  it("con pocos pines no se atreve a decidir", () => {
    expect(centroideRobusto([{ lat: 18.45, lng: -69.3 }, { lat: 18.46, lng: -69.31 }], 3)).toBeNull();
  });
});
