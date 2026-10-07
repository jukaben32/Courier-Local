import { describe, expect, it } from "vitest";
import { distanciaKm, largoRecorrido, ordenarPorCercania, ordenarRuta, type Parada, type Punto } from "../ruta";

// Puntos reales aproximados de San Pedro de Macorís (1° de latitud ≈ 111 km)
const parada = (id: string, lat: number | null, lng: number | null, franja = 2): Parada => ({ id, lat, lng, franja });
const SALIDA: Punto = { lat: 18.45, lng: -69.3 };
const grado = 0.01; // ≈ 1.1 km

// Generador repetible para no depender del azar en las pruebas
function aleatorio(semilla: number) {
  let s = semilla;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

function permutaciones<T>(lista: T[]): T[][] {
  if (lista.length <= 1) return [lista];
  return lista.flatMap((x, i) => permutaciones([...lista.slice(0, i), ...lista.slice(i + 1)]).map((resto) => [x, ...resto]));
}

describe("distanciaKm", () => {
  it("calcula distancias razonables", () => {
    expect(distanciaKm(SALIDA, SALIDA)).toBe(0);
    expect(distanciaKm({ lat: 18.45, lng: -69.3 }, { lat: 18.46, lng: -69.3 })).toBeCloseTo(1.11, 1);
  });
});

describe("ordenarRuta", () => {
  it("respeta el horario antes que la cercanía", () => {
    const orden = ordenarRuta(
      [parada("tarde-cerca", 18.451, -69.3, 3), parada("mediodia-lejos", 18.5, -69.3, 2)],
      SALIDA
    );
    expect(orden.map((p) => p.id)).toEqual(["mediodia-lejos", "tarde-cerca"]);
  });

  it("dentro de un horario va siempre a la más cercana", () => {
    const orden = ordenarRuta([parada("c", 18.45 + grado * 3, -69.3), parada("a", 18.45 + grado, -69.3), parada("b", 18.45 + grado * 2, -69.3)], SALIDA);
    expect(orden.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("quita cruces: queda tan corta como la mejor ruta posible (fuerza bruta)", () => {
    const azar = aleatorio(7);
    for (let intento = 0; intento < 5; intento += 1) {
      const puntos = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, lat: 18.45 + azar() * 0.05, lng: -69.3 + azar() * 0.05, franja: 2 }));
      const orden = ordenarPorCercania(SALIDA, puntos);
      const largoOptimizado = largoRecorrido(SALIDA, orden);
      const mejorPosible = Math.min(...permutaciones(puntos).map((p) => largoRecorrido(SALIDA, p)));
      expect(largoOptimizado).toBeLessThanOrEqual(mejorPosible * 1.1);
    }
  });

  it("las paradas sin ubicación van al final de su horario y se marcan aproximadas", () => {
    const orden = ordenarRuta([parada("sin", null, null, 2), parada("con", 18.46, -69.3, 2), parada("tarde", 18.451, -69.3, 3)], SALIDA);
    expect(orden.map((p) => [p.id, p.aproximada])).toEqual([["con", false], ["sin", true], ["tarde", false]]);
  });

  it("acumula kilómetros y minutos (viaje + 4 min por parada)", () => {
    const orden = ordenarRuta([parada("a", 18.46, -69.3), parada("b", 18.47, -69.3)], SALIDA);
    expect(orden[0].distanciaKm).toBeCloseTo(1.11 * 1.3, 1);
    expect(orden[1].acumuladoKm).toBeCloseTo(2 * 1.11 * 1.3, 1);
    expect(orden[1].acumuladoMin).toBeGreaterThan(orden[0].acumuladoMin + 4);
  });

  it("sin punto de salida arranca por un extremo y devuelve todas las paradas", () => {
    const orden = ordenarRuta([parada("a", 18.45, -69.3), parada("b", 18.46, -69.3), parada("c", 18.47, -69.3)], null);
    expect(orden).toHaveLength(3);
    expect(["a", "c"]).toContain(orden[0].id);
  });

  it("sin paradas devuelve una lista vacía", () => {
    expect(ordenarRuta([], SALIDA)).toEqual([]);
  });
});
